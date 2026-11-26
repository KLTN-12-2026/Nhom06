import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
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
const PREFIX = `T016_${Date.now()}_`;

function addDaysIso(baseIso: string, deltaDays: number): string {
  const base = parseIsoDateStrict(baseIso);
  return formatDateOnly(new Date(base.getTime() + deltaDays * 86_400_000));
}

interface StockLedgerBody {
  from: string;
  to: string;
  items: Array<{
    product: { id: string; code: string; name: string; unit: string };
    opening: string;
    inbound: string;
    outbound: string;
    adjustment: string;
    closing: string;
  }>;
  totals: {
    opening: string;
    inbound: string;
    outbound: string;
    adjustment: string;
    closing: string;
  };
}

interface DashboardBody {
  asOf: string;
  totalOnHand: string;
  lotsInStock: number;
  nearExpiry: { lots: number; qty: string };
  expired: { lots: number; qty: string };
  valueAtRisk: { amount: string; surplusQty: string; lotsWithoutCost: number } | null;
  monthlyInOut: Array<{ month: string; inbound: string; outbound: string }>;
  riskSummary: Array<{ level: string; lots: number; surplusQty: string }> | null;
  topLots: Array<{
    lotId: string;
    lotCode: string;
    onHandQty: string;
    riskLevel: string | null;
  }>;
  pendingProposals: number | null;
  pendingOrders: Array<{
    id: string;
    orderNo: string;
    status: string;
    itemCount: number;
  }>;
}

interface RiskReportBody {
  latestRun: { id: string; runType: string; finishedAt: string | null } | null;
  expiry: {
    evaluationDate: string;
    nearExpiry: { lots: number; qty: string };
    expired: { lots: number; qty: string };
  };
  byRiskLevel: Array<{ level: string; lots: number; surplusQty: string }>;
  proposalsByStatus: Record<string, number>;
  executionsByStatus: Record<string, number>;
  hasSufficientActualData: boolean;
  lots: Array<{
    lot: { id: string; lotCode: string };
    product: { id: string; code: string };
    forecastDemand: string;
    estimatedSurplus: string;
    actualHandledQty: string | null;
    riskLevel: string;
    proposalStatus: string | null;
    executionStatus: string | null;
    runId: string;
    proposalId: string | null;
  }>;
}

