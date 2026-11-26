import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import {
  formatDateOnly,
  getVnTodayDateString,
  parseIsoDateStrict,
} from '../src/modules/expiry/domain/vn-date';
import { PrismaService } from '../src/prisma/prisma.service';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const PREFIX = `T024_${Date.now()}_`;

const FORBIDDEN_MONEY_KEYS = new Set([
  'unitCost',
  'unit_cost',
  'lineTotal',
  'line_total',
  'totalAmount',
  'total_amount',
  'amount',
  'lotsWithoutCost',
  'lots_without_cost',
  'price',
  'cost',
]);

function addDaysIso(baseIso: string, deltaDays: number): string {
  const base = parseIsoDateStrict(baseIso);
  return formatDateOnly(new Date(base.getTime() + deltaDays * 86_400_000));
}

/**
 * Quét đệ quy toàn bộ JSON response để đảm bảo không lọt bất kỳ khóa tiền nào
 * cho người dùng thiếu quyền `reports.read`.
 */
function findMoneyKeysInJson(value: unknown, path = '$'): string[] {
  if (value === null || value === undefined || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, idx) => findMoneyKeysInJson(item, `${path}[${idx}]`));
  }

  const hits: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_MONEY_KEYS.has(key)) {
      hits.push(nextPath);
    }
    hits.push(...findMoneyKeysInJson(nested, nextPath));
  }
  return hits;
}

