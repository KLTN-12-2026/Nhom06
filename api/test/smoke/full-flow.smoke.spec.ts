import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../../src/app.config';
import { AppModule } from '../../src/app.module';
import {
  MlClient,
  MlForecastRequest,
  MlForecastResponse,
  MlModelInfoResponse,
} from '../../src/modules/ai/forecast/ml-client.service';
import { addCalendarDays } from '../../src/modules/ai/risk/domain/lot-risk.domain';
import { getVnTodayDateString } from '../../src/modules/expiry/domain/vn-date';
import { PrismaService } from '../../src/prisma/prisma.service';
import { verifyInventoryInvariants } from './inventory-invariants.helper';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const USE_MOCK_ML = process.env.SMOKE_MOCK_ML === 'true';

function buildDeterministicMockMlClient(): Pick<MlClient, 'getModelInfo' | 'forecast'> {
  return {
    getModelInfo: async (): Promise<MlModelInfoResponse> => ({
      model_version: 'rf-v1',
      trained_at: '2026-11-23T00:00:00Z',
      train_start: '2024-12-01',
      train_end: '2026-09-23',
      n_rows: 12680,
      features: ['lag_1', 'lag_7', 'rolling_mean_7', 'level_28'],
      params: { n_estimators: 200 },
      data_source: 'mô phỏng',
      metrics: {
        test_days: 60,
        methods: {
          random_forest: { mean_mae: 5.38, mean_rmse: 8.06 },
          moving_average_7: { mean_mae: 6.65, mean_rmse: 9.17 },
        },
      },
    }),
    forecast: async (req: MlForecastRequest): Promise<MlForecastResponse> => {
      const lastDate = req.history[req.history.length - 1].date;
      return {
        product_code: req.product_code,
        method: req.method,
        model_version: req.method === 'model' ? 'rf-v1' : 'moving-avg-7-v1',
        generated_at: new Date().toISOString(),
        forecast: Array.from({ length: req.horizon_days }, (_, idx) => ({
          date: addCalendarDays(lastDate, idx + 1),
          qty: req.method === 'model' ? 18 : 20,
        })),
      };
    },
  };
}