describe('Báo cáo NXT, Dashboard, Báo cáo rủi ro cận hạn & Xuất Excel (T-016 E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testStartedAt: Date;
  let todayVn: string;

  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let noDashboardUserToken: string;
  let noAnalysisUserToken: string;

  let managerUserId: string;
  let supplierId: string;
  let agencyId: string;

  let groupAId: string;
  let groupBId: string;
  let prodAId: string;
  let prodBId: string;
  let lotA1Id: string;
  let lotA2Id: string;
  let lotB1Id: string;

  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdInboundIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdOutboundIds: string[] = [];
  const createdStockCountIds: string[] = [];
  const createdLotIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdAnalysisRunIds: string[] = [];
  const createdProposalIds: string[] = [];

  async function loginAs(username: string, password = DEMO_PASSWORD): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function createCustomUserWithPermissions(
    suffix: string,
    permissionCodes: string[],
  ): Promise<{ userId: string; token: string }> {
    const role = await prisma.role.create({
      data: {
        code: `${PREFIX}ROLE_${suffix}`,
        name: `Vai trò test ${suffix}`,
      },
    });
    createdRoleIds.push(role.id);

    if (permissionCodes.length > 0) {
      const perms = await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true },
      });
      if (perms.length > 0) {
        await prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4);
    const username = `${PREFIX.toLowerCase()}u_${suffix.toLowerCase()}`;
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@kho-ai.local`,
        passwordHash,
        fullName: `Người dùng test ${suffix}`,
        status: 'active',
        userRoles: {
          create: { roleId: role.id },
        },
      },
    });
    createdUserIds.push(user.id);

    const token = await loginAs(username);
    return { userId: user.id, token };
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

    const [manager, supplier, agency] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findFirstOrThrow({ where: { status: 'active' } }),
      prisma.agency.findFirstOrThrow({ where: { status: 'active' } }),
    ]);

    managerUserId = manager.id;
    supplierId = supplier.id;
    agencyId = agency.id;

    // Tạo 2 tài khoản tùy chỉnh cho AC7:
    // 1) Không có cả reports.read lẫn inventory.read → /dashboard 403
    // 2) Có inventory.read nhưng thiếu analysis.read → /dashboard 200 với valueAtRisk: null, riskSummary: null
    const [noDash, noAnalysis] = await Promise.all([
      createCustomUserWithPermissions('NO_DASH', ['catalog.read']),
      createCustomUserWithPermissions('NO_ANALYSIS', ['inventory.read']),
    ]);
    noDashboardUserToken = noDash.token;
    noAnalysisUserToken = noAnalysis.token;

    // Tạo 2 nhóm hàng & 2 sản phẩm riêng cho kịch bản E2E
    const groupA = await prisma.productGroup.create({
      data: { code: `${PREFIX}GA`, name: `Nhóm test A ${PREFIX}` },
    });
    const groupB = await prisma.productGroup.create({
      data: { code: `${PREFIX}GB`, name: `Nhóm test B ${PREFIX}` },
    });
    groupAId = groupA.id;
    groupBId = groupB.id;
    createdGroupIds.push(groupAId, groupBId);

    const prodA = await prisma.product.create({
      data: {
        code: `${PREFIX}SPA`,
        name: 'Sản phẩm test báo cáo A',
        groupId: groupAId,
        unit: 'Thùng',
        shelfLifeDays: 180,
      },
    });
    const prodB = await prisma.product.create({
      data: {
        code: `${PREFIX}SPB`,
        name: 'Sản phẩm test báo cáo B',
        groupId: groupBId,
        unit: 'Lốc',
        shelfLifeDays: 90,
      },
    });
    prodAId = prodA.id;
    prodBId = prodB.id;
    createdProductIds.push(prodAId, prodBId);
  });

  afterAll(async () => {
    if (prisma) {
      if (createdProposalIds.length > 0) {
        await prisma.treatmentExecutionUpdate.deleteMany({
          where: { execution: { proposalId: { in: createdProposalIds } } },
        });
        await prisma.treatmentExecution.deleteMany({
          where: { proposalId: { in: createdProposalIds } },
        });
        await prisma.proposalDecision.deleteMany({
          where: { proposalId: { in: createdProposalIds } },
        });
        await prisma.llmExplanation.deleteMany({
          where: { proposalId: { in: createdProposalIds } },
        });
        await prisma.treatmentProposal.deleteMany({
          where: { id: { in: createdProposalIds } },
        });
      }
      if (createdAnalysisRunIds.length > 0) {
        await prisma.lotRiskAssessment.deleteMany({
          where: { analysisRunId: { in: createdAnalysisRunIds } },
        });
        await prisma.analysisRun.deleteMany({
          where: { id: { in: createdAnalysisRunIds } },
        });
      }
      if (createdLotIds.length > 0) {
        await prisma.expiryAlert.deleteMany({ where: { lotId: { in: createdLotIds } } });
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: createdLotIds } } });
      }
      if (createdStockCountIds.length > 0) {
        await prisma.stockCountItem.deleteMany({
          where: { countId: { in: createdStockCountIds } },
        });
        await prisma.stockCount.deleteMany({ where: { id: { in: createdStockCountIds } } });
      }
      if (createdOrderIds.length > 0) {
        const linkedOutbounds = await prisma.outboundReceipt.findMany({
          where: { orderId: { in: createdOrderIds } },
          select: { id: true },
        });
        for (const ob of linkedOutbounds) {
          if (!createdOutboundIds.includes(ob.id)) {
            createdOutboundIds.push(ob.id);
          }
        }
      }
      if (createdOutboundIds.length > 0) {
        await prisma.outboundReceiptItem.deleteMany({
          where: { outboundId: { in: createdOutboundIds } },
        });
        await prisma.outboundReceipt.deleteMany({ where: { id: { in: createdOutboundIds } } });
      }
      if (createdOrderIds.length > 0) {
        await prisma.orderLotAllocation.deleteMany({
          where: { orderItem: { orderId: { in: createdOrderIds } } },
        });
        await prisma.agencyOrderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
        await prisma.agencyOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
      }
      if (createdInboundIds.length > 0) {
        await prisma.inboundReceiptItem.deleteMany({
          where: { receiptId: { in: createdInboundIds } },
        });
        await prisma.inboundReceipt.deleteMany({ where: { id: { in: createdInboundIds } } });
      }
      if (createdLotIds.length > 0) {
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: createdLotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: createdLotIds } } });
      }
      if (createdProductIds.length > 0) {
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }
      if (createdGroupIds.length > 0) {
        await prisma.productGroup.deleteMany({ where: { id: { in: createdGroupIds } } });
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
          createdAt: { gte: testStartedAt },
          entityId: {
            in: [
              ...createdInboundIds,
              ...createdOrderIds,
              ...createdOutboundIds,
              ...createdStockCountIds,
            ],
          },
        },
      });
    }

    if (app) {
      await app.close();
    }
  });

  describe('AC7 — Phân quyền toàn bộ route báo cáo & bảng điều khiển', () => {
    it('trả 401 khi không có token cho cả 5 endpoint', async () => {
      await request(app.getHttpServer()).get('/api/reports/dashboard').expect(401);
      await request(app.getHttpServer()).get('/api/reports/stock-ledger').expect(401);
      await request(app.getHttpServer()).get('/api/reports/stock-ledger.xlsx').expect(401);
      await request(app.getHttpServer()).get('/api/reports/stock-ledger/monthly').expect(401);
      await request(app.getHttpServer()).get('/api/reports/risk').expect(401);
    });

    it('nhanvien xem được /dashboard (200) nhưng bị chặn 403 ở 4 endpoint báo cáo', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/reports/stock-ledger')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/reports/stock-ledger.xlsx')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/reports/stock-ledger/monthly')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/reports/risk')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('người dùng thiếu cả reports.read lẫn inventory.read bị chặn 403 ở /dashboard', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${noDashboardUserToken}`)
        .expect(403);
    });

    it('quanly và admin đều gọi được 200 mọi endpoint báo cáo', async () => {
      for (const token of [managerToken, adminToken]) {
        await request(app.getHttpServer())
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        await request(app.getHttpServer())
          .get('/api/reports/stock-ledger')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        await request(app.getHttpServer())
          .get('/api/reports/stock-ledger/monthly')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        await request(app.getHttpServer())
          .get('/api/reports/risk')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });
  });

  describe('AC2, AC3, AC6 — Luồng nhập + đơn chưa xuất + xuất một phần + kiểm kê + lọc kỳ + xuất Excel', () => {
    it('khớp tồn cuối kỳ NXT với tổng tồn các lô sau nhập, xuất một phần và duyệt kiểm kê; đơn chưa xuất không đổi tồn', async () => {
      const expiryLong = addDaysIso(todayVn, 120);
      const expiryMid = addDaysIso(todayVn, 20);

      // 1) Tạo & xác nhận phiếu nhập 1 (bằng admin có reports.read để lưu đơn giá): prodA lô L1 (100 @ 10000) + prodB lô LB1 (50, không đơn giá)
      const in1 = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId: prodAId,
              lotCode: `${PREFIX}LA1`,
              expiryDate: expiryLong,
              quantity: '100',
              unitCost: '10000',
            },
            {
              productId: prodBId,
              lotCode: `${PREFIX}LB1`,
              expiryDate: expiryMid,
              quantity: '50',
              unitCost: null,
            },
          ],
        })
        .expect(201);
      createdInboundIds.push((in1.body as { id: string }).id);

      const in1Confirmed = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${(in1.body as { id: string }).id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const confirmedItems1 = (
        in1Confirmed.body as { items: Array<{ productId: string; lotId: string }> }
      ).items;
      lotA1Id = confirmedItems1.find((i) => i.productId === prodAId)!.lotId;
      lotB1Id = confirmedItems1.find((i) => i.productId === prodBId)!.lotId;
      createdLotIds.push(lotA1Id, lotB1Id);

      // 2) Phiếu nhập 2 (bằng admin có reports.read để lưu đơn giá): nhập bổ sung cùng lô LA1 (300 @ 14000 → bình quân gia quyền = 13000) + lô LA2 (60 @ 25000)
      const in2 = await request(app.getHttpServer())
        .post('/api/inbound-receipts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          supplierId,
          receiptDate: todayVn,
          items: [
            {
              productId: prodAId,
              lotCode: `${PREFIX}LA1`,
              expiryDate: expiryLong,
              quantity: '300',
              unitCost: '14000',
            },
            {
              productId: prodAId,
              lotCode: `${PREFIX}LA2`,
              expiryDate: addDaysIso(todayVn, 45),
              quantity: '60',
              unitCost: '25000',
            },
          ],
        })
        .expect(201);
      createdInboundIds.push((in2.body as { id: string }).id);

      const in2Confirmed = await request(app.getHttpServer())
        .post(`/api/inbound-receipts/${(in2.body as { id: string }).id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      const confirmedItems2 = (
        in2Confirmed.body as { items: Array<{ lotCode: string; lotId: string }> }
      ).items;
      lotA2Id = confirmedItems2.find((i) => i.lotCode === `${PREFIX}LA2`)!.lotId;
      createdLotIds.push(lotA2Id);

      // 3) Tạo đơn đại lý (CHƯA XUẤT) → xác nhận không làm thay đổi NXT
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          agencyId,
          orderDate: todayVn,
          items: [{ productId: prodAId, requestedQty: '80' }],
        })
        .expect(201);
      const orderId = (orderRes.body as { id: string }).id;
      const orderItemId = (orderRes.body as { items: Array<{ id: string }> }).items[0].id;
      createdOrderIds.push(orderId);

      const ledgerBeforeOutbound = await request(app.getHttpServer())
        .get(`/api/reports/stock-ledger?from=${todayVn}&to=${todayVn}&productId=${prodAId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const beforeBody = ledgerBeforeOutbound.body as StockLedgerBody;
      expect(beforeBody.items).toHaveLength(1);
      expect(beforeBody.items[0]).toMatchObject({
        opening: '0',
        inbound: '460',
        outbound: '0',
        adjustment: '0',
        closing: '460',
      });

      // 4) Xuất một phần đơn đại lý (35 đơn vị từ lô LA2)
      const outboundRes = await request(app.getHttpServer())
        .post(`/api/orders/${orderId}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [{ orderItemId, lotId: lotA2Id, quantity: '35' }],
        })
        .expect(201);
      createdOutboundIds.push((outboundRes.body as { id: string }).id);

      // 5) Lập, gửi duyệt và duyệt phiếu kiểm kê cho LA1 (400 → 392, chênh -8)
      const scRes = await request(app.getHttpServer())
        .post('/api/stock-counts')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          countedAt: new Date().toISOString(),
          note: 'Kiểm kê E2E T-016',
          items: [{ lotId: lotA1Id, countedQty: '392', reason: 'Hư hỏng 8 thùng' }],
        })
        .expect(201);
      const scId = (scRes.body as { id: string }).id;
      createdStockCountIds.push(scId);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${scId}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/stock-counts/${scId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // 6) Kiểm tra NXT với to = hôm nay cho nhóm A: closing = tổng tồn các lô của prodA
      const ledgerGroupA = await request(app.getHttpServer())
        .get(`/api/reports/stock-ledger?from=${todayVn}&to=${todayVn}&groupId=${groupAId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const bodyA = ledgerGroupA.body as StockLedgerBody;
      expect(bodyA.items).toHaveLength(1);
      expect(bodyA.items[0]).toMatchObject({
        opening: '0',
        inbound: '460',
        outbound: '35',
        adjustment: '-8',
        closing: '417',
      });

      // Đối chiếu trực tiếp với tổng bảng inventory_lot_balances của prodA
      const balancesA = await prisma.inventoryLotBalance.findMany({
        where: { lot: { productId: prodAId } },
        select: { onHandQty: true },
      });
      const sumLotsA = balancesA.reduce(
        (acc, row) => acc.plus(row.onHandQty),
        new Prisma.Decimal(0),
      );
      expect(bodyA.items[0].closing).toBe(sumLotsA.toString());

      // AC3: Kỳ tương lai không có giao dịch → opening = closing, inbound = outbound = adjustment = 0
      const tomorrowVn = addDaysIso(todayVn, 1);
      const futureDayVn = addDaysIso(todayVn, 2);
      const futureLedger = await request(app.getHttpServer())
        .get(
          `/api/reports/stock-ledger?from=${tomorrowVn}&to=${futureDayVn}&productId=${prodAId}`,
        )
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const futureBody = futureLedger.body as StockLedgerBody;
      expect(futureBody.items).toHaveLength(1);
      expect(futureBody.items[0]).toMatchObject({
        opening: '417',
        inbound: '0',
        outbound: '0',
        adjustment: '0',
        closing: '417',
      });

      // AC3: Kỳ quá khứ trước mọi giao dịch của prodA → items rỗng
      const pastFrom = addDaysIso(todayVn, -30);
      const pastTo = addDaysIso(todayVn, -20);
      const pastLedger = await request(app.getHttpServer())
        .get(`/api/reports/stock-ledger?from=${pastFrom}&to=${pastTo}&productId=${prodAId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect((pastLedger.body as StockLedgerBody).items).toEqual([]);

      // AC6: Xuất Excel .xlsx khớp header tiếng Việt, số dòng và dòng Tổng như JSON
      const xlsxRes = await request(app.getHttpServer())
        .get(`/api/reports/stock-ledger.xlsx?from=${todayVn}&to=${todayVn}&groupId=${groupAId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(xlsxRes.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(xlsxRes.headers['content-disposition']).toContain(
        `Bao-cao-NXT_${todayVn}_${todayVn}.xlsx`,
      );

      const workbook = new ExcelJS.Workbook();
      const rawBuffer = xlsxRes.body as Buffer;
      await workbook.xlsx.load(rawBuffer as unknown as ExcelJS.Buffer);
      const sheet = workbook.getWorksheet('Nhap-Xuat-Ton');
      expect(sheet).toBeDefined();

      // Header ở dòng 5
      const headerValues = (sheet!.getRow(5).values as unknown[]).slice(1);
      expect(headerValues).toEqual([
        'STT',
        'Mã sản phẩm',
        'Tên sản phẩm',
        'ĐVT',
        'Tồn đầu kỳ',
        'Nhập',
        'Xuất',
        'Điều chỉnh',
        'Tồn cuối kỳ',
      ]);

      // Dòng dữ liệu prodA ở dòng 6
      const row6 = (sheet!.getRow(6).values as unknown[]).slice(1);
      expect(row6[1]).toBe(`${PREFIX}SPA`);
      expect(row6[4]).toBe(0);
      expect(row6[5]).toBe(460);
      expect(row6[6]).toBe(35);
      expect(row6[7]).toBe(-8);
      expect(row6[8]).toBe(417);

      // Dòng Tổng ở dòng 7
      const row7 = (sheet!.getRow(7).values as unknown[]).slice(1);
      expect(row7[1]).toBe('Tổng');
      expect(row7[5]).toBe(460);
      expect(row7[6]).toBe(35);
      expect(row7[7]).toBe(-8);
      expect(row7[8]).toBe(417);
    });
  });

  describe('AC4 & AC5 — Khớp Dashboard với màn nguồn + valueAtRisk + Báo cáo rủi ro không đếm trùng', () => {
    it('khớp /dashboard với /inventory/summary, /expiry-alerts/summary, /orders và trả null khi chưa có lượt phân tích', async () => {
      const existingRiskRuns = await prisma.analysisRun.count({
        where: { status: 'succeeded', runType: { in: ['RISK', 'FULL'] } },
      });

      const [dashRes, invRes, expRes, ordRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/inventory/summary')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/expiry-alerts/summary')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/orders?page=1&pageSize=100')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
      ]);

      const dash = dashRes.body as DashboardBody;
      const inv = invRes.body as { totalQty: string; lotCount: number };
      const exp = expRes.body as {
        evaluationDate: string;
        nearExpiry: { lots: number; qty: string };
        expired: { lots: number; qty: string };
      };
      const orders = (ordRes.body as { items: Array<{ id: string; status: string }> }).items;

      expect(dash.asOf).toBe(exp.evaluationDate);
      expect(dash.totalOnHand).toBe(inv.totalQty);
      expect(dash.lotsInStock).toBe(inv.lotCount);
      expect(dash.nearExpiry).toEqual(exp.nearExpiry);
      expect(dash.expired).toEqual(exp.expired);
      expect(dash.monthlyInOut).toHaveLength(12);

      // pendingOrders chỉ chứa đơn confirmed hoặc partial, tối đa 5
      expect(dash.pendingOrders.length).toBeLessThanOrEqual(5);
      for (const order of dash.pendingOrders) {
        expect(['confirmed', 'partial']).toContain(order.status);
      }
      const pendingOrderIdsInSystem = new Set(
        orders.filter((o) => o.status === 'confirmed' || o.status === 'partial').map((o) => o.id),
      );
      for (const order of dash.pendingOrders) {
        expect(pendingOrderIdsInSystem.has(order.id)).toBe(true);
      }

      if (existingRiskRuns === 0) {
        expect(dash.valueAtRisk).toBeNull();
        expect(dash.riskSummary).toBeNull();
      }
    });

    it('tính đúng valueAtRisk (2 lô có giá bình quân gia quyền, 1 lô thiếu giá), ẩn khối phân tích khi thiếu analysis.read và chống đếm trùng ở /reports/risk', async () => {
      // Tạo 2 lượt phân tích liên tiếp (run1 cũ hơn run2) để kiểm tra chống đếm trùng lô ở /reports/risk
      const run1Finished = new Date(Date.now() - 3_600_000);
      const run2Finished = new Date();

      const run1 = await prisma.analysisRun.create({
        data: {
          runType: 'RISK',
          triggerType: 'MANUAL',
          status: 'succeeded',
          requestedBy: managerUserId,
          modelVersion: 'rf-test-v1',
          startedAt: new Date(run1Finished.getTime() - 1000),
          finishedAt: run1Finished,
        },
      });
      const run2 = await prisma.analysisRun.create({
        data: {
          runType: 'FULL',
          triggerType: 'MANUAL',
          status: 'succeeded',
          requestedBy: managerUserId,
          modelVersion: 'rf-test-v2',
          startedAt: new Date(run2Finished.getTime() - 1000),
          finishedAt: run2Finished,
        },
      });
      createdAnalysisRunIds.push(run1.id, run2.id);

      // Lượt 1 đánh giá LA1
      const assess1 = await prisma.lotRiskAssessment.create({
        data: {
          analysisRunId: run1.id,
          lotId: lotA1Id,
          onHandSnapshot: new Prisma.Decimal('392'),
          estimatedDemandBeforeExpiry: new Prisma.Decimal('300'),
          estimatedSurplusQty: new Prisma.Decimal('92'),
          riskLevel: 'medium',
          basis: { note: 'run1' },
        },
      });

      // Lượt 2 (mới nhất) đánh giá:
      // - LA1: surplus 50 × avgCost 13.000 = 650.000 (medium)
      // - LA2: surplus 20 × avgCost 25.000 = 500.000 (high)
      // - LB1: surplus 30, không đơn giá → lotsWithoutCost = 1 (critical)
      // Tổng valueAtRisk = 1.150.000, surplusQty = 100, lotsWithoutCost = 1
      await prisma.lotRiskAssessment.create({
        data: {
          analysisRunId: run2.id,
          lotId: lotA1Id,
          onHandSnapshot: new Prisma.Decimal('392'),
          estimatedDemandBeforeExpiry: new Prisma.Decimal('342'),
          estimatedSurplusQty: new Prisma.Decimal('50'),
          riskLevel: 'medium',
          basis: { note: 'run2' },
        },
      });
      const assess2A2 = await prisma.lotRiskAssessment.create({
        data: {
          analysisRunId: run2.id,
          lotId: lotA2Id,
          onHandSnapshot: new Prisma.Decimal('25'),
          estimatedDemandBeforeExpiry: new Prisma.Decimal('5'),
          estimatedSurplusQty: new Prisma.Decimal('20'),
          riskLevel: 'high',
          basis: { note: 'run2' },
        },
      });
      await prisma.lotRiskAssessment.create({
        data: {
          analysisRunId: run2.id,
          lotId: lotB1Id,
          onHandSnapshot: new Prisma.Decimal('50'),
          estimatedDemandBeforeExpiry: new Prisma.Decimal('20'),
          estimatedSurplusQty: new Prisma.Decimal('30'),
          riskLevel: 'critical',
          basis: { note: 'run2' },
        },
      });

      // Tạo 1 đề xuất gắn lượt 1 (approved + execution có actualQty = 12) để kiểm tra D-026 link fallback
      const propA1 = await prisma.treatmentProposal.create({
        data: {
          riskAssessmentId: assess1.id,
          lotId: lotA1Id,
          actionType: 'PRIORITIZE_FEFO',
          proposedQty: new Prisma.Decimal('50'),
          rationale: 'Ưu tiên xuất FEFO',
          sourceRunId: run1.id,
          status: 'approved',
          snapshot: { ruleCode: 'R_MED' },
          execution: {
            create: {
              status: 'in_progress',
              plannedQty: new Prisma.Decimal('50'),
              actualQty: new Prisma.Decimal('12'),
              responsibleUserId: managerUserId,
            },
          },
        },
      });
      // Đề xuất chờ duyệt cho LA2 (chưa có execution → actualHandledQty = null)
      const propA2 = await prisma.treatmentProposal.create({
        data: {
          riskAssessmentId: assess2A2.id,
          lotId: lotA2Id,
          actionType: 'CONTACT_AGENCY',
          proposedQty: new Prisma.Decimal('20'),
          rationale: 'Liên hệ đại lý đẩy hàng',
          sourceRunId: run2.id,
          status: 'pending',
          snapshot: { ruleCode: 'R_HIGH' },
        },
      });
      createdProposalIds.push(propA1.id, propA2.id);

      // 1) Dashboard cho quản lý (có analysis.read)
      const dashManagerRes = await request(app.getHttpServer())
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const dashManager = dashManagerRes.body as DashboardBody;

      expect(dashManager.valueAtRisk).toEqual({
        amount: '1150000',
        surplusQty: '100',
        lotsWithoutCost: 1,
      });
      expect(dashManager.riskSummary).toEqual([
        { level: 'critical', lots: 1, surplusQty: '30' },
        { level: 'high', lots: 1, surplusQty: '20' },
        { level: 'medium', lots: 1, surplusQty: '50' },
        { level: 'low', lots: 0, surplusQty: '0' },
      ]);
      expect(dashManager.topLots.slice(0, 3).map((l) => l.lotId)).toEqual([
        lotB1Id,
        lotA2Id,
        lotA1Id,
      ]);

      // 2) Dashboard cho user thiếu analysis.read → valueAtRisk & riskSummary đều null
      const dashNoAnalysisRes = await request(app.getHttpServer())
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${noAnalysisUserToken}`)
        .expect(200);
      const dashNoAnalysis = dashNoAnalysisRes.body as DashboardBody;
      expect(dashNoAnalysis.valueAtRisk).toBeNull();
      expect(dashNoAnalysis.riskSummary).toBeNull();

      // 3) Báo cáo rủi ro /api/reports/risk?productId=prodAId:
      // LA1 xuất hiện ở cả run1 và run2 nhưng chỉ được đếm 1 lần (thuộc run2),
      // vẫn nối được đề xuất approved từ run1 + actualHandledQty = '12'.
      const riskRes = await request(app.getHttpServer())
        .get(`/api/reports/risk?productId=${prodAId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const riskBody = riskRes.body as RiskReportBody;

      expect(riskBody.latestRun?.id).toBe(run2.id);
      expect(riskBody.lots).toHaveLength(2);
      expect(riskBody.hasSufficientActualData).toBe(true);

      const rowA2 = riskBody.lots.find((l) => l.lot.id === lotA2Id)!;
      expect(rowA2).toMatchObject({
        forecastDemand: '5',
        estimatedSurplus: '20',
        actualHandledQty: null,
        riskLevel: 'high',
        proposalStatus: 'pending',
        executionStatus: null,
        runId: run2.id,
        proposalId: propA2.id,
      });

      const rowA1 = riskBody.lots.find((l) => l.lot.id === lotA1Id)!;
      expect(rowA1).toMatchObject({
        forecastDemand: '342',
        estimatedSurplus: '50',
        actualHandledQty: '12',
        riskLevel: 'medium',
        proposalStatus: 'approved',
        executionStatus: 'in_progress',
        runId: run2.id,
        proposalId: propA1.id,
      });

      // Lọc theo prodBId (chưa có dữ liệu thực hiện) → hasSufficientActualData = false
      const riskBRes = await request(app.getHttpServer())
        .get(`/api/reports/risk?productId=${prodBId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      const riskBBody = riskBRes.body as RiskReportBody;
      expect(riskBBody.lots).toHaveLength(1);
      expect(riskBBody.lots[0].actualHandledQty).toBeNull();
      expect(riskBBody.hasSufficientActualData).toBe(false);
    });
  });
});
