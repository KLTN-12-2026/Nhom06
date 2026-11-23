import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import {
  MlClient,
  MlForecastRequest,
  MlForecastResponse,
  MlModelInfoResponse,
  MlServiceError,
} from '../src/modules/ai/forecast/ml-client.service';
import { AnalysisPipelineService } from '../src/modules/ai/pipeline/analysis-pipeline.service';
import { AnalysisTriggerService } from '../src/modules/ai/pipeline/analysis-trigger.service';
import { addCalendarDays } from '../src/modules/ai/risk/domain/lot-risk.domain';
import { getVnTodayDateString } from '../src/modules/expiry/domain/vn-date';
import { PrismaService } from '../src/prisma/prisma.service';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';

describe('Risk Analysis & Pipeline API E2E trên PostgreSQL thật + MlClient mock (T-013 AC2–AC7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pipelineService: AnalysisPipelineService;
  let triggerService: AnalysisTriggerService;
  let mockMlClient: {
    getModelInfo: jest.Mock<Promise<MlModelInfoResponse>, []>;
    forecast: jest.Mock<Promise<MlForecastResponse>, [MlForecastRequest]>;
  };

  let testStartedAt: Date;
  let todayVn: string;
  const prefix = `T013_E2E_${Date.now()}_`;

  let managerUserId: string;
  let supplierId: string;
  let agencyId: string;
  let groupId: string;
  let sp001Id: string;
  let sp002Id: string;

  const createdProductIds: string[] = [];
  const createdLotIds: string[] = [];
  const createdInboundIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    testStartedAt = new Date();
    todayVn = getVnTodayDateString();

    mockMlClient = {
      getModelInfo: jest.fn(),
      forecast: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MlClient)
      .useValue(mockMlClient)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    pipelineService = app.get(AnalysisPipelineService);
    triggerService = app.get(AnalysisTriggerService);

    const [manager, supplier, agency, group, sp001, sp002] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } }),
      prisma.agency.findUniqueOrThrow({ where: { code: 'DL001' } }),
      prisma.productGroup.findFirstOrThrow({ where: { status: 'active' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
    ]);

    managerUserId = manager.id;
    supplierId = supplier.id;
    agencyId = agency.id;
    groupId = group.id;
    sp001Id = sp001.id;
    sp002Id = sp002.id;
  });

  function setupDefaultMlMock(dailyQty = 5) {
    mockMlClient.getModelInfo.mockReset();
    mockMlClient.forecast.mockReset();

    mockMlClient.getModelInfo.mockResolvedValue({
      model_version: 'rf-v1',
      trained_at: '2026-11-23T00:00:00Z',
      train_start: '2024-12-01',
      train_end: '2026-09-23',
      n_rows: 12680,
      features: ['lag_1', 'lag_7'],
      params: { n_estimators: 200 },
      data_source: 'mô phỏng',
      metrics: {
        test_days: 60,
        methods: {
          random_forest: { mean_mae: 5.38, mean_rmse: 8.06 },
          moving_average_7: { mean_mae: 6.65, mean_rmse: 9.17 },
        },
      },
    });

    mockMlClient.forecast.mockImplementation(async (req: MlForecastRequest) => {
      const lastDate = req.history[req.history.length - 1].date;
      return {
        product_code: req.product_code,
        method: req.method,
        model_version: req.method === 'model' ? 'rf-v1' : 'moving-avg-7-v1',
        generated_at: '2026-11-23T00:00:00Z',
        forecast: Array.from({ length: req.horizon_days }, (_, idx) => ({
          date: addCalendarDays(lastDate, idx + 1),
          qty: dailyQty,
        })),
      };
    });
  }

  beforeEach(() => {
    setupDefaultMlMock(5);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await cleanupAnalysisRuns();
  });

  afterAll(async () => {
    try {
      await cleanupAnalysisRuns();

      // Dọn đơn hàng & phiếu xuất tạo trong test
      if (createdOrderIds.length > 0) {
        const receipts = await prisma.outboundReceipt.findMany({
          where: { orderId: { in: createdOrderIds } },
          select: { id: true },
        });
        const receiptIds = receipts.map((r) => r.id);
        if (receiptIds.length > 0) {
          await prisma.stockMovement.deleteMany({
            where: { sourceType: 'OUTBOUND_RECEIPT', sourceId: { in: receiptIds } },
          });
          await prisma.outboundReceiptItem.deleteMany({
            where: { outboundId: { in: receiptIds } },
          });
          await prisma.outboundReceipt.deleteMany({ where: { id: { in: receiptIds } } });
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

      // Dọn phiếu nhập tạo trong test
      if (createdInboundIds.length > 0) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'INBOUND_RECEIPT', sourceId: { in: createdInboundIds } },
        });
        const inboundItems = await prisma.inboundReceiptItem.findMany({
          where: { receiptId: { in: createdInboundIds } },
          select: { lotId: true },
        });
        for (const item of inboundItems) {
          if (item.lotId && !createdLotIds.includes(item.lotId)) {
            createdLotIds.push(item.lotId);
          }
        }
        await prisma.inboundReceiptItem.deleteMany({
          where: { receiptId: { in: createdInboundIds } },
        });
        await prisma.inboundReceipt.deleteMany({ where: { id: { in: createdInboundIds } } });
      }

      // Dọn lô phát sinh từ tiền tố test
      const prefixLots = await prisma.lot.findMany({
        where: { lotCode: { startsWith: prefix } },
        select: { id: true },
      });
      for (const lot of prefixLots) {
        if (!createdLotIds.includes(lot.id)) {
          createdLotIds.push(lot.id);
        }
      }

      if (createdLotIds.length > 0) {
        await prisma.lotRiskAssessment.deleteMany({ where: { lotId: { in: createdLotIds } } });
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: createdLotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: createdLotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: createdLotIds } } });
      }

      // Dọn demand_history ACTUAL phát sinh từ test
      await prisma.demandHistory.deleteMany({
        where: { source: 'ACTUAL', createdAt: { gte: testStartedAt } },
      });

      if (createdProductIds.length > 0) {
        await prisma.demandHistory.deleteMany({ where: { productId: { in: createdProductIds } } });
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: { createdAt: { gte: testStartedAt } },
      });
    } finally {
      await app.close();
    }
  });

  async function cleanupAnalysisRuns() {
    const runs = await prisma.analysisRun.findMany({
      where: { createdAt: { gte: testStartedAt } },
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);
    if (runIds.length === 0) {
      return;
    }

    const proposals = await prisma.treatmentProposal.findMany({
      where: { sourceRunId: { in: runIds } },
      select: { id: true },
    });
    const proposalIds = proposals.map((p) => p.id);
    if (proposalIds.length > 0) {
      await prisma.proposalDecision.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await prisma.llmExplanation.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await prisma.treatmentProposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    await prisma.lotRiskAssessment.deleteMany({ where: { analysisRunId: { in: runIds } } });
    await prisma.demandForecast.deleteMany({ where: { analysisRunId: { in: runIds } } });
    await prisma.analysisRun.deleteMany({ where: { id: { in: runIds } } });
  }

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function createLotWithBalance(params: {
    productId: string;
    lotCode: string;
    expiryDate: string;
    onHandQty: string;
    status?: string;
  }) {
    const lot = await prisma.lot.create({
      data: {
        productId: params.productId,
        supplierId,
        lotCode: params.lotCode,
        expiryDate: new Date(`${params.expiryDate}T00:00:00.000Z`),
        receivedAt: new Date(`${addCalendarDays(todayVn, -10)}T00:00:00.000Z`),
        initialQuantity: new Prisma.Decimal(params.onHandQty === '0' ? '10' : params.onHandQty),
        status: params.status ?? 'active',
        balance: {
          create: {
            onHandQty: new Prisma.Decimal(params.onHandQty),
            version: 1,
          },
        },
      },
    });
    createdLotIds.push(lot.id);
    return lot;
  }

  it('AC7: không token trả 401; nhanvien xem được (200) và POST /runs trả 403; lượt mới không sửa proposal_decisions đã có', async () => {
    const lot = await createLotWithBalance({
      productId: sp001Id,
      lotCode: `${prefix}AC7_L1`,
      expiryDate: addCalendarDays(todayVn, 10),
      onHandQty: '80',
    });

    await request(app.getHttpServer()).post('/api/analysis/runs').send({}).expect(401);
    await request(app.getHttpServer()).get('/api/analysis/runs').expect(401);
    await request(app.getHttpServer()).get('/api/analysis/risk/latest').expect(401);
    await request(app.getHttpServer()).get(`/api/analysis/risk/lots/${lot.id}`).expect(401);

    const staffToken = await loginAs('nhanvien');
    const managerToken = await loginAs('quanly');

    // nhanvien không được chạy
    await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ horizonDays: 14 })
      .expect(403);

    // quanly chạy lượt 1
    const run1Res = await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 14 })
      .expect(201);
    const run1Id = (run1Res.body as { id: string }).id;

    // nhanvien xem được kết quả, chi tiết lô và lịch sử
    await request(app.getHttpServer())
      .get('/api/analysis/runs')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/analysis/risk/latest')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/analysis/risk/lots/${lot.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    // Dùng đề xuất do lượt 1 đã sinh (T-014) và gắn quyết định đã duyệt để kiểm bất biến 8
    const assessment = await prisma.lotRiskAssessment.findUniqueOrThrow({
      where: { analysisRunId_lotId: { analysisRunId: run1Id, lotId: lot.id } },
    });
    const existingProposal = await prisma.treatmentProposal.findFirst({
      where: { lotId: lot.id, sourceRunId: run1Id },
    });
    const proposal = existingProposal
      ? await prisma.treatmentProposal.update({
          where: { id: existingProposal.id },
          data: { status: 'approved' },
        })
      : await prisma.treatmentProposal.create({
          data: {
            riskAssessmentId: assessment.id,
            lotId: lot.id,
            actionType: 'CONTACT_AGENCY',
            proposedQty: new Prisma.Decimal('60'),
            rationale: 'Đề xuất kiểm thử bất biến 8',
            sourceRunId: run1Id,
            status: 'approved',
            snapshot: { ruleCode: 'TEST_RULE' },
          },
        });
    const decisionBefore = await prisma.proposalDecision.create({
      data: {
        proposalId: proposal.id,
        decision: 'approved',
        decidedBy: managerUserId,
        reason: 'Đã duyệt trước lượt phân tích mới',
      },
    });

    // Chạy lượt phân tích mới
    await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 14 })
      .expect(201);

    // Quyết định cũ giữ nguyên 100%
    const decisionAfter = await prisma.proposalDecision.findUniqueOrThrow({
      where: { id: decisionBefore.id },
    });
    expect(decisionAfter.decision).toBe(decisionBefore.decision);
    expect(decisionAfter.decidedBy).toBe(decisionBefore.decidedBy);
    expect(decisionAfter.reason).toBe(decisionBefore.reason);
    expect(decisionAfter.decidedAt.toISOString()).toBe(decisionBefore.decidedAt.toISOString());
  });

  it('AC2 + AC6: pipeline FULL lưu demand_forecasts + lot_risk_assessments (mọi lô tồn > 0), không đổi tồn/movement, và cảnh báo sản phẩm thiếu dự báo', async () => {
    const managerToken = await loginAs('quanly');

    // Tạo 1 sản phẩm active mới hoàn toàn chưa có demand_history (AC6)
    const noHistoryProduct = await prisma.product.create({
      data: {
        code: `${prefix}SP_NOHIST`,
        name: 'Sản phẩm chưa có lịch sử xuất',
        groupId,
        unit: 'Thùng',
        status: 'active',
      },
    });
    createdProductIds.push(noHistoryProduct.id);

    const lotExpired = await createLotWithBalance({
      productId: sp002Id,
      lotCode: `${prefix}AC2_EXP`,
      expiryDate: addCalendarDays(todayVn, -3),
      onHandQty: '25',
    });
    const lotHigh = await createLotWithBalance({
      productId: sp002Id,
      lotCode: `${prefix}AC2_HIGH`,
      expiryDate: addCalendarDays(todayVn, 10),
      onHandQty: '60',
    });
    const lotZero = await createLotWithBalance({
      productId: sp002Id,
      lotCode: `${prefix}AC2_ZERO`,
      expiryDate: addCalendarDays(todayVn, 25),
      onHandQty: '0',
    });
    const lotNoForecast = await createLotWithBalance({
      productId: noHistoryProduct.id,
      lotCode: `${prefix}AC6_NOFC`,
      expiryDate: addCalendarDays(todayVn, 20),
      onHandQty: '40',
    });

    const [movementsBefore, balanceAggBefore] = await Promise.all([
      prisma.stockMovement.count(),
      prisma.inventoryLotBalance.aggregate({ _sum: { onHandQty: true } }),
    ]);

    const runRes = await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 30 })
      .expect(201);

    const runBody = runRes.body as {
      id: string;
      runType: string;
      status: string;
      lotCount: number;
      metrics: { warnings: Array<{ code: string; productCode: string; lotCount: number }> };
    };
    expect(runBody.runType).toBe('FULL');
    expect(runBody.status).toBe('succeeded');

    // Kiểm tra bất biến 1: tồn và stock_movements không đổi
    const [movementsAfter, balanceAggAfter] = await Promise.all([
      prisma.stockMovement.count(),
      prisma.inventoryLotBalance.aggregate({ _sum: { onHandQty: true } }),
    ]);
    expect(movementsAfter).toBe(movementsBefore);
    expect(
      (balanceAggAfter._sum.onHandQty ?? new Prisma.Decimal(0)).equals(
        balanceAggBefore._sum.onHandQty ?? new Prisma.Decimal(0),
      ),
    ).toBe(true);

    // Có demand_forecasts gắn run này
    const forecastCount = await prisma.demandForecast.count({
      where: { analysisRunId: runBody.id },
    });
    expect(forecastCount).toBe(20 * 30);

    // Lô tồn > 0 của SP002 có kết quả, lô tồn = 0 và lô thiếu dự báo không có kết quả
    const savedAssessments = await prisma.lotRiskAssessment.findMany({
      where: { analysisRunId: runBody.id },
    });
    const assessedLotIds = new Set(savedAssessments.map((a) => a.lotId));
    expect(assessedLotIds.has(lotExpired.id)).toBe(true);
    expect(assessedLotIds.has(lotHigh.id)).toBe(true);
    expect(assessedLotIds.has(lotZero.id)).toBe(false);
    expect(assessedLotIds.has(lotNoForecast.id)).toBe(false);
    expect(savedAssessments.every((a) => a.forecastId === null)).toBe(true);

    // AC6: cảnh báo thiếu dự báo nằm trong metrics.warnings
    expect(runBody.metrics.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_FORECAST',
          productCode: noHistoryProduct.code,
          lotCount: 1,
        }),
      ]),
    );

    // Kiểm tra GET /risk/latest + thứ tự sắp xếp + lọc + GET /risk/lots/:lotId (basis đầy đủ)
    const latestRes = await request(app.getHttpServer())
      .get(`/api/analysis/risk/latest?productId=${sp002Id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const latestBody = latestRes.body as {
      run: { id: string; trigger: string; lotCount: number; modelVersion: string; evaluationDate: string };
      items: Array<{
        lot: { id: string; lotCode: string };
        riskLevel: string;
        isExpired: boolean;
        onHandSnapshot: string;
        estimatedSurplus: string;
      }>;
    };
    expect(latestBody.run.id).toBe(runBody.id);
    expect(latestBody.run.trigger).toBe('MANUAL');
    expect(latestBody.run.modelVersion).toBe('rf-v1');
    expect(latestBody.run.evaluationDate).toBe(todayVn);

    const expIdx = latestBody.items.findIndex((i) => i.lot.id === lotExpired.id);
    const highIdx = latestBody.items.findIndex((i) => i.lot.id === lotHigh.id);
    expect(expIdx).toBeGreaterThanOrEqual(0);
    expect(highIdx).toBeGreaterThan(expIdx);
    expect(latestBody.items[expIdx].riskLevel).toBe('critical');
    expect(latestBody.items[expIdx].isExpired).toBe(true);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/analysis/risk/lots/${lotHigh.id}?runId=${runBody.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const detailBody = detailRes.body as {
      assessment: {
        basis: {
          evaluationDate: string;
          minDeliveryDays: number;
          demandWindow: string;
          consumedByEarlierLots: string;
          forecastRunId: string;
          modelVersion: string;
          fefoOrder: number;
        };
      };
    };
    expect(detailBody.assessment.basis.evaluationDate).toBe(todayVn);
    expect(detailBody.assessment.basis.minDeliveryDays).toBe(7);
    expect(detailBody.assessment.basis.forecastRunId).toBe(runBody.id);
    expect(detailBody.assessment.basis.modelVersion).toBe('rf-v1');
    expect(detailBody.assessment.basis.fefoOrder).toBeGreaterThanOrEqual(1);
  });

  it('AC3: đồng bộ ACTUAL từ phiếu xuất ORDER đã xác nhận 30 đơn vị hôm nay; chạy lại không nhân đôi', async () => {
    const staffToken = await loginAs('nhanvien');
    const managerToken = await loginAs('quanly');

    // Tạo 1 sản phẩm riêng kèm 30 ngày SIMULATED kết thúc hôm qua để kiểm chứng độc lập không lẫn với xuất kho khác
    const prod = await prisma.product.create({
      data: {
        code: `${prefix}SP_ACT`,
        name: 'Sản phẩm test đồng bộ ACTUAL',
        groupId,
        unit: 'Lốc',
        status: 'active',
      },
    });
    createdProductIds.push(prod.id);

    await prisma.demandHistory.createMany({
      data: Array.from({ length: 30 }, (_, idx) => ({
        productId: prod.id,
        historyDate: new Date(`${addCalendarDays(todayVn, -(30 - idx))}T00:00:00.000Z`),
        qty: new Prisma.Decimal('15'),
        source: 'SIMULATED',
      })),
    });

    const lot = await createLotWithBalance({
      productId: prod.id,
      lotCode: `${prefix}AC3_LOT`,
      expiryDate: addCalendarDays(todayVn, 40),
      onHandQty: '100',
    });

    // Lập đơn đại lý và xác nhận xuất kho ORDER 30 đơn vị hôm nay
    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        agencyId,
        orderDate: todayVn,
        notes: 'Đơn kiểm thử AC3',
        items: [{ productId: prod.id, requestedQty: '30' }],
      })
      .expect(201);

    const order = orderRes.body as { id: string; items: Array<{ id: string }> };
    createdOrderIds.push(order.id);

    await request(app.getHttpServer())
      .post(`/api/orders/${order.id}/outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        items: [{ orderItemId: order.items[0].id, lotId: lot.id, quantity: '30' }],
        notes: 'Xuất 30 đơn vị kiểm thử AC3',
      })
      .expect(201);

    // Chạy pipeline lần 1
    await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 10 })
      .expect(201);

    const actualRows1 = await prisma.demandHistory.findMany({
      where: {
        productId: prod.id,
        historyDate: new Date(`${todayVn}T00:00:00.000Z`),
        source: 'ACTUAL',
      },
    });
    expect(actualRows1).toHaveLength(1);
    expect(actualRows1[0].qty.toFixed(3)).toBe('30.000');

    // Chạy pipeline lần 2 → không nhân đôi thành 60 và không tạo thêm dòng
    await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 10 })
      .expect(201);

    const actualRows2 = await prisma.demandHistory.findMany({
      where: {
        productId: prod.id,
        historyDate: new Date(`${todayVn}T00:00:00.000Z`),
        source: 'ACTUAL',
      },
    });
    expect(actualRows2).toHaveLength(1);
    expect(actualRows2[0].qty.toFixed(3)).toBe('30.000');
  });

  it('AC4: ML lỗi → run failed kèm lý do, 0 kết quả cho run đó, /risk/latest vẫn đọc lượt thành công trước đó', async () => {
    const managerToken = await loginAs('quanly');

    await createLotWithBalance({
      productId: sp001Id,
      lotCode: `${prefix}AC4_L1`,
      expiryDate: addCalendarDays(todayVn, 15),
      onHandQty: '90',
    });

    // Lượt 1 thành công
    const okRes = await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 10 })
      .expect(201);
    const okRunId = (okRes.body as { id: string }).id;

    // Lượt 2 lỗi ML ở sản phẩm thứ 3
    let calls = 0;
    mockMlClient.forecast.mockImplementation(async (req: MlForecastRequest) => {
      if (req.method === 'model') {
        calls += 1;
      }
      if (calls === 3) {
        throw new MlServiceError('Dịch vụ dự báo không phản hồi sau 30 giây');
      }
      const lastDate = req.history[req.history.length - 1].date;
      return {
        product_code: req.product_code,
        method: req.method,
        model_version: req.method === 'model' ? 'rf-v1' : 'moving-avg-7-v1',
        generated_at: '2026-11-23T00:00:00Z',
        forecast: [{ date: addCalendarDays(lastDate, 1), qty: 5 }],
      };
    });

    const failRes = await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 1 })
      .expect(502);
    expect((failRes.body as { message: string }).message).toBe('Dịch vụ dự báo không phản hồi');

    const failedRun = await prisma.analysisRun.findFirstOrThrow({
      where: { createdAt: { gte: testStartedAt }, status: 'failed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(failedRun.errorMessage).toContain('30 giây');

    const [failedForecasts, failedRisks] = await Promise.all([
      prisma.demandForecast.count({ where: { analysisRunId: failedRun.id } }),
      prisma.lotRiskAssessment.count({ where: { analysisRunId: failedRun.id } }),
    ]);
    expect(failedForecasts).toBe(0);
    expect(failedRisks).toBe(0);

    // /risk/latest vẫn trả kết quả lượt thành công trước đó
    const latestRes = await request(app.getHttpServer())
      .get('/api/analysis/risk/latest')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect((latestRes.body as { run: { id: string } }).run.id).toBe(okRunId);
  });

  it('AC5: đang có run running → POST trả 409; xác nhận phiếu nhập vẫn 200 khi pipeline hook ném lỗi', async () => {
    const managerToken = await loginAs('quanly');
    const staffToken = await loginAs('nhanvien');

    // 1. Tạo lượt đang running → POST trả 409
    const runningRun = await prisma.analysisRun.create({
      data: {
        runType: 'FULL',
        triggerType: 'MANUAL',
        status: 'running',
        startedAt: new Date(),
      },
    });

    const conflictRes = await request(app.getHttpServer())
      .post('/api/analysis/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(409);
    expect((conflictRes.body as { message: string }).message).toBe('Đang có lượt phân tích chạy');

    // Giải phóng lượt running
    await prisma.analysisRun.update({
      where: { id: runningRun.id },
      data: { status: 'failed', finishedAt: new Date(), errorMessage: 'Dọn test AC5' },
    });

    // 2. Bật hook STOCK_CHANGE với debounce 0 và ép pipelineService.run ném lỗi → xác nhận nhập vẫn 200
    jest
      .spyOn(triggerService as unknown as { isEnabled: () => boolean }, 'isEnabled')
      .mockReturnValue(true);
    jest
      .spyOn(triggerService as unknown as { getDebounceMs: () => number }, 'getDebounceMs')
      .mockReturnValue(0);
    const pipelineSpy = jest
      .spyOn(pipelineService, 'run')
      .mockRejectedValueOnce(new Error('Pipeline lỗi giả lập trong hook AC5'));

    const draftRes = await request(app.getHttpServer())
      .post('/api/inbound-receipts')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        supplierId,
        receiptDate: todayVn,
        notes: 'Phiếu kiểm thử hook AC5',
        items: [
          {
            productId: sp001Id,
            lotCode: `${prefix}AC5_IN`,
            expiryDate: addCalendarDays(todayVn, 90),
            quantity: '15',
            unitCost: '50000',
          },
        ],
      })
      .expect(201);

    const receiptId = (draftRes.body as { id: string }).id;
    createdInboundIds.push(receiptId);

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/inbound-receipts/${receiptId}/confirm`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect((confirmRes.body as { status: string }).status).toBe('confirmed');

    // Chờ setImmediate chạy nền để kiểm chứng hook thực sự gọi pipeline và tự nuốt lỗi an toàn
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(pipelineSpy).toHaveBeenCalledWith({ trigger: 'STOCK_CHANGE' });
  });
});
