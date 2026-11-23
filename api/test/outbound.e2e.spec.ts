import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { ExpiryThresholdsService } from '../src/modules/expiry/expiry-thresholds.service';
import { getVnTodayDateString } from '../src/modules/expiry/domain/vn-date';
import { planFefo } from '../src/modules/outbound/domain/fefo';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    username: string;
  };
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const PREFIX = `T009_${Date.now()}_`;

function addDaysIso(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('Đơn đại lý, phân bổ FEFO & xác nhận xuất kho (T-009 E2E trên PostgreSQL thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let thresholdsService: ExpiryThresholdsService;
  let testStartedAt: Date;
  let todayVn: string;

  let staffToken: string;
  let staffUserId: string;
  let managerToken: string;
  let managerUserId: string;

  let activeAgencyId: string;
  let inactiveAgencyId: string;
  let supplierId: string;
  let productGroupId: string;

  const createdOrderIds: string[] = [];
  const createdInboundReceiptIds: string[] = [];
  const createdLotIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdAgencyIds: string[] = [];

  beforeAll(async () => {
    testStartedAt = new Date();
    todayVn = getVnTodayDateString();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    thresholdsService = app.get(ExpiryThresholdsService);

    const staffLogin = await loginAs('nhanvien');
    staffToken = staffLogin.accessToken;
    staffUserId = staffLogin.user.id;

    const managerLogin = await loginAs('quanly');
    managerToken = managerLogin.accessToken;
    managerUserId = managerLogin.user.id;

    const agency = await prisma.agency.findUniqueOrThrow({ where: { code: 'DL001' } });
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } });
    const group = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });

    activeAgencyId = agency.id;
    supplierId = supplier.id;
    productGroupId = group.id;

    const inactiveAgency = await prisma.agency.create({
      data: {
        code: `${PREFIX}DL_OFF`,
        name: 'Đại lý ngừng hoạt động T009',
        status: 'inactive',
      },
    });
    inactiveAgencyId = inactiveAgency.id;
    createdAgencyIds.push(inactiveAgency.id);
  });

  afterAll(async () => {
    try {
      if (createdOrderIds.length > 0) {
        const outbounds = await prisma.outboundReceipt.findMany({
          where: { orderId: { in: createdOrderIds } },
          select: { id: true },
        });
        const outboundIds = outbounds.map((r) => r.id);
        if (outboundIds.length > 0) {
          await prisma.stockMovement.deleteMany({
            where: { sourceType: 'OUTBOUND_RECEIPT', sourceId: { in: outboundIds } },
          });
          await prisma.outboundReceiptItem.deleteMany({
            where: { outboundId: { in: outboundIds } },
          });
          await prisma.outboundReceipt.deleteMany({
            where: { id: { in: outboundIds } },
          });
        }

        const orderItems = await prisma.agencyOrderItem.findMany({
          where: { orderId: { in: createdOrderIds } },
          select: { id: true },
        });
        const orderItemIds = orderItems.map((i) => i.id);
        if (orderItemIds.length > 0) {
          await prisma.orderLotAllocation.deleteMany({
            where: { orderItemId: { in: orderItemIds } },
          });
        }
        await prisma.agencyOrderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
        await prisma.agencyOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
      }

      if (createdInboundReceiptIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'INBOUND_RECEIPT', sourceId: { in: createdInboundReceiptIds } },
        });
        await prisma.inboundReceiptItem.deleteMany({
          where: { receiptId: { in: createdInboundReceiptIds } },
        });
        await prisma.inboundReceipt.deleteMany({
          where: { id: { in: createdInboundReceiptIds } },
        });
      }

      const lotsByPrefix = await prisma.lot.findMany({
        where: { lotCode: { startsWith: PREFIX } },
        select: { id: true },
      });
      const allLotIds = Array.from(
        new Set([...createdLotIds, ...lotsByPrefix.map((l) => l.id)]),
      );
      if (allLotIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } });
      }

      if (createdProductIds.length > 0) {
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }
      if (createdAgencyIds.length > 0) {
        await prisma.agency.deleteMany({ where: { id: { in: createdAgencyIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ['agency_order', 'outbound_receipt', 'inbound_receipt'] },
          createdAt: { gte: testStartedAt },
        },
      });
    } finally {
      await app.close();
    }
  });

  async function loginAs(username: string): Promise<LoginResponseBody> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return res.body as LoginResponseBody;
  }

  async function createTestProduct(suffix: string, status: 'active' | 'inactive' = 'active') {
    const product = await prisma.product.create({
      data: {
        code: `${PREFIX}SP_${suffix}`,
        name: `Sản phẩm test ${suffix}`,
        groupId: productGroupId,
        unit: 'Thùng',
        status,
      },
    });
    createdProductIds.push(product.id);
    return product;
  }

  async function createTestLot(input: {
    productId: string;
    suffix: string;
    expiryDate: string;
    receivedAt?: string;
    onHandQty: string;
    status?: 'active' | 'blocked' | 'closed';
  }) {
    const lot = await prisma.lot.create({
      data: {
        productId: input.productId,
        supplierId,
        lotCode: `${PREFIX}${input.suffix}`,
        expiryDate: new Date(`${input.expiryDate}T00:00:00.000Z`),
        receivedAt: new Date(`${input.receivedAt ?? todayVn}T00:00:00.000Z`),
        initialQuantity: new Prisma.Decimal(
          Number(input.onHandQty) > 0 ? input.onHandQty : '10',
        ),
        status: input.status ?? 'active',
        balance: {
          create: {
            onHandQty: new Prisma.Decimal(input.onHandQty),
            version: 1,
          },
        },
      },
    });
    createdLotIds.push(lot.id);
    return lot;
  }

  // AC2
  describe('AC2: Tạo đơn đại lý (confirmed, không đổi tồn, validate đầu vào)', () => {
    it('tạo đơn hợp lệ → 201, status=confirmed, số DH..., không đổi tồn/movement; từ chối đầu vào sai → 400', async () => {
      const prod1 = await createTestProduct('AC2_1');
      const prod2 = await createTestProduct('AC2_2');
      const inactiveProd = await createTestProduct('AC2_OFF', 'inactive');
      const lot1 = await createTestLot({
        productId: prod1.id,
        suffix: 'AC2_L1',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '100',
      });

      const movementsBefore = await prisma.stockMovement.count();
      const balBefore = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: lot1.id },
      });

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          notes: 'Đơn giao buổi sáng',
          items: [
            { productId: prod1.id, requestedQty: '25.5' },
            { productId: prod2.id, requestedQty: 14.5 },
          ],
        })
        .expect(201);

      createdOrderIds.push(res.body.id);
      expect(res.body.status).toBe('confirmed');
      expect(res.body.orderNo).toMatch(/^DH\d{10,}$/);
      expect(res.body.lineCount).toBe(2);
      expect(res.body.totalRequestedQty).toBe('40');
      expect(res.body.totalFulfilledQty).toBe('0');
      expect(res.body.items[0].availableQty).toBe('100');
      expect(res.body.items[1].availableQty).toBe('0');

      // Bất biến 1: tồn và movement không đổi
      const movementsAfter = await prisma.stockMovement.count();
      const balAfter = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: lot1.id },
      });
      expect(movementsAfter).toBe(movementsBefore);
      expect(balAfter.onHandQty.toString()).toBe(balBefore.onHandQty.toString());

      // 0 dòng → 400
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ agencyId: activeAgencyId, orderDate: todayVn, items: [] })
        .expect(400);

      // Đại lý inactive + sản phẩm inactive → 400
      const inactiveRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: inactiveAgencyId,
          orderDate: todayVn,
          items: [{ productId: inactiveProd.id, requestedQty: '10' }],
        })
        .expect(400);
      expect(
        (inactiveRes.body.errors as Array<{ field: string }>).map((e) => e.field),
      ).toEqual(expect.arrayContaining(['agencyId', 'items.0.productId']));

      // Số lượng <= 0 → 400
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod1.id, requestedQty: '0' }],
        })
        .expect(400);

      // Trùng sản phẩm trong cùng đơn → 400
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [
            { productId: prod1.id, requestedQty: '5' },
            { productId: prod1.id, requestedQty: '10' },
          ],
        })
        .expect(400);
    });
  });

  // AC3
  describe('AC3: GET /api/orders/:id/fefo-plan không ghi DB và khớp kết quả domain trên dữ liệu thật', () => {
    it('trả đúng lô hợp lệ theo FEFO, lô bị loại kèm lý do, và không ghi bất kỳ bảng nào', async () => {
      const prod = await createTestProduct('AC3');
      const minDeliveryDays = await thresholdsService.getMinDeliveryDays(todayVn);

      const expiredLot = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_EXP',
        expiryDate: addDaysIso(todayVn, -3),
        onHandQty: '40',
      });
      const shortLot = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_SHORT',
        expiryDate: addDaysIso(todayVn, Math.max(0, minDeliveryDays - 1)),
        onHandQty: '25',
      });
      const blockedLot = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_BLK',
        expiryDate: addDaysIso(todayVn, 40),
        onHandQty: '50',
        status: 'blocked',
      });
      const zeroLot = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_ZERO',
        expiryDate: addDaysIso(todayVn, 45),
        onHandQty: '0',
      });
      const tieEarlyRecv = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_TIE_1',
        expiryDate: addDaysIso(todayVn, 20),
        receivedAt: addDaysIso(todayVn, -5),
        onHandQty: '30',
      });
      const tieLateRecv = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_TIE_2',
        expiryDate: addDaysIso(todayVn, 20),
        receivedAt: addDaysIso(todayVn, -1),
        onHandQty: '25',
      });
      const laterLot = await createTestLot({
        productId: prod.id,
        suffix: 'AC3_LATER',
        expiryDate: addDaysIso(todayVn, 50),
        onHandQty: '60',
      });

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '45' }],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);

      const [outCountBefore, allocCountBefore, movCountBefore] = await Promise.all([
        prisma.outboundReceipt.count(),
        prisma.orderLotAllocation.count(),
        prisma.stockMovement.count(),
      ]);

      const planRes = await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}/fefo-plan`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const [outCountAfter, allocCountAfter, movCountAfter] = await Promise.all([
        prisma.outboundReceipt.count(),
        prisma.orderLotAllocation.count(),
        prisma.stockMovement.count(),
      ]);
      expect(outCountAfter).toBe(outCountBefore);
      expect(allocCountAfter).toBe(allocCountBefore);
      expect(movCountAfter).toBe(movCountBefore);

      // Đối chiếu trực tiếp với hàm thuần domain planFefo
      const expected = planFefo(
        [
          {
            id: expiredLot.id,
            lotCode: expiredLot.lotCode,
            expiryDate: addDaysIso(todayVn, -3),
            receivedAt: todayVn,
            status: 'active',
            onHandQty: '40',
          },
          {
            id: shortLot.id,
            lotCode: shortLot.lotCode,
            expiryDate: addDaysIso(todayVn, Math.max(0, minDeliveryDays - 1)),
            receivedAt: todayVn,
            status: 'active',
            onHandQty: '25',
          },
          {
            id: blockedLot.id,
            lotCode: blockedLot.lotCode,
            expiryDate: addDaysIso(todayVn, 40),
            receivedAt: todayVn,
            status: 'blocked',
            onHandQty: '50',
          },
          {
            id: zeroLot.id,
            lotCode: zeroLot.lotCode,
            expiryDate: addDaysIso(todayVn, 45),
            receivedAt: todayVn,
            status: 'active',
            onHandQty: '0',
          },
          {
            id: tieEarlyRecv.id,
            lotCode: tieEarlyRecv.lotCode,
            expiryDate: addDaysIso(todayVn, 20),
            receivedAt: addDaysIso(todayVn, -5),
            status: 'active',
            onHandQty: '30',
          },
          {
            id: tieLateRecv.id,
            lotCode: tieLateRecv.lotCode,
            expiryDate: addDaysIso(todayVn, 20),
            receivedAt: addDaysIso(todayVn, -1),
            status: 'active',
            onHandQty: '25',
          },
          {
            id: laterLot.id,
            lotCode: laterLot.lotCode,
            expiryDate: addDaysIso(todayVn, 50),
            receivedAt: todayVn,
            status: 'active',
            onHandQty: '60',
          },
        ],
        '45',
        todayVn,
        minDeliveryDays,
      );

      const line = planRes.body.items[0];
      expect(planRes.body.minDeliveryDays).toBe(minDeliveryDays);
      expect(planRes.body.evaluationDate).toBe(todayVn);
      expect(line.allocatedQty).toBe(expected.allocatedQty.toString());
      expect(line.shortageQty).toBe(expected.shortageQty.toString());
      expect(line.lots.map((l: { lotId: string }) => l.lotId)).toEqual(
        expected.eligible.map((e) => e.lot.id),
      );
      expect(line.lots.map((l: { allocateQty: string }) => l.allocateQty)).toEqual(
        expected.eligible.map((e) => e.allocateQty.toString()),
      );
      expect(line.excludedLots.map((l: { lotId: string; reason: string }) => [l.lotId, l.reason])).toEqual(
        expected.excluded.map((e) => [e.lot.id, e.reason]),
      );

      // Tồn khả dụng trên GET /api/orders/:id = 30 + 25 + 60 = 115
      const detailRes = await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(detailRes.body.items[0].availableQty).toBe('115');
    });
  });

  // AC4
  describe('AC4: Xác nhận xuất đủ qua nhiều lô (tồn, movement, allocation, đơn fulfilled, warnings FEFO)', () => {
    it('trừ tồn đúng từng lô, ghi movement, allocation consumed, cập nhật đơn fulfilled và trả cảnh báo nếu bỏ qua FEFO', async () => {
      const prod = await createTestProduct('AC4');
      const lot1 = await createTestLot({
        productId: prod.id,
        suffix: 'AC4_L1',
        expiryDate: addDaysIso(todayVn, 20),
        onHandQty: '30',
      });
      const lot2 = await createTestLot({
        productId: prod.id,
        suffix: 'AC4_L2',
        expiryDate: addDaysIso(todayVn, 45),
        onHandQty: '50',
      });

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '45' }],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);
      const orderItemId = orderRes.body.items[0].id as string;

      // Cố tình lấy 20 từ lot1 (còn 10) và 25 từ lot2 để kiểm cả warnings FEFO
      const outRes = await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          notes: 'Giao đủ đợt 1',
          items: [
            { orderItemId, lotId: lot1.id, quantity: '20' },
            { orderItemId, lotId: lot2.id, quantity: '25' },
          ],
        })
        .expect(201);

      expect(outRes.body.outboundNo).toMatch(/^PX\d{10,}$/);
      expect(outRes.body.outboundType).toBe('ORDER');
      expect(outRes.body.status).toBe('confirmed');
      expect(outRes.body.orderStatus).toBe('fulfilled');
      expect(outRes.body.confirmer.id).toBe(managerUserId);
      expect(outRes.body.totalQuantity).toBe('45');
      expect(outRes.body.warnings).toHaveLength(1);
      expect(outRes.body.warnings[0].code).toBe('FEFO_ORDER_BYPASSED');

      const [bal1, bal2] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot1.id } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot2.id } }),
      ]);
      expect(bal1.onHandQty.toString()).toBe('10');
      expect(bal2.onHandQty.toString()).toBe('25');

      const movs = await prisma.stockMovement.findMany({
        where: { sourceType: 'OUTBOUND_RECEIPT', sourceId: outRes.body.id },
      });
      expect(movs).toHaveLength(2);
      const movByLot = new Map(movs.map((m) => [m.lotId, m]));
      expect(movByLot.get(lot1.id)?.movementType).toBe('OUTBOUND');
      expect(movByLot.get(lot1.id)?.quantityDelta.toString()).toBe('-20');
      expect(movByLot.get(lot1.id)?.balanceAfter.toString()).toBe('10');
      expect(movByLot.get(lot1.id)?.actorUserId).toBe(managerUserId);

      expect(movByLot.get(lot2.id)?.quantityDelta.toString()).toBe('-25');
      expect(movByLot.get(lot2.id)?.balanceAfter.toString()).toBe('25');

      const allocs = await prisma.orderLotAllocation.findMany({
        where: { orderItemId },
        orderBy: { allocationRank: 'asc' },
      });
      expect(allocs).toHaveLength(2);
      expect(allocs.every((a) => a.status === 'consumed')).toBe(true);

      const orderDetail = await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(orderDetail.body.status).toBe('fulfilled');
      expect(orderDetail.body.items[0].fulfilledQty).toBe('45');
      expect(orderDetail.body.items[0].remainingQty).toBe('0');
      expect(orderDetail.body.outboundReceipts).toHaveLength(1);

      // Tra cứu danh sách và chi tiết phiếu xuất
      const listOut = await request(app.getHttpServer())
        .get('/api/outbound-receipts')
        .query({ orderId: orderRes.body.id, type: 'ORDER', search: outRes.body.outboundNo })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(listOut.body.total).toBe(1);

      const detailOut = await request(app.getHttpServer())
        .get(`/api/outbound-receipts/${outRes.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(detailOut.body.items).toHaveLength(2);
    });
  });

  // AC5
  describe('AC5: Xuất một phần rồi nhập thêm và xuất phần còn thiếu', () => {
    it('tồn 50 đặt 80 → xuất 50 (partial) → nhập thêm vào cùng lô → xuất 30 (fulfilled, cộng dồn allocation)', async () => {
      const prod = await createTestProduct('AC5');
      const lot = await createTestLot({
        productId: prod.id,
        suffix: 'AC5_L1',
        expiryDate: addDaysIso(todayVn, 90),
        onHandQty: '50',
      });

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '80' }],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);
      const orderItemId = orderRes.body.items[0].id as string;

      // Đợt 1: xuất 50 → partial
      const out1 = await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [{ orderItemId, lotId: lot.id, quantity: '50' }],
        })
        .expect(201);
      expect(out1.body.orderStatus).toBe('partial');

      const orderMid = await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(orderMid.body.status).toBe('partial');
      expect(orderMid.body.items[0].fulfilledQty).toBe('50');
      expect(orderMid.body.items[0].remainingQty).toBe('30');

      // Nhập thêm 40 vào chính lô này qua phiếu nhập thật
      const inboundDraft = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId: prod.id,
              lotCode: lot.lotCode,
              expiryDate: addDaysIso(todayVn, 90),
              quantity: '40',
            },
          ],
        })
        .expect(201);
      createdInboundReceiptIds.push(inboundDraft.body.id);

      await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${inboundDraft.body.id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      // Đợt 2: xuất tiếp 30 từ cùng lô → fulfilled, order_lot_allocations cộng dồn 50 + 30 = 80
      const out2 = await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [{ orderItemId, lotId: lot.id, quantity: '30' }],
        })
        .expect(201);
      expect(out2.body.orderStatus).toBe('fulfilled');

      const alloc = await prisma.orderLotAllocation.findUniqueOrThrow({
        where: { orderItemId_lotId: { orderItemId, lotId: lot.id } },
      });
      expect(alloc.allocatedQty.toString()).toBe('80');
      expect(alloc.status).toBe('consumed');

      const bal = await prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot.id } });
      expect(bal.onHandQty.toString()).toBe('10');
    });
  });

  // AC6
  describe('AC6: Từ chối xuất sai điều kiện (vượt tồn, vượt còn thiếu, hết hạn, dưới ngưỡng giao, blocked, sai sản phẩm)', () => {
    it('từ chối toàn bộ ca không hợp lệ và giữ nguyên tồn/movement', async () => {
      const prod1 = await createTestProduct('AC6_1');
      const prod2 = await createTestProduct('AC6_2');
      const minDeliveryDays = await thresholdsService.getMinDeliveryDays(todayVn);

      const goodLot = await createTestLot({
        productId: prod1.id,
        suffix: 'AC6_GOOD',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '40',
      });
      const expiredLot = await createTestLot({
        productId: prod1.id,
        suffix: 'AC6_EXP',
        expiryDate: addDaysIso(todayVn, -1),
        onHandQty: '40',
      });
      const shortLot = await createTestLot({
        productId: prod1.id,
        suffix: 'AC6_SHORT',
        expiryDate: addDaysIso(todayVn, Math.max(0, minDeliveryDays - 1)),
        onHandQty: '40',
      });
      const blockedLot = await createTestLot({
        productId: prod1.id,
        suffix: 'AC6_BLK',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '40',
        status: 'blocked',
      });
      const wrongProdLot = await createTestLot({
        productId: prod2.id,
        suffix: 'AC6_OTHER',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '40',
      });

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod1.id, requestedQty: '30' }],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);
      const orderItemId = orderRes.body.items[0].id as string;

      // Vượt phần còn thiếu (35 > 30) → 409
      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId, lotId: goodLot.id, quantity: '35' }] })
        .expect(409);

      // Tạo đơn đặt 50 rồi thử xuất vượt tồn lô (45 > 40) → 409
      const bigOrder = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod1.id, requestedQty: '50' }],
        })
        .expect(201);
      createdOrderIds.push(bigOrder.body.id);
      await request(app.getHttpServer())
        .post(`/api/orders/${bigOrder.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId: bigOrder.body.items[0].id, lotId: goodLot.id, quantity: '45' }] })
        .expect(409);

      // Lô hết hạn → 409
      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId, lotId: expiredLot.id, quantity: '10' }] })
        .expect(409);

      // Lô dưới minDeliveryDays → 409
      if (minDeliveryDays > 0) {
        await request(app.getHttpServer())
          .post(`/api/orders/${orderRes.body.id}/outbound`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ items: [{ orderItemId, lotId: shortLot.id, quantity: '10' }] })
          .expect(409);
      }

      // Lô blocked → 409
      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId, lotId: blockedLot.id, quantity: '10' }] })
        .expect(409);

      // Lô của sản phẩm khác → 400
      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId, lotId: wrongProdLot.id, quantity: '10' }] })
        .expect(400);

      // Xác minh tồn không đổi
      const balAfter = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: goodLot.id },
      });
      expect(balAfter.onHandQty.toString()).toBe('40');
    });
  });

  // AC7
  describe('AC7: Xác nhận xuất đồng thời trên PostgreSQL thật (Promise.all)', () => {
    it('2 đơn song song cùng xuất 1 lô (tồn 100, mỗi bên 70) → đúng 1 thành công (201), 1 bị chặn (409), tồn = 30', async () => {
      const prod = await createTestProduct('AC7_LOT');
      const lot = await createTestLot({
        productId: prod.id,
        suffix: 'AC7_SHARED',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '100',
      });

      const [o1, o2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            agencyId: activeAgencyId,
            orderDate: todayVn,
            items: [{ productId: prod.id, requestedQty: '70' }],
          })
          .expect(201),
        request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            agencyId: activeAgencyId,
            orderDate: todayVn,
            items: [{ productId: prod.id, requestedQty: '70' }],
          })
          .expect(201),
      ]);
      createdOrderIds.push(o1.body.id, o2.body.id);

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/orders/${o1.body.id}/outbound`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ items: [{ orderItemId: o1.body.items[0].id, lotId: lot.id, quantity: '70' }] }),
        request(app.getHttpServer())
          .post(`/api/orders/${o2.body.id}/outbound`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ items: [{ orderItemId: o2.body.items[0].id, lotId: lot.id, quantity: '70' }] }),
      ]);

      expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([201, 409]);

      const bal = await prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot.id } });
      expect(bal.onHandQty.toString()).toBe('30');

      const movs = await prisma.stockMovement.findMany({ where: { lotId: lot.id } });
      expect(movs).toHaveLength(1);
      expect(movs[0].quantityDelta.toString()).toBe('-70');
    });

    it('2 request xuất song song cùng 1 đơn vượt phần còn thiếu (đặt 100, tồn 200, mỗi bên 70) → đúng 1 thành công', async () => {
      const prod = await createTestProduct('AC7_ORD');
      const lot = await createTestLot({
        productId: prod.id,
        suffix: 'AC7_ORD_L',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '200',
      });

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '100' }],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);
      const orderItemId = orderRes.body.items[0].id as string;

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/orders/${orderRes.body.id}/outbound`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ items: [{ orderItemId, lotId: lot.id, quantity: '70' }] }),
        request(app.getHttpServer())
          .post(`/api/orders/${orderRes.body.id}/outbound`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ items: [{ orderItemId, lotId: lot.id, quantity: '70' }] }),
      ]);

      expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([201, 409]);

      const bal = await prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot.id } });
      expect(bal.onHandQty.toString()).toBe('130');

      const orderAfter = await prisma.agencyOrder.findUniqueOrThrow({
        where: { id: orderRes.body.id },
        include: { items: true },
      });
      expect(orderAfter.status).toBe('partial');
      expect(orderAfter.items[0].fulfilledQty.toString()).toBe('70');
    });

    it('2 đơn song song xuất chéo 2 lô {L1, L2} và {L2, L1} đủ tồn → cả 2 đều 201, không deadlock, không trùng outboundNo', async () => {
      const prod1 = await createTestProduct('AC7_DL1');
      const prod2 = await createTestProduct('AC7_DL2');
      const lot1 = await createTestLot({
        productId: prod1.id,
        suffix: 'AC7_DL_L1',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '100',
      });
      const lot2 = await createTestLot({
        productId: prod2.id,
        suffix: 'AC7_DL_L2',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '100',
      });

      const [o1, o2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            agencyId: activeAgencyId,
            orderDate: todayVn,
            items: [
              { productId: prod1.id, requestedQty: '20' },
              { productId: prod2.id, requestedQty: '30' },
            ],
          })
          .expect(201),
        request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            agencyId: activeAgencyId,
            orderDate: todayVn,
            items: [
              { productId: prod2.id, requestedQty: '15' },
              { productId: prod1.id, requestedQty: '25' },
            ],
          })
          .expect(201),
      ]);
      createdOrderIds.push(o1.body.id, o2.body.id);

      const o1Item1 = o1.body.items.find((i: { productId: string }) => i.productId === prod1.id);
      const o1Item2 = o1.body.items.find((i: { productId: string }) => i.productId === prod2.id);
      const o2Item1 = o2.body.items.find((i: { productId: string }) => i.productId === prod1.id);
      const o2Item2 = o2.body.items.find((i: { productId: string }) => i.productId === prod2.id);

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/orders/${o1.body.id}/outbound`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            items: [
              { orderItemId: o1Item1.id, lotId: lot1.id, quantity: '20' },
              { orderItemId: o1Item2.id, lotId: lot2.id, quantity: '30' },
            ],
          }),
        request(app.getHttpServer())
          .post(`/api/orders/${o2.body.id}/outbound`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            items: [
              { orderItemId: o2Item2.id, lotId: lot2.id, quantity: '15' },
              { orderItemId: o2Item1.id, lotId: lot1.id, quantity: '25' },
            ],
          }),
      ]);

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect(r1.body.outboundNo).not.toBe(r2.body.outboundNo);

      const [bal1, bal2] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot1.id } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot2.id } }),
      ]);
      expect(bal1.onHandQty.toString()).toBe('55');
      expect(bal2.onHandQty.toString()).toBe('55');
    });
  });

  // AC8 (E2E xung đột lô thứ 2)
  describe('AC8: E2E rollback khi lô thứ 2 không hợp lệ', () => {
    it('lô 1 hợp lệ + lô 2 bị khóa → 409, lô 1 giữ nguyên tồn và không tạo phiếu xuất/movement', async () => {
      const prod1 = await createTestProduct('AC8_1');
      const prod2 = await createTestProduct('AC8_2');
      const lot1 = await createTestLot({
        productId: prod1.id,
        suffix: 'AC8_L1',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '50',
      });
      const lot2 = await createTestLot({
        productId: prod2.id,
        suffix: 'AC8_L2',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '50',
        status: 'blocked',
      });

      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [
            { productId: prod1.id, requestedQty: '10' },
            { productId: prod2.id, requestedQty: '10' },
          ],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);

      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [
            { orderItemId: orderRes.body.items[0].id, lotId: lot1.id, quantity: '10' },
            { orderItemId: orderRes.body.items[1].id, lotId: lot2.id, quantity: '10' },
          ],
        })
        .expect(409);

      const bal1 = await prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot1.id } });
      expect(bal1.onHandQty.toString()).toBe('50');

      const receipts = await prisma.outboundReceipt.findMany({ where: { orderId: orderRes.body.id } });
      expect(receipts).toHaveLength(0);
    });
  });

  // AC9
  describe('AC9: Sửa đơn chưa xuất, hủy đơn confirmed/partial, chặn sửa/hủy sai trạng thái, không có DELETE', () => {
    it('đáp ứng đầy đủ quy tắc sửa, hủy đơn và không có route DELETE', async () => {
      const prod = await createTestProduct('AC9');
      const lot = await createTestLot({
        productId: prod.id,
        suffix: 'AC9_L1',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '100',
      });

      // Đơn 1: sửa khi chưa xuất → 200, rồi hủy thiếu lý do → 400, hủy có lý do → 200
      const o1 = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '30' }],
        })
        .expect(201);
      createdOrderIds.push(o1.body.id);

      const updated = await request(app.getHttpServer())
        .put(`/api/orders/${o1.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          notes: 'Cập nhật số lượng',
          items: [{ productId: prod.id, requestedQty: '40' }],
        })
        .expect(200);
      expect(updated.body.orderNo).toBe(o1.body.orderNo);
      expect(updated.body.totalRequestedQty).toBe('40');

      await request(app.getHttpServer())
        .post(`/api/orders/${o1.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: '   ' })
        .expect(400);

      const cancelled1 = await request(app.getHttpServer())
        .post(`/api/orders/${o1.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Đại lý hủy do hết nhu cầu' })
        .expect(200);
      expect(cancelled1.body.status).toBe('cancelled');
      expect(cancelled1.body.canceller.id).toBe(staffUserId);
      expect(cancelled1.body.cancelledAt).toBeTruthy();

      // Đơn 2: xuất một phần → thử sửa (409) → hủy partial (200), phiếu xuất giữ nguyên, tồn không đổi
      const o2 = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '50' }],
        })
        .expect(201);
      createdOrderIds.push(o2.body.id);

      const outPartial = await request(app.getHttpServer())
        .post(`/api/orders/${o2.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId: o2.body.items[0].id, lotId: lot.id, quantity: '20' }] })
        .expect(201);

      await request(app.getHttpServer())
        .put(`/api/orders/${o2.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '60' }],
        })
        .expect(409);

      const cancelled2 = await request(app.getHttpServer())
        .post(`/api/orders/${o2.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Không giao tiếp phần thiếu' })
        .expect(200);
      expect(cancelled2.body.status).toBe('cancelled');

      // Phiếu xuất cũ vẫn confirmed, tồn vẫn là 80
      const oldOutbound = await prisma.outboundReceipt.findUniqueOrThrow({
        where: { id: outPartial.body.id },
      });
      expect(oldOutbound.status).toBe('confirmed');
      const bal = await prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot.id } });
      expect(bal.onHandQty.toString()).toBe('80');

      // Đơn 3: xuất đủ → hủy (409)
      const o3 = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '10' }],
        })
        .expect(201);
      createdOrderIds.push(o3.body.id);

      await request(app.getHttpServer())
        .post(`/api/orders/${o3.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ items: [{ orderItemId: o3.body.items[0].id, lotId: lot.id, quantity: '10' }] })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/orders/${o3.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Thử hủy đơn đã xuất đủ' })
        .expect(409);

      // Không có route DELETE (Bất biến 6)
      await request(app.getHttpServer())
        .delete(`/api/orders/${o1.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/outbound-receipts/${outPartial.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(404);
    });
  });

  // AC10
  describe('AC10: Phân quyền theo D-016', () => {
    it('không token → 401; quanly không tạo/sửa/hủy đơn (403) nhưng xem FEFO và xác nhận xuất được; nhanvien tạo + xuất được', async () => {
      const prod = await createTestProduct('AC10');
      const lot = await createTestLot({
        productId: prod.id,
        suffix: 'AC10_L1',
        expiryDate: addDaysIso(todayVn, 60),
        onHandQty: '50',
      });

      // Không token → 401
      await request(app.getHttpServer()).get('/api/orders').expect(401);
      await request(app.getHttpServer()).get('/api/outbound-receipts').expect(401);

      // quanly không có orders.create → 403
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '10' }],
        })
        .expect(403);

      // nhanvien tạo đơn thành công
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '10' }],
        })
        .expect(201);
      createdOrderIds.push(orderRes.body.id);

      // quanly không có orders.create / orders.cancel → 403
      await request(app.getHttpServer())
        .put(`/api/orders/${orderRes.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          agencyId: activeAgencyId,
          orderDate: todayVn,
          items: [{ productId: prod.id, requestedQty: '12' }],
        })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Thử hủy bằng quản lý' })
        .expect(403);

      // quanly xem được FEFO plan và xác nhận xuất được
      await request(app.getHttpServer())
        .get(`/api/orders/${orderRes.body.id}/fefo-plan`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/orders/${orderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ items: [{ orderItemId: orderRes.body.items[0].id, lotId: lot.id, quantity: '10' }] })
        .expect(201);
    });
  });
});
