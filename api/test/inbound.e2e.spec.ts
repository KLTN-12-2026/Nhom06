import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponseBody {
  accessToken: string;
  user: {
    id: string;
    username: string;
  };
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const PREFIX = `T007_${Date.now()}_`;

describe('Phiếu nhập, lô, xác nhận nhập kho & tra cứu lô (T-007 E2E trên PostgreSQL thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testStartedAt: Date;

  let staffToken: string;
  let staffUserId: string;
  let managerToken: string;
  let managerUserId: string;

  let activeSupplierId: string;
  let inactiveSupplierId: string;
  let product1Id: string;
  let product2Id: string;
  let inactiveProductId: string;

  const createdReceiptIds: string[] = [];
  const createdLotIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdSupplierIds: string[] = [];

  beforeAll(async () => {
    testStartedAt = new Date();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const staffLogin = await loginAs('nhanvien');
    staffToken = staffLogin.accessToken;
    staffUserId = staffLogin.user.id;

    const managerLogin = await loginAs('quanly');
    managerToken = managerLogin.accessToken;
    managerUserId = managerLogin.user.id;

    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } });
    const product1 = await prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } });
    const product2 = await prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } });
    const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });

    activeSupplierId = supplier.id;
    product1Id = product1.id;
    product2Id = product2.id;

    // Tạo NCC & sản phẩm inactive phục vụ test AC2
    const inactiveSup = await prisma.supplier.create({
      data: {
        code: `${PREFIX}NCC_OFF`,
        name: 'NCC ngừng hoạt động T007',
        status: 'inactive',
      },
    });
    inactiveSupplierId = inactiveSup.id;
    createdSupplierIds.push(inactiveSup.id);

    const inactiveProd = await prisma.product.create({
      data: {
        code: `${PREFIX}SP_OFF`,
        name: 'Sản phẩm ngừng kinh doanh T007',
        groupId: suaGroup.id,
        unit: 'thùng',
        status: 'inactive',
      },
    });
    inactiveProductId = inactiveProd.id;
    createdProductIds.push(inactiveProd.id);
  });

  afterAll(async () => {
    try {
      // Thu thập mọi lô gắn với prefix hoặc gắn với các phiếu đã tạo
      const lotsByPrefix = await prisma.lot.findMany({
        where: { lotCode: { startsWith: PREFIX } },
        select: { id: true },
      });
      const allLotIds = Array.from(
        new Set([...createdLotIds, ...lotsByPrefix.map((item) => item.id)]),
      );

      if (createdReceiptIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'INBOUND_RECEIPT', sourceId: { in: createdReceiptIds } },
        });
        await prisma.inboundReceiptItem.deleteMany({
          where: { receiptId: { in: createdReceiptIds } },
        });
        await prisma.inboundReceipt.deleteMany({
          where: { id: { in: createdReceiptIds } },
        });
      }

      if (allLotIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } });
      }

      if (createdProductIds.length > 0) {
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }
      if (createdSupplierIds.length > 0) {
        await prisma.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'inbound_receipt',
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

  // AC1
  describe('AC1: Tạo phiếu nhập nháp không làm thay đổi lô/tồn/sổ biến động (Bất biến 1)', () => {
    it('tạo nháp 2 dòng → 201, status=draft, receiptNo đúng định dạng, không tạo lô/tồn/movement, sửa nháp giữ nguyên receiptNo', async () => {
      const lot1Code = `${PREFIX}AC1_L1`;
      const lot2Code = `${PREFIX}AC1_L2`;

      const createRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          notes: 'Hàng về chiều nay, chờ kiểm đếm',
          items: [
            {
              productId: product1Id,
              lotCode: ` ${lot1Code.toLowerCase()} `,
              expiryDate: '2027-06-01',
              quantity: '12.5',
              unitCost: '320000',
            },
            {
              productId: product2Id,
              lotCode: lot2Code,
              expiryDate: '2027-07-01',
              quantity: 8,
              unitCost: 540000,
            },
          ],
        })
        .expect(201);

      const receipt = createRes.body;
      createdReceiptIds.push(receipt.id);

      expect(receipt.status).toBe('draft');
      expect(receipt.receiptNo).toMatch(/^PN261122\d{4,}$/);
      expect(receipt.lineCount).toBe(2);
      expect(receipt.totalQuantity).toBe('20.5');
      // T-024: nhanvien thiếu reports.read nên không nhận trường tiền trong response
      expect(receipt.totalAmount).toBeUndefined();
      expect(receipt.items).toHaveLength(2);
      expect(receipt.items[0].lotCode).toBe(lot1Code);
      expect(receipt.items[0].lotId).toBeNull();
      expect(receipt.items[0].unitCost).toBeUndefined();
      expect(receipt.items[0].lineTotal).toBeUndefined();
      expect(receipt.items[1].lotId).toBeNull();

      // Quản lý (có reports.read) đọc lại thấy đúng tổng tiền đã lưu
      const managerCheckRes = await request(app.getHttpServer())
        .get(`/api/inbound-receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(managerCheckRes.body.totalAmount).toBe('8320000');

      // Bất biến 1: KHÔNG có lô mới, KHÔNG có balance, KHÔNG có stock_movements
      const lots = await prisma.lot.findMany({
        where: { lotCode: { in: [lot1Code, lot2Code] } },
      });
      expect(lots).toHaveLength(0);

      const movements = await prisma.stockMovement.findMany({
        where: { sourceType: 'INBOUND_RECEIPT', sourceId: receipt.id },
      });
      expect(movements).toHaveLength(0);

      // Sửa nháp bằng PUT: thay toàn bộ dòng, giữ nguyên receiptNo, vẫn không tạo lô/tồn
      const updateRes = await request(app.getHttpServer())
        .put(`/api/inbound-receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-23',
          notes: 'Đã cập nhật lại số lượng nháp',
          items: [
            {
              productId: product1Id,
              lotCode: lot1Code,
              expiryDate: '2027-06-15',
              quantity: '20',
              unitCost: '300000',
            },
          ],
        })
        .expect(200);

      expect(updateRes.body.receiptNo).toBe(receipt.receiptNo);
      expect(updateRes.body.lineCount).toBe(1);
      expect(updateRes.body.totalQuantity).toBe('20');

      // Tra cứu danh sách có lọc
      const listRes = await request(app.getHttpServer())
        .get('/api/inbound-receipts')
        .query({
          status: 'draft',
          supplierId: activeSupplierId,
          from: '2026-11-20',
          to: '2026-11-25',
          search: receipt.receiptNo,
        })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(listRes.body.total).toBeGreaterThanOrEqual(1);
      expect(listRes.body.items[0].id).toBe(receipt.id);
      expect(listRes.body.items[0].creator.fullName).toBe('Trương Thành Lê');
    });
  });

  // AC2
  describe('AC2: Validate dữ liệu đầu vào và xung đột lô', () => {
    it('trả 400 có errors chỉ rõ dòng/trường cho mọi trường hợp dữ liệu không hợp lệ', async () => {
      // 0 dòng
      const emptyRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [],
        })
        .expect(400);
      expect(emptyRes.body.errors.map((e: { field: string }) => e.field)).toContain('items');

      // quantity = 0, âm, HSD <= ngày chứng từ, HSD <= NSX
      const invalidFieldsRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}BAD1`,
              expiryDate: '2026-11-22',
              quantity: 0,
              unitCost: -10,
            },
            {
              productId: product2Id,
              lotCode: `${PREFIX}BAD2`,
              expiryDate: '2026-12-01',
              manufacturedDate: '2026-12-01',
              quantity: -5,
            },
          ],
        })
        .expect(400);
      const badFields = (invalidFieldsRes.body.errors as Array<{ field: string }>).map(
        (e) => e.field,
      );
      expect(badFields).toEqual(
        expect.arrayContaining([
          'items.0.quantity',
          'items.0.unitCost',
          'items.0.expiryDate',
          'items.1.quantity',
          'items.1.expiryDate',
        ]),
      );

      // NCC inactive + sản phẩm inactive ở dòng thứ 2
      const inactiveRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: inactiveSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}INACT1`,
              expiryDate: '2027-06-01',
              quantity: '10',
            },
            {
              productId: inactiveProductId,
              lotCode: `${PREFIX}INACT2`,
              expiryDate: '2027-06-01',
              quantity: '5',
            },
          ],
        })
        .expect(400);
      const inactiveFields = (inactiveRes.body.errors as Array<{ field: string }>).map(
        (e) => e.field,
      );
      expect(inactiveFields).toEqual(
        expect.arrayContaining(['supplierId', 'items.1.productId']),
      );

      // Hai dòng cùng (productId, lotCode) khác HSD trong cùng phiếu
      const sameReceiptConflict = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}DUP_IN_RECEIPT`,
              expiryDate: '2027-06-01',
              quantity: '10',
            },
            {
              productId: product1Id,
              lotCode: `${PREFIX}DUP_IN_RECEIPT`,
              expiryDate: '2027-08-01',
              quantity: '5',
            },
          ],
        })
        .expect(400);
      expect(
        (sameReceiptConflict.body.errors as Array<{ field: string }>).map((e) => e.field),
      ).toContain('items.1.expiryDate');

      // Trùng mã lô với lô đã có sẵn trong DB nhưng khác HSD
      const existingLot = await prisma.lot.create({
        data: {
          productId: product1Id,
          supplierId: activeSupplierId,
          lotCode: `${PREFIX}EXISTING_DIFF_HSD`,
          expiryDate: new Date('2027-05-01'),
          receivedAt: new Date('2026-11-01'),
          initialQuantity: new Prisma.Decimal('10'),
          status: 'active',
        },
      });
      createdLotIds.push(existingLot.id);

      const dbConflict = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: existingLot.lotCode,
              expiryDate: '2027-09-01',
              quantity: '15',
            },
          ],
        })
        .expect(400);
      expect(dbConflict.body.message).toContain('Mã lô đã tồn tại với hạn sử dụng khác');
      expect(dbConflict.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'items.0.lotCode',
            message: 'Mã lô đã tồn tại với hạn sử dụng khác',
          }),
        ]),
      );
    });
  });

  // AC3 & AC4
  describe('AC3 & AC4: Xác nhận nhập kho cập nhật tồn + sổ biến động và chặn xác nhận lần 2', () => {
    it('xác nhận phiếu gồm lô mới + lô đã có tồn 10 (và gộp 2 dòng cùng mã lô); xác nhận lần 2 → 409', async () => {
      const existingLot = await prisma.lot.create({
        data: {
          productId: product1Id,
          supplierId: activeSupplierId,
          lotCode: `${PREFIX}AC3_OLD`,
          expiryDate: new Date('2027-06-01'),
          receivedAt: new Date('2026-11-01'),
          initialQuantity: new Prisma.Decimal('10'),
          status: 'active',
        },
      });
      createdLotIds.push(existingLot.id);
      await prisma.inventoryLotBalance.create({
        data: { lotId: existingLot.id, onHandQty: new Prisma.Decimal('10.000'), version: 0 },
      });

      const newLotCode = `${PREFIX}AC3_NEW`;

      const createRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product2Id,
              lotCode: newLotCode,
              expiryDate: '2027-08-15',
              quantity: '15.5',
              unitCost: '200000',
            },
            {
              productId: product1Id,
              lotCode: existingLot.lotCode,
              expiryDate: '2027-06-01',
              quantity: '4.5',
              unitCost: '100000',
            },
            {
              productId: product1Id,
              lotCode: existingLot.lotCode,
              expiryDate: '2027-06-01',
              quantity: '3',
              unitCost: '100000',
            },
          ],
        })
        .expect(201);
      const receiptId = createRes.body.id as string;
      createdReceiptIds.push(receiptId);

      // Xác nhận bằng quanly (AC3 + AC8)
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${receiptId}/confirm`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(confirmRes.body.status).toBe('confirmed');
      expect(confirmRes.body.confirmer.id).toBe(managerUserId);
      expect(confirmRes.body.confirmedAt).toBeTruthy();
      expect(confirmRes.body.totalQuantity).toBe('23');
      expect(confirmRes.body.items.every((i: { lotId: string | null }) => i.lotId !== null)).toBe(
        true,
      );

      // Kiểm tra lô mới và tồn lô mới
      const createdLot = await prisma.lot.findUniqueOrThrow({
        where: { productId_lotCode: { productId: product2Id, lotCode: newLotCode } },
        include: { balance: true },
      });
      createdLotIds.push(createdLot.id);
      expect(createdLot.initialQuantity.toString()).toBe('15.5');
      expect(createdLot.balance?.onHandQty.toString()).toBe('15.5');
      expect(createdLot.balance?.version).toBe(1);

      // Kiểm tra tồn lô cũ: 10 + (4.5 + 3) = 17.5
      const oldBalance = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: existingLot.id },
      });
      expect(oldBalance.onHandQty.toString()).toBe('17.5');
      expect(oldBalance.version).toBe(1);

      // Kiểm tra 2 dòng stock_movements (mỗi lô 1 dòng)
      const movements = await prisma.stockMovement.findMany({
        where: { sourceType: 'INBOUND_RECEIPT', sourceId: receiptId },
        orderBy: { id: 'asc' },
      });
      expect(movements).toHaveLength(2);
      const movByLot = new Map(movements.map((m) => [m.lotId, m]));
      expect(movByLot.get(existingLot.id)).toMatchObject({
        movementType: 'INBOUND',
        sourceType: 'INBOUND_RECEIPT',
        sourceId: receiptId,
        actorUserId: managerUserId,
      });
      expect(movByLot.get(existingLot.id)?.quantityDelta.toString()).toBe('7.5');
      expect(movByLot.get(existingLot.id)?.balanceAfter.toString()).toBe('17.5');

      expect(movByLot.get(createdLot.id)?.quantityDelta.toString()).toBe('15.5');
      expect(movByLot.get(createdLot.id)?.balanceAfter.toString()).toBe('15.5');

      // Audit log INBOUND_CONFIRMED
      const auditLogs = await prisma.auditLog.findMany({
        where: { entityType: 'inbound_receipt', entityId: receiptId, eventType: 'INBOUND_CONFIRMED' },
      });
      expect(auditLogs).toHaveLength(1);

      // AC4: Xác nhận lần 2 → 409, tồn và movement không đổi
      await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${receiptId}/confirm`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(409);

      const oldBalanceAfter = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: existingLot.id },
      });
      expect(oldBalanceAfter.onHandQty.toString()).toBe('17.5');
      const movementsAfter = await prisma.stockMovement.findMany({
        where: { sourceType: 'INBOUND_RECEIPT', sourceId: receiptId },
      });
      expect(movementsAfter).toHaveLength(2);
    });
  });

  // AC5
  describe('AC5: Xác nhận đồng thời trên PostgreSQL thật', () => {
    it('gửi 2 request xác nhận cùng phiếu song song → đúng 1 thành công (200), 1 nhận 409; tồn chỉ tăng 1 lần', async () => {
      const lotCode1 = `${PREFIX}AC5_L1`;
      const lotCode2 = `${PREFIX}AC5_L2`;

      const createRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            { productId: product1Id, lotCode: lotCode1, expiryDate: '2027-06-01', quantity: '30' },
            { productId: product2Id, lotCode: lotCode2, expiryDate: '2027-07-01', quantity: '40' },
          ],
        })
        .expect(201);
      const receiptId = createRes.body.id as string;
      createdReceiptIds.push(receiptId);

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/inbound-receipts/${receiptId}/confirm`)
          .set('Authorization', `Bearer ${staffToken}`),
        request(app.getHttpServer())
          .post(`/api/inbound-receipts/${receiptId}/confirm`)
          .set('Authorization', `Bearer ${managerToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const lot1 = await prisma.lot.findUniqueOrThrow({
        where: { productId_lotCode: { productId: product1Id, lotCode: lotCode1 } },
        include: { balance: true },
      });
      const lot2 = await prisma.lot.findUniqueOrThrow({
        where: { productId_lotCode: { productId: product2Id, lotCode: lotCode2 } },
        include: { balance: true },
      });
      createdLotIds.push(lot1.id, lot2.id);

      expect(lot1.balance?.onHandQty.toString()).toBe('30');
      expect(lot2.balance?.onHandQty.toString()).toBe('40');

      const movements = await prisma.stockMovement.findMany({
        where: { sourceType: 'INBOUND_RECEIPT', sourceId: receiptId },
      });
      expect(movements).toHaveLength(2);
    });

    it('xác nhận song song 2 phiếu khác nhau cùng nhập vào 1 mã lô mới → cả 2 đều 200, cộng dồn tồn chính xác', async () => {
      const sharedLotCode = `${PREFIX}AC5_SHARED`;

      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/inbound-receipts')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            supplierId: activeSupplierId,
            receiptDate: '2026-11-22',
            items: [
              {
                productId: product1Id,
                lotCode: sharedLotCode,
                expiryDate: '2027-09-01',
                quantity: '12',
              },
            ],
          })
          .expect(201),
        request(app.getHttpServer())
          .post('/api/inbound-receipts')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            supplierId: activeSupplierId,
            receiptDate: '2026-11-22',
            items: [
              {
                productId: product1Id,
                lotCode: sharedLotCode,
                expiryDate: '2027-09-01',
                quantity: '18',
              },
            ],
          })
          .expect(201),
      ]);
      createdReceiptIds.push(r1.body.id, r2.body.id);

      const [c1, c2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/inbound-receipts/${r1.body.id}/confirm`)
          .set('Authorization', `Bearer ${staffToken}`),
        request(app.getHttpServer())
          .post(`/api/inbound-receipts/${r2.body.id}/confirm`)
          .set('Authorization', `Bearer ${managerToken}`),
      ]);

      expect(c1.status).toBe(200);
      expect(c2.status).toBe(200);

      const sharedLot = await prisma.lot.findUniqueOrThrow({
        where: { productId_lotCode: { productId: product1Id, lotCode: sharedLotCode } },
        include: { balance: true },
      });
      createdLotIds.push(sharedLot.id);
      expect(sharedLot.balance?.onHandQty.toString()).toBe('30');
      expect(sharedLot.balance?.version).toBe(2);

      const movs = await prisma.stockMovement.findMany({
        where: { lotId: sharedLot.id },
        orderBy: { id: 'asc' },
      });
      expect(movs).toHaveLength(2);
      expect(movs[1].balanceAfter.toString()).toBe('30');
    });
  });

  // AC6
  describe('AC6: Tính nguyên tử khi có xung đột phát sinh ở dòng thứ 2 (Bất biến 3)', () => {
    it('chèn lô xung đột HSD trước khi xác nhận → 400 và rollback hoàn toàn dòng 1 (không lô mới, không tồn, không movement, phiếu vẫn draft)', async () => {
      const lot1Code = `${PREFIX}AC6_OK`;
      const lot2Code = `${PREFIX}AC6_CONFLICT`;

      const createRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            { productId: product1Id, lotCode: lot1Code, expiryDate: '2027-06-01', quantity: '50' },
            { productId: product2Id, lotCode: lot2Code, expiryDate: '2027-06-01', quantity: '20' },
          ],
        })
        .expect(201);
      const receiptId = createRes.body.id as string;
      createdReceiptIds.push(receiptId);

      // Chèn lô xung đột HSD sau khi đã lập nháp
      const conflictLot = await prisma.lot.create({
        data: {
          productId: product2Id,
          supplierId: activeSupplierId,
          lotCode: lot2Code,
          expiryDate: new Date('2027-12-31'),
          receivedAt: new Date('2026-11-22'),
          initialQuantity: new Prisma.Decimal('5'),
          status: 'active',
        },
      });
      createdLotIds.push(conflictLot.id);

      const confirmRes = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${receiptId}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(400);
      expect(confirmRes.body.message).toContain('Mã lô đã tồn tại với hạn sử dụng khác');

      // Kiểm tra rollback toàn phần trên DB
      const receiptAfter = await prisma.inboundReceipt.findUniqueOrThrow({
        where: { id: receiptId },
        include: { items: true },
      });
      expect(receiptAfter.status).toBe('draft');
      expect(receiptAfter.confirmedBy).toBeNull();
      expect(receiptAfter.confirmedAt).toBeNull();
      expect(receiptAfter.items.every((item) => item.lotId === null)).toBe(true);

      const lot1InDb = await prisma.lot.findUnique({
        where: { productId_lotCode: { productId: product1Id, lotCode: lot1Code } },
      });
      expect(lot1InDb).toBeNull();

      const movements = await prisma.stockMovement.findMany({
        where: { sourceType: 'INBOUND_RECEIPT', sourceId: receiptId },
      });
      expect(movements).toHaveLength(0);
    });
  });

  // AC7
  describe('AC7: Hủy nháp, chặn sửa/hủy sau xác nhận, không có route DELETE (Bất biến 6)', () => {
    it('hủy nháp → cancelled không đổi tồn; sửa/hủy phiếu đã xác nhận → 409; DELETE → 404', async () => {
      // Tạo phiếu 1 để hủy nháp
      const draft1 = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC7_CANCEL`,
              expiryDate: '2027-06-01',
              quantity: '10',
            },
          ],
        })
        .expect(201);
      createdReceiptIds.push(draft1.body.id);

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${draft1.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(cancelRes.body.status).toBe('cancelled');

      const cancelledLot = await prisma.lot.findUnique({
        where: { productId_lotCode: { productId: product1Id, lotCode: `${PREFIX}AC7_CANCEL` } },
      });
      expect(cancelledLot).toBeNull();

      // Phiếu đã hủy không thể xác nhận lại
      await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${draft1.body.id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(409);

      // Tạo phiếu 2, xác nhận xong rồi thử sửa/hủy/DELETE
      const draft2 = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC7_CONFIRMED`,
              expiryDate: '2027-06-01',
              quantity: '10',
            },
          ],
        })
        .expect(201);
      createdReceiptIds.push(draft2.body.id);

      const confirmed = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${draft2.body.id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      createdLotIds.push(confirmed.body.items[0].lotId);

      await request(app.getHttpServer())
        .put(`/api/inbound-receipts/${draft2.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC7_CONFIRMED`,
              expiryDate: '2027-06-01',
              quantity: '99',
            },
          ],
        })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${draft2.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/inbound-receipts/${draft2.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(404);
    });
  });

  // AC8
  describe('AC8: Phân quyền theo ma trận D-016 (Bất biến 9)', () => {
    it('không token → 401; quanly không tạo/sửa/hủy được (403) nhưng xác nhận được (200); nhanvien làm được cả hai', async () => {
      await request(app.getHttpServer()).get('/api/inbound-receipts').expect(401);
      await request(app.getHttpServer()).post('/api/inbound-receipts').send({}).expect(401);
      await request(app.getHttpServer()).get('/api/lots').expect(401);

      await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC8_MGR`,
              expiryDate: '2027-06-01',
              quantity: '5',
            },
          ],
        })
        .expect(403);

      const staffDraft = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC8_STAFF`,
              expiryDate: '2027-06-01',
              quantity: '7',
            },
          ],
        })
        .expect(201);
      createdReceiptIds.push(staffDraft.body.id);

      await request(app.getHttpServer())
        .put(`/api/inbound-receipts/${staffDraft.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC8_STAFF`,
              expiryDate: '2027-06-01',
              quantity: '8',
            },
          ],
        })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${staffDraft.body.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);

      const confirmedByMgr = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${staffDraft.body.id}/confirm`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(confirmedByMgr.body.confirmer.id).toBe(managerUserId);
      createdLotIds.push(confirmedByMgr.body.items[0].lotId);

      // nhanvien cũng có quyền xác nhận
      const staffDraft2 = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId: activeSupplierId,
          receiptDate: '2026-11-22',
          items: [
            {
              productId: product1Id,
              lotCode: `${PREFIX}AC8_STAFF2`,
              expiryDate: '2027-06-01',
              quantity: '3',
            },
          ],
        })
        .expect(201);
      createdReceiptIds.push(staffDraft2.body.id);

      const confirmedByStaff = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${staffDraft2.body.id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(confirmedByStaff.body.confirmer.id).toBe(staffUserId);
      createdLotIds.push(confirmedByStaff.body.items[0].lotId);
    });
  });

  // AC9
  describe('AC9: GET /api/lots tra cứu lô theo sản phẩm, khoảng HSD, mã lô và trạng thái', () => {
    it('lọc đúng theo productId + expiryFrom/expiryTo + search + status, trả onHandQty dạng string', async () => {
      const lotEarly = await prisma.lot.create({
        data: {
          productId: product1Id,
          supplierId: activeSupplierId,
          lotCode: `${PREFIX}LOT_EARLY`,
          expiryDate: new Date('2027-03-15'),
          receivedAt: new Date('2026-11-10'),
          initialQuantity: new Prisma.Decimal('20.500'),
          status: 'active',
        },
      });
      const lotLate = await prisma.lot.create({
        data: {
          productId: product1Id,
          supplierId: activeSupplierId,
          lotCode: `${PREFIX}LOT_LATE`,
          expiryDate: new Date('2027-10-20'),
          receivedAt: new Date('2026-11-12'),
          initialQuantity: new Prisma.Decimal('50.000'),
          status: 'active',
        },
      });
      const lotBlocked = await prisma.lot.create({
        data: {
          productId: product1Id,
          supplierId: activeSupplierId,
          lotCode: `${PREFIX}LOT_BLOCKED`,
          expiryDate: new Date('2027-04-01'),
          receivedAt: new Date('2026-11-11'),
          initialQuantity: new Prisma.Decimal('5.000'),
          status: 'blocked',
        },
      });
      createdLotIds.push(lotEarly.id, lotLate.id, lotBlocked.id);

      await prisma.inventoryLotBalance.create({
        data: { lotId: lotEarly.id, onHandQty: new Prisma.Decimal('20.500') },
      });

      const res = await request(app.getHttpServer())
        .get('/api/lots')
        .query({
          productId: product1Id,
          expiryFrom: '2027-03-01',
          expiryTo: '2027-05-01',
          search: `${PREFIX}LOT_`,
          status: 'active',
        })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(lotEarly.id);
      expect(res.body.items[0].expiryDate).toBe('2027-03-15');
      expect(typeof res.body.items[0].onHandQty).toBe('string');
      expect(res.body.items[0].onHandQty).toBe('20.5');

      // Lô chưa có bản ghi balance trả "0"
      const lateRes = await request(app.getHttpServer())
        .get('/api/lots')
        .query({ search: `${PREFIX}LOT_LATE` })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(lateRes.body.items).toHaveLength(1);
      expect(lateRes.body.items[0].onHandQty).toBe('0');
    });
  });
});