describe('Ẩn số liệu tiền với người thiếu quyền reports.read (T-024 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testStartedAt: Date;
  let todayVn: string;

  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let reportsOnlyToken: string;

  let managerUserId: string;
  let supplierId: string;
  let productId: string;
  let product2Id: string;

  const createdReceiptIds: string[] = [];
  const createdLotIds: string[] = [];
  const createdAnalysisRunIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    process.env.EXPIRY_CRON_ENABLED = 'false';
    process.env.ANALYSIS_CRON_ENABLED = 'false';
    process.env.ANALYSIS_AUTO_ENABLED = 'false';
    testStartedAt = new Date();
    todayVn = getVnTodayDateString();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    [adminToken, managerToken, staffToken] = await Promise.all([
      loginAs('admin'),
      loginAs('quanly'),
      loginAs('nhanvien'),
    ]);

    const [manager, supplier, products] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findFirstOrThrow({ where: { status: 'active' } }),
      prisma.product.findMany({ where: { status: 'active' }, orderBy: { code: 'asc' }, take: 2 }),
    ]);
    managerUserId = manager.id;
    supplierId = supplier.id;
    productId = products[0].id;
    product2Id = products[1].id;

    // Tạo user có reports.read nhưng thiếu analysis.read để kiểm tra ranh giới dashboard
    const role = await prisma.role.create({
      data: { code: `${PREFIX}ROLE_RPT_ONLY`, name: 'Chỉ xem báo cáo (test T-024)' },
    });
    createdRoleIds.push(role.id);

    const reportsPerm = await prisma.permission.findUniqueOrThrow({
      where: { code: 'reports.read' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: reportsPerm.id },
    });

    const username = `${PREFIX.toLowerCase()}rpt_only`;
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4);
    const customUser = await prisma.user.create({
      data: {
        username,
        email: `${username}@kho-ai.local`,
        passwordHash,
        fullName: 'Người dùng chỉ có reports.read',
        status: 'active',
        userRoles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(customUser.id);
    reportsOnlyToken = await loginAs(username);
  });

  afterAll(async () => {
    try {
      if (createdAnalysisRunIds.length > 0) {
        await prisma.lotRiskAssessment.deleteMany({
          where: { analysisRunId: { in: createdAnalysisRunIds } },
        });
        await prisma.analysisRun.deleteMany({
          where: { id: { in: createdAnalysisRunIds } },
        });
      }

      const lotsByPrefix = await prisma.lot.findMany({
        where: { lotCode: { startsWith: PREFIX } },
        select: { id: true },
      });
      const allLotIds = Array.from(new Set([...createdLotIds, ...lotsByPrefix.map((l) => l.id)]));

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

      if (createdUserIds.length > 0) {
        await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
        await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdRoleIds.length > 0) {
        await prisma.rolePermission.deleteMany({ where: { roleId: { in: createdRoleIds } } });
        await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'inbound_receipt',
          entityId: { in: createdReceiptIds },
          createdAt: { gte: testStartedAt },
        },
      });
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  describe('AC3 — Phiếu nhập (/api/inbound-receipts): ẩn tiền với nhanvien, bỏ qua unitCost khi POST/PUT và giữ đơn giá cũ khi sửa nháp', () => {
    it('nhanvien gửi unitCost khi POST bị bỏ qua; admin lập phiếu có đơn giá rồi nhanvien sửa nháp vẫn giữ nguyên đơn giá cũ; mọi response cho nhanvien không chứa khóa tiền', async () => {
      const staffLotCode = `${PREFIX}STF_L1`;
      const adminLot1 = `${PREFIX}ADM_PRESERVE_L1`;
      const adminLot2 = `${PREFIX}ADM_PRESERVE_L2`;
      const addedLotByStaff = `${PREFIX}STF_ADDED_L3`;
      const cancelLotCode = `${PREFIX}INB_CANCEL`;
      const expiryDate = addDaysIso(todayVn, 120);

      // 1. POST tạo nháp bởi nhanvien dù gửi kèm unitCost → bị bỏ qua (lưu null) và response không chứa khóa tiền
      const staffCreateRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          notes: 'Nhân viên thử gửi unitCost T-024',
          items: [
            {
              productId,
              lotCode: staffLotCode,
              expiryDate,
              quantity: '10',
              unitCost: '320000',
            },
          ],
        })
        .expect(201);

      const staffReceiptId = (staffCreateRes.body as { id: string }).id;
      createdReceiptIds.push(staffReceiptId);
      expect(findMoneyKeysInJson(staffCreateRes.body)).toEqual([]);
      expect(staffCreateRes.body.totalQuantity).toBe('10');

      // Admin/Quản lý kiểm tra lại: unitCost mà nhân viên gửi đã bị bỏ qua → null / totalAmount = '0'
      for (const token of [managerToken, adminToken]) {
        const detailRes = await request(app.getHttpServer())
          .get(`/api/inbound-receipts/${staffReceiptId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(detailRes.body.totalAmount).toBe('0');
        expect(detailRes.body.items[0].unitCost).toBeNull();
        expect(detailRes.body.items[0].lineTotal).toBeNull();
      }

      // 2. Admin lập phiếu nháp có đơn giá ở 2 dòng
      const adminDraftRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          notes: 'Admin lập phiếu có đơn giá T-024',
          items: [
            {
              productId,
              lotCode: adminLot1,
              expiryDate,
              quantity: '10',
              unitCost: '320000',
            },
            {
              productId: product2Id,
              lotCode: adminLot2,
              expiryDate,
              quantity: '5',
              unitCost: '150000',
            },
          ],
        })
        .expect(201);

      const receiptId = (adminDraftRes.body as { id: string }).id;
      const receiptNo = (adminDraftRes.body as { receiptNo: string }).receiptNo;
      createdReceiptIds.push(receiptId);
      expect(adminDraftRes.body.totalAmount).toBe('3950000');
      expect(adminDraftRes.body.items[0].unitCost).toBe('320000');
      expect(adminDraftRes.body.items[1].unitCost).toBe('150000');

      // 3. nhanvien sửa phiếu nháp đó: đổi số lượng dòng 1 (10→20) kèm thử gửi unitCost khác,
      // giữ nguyên dòng 2 (không gửi unitCost), và thêm 1 dòng mới có gửi unitCost →
      // dòng cũ giữ đúng unitCost cũ, dòng mới để null, response cho nhanvien không chứa khóa tiền.
      const staffUpdateRes = await request(app.getHttpServer())
        .put(`/api/inbound-receipts/${receiptId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          notes: 'Nhân viên cập nhật số lượng T-024',
          items: [
            {
              productId,
              lotCode: adminLot1,
              expiryDate,
              quantity: '20',
              unitCost: '999999',
            },
            {
              productId: product2Id,
              lotCode: adminLot2,
              expiryDate,
              quantity: '5',
            },
            {
              productId,
              lotCode: addedLotByStaff,
              expiryDate,
              quantity: '8',
              unitCost: '888888',
            },
          ],
        })
        .expect(200);
      expect(findMoneyKeysInJson(staffUpdateRes.body)).toEqual([]);
      expect(staffUpdateRes.body.totalQuantity).toBe('33');

      // Admin và Quản lý đọc lại: đơn giá dòng cũ còn nguyên (20*320000 + 5*150000 = 7150000), dòng mới null
      for (const token of [managerToken, adminToken]) {
        const detailRes = await request(app.getHttpServer())
          .get(`/api/inbound-receipts/${receiptId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(detailRes.body.totalAmount).toBe('7150000');
        expect(detailRes.body.items).toHaveLength(3);
        expect(detailRes.body.items[0]).toMatchObject({
          lotCode: adminLot1,
          quantity: '20',
          unitCost: '320000',
          lineTotal: '6400000',
        });
        expect(detailRes.body.items[1]).toMatchObject({
          lotCode: adminLot2,
          quantity: '5',
          unitCost: '150000',
          lineTotal: '750000',
        });
        expect(detailRes.body.items[2]).toMatchObject({
          lotCode: addedLotByStaff,
          quantity: '8',
          unitCost: null,
          lineTotal: null,
        });
      }

      // 4. GET danh sách phiếu nhập: 3 vai trò
      const [staffList, managerList, adminList] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/inbound-receipts')
          .query({ search: receiptNo })
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/inbound-receipts')
          .query({ search: receiptNo })
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/inbound-receipts')
          .query({ search: receiptNo })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
      ]);

      expect(staffList.body.items).toHaveLength(1);
      expect(findMoneyKeysInJson(staffList.body)).toEqual([]);
      expect(managerList.body.items[0].totalAmount).toBe('7150000');
      expect(adminList.body.items[0].totalAmount).toBe('7150000');

      // 5. GET chi tiết phiếu nhập bởi nhanvien → không chứa khóa tiền
      const staffDetail = await request(app.getHttpServer())
        .get(`/api/inbound-receipts/${receiptId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(findMoneyKeysInJson(staffDetail.body)).toEqual([]);
      expect(staffDetail.body.items[0].quantity).toBe('20');

      // 6. POST confirm bởi nhanvien → xác nhận thành công, response không chứa khóa tiền
      const staffConfirm = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${receiptId}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(staffConfirm.body.status).toBe('confirmed');
      expect(findMoneyKeysInJson(staffConfirm.body)).toEqual([]);
      for (const item of staffConfirm.body.items as Array<{ lotId: string }>) {
        createdLotIds.push(item.lotId);
      }

      // 7. POST cancel bởi nhanvien trên phiếu nháp khác → response không chứa khóa tiền
      const draft2 = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId,
              lotCode: cancelLotCode,
              expiryDate,
              quantity: '5',
            },
          ],
        })
        .expect(201);
      createdReceiptIds.push(draft2.body.id);
      expect(findMoneyKeysInJson(draft2.body)).toEqual([]);

      const staffCancel = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${draft2.body.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      expect(staffCancel.body.status).toBe('cancelled');
      expect(findMoneyKeysInJson(staffCancel.body)).toEqual([]);

      // 8. Admin (có reports.read) vẫn sửa/hủy đơn giá bình thường và nhận đủ trường tiền
      const adminUpdateRes = await request(app.getHttpServer())
        .put(`/api/inbound-receipts/${staffReceiptId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId,
              lotCode: staffLotCode,
              expiryDate,
              quantity: '4',
              unitCost: '125000',
            },
          ],
        })
        .expect(200);
      expect(adminUpdateRes.body.totalAmount).toBe('500000');
      expect(adminUpdateRes.body.items[0].unitCost).toBe('125000');
      expect(adminUpdateRes.body.items[0].lineTotal).toBe('500000');

      const adminCancel = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${staffReceiptId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(adminCancel.body.totalAmount).toBe('500000');
    });
  });

  describe('AC2 — Dashboard (/api/reports/dashboard): valueAtRisk = null khi thiếu reports.read kể cả khi có analysis.read', () => {
    it('admin và quanly thấy valueAtRisk; nhanvien (có analysis.read, thiếu reports.read) nhận valueAtRisk = null và không lọt khóa tiền nhưng vẫn thấy riskSummary', async () => {
      // Đảm bảo có ít nhất 1 lô đã xác nhận kèm đơn giá và 1 lượt phân tích thành công mới nhất
      const lotCode = `${PREFIX}DASH_LOT`;
      const expiryDate = addDaysIso(todayVn, 15);

      const inRes = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId,
              lotCode,
              expiryDate,
              quantity: '20',
              unitCost: '150000',
            },
          ],
        })
        .expect(201);
      createdReceiptIds.push(inRes.body.id);

      const confirmed = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${inRes.body.id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const lotId = confirmed.body.items[0].lotId as string;
      createdLotIds.push(lotId);

      // Tạo lượt phân tích FULL mới nhất có surplus > 0 để valueAtRisk > 0
      const runFinishedAt = new Date(Date.now() + 60_000);
      const run = await prisma.analysisRun.create({
        data: {
          runType: 'FULL',
          triggerType: 'MANUAL',
          status: 'succeeded',
          requestedBy: managerUserId,
          modelVersion: 'rf-t024-test',
          startedAt: new Date(runFinishedAt.getTime() - 1000),
          finishedAt: runFinishedAt,
        },
      });
      createdAnalysisRunIds.push(run.id);

      await prisma.lotRiskAssessment.create({
        data: {
          analysisRunId: run.id,
          lotId,
          onHandSnapshot: new Prisma.Decimal('20'),
          estimatedDemandBeforeExpiry: new Prisma.Decimal('8'),
          estimatedSurplusQty: new Prisma.Decimal('12'),
          riskLevel: 'high',
          basis: { note: 'T-024 test' },
        },
      });

      const [adminDash, managerDash, staffDash, reportsOnlyDash] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${reportsOnlyToken}`)
          .expect(200),
      ]);

      // admin & quanly thấy valueAtRisk đầy đủ (12 * 150.000 = 1.800.000)
      expect(adminDash.body.valueAtRisk).toEqual({
        amount: '1800000',
        surplusQty: '12',
        lotsWithoutCost: 0,
      });
      expect(managerDash.body.valueAtRisk).toEqual({
        amount: '1800000',
        surplusQty: '12',
        lotsWithoutCost: 0,
      });

      // nhanvien có analysis.read nhưng thiếu reports.read → valueAtRisk = null, không có khóa tiền nào,
      // vẫn giữ nguyên riskSummary vì không chứa tiền
      expect(staffDash.body.valueAtRisk).toBeNull();
      expect(staffDash.body.riskSummary).not.toBeNull();
      expect(findMoneyKeysInJson(staffDash.body)).toEqual([]);

      // User có reports.read nhưng thiếu analysis.read → valueAtRisk = null & riskSummary = null
      expect(reportsOnlyDash.body.valueAtRisk).toBeNull();
      expect(reportsOnlyDash.body.riskSummary).toBeNull();
    });
  });
});
