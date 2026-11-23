import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import {
  formatDateOnly,
  getVnTodayDateString,
  parseIsoDateStrict,
} from '../src/modules/expiry/domain/vn-date';
import { ExpiryThresholdsService } from '../src/modules/expiry/expiry-thresholds.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponseBody {
  accessToken: string;
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const E2E_PREFIX = 'T011_';

function addDays(baseIso: string, deltaDays: number): Date {
  const base = parseIsoDateStrict(baseIso);
  return new Date(base.getTime() + deltaDays * 86_400_000);
}

describe('Ngưỡng cảnh báo HSD và cảnh báo hàng cận hạn (T-011 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let thresholdsService: ExpiryThresholdsService;
  let testStartedAt: Date;

  let staffToken: string;
  let managerToken: string;
  let initialGlobalId: string;
  let initialGlobalSnapshot: {
    warningDays: number;
    criticalDays: number;
    minDeliveryDays: number | null;
    effectiveFrom: Date;
  };

  let sp001Id: string;
  let sp002Id: string;
  let sp003Id: string;
  let suaGroupId: string;

  const createdLotIds: string[] = [];

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
    onHandQty: string;
  }): Promise<string> {
    const lot = await prisma.lot.create({
      data: {
        productId: params.productId,
        lotCode: params.lotCode,
        expiryDate: params.expiryDate,
        receivedAt: addDays(getVnTodayDateString(), -30),
        initialQuantity: new Prisma.Decimal('100.000'),
        status: 'active',
      },
    });
    createdLotIds.push(lot.id);

    await prisma.inventoryLotBalance.create({
      data: {
        lotId: lot.id,
        onHandQty: new Prisma.Decimal(params.onHandQty),
      },
    });

    return lot.id;
  }

  beforeAll(async () => {
    process.env.EXPIRY_CRON_ENABLED = 'false';
    testStartedAt = new Date();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    thresholdsService = app.get(ExpiryThresholdsService);

    staffToken = await loginAs('nhanvien');
    managerToken = await loginAs('quanly');

    const globalRow = await prisma.expiryThreshold.findFirstOrThrow({
      where: { scope: 'GLOBAL', effectiveTo: null },
    });
    initialGlobalId = globalRow.id;
    initialGlobalSnapshot = {
      warningDays: globalRow.warningDays,
      criticalDays: globalRow.criticalDays,
      minDeliveryDays: globalRow.minDeliveryDays,
      effectiveFrom: globalRow.effectiveFrom,
    };

    const [sp001, sp002, sp003, suaGroup] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP003' } }),
      prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } }),
    ]);

    sp001Id = sp001.id;
    sp002Id = sp002.id;
    sp003Id = sp003.id;
    suaGroupId = suaGroup.id;
  });

  afterAll(async () => {
    try {
      if (createdLotIds.length > 0) {
        await prisma.expiryAlert.deleteMany({
          where: { lotId: { in: createdLotIds } },
        });
        await prisma.inventoryLotBalance.deleteMany({
          where: { lotId: { in: createdLotIds } },
        });
        await prisma.lot.deleteMany({
          where: { id: { in: createdLotIds } },
        });
      }

      // Xóa mọi bản ngưỡng tạo trong thời gian test rồi khôi phục GLOBAL seed ban đầu
      await prisma.expiryAlert.deleteMany({
        where: { threshold: { createdAt: { gte: testStartedAt } } },
      });
      await prisma.expiryThreshold.deleteMany({
        where: {
          id: { not: initialGlobalId },
          createdAt: { gte: testStartedAt },
        },
      });
      await prisma.expiryThreshold.update({
        where: { id: initialGlobalId },
        data: {
          warningDays: initialGlobalSnapshot.warningDays,
          criticalDays: initialGlobalSnapshot.criticalDays,
          minDeliveryDays: initialGlobalSnapshot.minDeliveryDays,
          effectiveFrom: initialGlobalSnapshot.effectiveFrom,
          effectiveTo: null,
        },
      });

      await prisma.auditLog.deleteMany({
        where: { createdAt: { gte: testStartedAt } },
      });
    } finally {
      await app.close();
    }
  });

  // AC7: Phân quyền và xác thực
  describe('AC7: Phân quyền và xác thực', () => {
    it('không có token → 401 trên các route ngưỡng và cảnh báo', async () => {
      await request(app.getHttpServer()).get('/api/expiry-thresholds').expect(401);
      await request(app.getHttpServer()).get('/api/expiry-alerts').expect(401);
      await request(app.getHttpServer()).post('/api/expiry-alerts/evaluate').send({}).expect(401);
    });

    it('nhanvien đọc được (200) nhưng bị chặn 403 khi sửa ngưỡng hoặc chạy evaluate', async () => {
      await request(app.getHttpServer())
        .get('/api/expiry-thresholds')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/expiry-thresholds/history')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/expiry-alerts')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/expiry-alerts/summary')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/expiry-thresholds/global')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ warningDays: 25, criticalDays: 5, minDeliveryDays: 7 })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/expiry-thresholds/overrides')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ scope: 'PRODUCT', targetId: sp002Id, warningDays: 10 })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/expiry-alerts/evaluate')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({})
        .expect(403);
    });
  });

  // AC2 & AC3: Cập nhật ngưỡng chung, validation, trùng override, lịch sử và bất biến không đổi lô/tồn
  describe('AC2 & AC3: Cấu hình ngưỡng, lịch sử, validation và 409 trùng đối tượng', () => {
    it('validate số âm và criticalDays > warningDays → 400 có errors[].field', async () => {
      const badCrit = await request(app.getHttpServer())
        .put('/api/expiry-thresholds/global')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ warningDays: 10, criticalDays: 15, minDeliveryDays: 7 })
        .expect(400);

      expect(
        (badCrit.body.errors as Array<{ field: string }>).map((e) => e.field),
      ).toContain('criticalDays');

      const badNegative = await request(app.getHttpServer())
        .put('/api/expiry-thresholds/global')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ warningDays: -1, criticalDays: -2, minDeliveryDays: -3 })
        .expect(400);

      expect(
        (badNegative.body.errors as Array<{ field: string }>).map((e) => e.field),
      ).toEqual(expect.arrayContaining(['warningDays', 'criticalDays', 'minDeliveryDays']));
    });

    it('cập nhật ngưỡng chung đóng bản cũ, tạo bản mới, ghi audit log và không đổi HSD/tồn lô', async () => {
      const todayVn = getVnTodayDateString();
      const probeLotId = await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${E2E_PREFIX}PROBE_AC2`,
        expiryDate: addDays(todayVn, 90),
        onHandQty: '25.000',
      });
      const lotBefore = await prisma.lot.findUniqueOrThrow({ where: { id: probeLotId } });
      const balBefore = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: probeLotId },
      });

      const updateRes = await request(app.getHttpServer())
        .put('/api/expiry-thresholds/global')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ warningDays: 30, criticalDays: 7, minDeliveryDays: 10 })
        .expect(200);

      expect(updateRes.body).toMatchObject({
        warningDays: 30,
        criticalDays: 7,
        minDeliveryDays: 10,
        effectiveFrom: todayVn,
      });

      // Bản cũ phải có effective_to = todayVn
      const oldGlobal = await prisma.expiryThreshold.findUniqueOrThrow({
        where: { id: initialGlobalId },
      });
      expect(oldGlobal.effectiveTo ? formatDateOnly(oldGlobal.effectiveTo) : null).toBe(todayVn);

      // Lịch sử GLOBAL trả ít nhất 2 bản
      const historyRes = await request(app.getHttpServer())
        .get('/api/expiry-thresholds/history')
        .query({ scope: 'GLOBAL' })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(historyRes.body.items.length).toBeGreaterThanOrEqual(2);

      // Audit log đã được ghi
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'expiry_threshold',
          eventType: 'EXPIRY_THRESHOLD_GLOBAL_UPDATED',
          createdAt: { gte: testStartedAt },
        },
      });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);

      // Hàm export getMinDeliveryDays trả đúng giá trị mới
      await expect(thresholdsService.getMinDeliveryDays(todayVn)).resolves.toBe(10);

      // HSD và tồn lô không bị sửa (PB18 AC9)
      const lotAfter = await prisma.lot.findUniqueOrThrow({ where: { id: probeLotId } });
      const balAfter = await prisma.inventoryLotBalance.findUniqueOrThrow({
        where: { lotId: probeLotId },
      });
      expect(lotAfter.expiryDate.getTime()).toBe(lotBefore.expiryDate.getTime());
      expect(balAfter.onHandQty.toString()).toBe(balBefore.onHandQty.toString());

      // Đưa minDeliveryDays về 7 cho các test tiếp theo
      await request(app.getHttpServer())
        .put('/api/expiry-thresholds/global')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ warningDays: 30, criticalDays: 7, minDeliveryDays: 7 })
        .expect(200);
    });

    it('thêm override trùng đối tượng đang hiệu lực → 409; sửa và kết thúc hiệu lực hoạt động đúng', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/expiry-thresholds/overrides')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ scope: 'PRODUCT_GROUP', targetId: suaGroupId, warningDays: 45 })
        .expect(201);
      const overrideId = createRes.body.id as string;

      // Trùng đối tượng đang hiệu lực -> 409
      await request(app.getHttpServer())
        .post('/api/expiry-thresholds/overrides')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ scope: 'PRODUCT_GROUP', targetId: suaGroupId, warningDays: 40 })
        .expect(409);

      // Sửa ngưỡng riêng -> đóng bản cũ, tạo bản mới
      const editedRes = await request(app.getHttpServer())
        .put(`/api/expiry-thresholds/overrides/${overrideId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ warningDays: 42 })
        .expect(200);
      expect(editedRes.body.warningDays).toBe(42);
      expect(editedRes.body.id).not.toBe(overrideId);

      // Kết thúc hiệu lực bản mới -> effectiveTo != null, không xóa vật lý
      const endedRes = await request(app.getHttpServer())
        .post(`/api/expiry-thresholds/overrides/${editedRes.body.id}/end`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(endedRes.body.effectiveTo).toBe(getVnTodayDateString());

      // Kết thúc lại lần nữa -> 409
      await request(app.getHttpServer())
        .post(`/api/expiry-thresholds/overrides/${editedRes.body.id}/end`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(409);
    });
  });

  // AC4, AC5, AC6: Danh sách cảnh báo, summary, đổi date/ngưỡng, evaluate idempotent & không đổi tồn
  describe('AC4, AC5, AC6: Danh sách cảnh báo, đổi ngày/ngưỡng và evaluate idempotent', () => {
    let overrideSp002Id: string;

    it('AC4: lọc đúng tồn > 0, áp dụng override PRODUCT 10 ngày, phân loại severity và tổng hợp summary chính xác', async () => {
      const todayVn = getVnTodayDateString();

      // Tạo override PRODUCT 10 ngày cho SP002
      const overrideRes = await request(app.getHttpServer())
        .post('/api/expiry-thresholds/overrides')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ scope: 'PRODUCT', targetId: sp002Id, warningDays: 10 })
        .expect(201);
      overrideSp002Id = overrideRes.body.id as string;

      // Hàm export resolveThreshold trả đúng override cho SP002 và GLOBAL cho SP003
      const resolvedSp002 = await thresholdsService.resolveThreshold(sp002Id, todayVn);
      expect(resolvedSp002).toMatchObject({ scope: 'PRODUCT', warningDays: 10, criticalDays: 7 });

      // Chèn 5 lô đúng mô tả AC4 + 1 lô warning (SP003 còn 20 ngày không override) để phủ đủ 3 mức
      await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${E2E_PREFIX}EXP_5`,
        expiryDate: addDays(todayVn, -5),
        onHandQty: '5.000',
      });
      await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${E2E_PREFIX}EXP_ZERO`,
        expiryDate: addDays(todayVn, -2),
        onHandQty: '0.000',
      });
      await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${E2E_PREFIX}CRIT_3`,
        expiryDate: addDays(todayVn, 3),
        onHandQty: '10.000',
      });
      await createLotWithBalance({
        productId: sp002Id,
        lotCode: `${E2E_PREFIX}OVR_20`,
        expiryDate: addDays(todayVn, 20),
        onHandQty: '15.000',
      });
      await createLotWithBalance({
        productId: sp001Id,
        lotCode: `${E2E_PREFIX}NORM_60`,
        expiryDate: addDays(todayVn, 60),
        onHandQty: '20.000',
      });
      await createLotWithBalance({
        productId: sp003Id,
        lotCode: `${E2E_PREFIX}WARN_20`,
        expiryDate: addDays(todayVn, 20),
        onHandQty: '8.000',
      });

      // Lọc đúng các lô T011_ của bài test
      const listRes = await request(app.getHttpServer())
        .get('/api/expiry-alerts')
        .query({ search: E2E_PREFIX })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(listRes.body.evaluationDate).toBe(todayVn);
      const items = listRes.body.items as Array<{
        lot: { lotCode: string };
        severity: string;
        daysRemaining: number;
        onHandQty: string;
        thresholdApplied: { scope: string; warningDays: number };
      }>;

      // Phải trả đúng 3 lô: EXP_5 (expired), CRIT_3 (critical), WARN_20 (warning)
      // Loại EXP_ZERO (tồn 0), NORM_60 (normal), và OVR_20 (normal vì override 10 ngày)
      expect(items.map((i) => ({ lotCode: i.lot.lotCode, severity: i.severity }))).toEqual([
        { lotCode: `${E2E_PREFIX}EXP_5`, severity: 'expired' },
        { lotCode: `${E2E_PREFIX}CRIT_3`, severity: 'critical' },
        { lotCode: `${E2E_PREFIX}WARN_20`, severity: 'warning' },
      ]);
      expect(items[0].onHandQty).toBe('5');
      expect(items[0].daysRemaining).toBe(-5);
      expect(items[2].thresholdApplied).toMatchObject({ scope: 'GLOBAL', warningDays: 30 });

      // Kiểm tra lọc theo severity và maxDaysRemaining
      const onlyExpired = await request(app.getHttpServer())
        .get('/api/expiry-alerts')
        .query({ search: E2E_PREFIX, severity: 'expired' })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(onlyExpired.body.total).toBe(1);

      const maxFiveDays = await request(app.getHttpServer())
        .get('/api/expiry-alerts')
        .query({ search: E2E_PREFIX, maxDaysRemaining: 5 })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(maxFiveDays.body.total).toBe(2);

      // Summary phải chứa ít nhất số lô/tổng đơn vị khớp với bộ lô test (kho seed chưa có lô sẵn)
      const summaryRes = await request(app.getHttpServer())
        .get('/api/expiry-alerts/summary')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(summaryRes.body).toMatchObject({
        evaluationDate: todayVn,
        expired: { lots: 1, qty: '5' },
        nearExpiry: { lots: 2, qty: '18' },
        totalAlertLots: 3,
        global: { warningDays: 30, criticalDays: 7, minDeliveryDays: 7 },
      });
      expect(summaryRes.body.overridesSummary).toContain('riêng SP002 10 ngày');
    });

    it('AC5: đổi date truy vấn và đổi ngưỡng → kết quả cảnh báo cập nhật theo ngay', async () => {
      const todayVn = getVnTodayDateString();
      const plus40Days = formatDateOnly(addDays(todayVn, 40));

      // Khi dịch ngày đánh giá +40 ngày: lô NORM_60 (còn 20 ngày) vào warning, lô OVR_20 (quá 20 ngày) vào expired
      const futureRes = await request(app.getHttpServer())
        .get('/api/expiry-alerts')
        .query({ date: plus40Days, search: E2E_PREFIX })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      const futureCodes = (futureRes.body.items as Array<{ lot: { lotCode: string } }>).map(
        (i) => i.lot.lotCode,
      );
      expect(futureCodes).toContain(`${E2E_PREFIX}NORM_60`);
      expect(futureCodes).toContain(`${E2E_PREFIX}OVR_20`);

      // Đổi override của SP002 từ 10 lên 25 ngày → lô OVR_20 (còn 20 ngày) lập tức xuất hiện ở ngày hôm nay
      await request(app.getHttpServer())
        .put(`/api/expiry-thresholds/overrides/${overrideSp002Id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ warningDays: 25 })
        .expect(200);

      const afterOverrideUpdate = await request(app.getHttpServer())
        .get('/api/expiry-alerts')
        .query({ search: E2E_PREFIX })
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const ovrItem = (
        afterOverrideUpdate.body.items as Array<{
          lot: { lotCode: string };
          severity: string;
          thresholdApplied: { scope: string; warningDays: number };
        }>
      ).find((i) => i.lot.lotCode === `${E2E_PREFIX}OVR_20`);
      expect(ovrItem).toBeDefined();
      expect(ovrItem?.severity).toBe('warning');
      expect(ovrItem?.thresholdApplied).toMatchObject({ scope: 'PRODUCT', warningDays: 25 });
    });

    it('AC6: evaluate chạy 2 lần cùng ngày không nhân đôi expiry_alerts và không đổi tồn / stock_movements', async () => {
      const todayVn = getVnTodayDateString();
      const evalDateObj = parseIsoDateStrict(todayVn);

      const [movementsBefore, balancesBefore] = await Promise.all([
        prisma.stockMovement.count(),
        prisma.inventoryLotBalance.aggregate({ _sum: { onHandQty: true } }),
      ]);

      const run1 = await request(app.getHttpServer())
        .post('/api/expiry-alerts/evaluate')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ date: todayVn })
        .expect(200);

      const alertsCountAfterRun1 = await prisma.expiryAlert.count({
        where: { evaluationDate: evalDateObj },
      });
      expect(alertsCountAfterRun1).toBe(run1.body.evaluatedLots);
      expect(alertsCountAfterRun1).toBe(4); // EXP_5, CRIT_3, WARN_20, OVR_20 (sau khi nâng override lên 25)

      // Lô tồn 0 không được ghi vào expiry_alerts
      const zeroAlert = await prisma.expiryAlert.findFirst({
        where: {
          evaluationDate: evalDateObj,
          lot: { lotCode: `${E2E_PREFIX}EXP_ZERO` },
        },
      });
      expect(zeroAlert).toBeNull();

      // Chạy lần 2 cùng ngày → idempotent, không nhân đôi
      await request(app.getHttpServer())
        .post('/api/expiry-alerts/evaluate')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ date: todayVn })
        .expect(200);

      const alertsCountAfterRun2 = await prisma.expiryAlert.count({
        where: { evaluationDate: evalDateObj },
      });
      expect(alertsCountAfterRun2).toBe(alertsCountAfterRun1);

      // Bất biến 1: số stock_movements và tổng tồn không đổi
      const [movementsAfter, balancesAfter] = await Promise.all([
        prisma.stockMovement.count(),
        prisma.inventoryLotBalance.aggregate({ _sum: { onHandQty: true } }),
      ]);
      expect(movementsAfter).toBe(movementsBefore);
      expect(balancesAfter._sum.onHandQty?.toString()).toBe(
        balancesBefore._sum.onHandQty?.toString(),
      );
    });
  });
});
