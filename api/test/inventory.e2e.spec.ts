import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import {
  getVnTodayDateString,
  parseIsoDateStrict,
} from '../src/modules/expiry/domain/vn-date';
import { StockMovementsController } from '../src/modules/inventory/stock-movements.controller';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponseBody {
  accessToken: string;
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const PREFIX = `T010_E2E_${Date.now()}_`;

function addDaysUtc(baseIso: string, deltaDays: number): Date {
  const base = parseIsoDateStrict(baseIso);
  return new Date(base.getTime() + deltaDays * 86_400_000);
}

describe('Tồn kho theo lô, lịch sử biến động, kiểm kê, khóa lô (T-010 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testStartedAt: Date;
  let todayVn: string;

  let staffToken: string;
  let managerToken: string;
  let staffUserId: string;
  let managerUserId: string;

  let supplierId: string;
  let suaGroupId: string;
  let ngkGroupId: string;
  let sp001Id: string;
  let sp002Id: string;
  let sp011Id: string;

  const createdLotIds: string[] = [];
  const createdInboundIds: string[] = [];
  const createdStockCountIds: string[] = [];
  const createdThresholdIds: string[] = [];

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as LoginResponseBody).accessToken;
  }

  async function createLotWithBalance(params: {
    productId: string;
    lotCode: string;
    expiryDate: Date;
    receivedAt?: Date;
    onHandQty?: string | null;
    status?: 'active' | 'blocked' | 'closed';
  }): Promise<string> {
    const lot = await prisma.lot.create({
      data: {
        productId: params.productId,
        supplierId,
        lotCode: params.lotCode,
        expiryDate: params.expiryDate,
        receivedAt: params.receivedAt ?? addDaysUtc(todayVn, -20),
        initialQuantity: new Prisma.Decimal('100.000'),
        status: params.status ?? 'active',
      },
    });
    createdLotIds.push(lot.id);

    if (params.onHandQty !== null && params.onHandQty !== undefined) {
      await prisma.inventoryLotBalance.create({
        data: {
          lotId: lot.id,
          onHandQty: new Prisma.Decimal(params.onHandQty),
        },
      });
    }

    return lot.id;
  }

  beforeAll(async () => {
    process.env.EXPIRY_CRON_ENABLED = 'false';
    testStartedAt = new Date();
    todayVn = getVnTodayDateString();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    [staffToken, managerToken] = await Promise.all([loginAs('nhanvien'), loginAs('quanly')]);

    const [staff, manager, supplier, suaGroup, ngkGroup, sp001, sp002, sp011] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'nhanvien' } }),
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } }),
      prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } }),
      prisma.productGroup.findUniqueOrThrow({ where: { code: 'NGK' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP011' } }),
    ]);

    staffUserId = staff.id;
    managerUserId = manager.id;
    supplierId = supplier.id;
    suaGroupId = suaGroup.id;
    ngkGroupId = ngkGroup.id;
    sp001Id = sp001.id;
    sp002Id = sp002.id;
    sp011Id = sp011.id;
  });

  afterAll(async () => {
    try {
      if (createdStockCountIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'STOCK_COUNT', sourceId: { in: createdStockCountIds } },
        });
        await prisma.stockCountItem.deleteMany({
          where: { countId: { in: createdStockCountIds } },
        });
        await prisma.stockCount.deleteMany({
          where: { id: { in: createdStockCountIds } },
        });
      }

      if (createdInboundIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'INBOUND_RECEIPT', sourceId: { in: createdInboundIds } },
        });
        await prisma.inboundReceiptItem.deleteMany({
          where: { receiptId: { in: createdInboundIds } },
        });
        await prisma.inboundReceipt.deleteMany({
          where: { id: { in: createdInboundIds } },
        });
      }

      const prefixedLots = await prisma.lot.findMany({
        where: { lotCode: { startsWith: PREFIX } },
        select: { id: true },
      });
      const allLotIds = Array.from(
        new Set([...createdLotIds, ...prefixedLots.map((lot) => lot.id)]),
      );

      if (allLotIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.expiryAlert.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.stockCountItem.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.inboundReceiptItem.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: allLotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } });
      }

      if (createdThresholdIds.length > 0) {
        await prisma.expiryThreshold.deleteMany({ where: { id: { in: createdThresholdIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ['stock_count', 'lot', 'inbound_receipt', 'expiry_threshold'] },
          createdAt: { gte: testStartedAt },
        },
      });
    } finally {
      await app.close();
    }
  });

  // AC1
  describe('AC1: Tồn kho theo lô, tổng hợp theo sản phẩm và ngưỡng HSD override', () => {
    it('lọc đúng theo nhóm, sản phẩm, tình trạng HSD (kể cả override SP), mã lô, ẩn/hiện tồn 0 và tổng sản phẩm = tổng lô', async () => {
      const lotExpired = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC1_EXP`,
        expiryDate: addDaysUtc(todayVn, -5),
        onHandQty: '12.500',
      });
      const lotCritical = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC1_CRIT`,
        expiryDate: addDaysUtc(todayVn, 4),
        onHandQty: '25.250',
      });
      const lotNormal45 = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC1_NORM45`,
        expiryDate: addDaysUtc(todayVn, 45),
        onHandQty: '40.000',
      });
      const lotNgkWarning = await createLotWithBalance({
        productId: sp011Id,
        lotCode: `${PREFIX}AC1_WARN`,
        expiryDate: addDaysUtc(todayVn, 20),
        onHandQty: '15.000',
      });
      const lotEmpty = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC1_EMPTY`,
        expiryDate: addDaysUtc(todayVn, 120),
        onHandQty: '0.000',
      });

      // Mặc định includeEmpty=false: ẩn lô tồn 0, sắp SP001 -> SP002 -> SP004
      const defaultRes = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC1_` })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(defaultRes.body.total).toBe(4);
      expect(defaultRes.body.items.map((item: { lotId: string }) => item.lotId)).toEqual([
        lotNormal45,
        lotExpired,
        lotCritical,
        lotNgkWarning,
      ]);
      expect(defaultRes.body.items[0]).toMatchObject({
        lotId: lotNormal45,
        expiryStatus: 'normal',
        onHandQty: '40',
        lotStatus: 'active',
      });
      expect(defaultRes.body.items[1].expiryStatus).toBe('expired');
      expect(defaultRes.body.items[2].expiryStatus).toBe('critical');
      expect(defaultRes.body.items[3].expiryStatus).toBe('warning');

      // includeEmpty=false tường minh vẫn ẩn lô tồn 0; includeEmpty=true hiện đủ 5 lô
      const explicitFalseRes = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC1_`, includeEmpty: 'false' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(explicitFalseRes.body.total).toBe(4);

      const withEmptyRes = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC1_`, includeEmpty: 'true' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(withEmptyRes.body.total).toBe(5);
      expect(
        withEmptyRes.body.items.some((item: { lotId: string }) => item.lotId === lotEmpty),
      ).toBe(true);

      // Lọc theo groupId (NGK) và theo productId (SP002)
      const groupRes = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC1_`, groupId: ngkGroupId })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(groupRes.body.total).toBe(1);
      expect(groupRes.body.items[0].lotId).toBe(lotNgkWarning);

      const productRes = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC1_`, productId: sp002Id })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(productRes.body.total).toBe(2);

      // Lọc theo expiryStatus = near_expiry (gộp critical + warning)
      const nearRes = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC1_`, expiryStatus: 'near_expiry' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(nearRes.body.items.map((item: { lotId: string }) => item.lotId)).toEqual([
        lotCritical,
        lotNgkWarning,
      ]);

      // Summary: tổng theo sản phẩm = tổng các lô tương ứng (PB15 AC2)
      const summaryRes = await request(app.getHttpServer())
        .get('/api/inventory/summary')
        .query({ search: `${PREFIX}AC1_`, groupId: suaGroupId })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(summaryRes.body.lotCount).toBe(3);
      expect(summaryRes.body.totalQty).toBe('77.75');
      expect(summaryRes.body.byProduct).toHaveLength(2);
      expect(summaryRes.body.byProduct[0]).toMatchObject({
        productId: sp001Id,
        productCode: 'SP001',
        lotCount: 1,
        totalQty: '40',
      });
      expect(summaryRes.body.byProduct[1]).toMatchObject({
        productId: sp002Id,
        productCode: 'SP002',
        lotCount: 2,
        totalQty: '37.75',
      });

      // Thêm override ngưỡng riêng cho sản phẩm SP001 = 60 ngày → lô còn 45 ngày chuyển từ normal sang warning
      const overrideRes = await request(app.getHttpServer())
        .post('/api/expiry-thresholds/overrides')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ scope: 'PRODUCT', targetId: sp001Id, warningDays: 60 })
        .expect(201);
      createdThresholdIds.push(overrideRes.body.id as string);

      try {
        const afterOverrideRes = await request(app.getHttpServer())
          .get('/api/inventory/lots')
          .query({ search: `${PREFIX}AC1_NORM45` })
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200);

        expect(afterOverrideRes.body.items[0].expiryStatus).toBe('warning');
        expect(afterOverrideRes.body.items[0].warningDays).toBe(60);
      } finally {
        await prisma.expiryThreshold.delete({ where: { id: overrideRes.body.id as string } });
      }
    });
  });

  // AC2
  describe('AC2: Lịch sử biến động chỉ đọc, gắn chứng từ và lọc theo nghiệp vụ/ngày VN/lô', () => {
    it('trả đúng dòng INBOUND và ADJUSTMENT sau phiếu nhập + kiểm kê, lọc đúng ngày VN và không có route ghi', async () => {
      const lotCode = `${PREFIX}AC2_LOT`;

      // 1. Lập & xác nhận phiếu nhập -> tạo dòng INBOUND
      const draftInbound = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          notes: 'Nhập kiểm thử AC2',
          items: [
            {
              productId: sp001Id,
              lotCode,
              expiryDate: '2027-08-01',
              quantity: '20',
            },
          ],
        })
        .expect(201);
      createdInboundIds.push(draftInbound.body.id as string);

      const confirmedInbound = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${draftInbound.body.id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      const lotId = confirmedInbound.body.items[0].lotId as string;
      createdLotIds.push(lotId);

      // 2. Lập, gửi & duyệt phiếu kiểm kê giảm 3 -> tạo dòng ADJUSTMENT
      const createdCount = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T10:00:00+07:00`,
          items: [{ lotId, countedQty: '17', reason: 'Kiểm đếm thiếu 3 đơn vị' }],
        })
        .expect(201);
      createdStockCountIds.push(createdCount.body.id as string);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${createdCount.body.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const approvedCount = await request(app.getHttpServer())
        .post(`/api/stock-counts/${createdCount.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // Tra cứu theo lotId → trả đúng 2 dòng ADJUSTMENT (mới hơn) và INBOUND
      const movementsRes = await request(app.getHttpServer())
        .get('/api/stock-movements')
        .query({ lotId })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(movementsRes.body.total).toBe(2);
      const [adjRow, inbRow] = movementsRes.body.items;

      expect(adjRow).toMatchObject({
        movementType: 'ADJUSTMENT',
        lotCode,
        quantityDelta: '-3',
        balanceAfter: '17',
        source: {
          type: 'STOCK_COUNT',
          id: approvedCount.body.id,
          documentNo: approvedCount.body.countNo,
          url: `/stock-counts/${approvedCount.body.id}`,
        },
        actor: { id: managerUserId, fullName: 'Nguyễn Văn Dương' },
      });

      expect(inbRow).toMatchObject({
        movementType: 'INBOUND',
        lotCode,
        quantityDelta: '20',
        balanceAfter: '20',
        source: {
          type: 'INBOUND_RECEIPT',
          id: confirmedInbound.body.id,
          documentNo: confirmedInbound.body.receiptNo,
          url: `/inbound/${confirmedInbound.body.id}`,
        },
        actor: { id: staffUserId, fullName: 'Trương Thành Lê' },
      });

      // Lọc theo movementType=ADJUSTMENT và tìm theo documentNo
      const adjOnlyRes = await request(app.getHttpServer())
        .get('/api/stock-movements')
        .query({ movementType: 'ADJUSTMENT', search: approvedCount.body.countNo })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(adjOnlyRes.body.total).toBe(1);
      expect(adjOnlyRes.body.items[0].source.documentNo).toBe(approvedCount.body.countNo);

      // Kiểm lọc theo ranh giới ngày VN (UTC+7): 00:30 VN ngày 2026-11-24 = 17:30 UTC ngày 2026-11-23
      await prisma.stockMovement.update({
        where: { id: BigInt(adjRow.id as string) },
        data: { occurredAt: new Date('2026-11-24T00:30:00+07:00') },
      });

      const vnDay23 = await request(app.getHttpServer())
        .get('/api/stock-movements')
        .query({ lotId, movementType: 'ADJUSTMENT', from: '2026-11-23', to: '2026-11-23' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(vnDay23.body.total).toBe(0);

      const vnDay24 = await request(app.getHttpServer())
        .get('/api/stock-movements')
        .query({ lotId, movementType: 'ADJUSTMENT', from: '2026-11-24', to: '2026-11-24' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(vnDay24.body.total).toBe(1);

      // Kiểm cấu trúc controller & HTTP: không có route POST/PUT/PATCH/DELETE cho stock-movements
      const scanner = new MetadataScanner();
      const controllerInstance = app.get(StockMovementsController);
      const controllerPath = Reflect.getMetadata(PATH_METADATA, StockMovementsController) as string;
      expect(controllerPath).toBe('stock-movements');

      const methods = scanner
        .getAllMethodNames(Object.getPrototypeOf(controllerInstance) as object)
        .map((name) =>
          Reflect.getMetadata(
            METHOD_METADATA,
            (controllerInstance as unknown as Record<string, unknown>)[name] as object,
          ) as RequestMethod | undefined,
        )
        .filter((m): m is RequestMethod => m !== undefined);

      expect(methods).toEqual([RequestMethod.GET]);

      await request(app.getHttpServer())
        .post('/api/stock-movements')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .put('/api/stock-movements/1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .patch('/api/stock-movements/1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .delete('/api/stock-movements/1')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });
  });

  // AC3
  describe('AC3: Lập/sửa/gửi/hủy phiếu kiểm kê không đổi tồn (Bất biến 1) và validate chặt', () => {
    it('nháp/sửa/gửi/hủy không đổi tồn và không tạo movement; từ chối thiếu lý do lệch, số âm, trùng lô, lô closed', async () => {
      const lot1Id = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC3_L1`,
        expiryDate: addDaysUtc(todayVn, 90),
        onHandQty: '10.000',
      });
      const lot2Id = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC3_L2`,
        expiryDate: addDaysUtc(todayVn, 90),
        onHandQty: '25.000',
      });
      const closedLotId = await createLotWithBalance({
        productId: sp011Id,
        lotCode: `${PREFIX}AC3_CLOSED`,
        expiryDate: addDaysUtc(todayVn, 90),
        onHandQty: '0.000',
        status: 'closed',
      });

      const movementCountBefore = await prisma.stockMovement.count({
        where: { lotId: { in: [lot1Id, lot2Id] } },
      });

      // Validate: lệch thiếu lý do -> 400
      const noReasonRes = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:00:00+07:00`,
          items: [{ lotId: lot1Id, countedQty: '8' }],
        })
        .expect(400);
      expect(noReasonRes.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'items.0.reason' })]),
      );

      // Validate: countedQty âm -> 400
      const negativeRes = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:00:00+07:00`,
          items: [{ lotId: lot1Id, countedQty: '-1', reason: 'âm' }],
        })
        .expect(400);
      expect(negativeRes.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'items.0.countedQty' })]),
      );

      // Validate: trùng lô -> 400
      await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:00:00+07:00`,
          items: [
            { lotId: lot1Id, countedQty: '10' },
            { lotId: lot1Id, countedQty: '10' },
          ],
        })
        .expect(400);

      // Validate: lô closed -> 400
      await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:00:00+07:00`,
          items: [{ lotId: closedLotId, countedQty: '0' }],
        })
        .expect(400);

      // Tạo nháp hợp lệ -> sinh số KK...
      const created = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:00:00+07:00`,
          note: 'Kiểm kê định kỳ',
          items: [{ lotId: lot1Id, countedQty: '8', reason: 'Thiếu 2 đơn vị' }],
        })
        .expect(201);
      createdStockCountIds.push(created.body.id as string);
      expect(created.body.countNo).toMatch(/^KK\d{10}$/);
      expect(created.body.status).toBe('draft');
      expect(created.body.items[0].systemQty).toBe('10');
      expect(created.body.items[0].varianceQty).toBe('-2');

      // Sửa nháp: thêm lot2 -> giữ systemQty lot1=10 và lấy tồn hiện tại lot2=25
      const updated = await request(app.getHttpServer())
        .put(`/api/stock-counts/${created.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:30:00+07:00`,
          note: 'Bổ sung lô 2',
          items: [
            { lotId: lot1Id, countedQty: '9', reason: 'Đếm lại thiếu 1' },
            { lotId: lot2Id, countedQty: '25' },
          ],
        })
        .expect(200);
      expect(updated.body.items).toHaveLength(2);
      expect(updated.body.items[0].systemQty).toBe('10');
      expect(updated.body.items[1].systemQty).toBe('25');

      // Gửi duyệt -> submitted; sửa sau khi gửi -> 409
      await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/stock-counts/${created.body.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T09:30:00+07:00`,
          items: [{ lotId: lot1Id, countedQty: '10' }],
        })
        .expect(409);

      // Hủy phiếu submitted bởi quanly (bắt buộc lý do)
      await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: '   ' })
        .expect(400);

      const cancelled = await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Kiểm đếm lại toàn kho vào ngày mai' })
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.note).toContain('Kiểm đếm lại toàn kho vào ngày mai');

      // Xác minh Bất biến 1: tồn và số movement không thay đổi
      const [bal1, bal2, movementCountAfter] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot1Id } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot2Id } }),
        prisma.stockMovement.count({ where: { lotId: { in: [lot1Id, lot2Id] } } }),
      ]);
      expect(bal1.onHandQty.toString()).toBe('10');
      expect(bal2.onHandQty.toString()).toBe('25');
      expect(movementCountAfter).toBe(movementCountBefore);
    });
  });

  // AC4
  describe('AC4: Duyệt kiểm kê cập nhật tồn cho lô lệch và không tạo movement cho lô khớp', () => {
    it('lô A 10->8 tạo movement -2 balance_after 8; lô B 5->5 không tạo movement; lô C 10->13.25 tạo +3.25; duyệt lần 2 -> 409', async () => {
      const lotA = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC4_A`,
        expiryDate: addDaysUtc(todayVn, 100),
        onHandQty: '10.000',
      });
      const lotB = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC4_B`,
        expiryDate: addDaysUtc(todayVn, 100),
        onHandQty: '5.000',
      });
      const lotC = await createLotWithBalance({
        productId: sp011Id,
        lotCode: `${PREFIX}AC4_C`,
        expiryDate: addDaysUtc(todayVn, 100),
        onHandQty: '10.000',
      });

      const created = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T11:00:00+07:00`,
          items: [
            { lotId: lotA, countedQty: '8', reason: 'Hư hỏng 2 đơn vị' },
            { lotId: lotB, countedQty: '5' },
            { lotId: lotC, countedQty: '13.25', reason: 'Kiểm thừa 3.25 đơn vị' },
          ],
        })
        .expect(201);
      createdStockCountIds.push(created.body.id as string);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const approved = await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(approved.body.status).toBe('approved');
      expect(approved.body.approver.id).toBe(managerUserId);
      expect(approved.body.approvedAt).toBeTruthy();

      const [balA, balB, balC, movements] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lotA } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lotB } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lotC } }),
        prisma.stockMovement.findMany({
          where: { sourceType: 'STOCK_COUNT', sourceId: created.body.id as string },
        }),
      ]);

      expect(balA.onHandQty.toString()).toBe('8');
      expect(balB.onHandQty.toString()).toBe('5');
      expect(balC.onHandQty.toString()).toBe('13.25');

      // Chỉ có đúng 2 movement cho lô A và lô C; lô B không tạo movement
      expect(movements).toHaveLength(2);
      const movA = movements.find((m) => m.lotId === lotA);
      const movB = movements.find((m) => m.lotId === lotB);
      const movC = movements.find((m) => m.lotId === lotC);

      expect(movA).toBeDefined();
      expect(movA!.movementType).toBe('ADJUSTMENT');
      expect(movA!.quantityDelta.toString()).toBe('-2');
      expect(movA!.balanceAfter.toString()).toBe('8');
      expect(movA!.actorUserId).toBe(managerUserId);

      expect(movB).toBeUndefined();

      expect(movC).toBeDefined();
      expect(movC!.movementType).toBe('ADJUSTMENT');
      expect(movC!.quantityDelta.toString()).toBe('3.25');
      expect(movC!.balanceAfter.toString()).toBe('13.25');

      // Duyệt lần 2 -> 409, tồn và movement giữ nguyên
      await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(409);

      const balAAfterDouble = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: lotA },
      });
      expect(balAAfterDouble.onHandQty.toString()).toBe('8');
    });
  });

  // AC5
  describe('AC5: Tồn lô thay đổi sau khi kiểm đếm -> duyệt trả 409, giữ nguyên tồn và phiếu submitted', () => {
    it('xác nhận phiếu nhập chen vào tăng tồn lô A trước khi duyệt -> 409 liệt kê lô lệch, không đổi tồn', async () => {
      const lotACode = `${PREFIX}AC5_A`;
      const lotA = await createLotWithBalance({
        productId: sp001Id,
        lotCode: lotACode,
        expiryDate: new Date('2027-09-01'),
        onHandQty: '10.000',
      });
      const lotB = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC5_B`,
        expiryDate: new Date('2027-09-01'),
        onHandQty: '20.000',
      });

      const created = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T12:00:00+07:00`,
          items: [
            { lotId: lotA, countedQty: '8', reason: 'Thiếu 2' },
            { lotId: lotB, countedQty: '18', reason: 'Thiếu 2' },
          ],
        })
        .expect(201);
      createdStockCountIds.push(created.body.id as string);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      // Phiếu nhập chen vào cùng mã lô lotA làm tồn tăng từ 10 -> 15
      const inboundDraft = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId: sp001Id,
              lotCode: lotACode,
              expiryDate: '2027-09-01',
              quantity: '5',
            },
          ],
        })
        .expect(201);
      createdInboundIds.push(inboundDraft.body.id as string);

      await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${inboundDraft.body.id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      // Duyệt kiểm kê -> 409 liệt kê lô lệch lotA
      const approveRes = await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(409);

      expect(approveRes.body.message).toBe('Tồn đã thay đổi sau khi kiểm đếm, cần đối chiếu lại');
      expect(approveRes.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: `lot:${lotACode}`,
          }),
        ]),
      );

      // Xác minh không đổi tồn bất kỳ lô nào, 0 movement từ phiếu kiểm kê, phiếu vẫn submitted
      const [balA, balB, countAfter, movements] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lotA } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lotB } }),
        prisma.stockCount.findUniqueOrThrow({ where: { id: created.body.id as string } }),
        prisma.stockMovement.findMany({
          where: { sourceType: 'STOCK_COUNT', sourceId: created.body.id as string },
        }),
      ]);
      expect(balA.onHandQty.toString()).toBe('15');
      expect(balB.onHandQty.toString()).toBe('20');
      expect(countAfter.status).toBe('submitted');
      expect(countAfter.approvedBy).toBeNull();
      expect(movements).toHaveLength(0);
    });
  });

  // AC6 (đồng thời trên PostgreSQL thật; rollback ép lỗi nằm trong stock-counts.service.spec.ts)
  describe('AC6: Duyệt đồng thời (Promise.all) trên PostgreSQL thật', () => {
    it('hai request duyệt cùng phiếu song song -> đúng 1 thành công (200) và 1 thất bại (409), không nhân đôi movement', async () => {
      const lotId = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC6_SAME`,
        expiryDate: addDaysUtc(todayVn, 120),
        onHandQty: '50.000',
      });

      const created = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T13:00:00+07:00`,
          items: [{ lotId, countedQty: '45', reason: 'Thiếu 5 đơn vị' }],
        })
        .expect(201);
      createdStockCountIds.push(created.body.id as string);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${created.body.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/stock-counts/${created.body.id}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app.getHttpServer())
          .post(`/api/stock-counts/${created.body.id}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
      ]);

      expect([res1.status, res2.status].sort()).toEqual([200, 409]);

      const [balance, movements] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId } }),
        prisma.stockMovement.findMany({
          where: { sourceType: 'STOCK_COUNT', sourceId: created.body.id as string },
        }),
      ]);
      expect(balance.onHandQty.toString()).toBe('45');
      expect(movements).toHaveLength(1);
    });

    it('hai phiếu khác nhau giao 2 lô ngược thứ tự duyệt song song -> không deadlock, đúng 1 thành công và 1 trả 409', async () => {
      const lot1 = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC6_OVERLAP_1`,
        expiryDate: addDaysUtc(todayVn, 120),
        onHandQty: '40.000',
      });
      const lot2 = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC6_OVERLAP_2`,
        expiryDate: addDaysUtc(todayVn, 120),
        onHandQty: '30.000',
      });

      const count1 = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T14:00:00+07:00`,
          items: [
            { lotId: lot1, countedQty: '38', reason: 'Phiếu 1 giảm 2' },
            { lotId: lot2, countedQty: '29', reason: 'Phiếu 1 giảm 1' },
          ],
        })
        .expect(201);
      createdStockCountIds.push(count1.body.id as string);

      const count2 = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T14:05:00+07:00`,
          items: [
            { lotId: lot2, countedQty: '28', reason: 'Phiếu 2 giảm 2' },
            { lotId: lot1, countedQty: '37', reason: 'Phiếu 2 giảm 3' },
          ],
        })
        .expect(201);
      createdStockCountIds.push(count2.body.id as string);

      await Promise.all([
        request(app.getHttpServer())
          .post(`/api/stock-counts/${count1.body.id}/submit`)
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200),
        request(app.getHttpServer())
          .post(`/api/stock-counts/${count2.body.id}/submit`)
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200),
      ]);

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/stock-counts/${count1.body.id}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
        request(app.getHttpServer())
          .post(`/api/stock-counts/${count2.body.id}/approve`)
          .set('Authorization', `Bearer ${managerToken}`),
      ]);

      expect([res1.status, res2.status].sort()).toEqual([200, 409]);
    });
  });

  // AC7
  describe('AC7: Phân quyền theo D-016 và khóa/mở khóa lô', () => {
    it('kiểm đủ 401/403/200 cho nhanvien & quanly (gồm nhanvien hủy phiếu submitted -> 403) và khóa/mở khóa lô không đổi tồn', async () => {
      const lotId = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${PREFIX}AC7_LOCK`,
        expiryDate: addDaysUtc(todayVn, 80),
        onHandQty: '33.000',
      });
      const closedLotId = await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${PREFIX}AC7_CLOSED`,
        expiryDate: addDaysUtc(todayVn, 80),
        onHandQty: '0.000',
        status: 'closed',
      });

      // Không token -> 401 trên mọi route mới
      await request(app.getHttpServer()).get('/api/inventory/lots').expect(401);
      await request(app.getHttpServer()).get('/api/inventory/summary').expect(401);
      await request(app.getHttpServer()).get('/api/stock-movements').expect(401);
      await request(app.getHttpServer()).get('/api/stock-counts').expect(401);
      await request(app.getHttpServer())
        .patch(`/api/lots/${lotId}/status`)
        .send({ status: 'blocked', reason: 'test' })
        .expect(401);

      // nhanvien lập & hủy draft của chính mình được, nhưng không duyệt / không hủy submitted / không khóa lô được
      const staffDraftToCancel = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T15:00:00+07:00`,
          items: [{ lotId, countedQty: '33' }],
        })
        .expect(201);
      createdStockCountIds.push(staffDraftToCancel.body.id as string);

      // quanly không thể hủy draft của nhanvien -> 403
      await request(app.getHttpServer())
        .post(`/api/stock-counts/${staffDraftToCancel.body.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Thử hủy nháp của người khác' })
        .expect(403);

      // nhanvien hủy draft của mình -> 200
      await request(app.getHttpServer())
        .post(`/api/stock-counts/${staffDraftToCancel.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Nhập nhầm ngày kiểm kê' })
        .expect(200);

      // nhanvien lập & gửi phiếu thứ 2
      const staffSubmitted = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: `${todayVn}T15:10:00+07:00`,
          items: [{ lotId, countedQty: '33' }],
        })
        .expect(201);
      createdStockCountIds.push(staffSubmitted.body.id as string);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${staffSubmitted.body.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      // nhanvien duyệt -> 403; nhanvien hủy phiếu submitted -> 403
      await request(app.getHttpServer())
        .post(`/api/stock-counts/${staffSubmitted.body.id}/approve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${staffSubmitted.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ reason: 'Nhân viên thử hủy phiếu đã gửi' })
        .expect(403);

      // nhanvien khóa lô -> 403
      await request(app.getHttpServer())
        .patch(`/api/lots/${lotId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'blocked', reason: 'Nghi ngờ hư hỏng' })
        .expect(403);

      // quanly khóa lô thiếu lý do -> 400
      await request(app.getHttpServer())
        .patch(`/api/lots/${lotId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'blocked', reason: '  ' })
        .expect(400);

      // quanly khóa lô closed -> 409
      await request(app.getHttpServer())
        .patch(`/api/lots/${closedLotId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'blocked', reason: 'Thử khóa lô đã đóng' })
        .expect(409);

      // quanly khóa lô hợp lệ -> 200, không đổi tồn, có audit LOT_BLOCKED, vẫn hiện trong GET /api/inventory/lots
      const blockedRes = await request(app.getHttpServer())
        .patch(`/api/lots/${lotId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'blocked', reason: 'Bao bì rách, chờ kiểm tra chất lượng' })
        .expect(200);
      expect(blockedRes.body.status).toBe('blocked');
      expect(blockedRes.body.onHandQty).toBe('33');

      const [balAfterBlock, blockMovements, blockAudits] = await Promise.all([
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId } }),
        prisma.stockMovement.findMany({ where: { lotId } }),
        prisma.auditLog.findMany({
          where: { entityType: 'lot', entityId: lotId, eventType: 'LOT_BLOCKED' },
        }),
      ]);
      expect(balAfterBlock.onHandQty.toString()).toBe('33');
      expect(blockMovements).toHaveLength(0);
      expect(blockAudits).toHaveLength(1);

      const invAfterBlock = await request(app.getHttpServer())
        .get('/api/inventory/lots')
        .query({ search: `${PREFIX}AC7_LOCK` })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(invAfterBlock.body.items).toHaveLength(1);
      expect(invAfterBlock.body.items[0].lotStatus).toBe('blocked');

      // Khóa lại lô đã khóa -> 409
      await request(app.getHttpServer())
        .patch(`/api/lots/${lotId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'blocked', reason: 'Khóa lại lần 2' })
        .expect(409);

      // Mở khóa lô -> 200 + audit LOT_UNBLOCKED
      const unblockedRes = await request(app.getHttpServer())
        .patch(`/api/lots/${lotId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'active', reason: 'Đã kiểm định đạt chất lượng' })
        .expect(200);
      expect(unblockedRes.body.status).toBe('active');

      const unblockAudits = await prisma.auditLog.findMany({
        where: { entityType: 'lot', entityId: lotId, eventType: 'LOT_UNBLOCKED' },
      });
      expect(unblockAudits).toHaveLength(1);

      // quanly duyệt phiếu submitted -> 200
      const approvedByMgr = await request(app.getHttpServer())
        .post(`/api/stock-counts/${staffSubmitted.body.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(approvedByMgr.body.status).toBe('approved');
    });
  });
});
