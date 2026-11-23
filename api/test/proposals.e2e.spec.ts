import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
} from '../src/modules/ai/forecast/ml-client.service';
import { AnalysisPipelineService } from '../src/modules/ai/pipeline/analysis-pipeline.service';
import { LlmExplanationInput } from '../src/modules/ai/proposals/domain/llm-guard';
import {
  LLM_PROVIDER_TOKEN,
  LlmExplainOptions,
  LlmExplainResult,
  LlmProvider,
  LlmProviderError,
} from '../src/modules/ai/proposals/llm/llm-provider.interface';
import { MockProvider } from '../src/modules/ai/proposals/llm/mock.provider';
import { NoneProvider } from '../src/modules/ai/proposals/llm/none.provider';
import { addCalendarDays } from '../src/modules/ai/risk/domain/lot-risk.domain';
import { getVnTodayDateString } from '../src/modules/expiry/domain/vn-date';
import { PrismaService } from '../src/prisma/prisma.service';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const FAKE_SECRET_KEY = 'SK-T014-SECRET-NEVER-LEAK-987654321';

class SwitchableTestLlmProvider implements LlmProvider {
  private delegate: LlmProvider = new MockProvider();

  get providerName(): string {
    return this.delegate.providerName;
  }

  setDelegate(provider: LlmProvider): void {
    this.delegate = provider;
  }

  explain(input: LlmExplanationInput, options: LlmExplainOptions): Promise<LlmExplainResult> {
    return this.delegate.explain(input, options);
  }
}