describe('Smoke test toàn hệ thống qua HTTP (T-017 AC5 + Plan review)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let todayVn: string;

  const originalCronEnv = {
    EXPIRY_CRON_ENABLED: process.env.EXPIRY_CRON_ENABLED,
    ANALYSIS_CRON_ENABLED: process.env.ANALYSIS_CRON_ENABLED,
    ANALYSIS_AUTO_ENABLED: process.env.ANALYSIS_AUTO_ENABLED,
    ANALYSIS_AUTO_DEBOUNCE_MS: process.env.ANALYSIS_AUTO_DEBOUNCE_MS,
  };

  beforeAll(async () => {
    process.env.EXPIRY_CRON_ENABLED = 'false';
    process.env.ANALYSIS_CRON_ENABLED = 'false';
    process.env.ANALYSIS_AUTO_ENABLED = 'false';
    process.env.ANALYSIS_AUTO_DEBOUNCE_MS = '0';

    todayVn = getVnTodayDateString();

    const builder = Test.createTestingModule({
      imports: [AppModule],
    });
    if (USE_MOCK_ML) {
      builder.overrideProvider(MlClient).useValue(buildDeterministicMockMlClient());
    }

    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    process.env.EXPIRY_CRON_ENABLED = originalCronEnv.EXPIRY_CRON_ENABLED;
    process.env.ANALYSIS_CRON_ENABLED = originalCronEnv.ANALYSIS_CRON_ENABLED;
    process.env.ANALYSIS_AUTO_ENABLED = originalCronEnv.ANALYSIS_AUTO_ENABLED;
    process.env.ANALYSIS_AUTO_DEBOUNCE_MS = originalCronEnv.ANALYSIS_AUTO_DEBOUNCE_MS;
  });

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function getStockSnapshot(): Promise<{ movementCount: number; totalOnHand: Prisma.Decimal }> {
    const [movementCount, balances] = await Promise.all([
      prisma.stockMovement.count(),
      prisma.inventoryLotBalance.findMany({ select: { onHandQty: true } }),
    ]);
    const totalOnHand = balances.reduce(
      (sum, row) => sum.add(row.onHandQty),
      new Prisma.Decimal(0),
    );
    return { movementCount, totalOnHand };
  }

  it('đi hết luồng nghiệp vụ chính qua HTTP và giữ vững toàn bộ bất biến tồn kho + phân quyền', async () => {
    const suffix = String(Date.now()).slice(-7);
    const server = app.getHttpServer();

    // 1. Đăng nhập 3 vai trò & kiểm tra phân quyền backend
    const [adminToken, managerToken, staffToken] = await Promise.all([
      loginAs('admin'),
      loginAs('quanly'),
      loginAs('nhanvien'),
    ]);

    await request(server)
      .get('/api/reports/stock-ledger')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);

    await request(server)
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ horizonDays: 60 })
      .expect(403);

    // 2. Tạo NCC và sản phẩm mới (kèm tải nhóm hàng, đại lý và SP002 đã seed)
    const [groupsRes, agenciesRes, productsRes] = await Promise.all([
      request(server)
        .get('/api/product-groups')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200),
      request(server)
        .get('/api/agencies')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200),
      request(server)
        .get('/api/products?search=SP002')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200),
    ]);

    const asList = <T>(body: T[] | { items: T[] }): T[] => (Array.isArray(body) ? body : body.items);
    const groupId = asList(groupsRes.body as Array<{ id: string }> | { items: Array<{ id: string }> })[0].id;
    const agencyId = asList(agenciesRes.body as Array<{ id: string }> | { items: Array<{ id: string }> })[0].id;
    const sp002 = asList(
      productsRes.body as Array<{ id: string; code: string }> | { items: Array<{ id: string; code: string }> },
    ).find((p) => p.code === 'SP002');
    expect(sp002).toBeDefined();

    const supplierRes = await request(server)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: `NCCSMK${suffix}`,
        name: `Nhà cung cấp Smoke ${suffix}`,
        phone: '02363889900',
      })
      .expect(201);
    const supplierId = (supplierRes.body as { id: string }).id;

    const productRes = await request(server)
      .post('/api/products')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: `SPSMK${suffix}`,
        name: `Sản phẩm Smoke ${suffix}`,
        groupId,
        unit: 'thùng',
        shelfLifeDays: 180,
      })
      .expect(201);
    const newProductId = (productRes.body as { id: string }).id;

    // 3. Nhập nháp (không đổi tồn) → Xác nhận nhập (chứng minh HTTP bỏ qua confirmedAt giả lập quá khứ)
    const snapBeforeDraft = await getStockSnapshot();
    const expiredLotCode = `SMK-EXP-${suffix}`;
    const lot1Code = `SMK-L1-${suffix}`;
    const lot2Code = `SMK-L2-${suffix}`;

    const inboundDraftRes = await request(server)
      .post('/api/inbound-receipts')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        supplierId,
        receiptDate: addCalendarDays(todayVn, -60),
        notes: 'Phiếu nhập smoke test',
        items: [
          {
            productId: newProductId,
            lotCode: lot1Code,
            expiryDate: addCalendarDays(todayVn, 120),
            quantity: '100',
            unitCost: '120000',
          },
          {
            productId: newProductId,
            lotCode: lot2Code,
            expiryDate: addCalendarDays(todayVn, 200),
            quantity: '50',
            unitCost: '120000',
          },
          {
            productId: sp002!.id,
            lotCode: expiredLotCode,
            expiryDate: addCalendarDays(todayVn, -10),
            quantity: '30',
            unitCost: '185000',
          },
        ],
      })
      .expect(201);
    const inboundId = (inboundDraftRes.body as { id: string }).id;

    const snapAfterDraft = await getStockSnapshot();
    expect(snapAfterDraft.movementCount).toBe(snapBeforeDraft.movementCount);
    expect(snapAfterDraft.totalOnHand.eq(snapBeforeDraft.totalOnHand)).toBe(true);

    // Gửi kèm confirmedAt quá khứ trong body HTTP: API phải bỏ qua và dùng giờ hiện tại của server
    const fakePastIso = '2024-01-15T00:00:00.000Z';
    const confirmBeforeMs = Date.now() - 5_000;
    const inboundConfirmedRes = await request(server)
      .post(`/api/inbound-receipts/${inboundId}/confirm`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ confirmedAt: fakePastIso })
      .expect(200);

    const confirmedInbound = inboundConfirmedRes.body as {
      status: string;
      confirmedAt: string;
      items: Array<{ lotId: string; lotCode: string; productId: string }>;
    };
    expect(confirmedInbound.status).toBe('confirmed');
    expect(new Date(confirmedInbound.confirmedAt).getTime()).toBeGreaterThanOrEqual(confirmBeforeMs);

    const lot1Id = confirmedInbound.items.find((i) => i.lotCode === lot1Code)!.lotId;
    const expiredLotId = confirmedInbound.items.find((i) => i.lotCode === expiredLotCode)!.lotId;

    const snapAfterConfirm = await getStockSnapshot();
    expect(snapAfterConfirm.movementCount).toBe(snapBeforeDraft.movementCount + 3);
    expect(snapAfterConfirm.totalOnHand.eq(snapBeforeDraft.totalOnHand.add(180))).toBe(true);

    // Chống xác nhận hai lần (bất biến 4)
    await request(server)
      .post(`/api/inbound-receipts/${inboundId}/confirm`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(409);

    // 4. Tạo đơn đại lý → fefo-plan (kiểm loại lô hết hạn & không đổi tồn) → xuất một phần
    const orderRes = await request(server)
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        agencyId,
        orderDate: todayVn,
        notes: 'Đơn đại lý smoke test',
        items: [
          { productId: newProductId, requestedQty: '120' },
          { productId: sp002!.id, requestedQty: '10' },
        ],
      })
      .expect(201);

    const order = orderRes.body as {
      id: string;
      status: string;
      items: Array<{ id: string; productId: string }>;
    };
    expect(order.status).toBe('confirmed');
    const newProductOrderItemId = order.items.find((i) => i.productId === newProductId)!.id;

    const fefoPlanRes = await request(server)
      .get(`/api/orders/${order.id}/fefo-plan`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    const fefoPlan = fefoPlanRes.body as {
      items: Array<{
        product: { id: string };
        lots: Array<{ lotId: string; lotCode: string; rank: number }>;
        excludedLots: Array<{ lotId: string; lotCode: string; reason: string }>;
      }>;
    };

    const newProdFefo = fefoPlan.items.find((i) => i.product.id === newProductId)!;
    expect(newProdFefo.lots[0].lotCode).toBe(lot1Code);
    expect(newProdFefo.lots[1].lotCode).toBe(lot2Code);

    const sp002Fefo = fefoPlan.items.find((i) => i.product.id === sp002!.id)!;
    const excludedExpired = sp002Fefo.excludedLots.find((l) => l.lotId === expiredLotId);
    expect(excludedExpired).toBeDefined();
    expect(excludedExpired!.reason).toContain('hết hạn');

    const snapAfterFefo = await getStockSnapshot();
    expect(snapAfterFefo.movementCount).toBe(snapAfterConfirm.movementCount);
    expect(snapAfterFefo.totalOnHand.eq(snapAfterConfirm.totalOnHand)).toBe(true);

    // Gửi confirmedAt qua HTTP vào POST /api/orders/:id/outbound phải bị chặn 400 (forbidNonWhitelisted)
    await request(server)
      .post(`/api/orders/${order.id}/outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        confirmedAt: fakePastIso,
        items: [{ orderItemId: newProductOrderItemId, lotId: lot1Id, quantity: '60' }],
      })
      .expect(400);

    // Xuất một phần hợp lệ (60 / 120 của sản phẩm mới)
    const outboundRes = await request(server)
      .post(`/api/orders/${order.id}/outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        notes: 'Xuất một phần smoke test',
        items: [{ orderItemId: newProductOrderItemId, lotId: lot1Id, quantity: '60' }],
      })
      .expect(201);

    expect((outboundRes.body as { orderStatus: string }).orderStatus).toBe('partial');

    const snapAfterOutbound = await getStockSnapshot();
    expect(snapAfterOutbound.movementCount).toBe(snapAfterConfirm.movementCount + 1);
    expect(snapAfterOutbound.totalOnHand.eq(snapAfterConfirm.totalOnHand.sub(60))).toBe(true);

    // 5. Kiểm kê: lập nháp → gửi duyệt → duyệt điều chỉnh (chứng minh HTTP bỏ qua approvedAt quá khứ)
    const scCreateRes = await request(server)
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        countedAt: new Date().toISOString(),
        note: 'Kiểm kê smoke test',
        items: [
          {
            lotId: lot1Id,
            countedQty: '38',
            reason: 'Hao hụt mẫu smoke (-2 thùng)',
          },
        ],
      })
      .expect(201);
    const stockCountId = (scCreateRes.body as { id: string }).id;

    await request(server)
      .post(`/api/stock-counts/${stockCountId}/submit`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    const snapBeforeApproveSc = await getStockSnapshot();
    expect(snapBeforeApproveSc.movementCount).toBe(snapAfterOutbound.movementCount);

    const approveBeforeMs = Date.now() - 5_000;
    const scApproveRes = await request(server)
      .post(`/api/stock-counts/${stockCountId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ approvedAt: fakePastIso })
      .expect(200);

    const approvedSc = scApproveRes.body as { status: string; approvedAt: string };
    expect(approvedSc.status).toBe('approved');
    expect(new Date(approvedSc.approvedAt).getTime()).toBeGreaterThanOrEqual(approveBeforeMs);

    const snapAfterApproveSc = await getStockSnapshot();
    expect(snapAfterApproveSc.movementCount).toBe(snapAfterOutbound.movementCount + 1);
    expect(snapAfterApproveSc.totalOnHand.eq(snapAfterOutbound.totalOnHand.sub(2))).toBe(true);

    // 6. Cảnh báo HSD (không đổi tồn)
    await request(server)
      .post('/api/expiry-alerts/evaluate')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const alertsRes = await request(server)
      .get(`/api/expiry-alerts?search=${expiredLotCode}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const alertItems = (alertsRes.body as { items: Array<{ lot: { id: string }; severity: string }> })
      .items;
    expect(alertItems.some((a) => a.lot.id === expiredLotId && a.severity === 'expired')).toBe(
      true,
    );

    const snapAfterAlerts = await getStockSnapshot();
    expect(snapAfterAlerts.movementCount).toBe(snapAfterApproveSc.movementCount);

    // 7. Chạy phân tích FULL (ML thật mặc định, hoặc mock khi SMOKE_MOCK_ML=true) — không đổi tồn
    const analysisRes = await request(server)
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 60 })
      .expect(201);
    expect((analysisRes.body as { status: string }).status).toBe('succeeded');

    const snapAfterAnalysis = await getStockSnapshot();
    expect(snapAfterAnalysis.movementCount).toBe(snapAfterApproveSc.movementCount);
    expect(snapAfterAnalysis.totalOnHand.eq(snapAfterApproveSc.totalOnHand)).toBe(true);

    const riskRes = await request(server)
      .get('/api/analysis/risk/latest')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const riskItems = (
      riskRes.body as { items: Array<{ lot: { id: string }; riskLevel: string }> }
    ).items;
    expect(riskItems.some((r) => r.lot.id === expiredLotId && r.riskLevel === 'critical')).toBe(
      true,
    );

    // 8. Đề xuất & Phê duyệt (ADMIN bị 403; QUANLY duyệt thành công nhưng KHÔNG đổi tồn)
    const proposalsRes = await request(server)
      .get(`/api/proposals?lotId=${expiredLotId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const targetProposal = (
      proposalsRes.body as {
        items: Array<{ id: string; actionType: string; status: string }>;
      }
    ).items.find((p) => p.actionType === 'DISPOSE' && p.status === 'pending');
    expect(targetProposal).toBeDefined();

    const proposalDetailRes = await request(server)
      .get(`/api/proposals/${targetProposal!.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const proposalDetail = proposalDetailRes.body as {
      allowedActions: string[];
      llmInput: { ma_lo: string };
    };
    expect(proposalDetail.allowedActions).toContain('DISPOSE');
    expect(proposalDetail.llmInput.ma_lo).toBe(expiredLotCode);

    // Bất biến 8: ADMIN không có quyền phê duyệt đề xuất
    await request(server)
      .post(`/api/proposals/${targetProposal!.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Admin thử duyệt' })
      .expect(403);

    const approveProposalRes = await request(server)
      .post(`/api/proposals/${targetProposal!.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Duyệt hủy lô hết hạn smoke test' })
      .expect(201);

    const approvedProposal = approveProposalRes.body as {
      status: string;
      execution: { id: string; status: string };
    };
    expect(approvedProposal.status).toBe('approved');
    expect(approvedProposal.execution.status).toBe('planned');

    // Phê duyệt tuyệt đối KHÔNG trừ tồn kho (bất biến 1 & D-028)
    const snapAfterProposalApprove = await getStockSnapshot();
    expect(snapAfterProposalApprove.movementCount).toBe(snapAfterAnalysis.movementCount);
    expect(snapAfterProposalApprove.totalOnHand.eq(snapAfterAnalysis.totalOnHand)).toBe(true);

    // 9. Lập phiếu hủy (DISPOSAL) từ phương án thực hiện → trừ tồn về 0 + ghi movement DISPOSAL
    const disposalRes = await request(server)
      .post(`/api/executions/${approvedProposal.execution.id}/disposal`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        quantity: '30',
        notes: 'Hủy lô hết hạn smoke test',
      })
      .expect(201);

    const disposalBody = disposalRes.body as {
      execution: { status: string; actualQty: string };
      outboundReceipt: { outboundType: string; status: string };
    };
    expect(disposalBody.outboundReceipt.outboundType).toBe('DISPOSAL');
    expect(disposalBody.outboundReceipt.status).toBe('confirmed');
    expect(disposalBody.execution.status).toBe('in_progress');
    expect(new Prisma.Decimal(disposalBody.execution.actualQty).eq(30)).toBe(true);

    // Đánh dấu hoàn thành phương án thực hiện (không đổi tồn thêm)
    const completeExecRes = await request(server)
      .post(`/api/executions/${approvedProposal.execution.id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        status: 'completed',
        note: 'Hoàn tất hủy lô hết hạn theo biên bản',
      })
      .expect(201);
    expect((completeExecRes.body as { status: string }).status).toBe('completed');

    const expiredLotBalance = await prisma.inventoryLotBalance.findUnique({
      where: { lotId: expiredLotId },
      select: { onHandQty: true },
    });
    expect(expiredLotBalance?.onHandQty.eq(0)).toBe(true);

    // 10. Báo cáo NXT khớp tồn từng sản phẩm & Dashboard trả đủ dữ liệu
    const ledgerRes = await request(server)
      .get(`/api/reports/stock-ledger?from=${addCalendarDays(todayVn, -90)}&to=${todayVn}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const ledgerItems = (
      ledgerRes.body as {
        items: Array<{ product: { id: string; code: string }; closing: string }>;
      }
    ).items;

    const allBalances = await prisma.inventoryLotBalance.findMany({
      select: {
        onHandQty: true,
        lot: { select: { productId: true } },
      },
    });
    const expectedByProduct = new Map<string, Prisma.Decimal>();
    for (const row of allBalances) {
      const prev = expectedByProduct.get(row.lot.productId) ?? new Prisma.Decimal(0);
      expectedByProduct.set(row.lot.productId, prev.add(row.onHandQty));
    }

    const newProdLedger = ledgerItems.find((item) => item.product.id === newProductId);
    expect(newProdLedger).toBeDefined();
    expect(new Prisma.Decimal(newProdLedger!.closing).eq(38 + 50)).toBe(true);

    for (const item of ledgerItems) {
      const expected = expectedByProduct.get(item.product.id) ?? new Prisma.Decimal(0);
      expect(new Prisma.Decimal(item.closing).eq(expected)).toBe(true);
    }

    const dashboardRes = await request(server)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const dashboard = dashboardRes.body as {
      totalOnHand: string;
      monthlyInOut: unknown[];
      pendingOrders: unknown[];
    };
    expect(new Prisma.Decimal(dashboard.totalOnHand).gt(0)).toBe(true);
    expect(dashboard.monthlyInOut).toHaveLength(12);
    expect(dashboard.pendingOrders.length).toBeGreaterThanOrEqual(1);

    // 11. Kiểm tra bất biến tồn kho toàn cục (tồn = tổng movement, không âm, chứng từ tồn tại)
    const invariants = await verifyInventoryInvariants(prisma);
    expect(invariants.violations).toEqual([]);
    expect(invariants.checkedLots).toBeGreaterThanOrEqual(3);
    expect(invariants.checkedMovements).toBeGreaterThanOrEqual(6);
  });
});