describe('Proposals & LLM Guardrail E2E trên PostgreSQL thật (T-014 AC3–AC7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;
  let pipelineService: AnalysisPipelineService;
  let testLlmProvider: SwitchableTestLlmProvider;

  let mockMlClient: {
    getModelInfo: jest.Mock<Promise<MlModelInfoResponse>, []>;
    forecast: jest.Mock<Promise<MlForecastResponse>, [MlForecastRequest]>;
  };

  let testStartedAt: Date;
  let todayVn: string;
  const prefix = `T014_E2E_${Date.now()}_`;

  let managerUserId: string;
  let supplierId: string;
  let sp002Id: string;
  let managerToken: string;
  let staffToken: string;
  let demoToggleEnabled = false;

  const createdLotIds: string[] = [];

  beforeAll(async () => {
    testStartedAt = new Date();
    todayVn = getVnTodayDateString();
    testLlmProvider = new SwitchableTestLlmProvider();

    mockMlClient = {
      getModelInfo: jest.fn(),
      forecast: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MlClient)
      .useValue(mockMlClient)
      .overrideProvider(LLM_PROVIDER_TOKEN)
      .useValue(testLlmProvider)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    configService = app.get(ConfigService);
    pipelineService = app.get(AnalysisPipelineService);

    // Chèn LLM_API_KEY giả & điều khiển LLM_DEMO_TOGGLE linh hoạt trong test AC6/AC7
    const originalGet = configService.get.bind(configService);
    jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'LLM_API_KEY') {
        return FAKE_SECRET_KEY;
      }
      if (key === 'LLM_DEMO_TOGGLE') {
        return demoToggleEnabled ? 'true' : 'false';
      }
      return originalGet(key, defaultValue);
    });

    const [manager, supplier, sp002] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
    ]);

    managerUserId = manager.id;
    supplierId = supplier.id;
    sp002Id = sp002.id;

    managerToken = await loginAs('quanly');
    staffToken = await loginAs('nhanvien');
  });

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

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

  async function createTestLot(params: {
    suffix: string;
    daysFromToday: number;
    onHandQty: string;
    productId?: string;
  }) {
    const expiryDate = new Date(`${addCalendarDays(todayVn, params.daysFromToday)}T00:00:00.000Z`);
    const receivedAt = new Date(`${addCalendarDays(todayVn, -30)}T00:00:00.000Z`);
    const lot = await prisma.lot.create({
      data: {
        productId: params.productId ?? sp002Id,
        supplierId,
        lotCode: `${prefix}${params.suffix}`,
        expiryDate,
        receivedAt,
        initialQuantity: new Prisma.Decimal(params.onHandQty),
        status: 'active',
        balance: {
          create: {
            onHandQty: new Prisma.Decimal(params.onHandQty),
          },
        },
      },
    });
    createdLotIds.push(lot.id);
    return lot;
  }

  async function cleanupTestRunsAndLots() {
    const runs = await prisma.analysisRun.findMany({
      where: { createdAt: { gte: testStartedAt } },
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);

    const proposals = await prisma.treatmentProposal.findMany({
      where: {
        OR: [
          ...(runIds.length > 0 ? [{ sourceRunId: { in: runIds } }] : []),
          ...(createdLotIds.length > 0 ? [{ lotId: { in: createdLotIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const proposalIds = proposals.map((p) => p.id);

    if (proposalIds.length > 0) {
      await prisma.proposalDecision.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await prisma.llmExplanation.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await prisma.treatmentProposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    if (runIds.length > 0) {
      await prisma.lotRiskAssessment.deleteMany({ where: { analysisRunId: { in: runIds } } });
      await prisma.demandForecast.deleteMany({ where: { analysisRunId: { in: runIds } } });
      await prisma.analysisRun.deleteMany({ where: { id: { in: runIds } } });
    }

    if (createdLotIds.length > 0) {
      await prisma.lotRiskAssessment.deleteMany({ where: { lotId: { in: createdLotIds } } });
      await prisma.stockMovement.deleteMany({ where: { lotId: { in: createdLotIds } } });
      await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: createdLotIds } } });
      await prisma.lot.deleteMany({ where: { id: { in: createdLotIds } } });
      createdLotIds.length = 0;
    }
  }

  beforeEach(() => {
    setupDefaultMlMock(1);
    testLlmProvider.setDelegate(new MockProvider());
    demoToggleEnabled = false;
  });

  afterEach(async () => {
    await cleanupTestRunsAndLots();
  });

  afterAll(async () => {
    try {
      await cleanupTestRunsAndLots();
      await prisma.demandHistory.deleteMany({
        where: { source: 'ACTUAL', createdAt: { gte: testStartedAt } },
      });
    } finally {
      jest.restoreAllMocks();
      await app.close();
    }
  });

  it('AC3: pipeline (LLM mock) tạo đúng 1 đề xuất cho mỗi lô có tồn dư, đúng phương án; chạy lượt 2 không tạo trùng, không sửa đề xuất cũ', async () => {
    const expiredLot = await createTestLot({
      suffix: 'EXP',
      daysFromToday: -10,
      onHandQty: '120',
    });
    const highLot = await createTestLot({
      suffix: 'HIGH',
      daysFromToday: 8,
      onHandQty: '250',
    });
    const mediumLot = await createTestLot({
      suffix: 'MED',
      daysFromToday: 30,
      onHandQty: '300',
    });

    const run1 = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    expect(run1.status).toBe('succeeded');
    expect(run1.metrics.createdProposals).toBeGreaterThanOrEqual(3);

    const proposalsAfterRun1 = await prisma.treatmentProposal.findMany({
      where: { lotId: { in: [expiredLot.id, highLot.id, mediumLot.id] } },
      include: { llmExplanations: true },
    });
    expect(proposalsAfterRun1).toHaveLength(3);

    const byLot = new Map(proposalsAfterRun1.map((p) => [p.lotId, p]));
    expect(byLot.get(expiredLot.id)?.actionType).toBe('DISPOSE');
    expect(byLot.get(expiredLot.id)?.status).toBe('pending');
    expect(byLot.get(highLot.id)?.actionType).toBe('CONTACT_AGENCY');
    expect(byLot.get(mediumLot.id)?.actionType).toBe('PRIORITIZE_FEFO');

    for (const p of proposalsAfterRun1) {
      expect(p.llmExplanations).toHaveLength(1);
      expect(p.llmExplanations[0].validationStatus).toBe('valid');
      expect(p.llmExplanations[0].modelName).toContain('[Mô phỏng]');
    }

    // Chuyển 1 đề xuất sang approved để xác minh lượt 2 cũng không đụng tới đề xuất đã duyệt
    const approvedProposalId = byLot.get(mediumLot.id)!.id;
    await prisma.treatmentProposal.update({
      where: { id: approvedProposalId },
      data: { status: 'approved' },
    });

    // Giảm HSD của lô medium xuống <= 14 ngày để đổi phương án quy tắc → vẫn phải bỏ qua (không tạo trùng theo lô)
    await prisma.lot.update({
      where: { id: mediumLot.id },
      data: { expiryDate: new Date(`${addCalendarDays(todayVn, 10)}T00:00:00.000Z`) },
    });

    const run2 = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    expect(run2.status).toBe('succeeded');
    expect(run2.metrics.skippedProposals).toBeGreaterThanOrEqual(3);

    const proposalsAfterRun2 = await prisma.treatmentProposal.findMany({
      where: { lotId: { in: [expiredLot.id, highLot.id, mediumLot.id] } },
    });
    expect(proposalsAfterRun2).toHaveLength(3);

    const byLot2 = new Map(proposalsAfterRun2.map((p) => [p.lotId, p]));
    expect(byLot2.get(expiredLot.id)?.id).toBe(byLot.get(expiredLot.id)?.id);
    expect(byLot2.get(expiredLot.id)?.sourceRunId).toBe(run1.id);
    expect(byLot2.get(highLot.id)?.id).toBe(byLot.get(highLot.id)?.id);
    expect(byLot2.get(mediumLot.id)?.status).toBe('approved');
    expect(byLot2.get(mediumLot.id)?.actionType).toBe('PRIORITIZE_FEFO');
  });

  it('AC4: provider bịa số → invalid + fallback ruleSummaryText, số liệu/phương án không đổi; provider timeout → failed nhưng lượt phân tích vẫn succeeded', async () => {
    const highLot = await createTestLot({
      suffix: 'HALLUC',
      daysFromToday: 8,
      onHandQty: '250',
    });

    // Ca 4a: Provider bịa số 9999
    testLlmProvider.setDelegate({
      providerName: 'fake-hallucinating',
      explain: async (input) => ({
        provider: 'fake-hallucinating',
        modelName: 'fake-model-v1',
        rawText: JSON.stringify({
          explanation: `Lô ${input.ma_lo} cần đẩy gấp 9999 đơn vị ngay hôm nay.`,
          action: input.phuong_an,
          numbers: { ton_du_uoc_tinh: input.ton_du_uoc_tinh },
        }),
      }),
    });

    const runInvalid = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    expect(runInvalid.status).toBe('succeeded');

    const proposal = await prisma.treatmentProposal.findFirstOrThrow({
      where: { lotId: highLot.id },
      include: { llmExplanations: true },
    });
    expect(proposal.actionType).toBe('CONTACT_AGENCY');
    expect(proposal.llmExplanations[0].validationStatus).toBe('invalid');

    const detailRes = await request(app.getHttpServer())
      .get(`/api/proposals/${proposal.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(detailRes.body.displayMode).toBe('fallback');
    expect(detailRes.body.fallbackReason).toBe('invalid');
    expect(detailRes.body.explanation.status).toBe('invalid');
    expect(detailRes.body.explanation.text).toBeNull();
    expect(detailRes.body.ruleSummaryText).toContain('Tồn dư ước tính');
    expect(detailRes.body.actionType).toBe('CONTACT_AGENCY');

    // Ca 4b: Provider timeout trong pipeline mới
    const timeoutLot = await createTestLot({
      suffix: 'TIMEOUT',
      daysFromToday: 10,
      onHandQty: '180',
    });

    testLlmProvider.setDelegate({
      providerName: 'fake-timeout',
      explain: async () => {
        throw new LlmProviderError('Dịch vụ LLM quá thời gian chờ (20000 ms)', {
          provider: 'fake-timeout',
          modelName: 'slow-model',
          code: 'TIMEOUT',
        });
      },
    });

    const runTimeout = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    expect(runTimeout.status).toBe('succeeded');

    const timeoutProposal = await prisma.treatmentProposal.findFirstOrThrow({
      where: { lotId: timeoutLot.id },
      include: { llmExplanations: true },
    });
    expect(timeoutProposal.llmExplanations[0].validationStatus).toBe('failed');
    expect(timeoutProposal.llmExplanations[0].errorMessage).toContain('quá thời gian chờ');

    const timeoutDetail = await request(app.getHttpServer())
      .get(`/api/proposals/${timeoutProposal.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(timeoutDetail.body.displayMode).toBe('fallback');
    expect(timeoutDetail.body.fallbackReason).toBe('failed');
    expect(timeoutDetail.body.explanation.text).toBeNull();
    expect(timeoutDetail.body.ruleSummaryText).toContain('Tồn dư ước tính');
  });

  it('AC5: LLM_PROVIDER=none không gọi mạng, chi tiết đề xuất vẫn xem được với tóm tắt quy tắc', async () => {
    const lot = await createTestLot({
      suffix: 'NONE',
      daysFromToday: 9,
      onHandQty: '160',
    });

    testLlmProvider.setDelegate(new NoneProvider());
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    const run = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    expect(run.status).toBe('succeeded');
    expect(fetchSpy).not.toHaveBeenCalled();

    const proposal = await prisma.treatmentProposal.findFirstOrThrow({
      where: { lotId: lot.id },
    });

    const detailRes = await request(app.getHttpServer())
      .get(`/api/proposals/${proposal.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(detailRes.body.displayMode).toBe('fallback');
    expect(detailRes.body.fallbackReason).toBe('failed');
    expect(detailRes.body.ruleSummaryText).toContain('Tồn dư ước tính');
    fetchSpy.mockRestore();
  });

  it('AC6: không response nào chứa LLM_API_KEY và llmInput không có tên người dùng hay đại lý', async () => {
    const lot = await createTestLot({
      suffix: 'NOLEAK',
      daysFromToday: 8,
      onHandQty: '210',
    });

    await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    const proposal = await prisma.treatmentProposal.findFirstOrThrow({
      where: { lotId: lot.id },
    });

    const [listRes, detailRes, summaryRes, explainRes, runsRes, riskRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/proposals')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/proposals/${proposal.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/proposals/summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200),
      request(app.getHttpServer())
        .post(`/api/proposals/${proposal.id}/explain`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(201),
      request(app.getHttpServer())
        .get('/api/analysis/runs')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/api/analysis/risk/latest')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200),
    ]);

    for (const res of [listRes, detailRes, summaryRes, explainRes, runsRes, riskRes]) {
      expect(JSON.stringify(res.body)).not.toContain(FAKE_SECRET_KEY);
    }

    const llmInputJson = JSON.stringify(detailRes.body.llmInput);
    expect(llmInputJson).not.toContain('Nguyễn Văn Dương');
    expect(llmInputJson).not.toContain('Phan Thanh Đức');
    expect(llmInputJson).not.toContain('Trương Thành Lê');
    expect(llmInputJson).not.toContain('Đại lý');
    expect(Object.keys(detailRes.body.llmInput).sort()).toEqual(
      [
        'ma_lo',
        'san_pham',
        'han_su_dung',
        'so_ngay_con_lai',
        'ton_luc_phan_tich',
        'nhu_cau_phan_bo_duoc',
        'tieu_thu_uoc_tinh',
        'ton_du_uoc_tinh',
        'muc_rui_ro',
        'phuong_an',
        'luong_de_xuat',
        'allowed_actions',
      ].sort(),
    );
  });

  it('AC7: tạo/diễn giải đề xuất không đổi tồn, movement hay decision; kiểm quyền 401/403 và simulateFailure 400/201', async () => {
    const lot = await createTestLot({
      suffix: 'AUTH',
      daysFromToday: 8,
      onHandQty: '220',
    });

    const [balBefore, movBefore, decBefore] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot.id } }),
      prisma.stockMovement.count(),
      prisma.proposalDecision.count(),
    ]);

    await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    const proposal = await prisma.treatmentProposal.findFirstOrThrow({
      where: { lotId: lot.id },
    });

    // Không token → 401
    await request(app.getHttpServer()).get('/api/proposals').expect(401);
    await request(app.getHttpServer()).get('/api/proposals/summary').expect(401);
    await request(app.getHttpServer()).get(`/api/proposals/${proposal.id}`).expect(401);
    await request(app.getHttpServer()).post(`/api/proposals/${proposal.id}/explain`).expect(401);

    // Nhân viên kho xem được (200), nhưng POST /explain bị chặn (403)
    await request(app.getHttpServer())
      .get('/api/proposals')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/proposals/summary')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/proposals/${proposal.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/proposals/${proposal.id}/explain`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(403);

    // simulateFailure=true khi LLM_DEMO_TOGGLE=false → 400
    demoToggleEnabled = false;
    await request(app.getHttpServer())
      .post(`/api/proposals/${proposal.id}/explain`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ simulateFailure: true })
      .expect(400);

    // Khi bật LLM_DEMO_TOGGLE=true → 201 tạo bản failed, rồi khôi phục tạo bản valid mới
    demoToggleEnabled = true;
    const simFailRes = await request(app.getHttpServer())
      .post(`/api/proposals/${proposal.id}/explain`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ simulateFailure: true })
      .expect(201);
    expect(simFailRes.body.displayMode).toBe('fallback');
    expect(simFailRes.body.explanation.status).toBe('failed');

    const restoreRes = await request(app.getHttpServer())
      .post(`/api/proposals/${proposal.id}/explain`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ simulateFailure: false })
      .expect(201);
    expect(restoreRes.body.displayMode).toBe('llm');
    expect(restoreRes.body.explanation.status).toBe('valid');

    const totalExplanations = await prisma.llmExplanation.count({
      where: { proposalId: proposal.id },
    });
    expect(totalExplanations).toBe(3);

    // Kiểm tra bất biến 1 & 8: không đổi tồn, không phát sinh movement, không tạo decision
    const [balAfter, movAfter, decAfter] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot.id } }),
      prisma.stockMovement.count(),
      prisma.proposalDecision.count(),
    ]);
    expect(balAfter.onHandQty.equals(balBefore.onHandQty)).toBe(true);
    expect(movAfter).toBe(movBefore);
    expect(decAfter).toBe(decBefore);
  });
});
