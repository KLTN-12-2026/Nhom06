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
} from '../src/modules/ai/forecast/ml-client.service';
import { AnalysisPipelineService } from '../src/modules/ai/pipeline/analysis-pipeline.service';
import { LLM_PROVIDER_TOKEN } from '../src/modules/ai/proposals/llm/llm-provider.interface';
import { MockProvider } from '../src/modules/ai/proposals/llm/mock.provider';
import { addCalendarDays } from '../src/modules/ai/risk/domain/lot-risk.domain';
import { getVnTodayDateString } from '../src/modules/expiry/domain/vn-date';
import { PrismaService } from '../src/prisma/prisma.service';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';

describe('Proposal Decisions & Executions E2E trên PostgreSQL thật (T-015 AC1–AC8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pipelineService: AnalysisPipelineService;

  let mockMlClient: {
    getModelInfo: jest.Mock<Promise<MlModelInfoResponse>, []>;
    forecast: jest.Mock<Promise<MlForecastResponse>, [MlForecastRequest]>;
  };

  let testStartedAt: Date;
  let todayVn: string;
  const prefix = `T015_E2E_${Date.now()}_`;

  let managerUserId: string;
  let supplierId: string;
  let agencyId: string;
  let sp002Id: string;
  let sp003Id: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;

  const createdLotIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdRunIds: string[] = [];

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
      .overrideProvider(LLM_PROVIDER_TOKEN)
      .useValue(new MockProvider())
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    pipelineService = app.get(AnalysisPipelineService);

    const [manager, supplier, agency, sp002, sp003] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } }),
      prisma.agency.findUniqueOrThrow({ where: { code: 'DL001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP003' } }),
    ]);

    managerUserId = manager.id;
    supplierId = supplier.id;
    agencyId = agency.id;
    sp002Id = sp002.id;
    sp003Id = sp003.id;

    [adminToken, managerToken, staffToken] = await Promise.all([
      loginAs('admin'),
      loginAs('quanly'),
      loginAs('nhanvien'),
    ]);
  });

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  function setupMlMock(dailyQty = 1) {
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

  async function createPendingProposalFixture(params: {
    suffix: string;
    productId?: string;
    daysFromToday: number;
    onHandQty: string;
    proposedQty?: string;
    lotStatus?: 'active' | 'blocked' | 'closed';
    actionType: 'DISPOSE' | 'RETURN_TO_SUPPLIER' | 'CONTACT_AGENCY' | 'PRIORITIZE_FEFO';
    riskLevel?: 'critical' | 'high' | 'medium';
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
        initialQuantity: new Prisma.Decimal(
          new Prisma.Decimal(params.onHandQty).gt(0) ? params.onHandQty : '10',
        ),
        status: params.lotStatus ?? 'active',
        balance: {
          create: {
            onHandQty: new Prisma.Decimal(params.onHandQty),
            version: 1,
          },
        },
      },
    });
    createdLotIds.push(lot.id);

    const run = await prisma.analysisRun.create({
      data: {
        runType: 'FULL',
        triggerType: 'MANUAL',
        status: 'succeeded',
        requestedBy: managerUserId,
        modelVersion: 'rf-v1',
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    createdRunIds.push(run.id);

    const proposedQty = params.proposedQty ?? params.onHandQty;
    const assessment = await prisma.lotRiskAssessment.create({
      data: {
        analysisRunId: run.id,
        lotId: lot.id,
        onHandSnapshot: new Prisma.Decimal(
          new Prisma.Decimal(params.onHandQty).gt(0) ? params.onHandQty : proposedQty,
        ),
        estimatedDemandBeforeExpiry: new Prisma.Decimal('0'),
        estimatedSurplusQty: new Prisma.Decimal(proposedQty),
        riskLevel:
          params.riskLevel ??
          (params.daysFromToday < 0 ? 'critical' : params.daysFromToday <= 14 ? 'high' : 'medium'),
        basis: {
          evaluationDate: todayVn,
          isExpired: params.daysFromToday < 0,
        },
      },
    });

    const proposal = await prisma.treatmentProposal.create({
      data: {
        riskAssessmentId: assessment.id,
        lotId: lot.id,
        actionType: params.actionType,
        proposedQty: new Prisma.Decimal(proposedQty),
        rationale: `Tóm tắt quy tắc cho lô ${lot.lotCode}`,
        sourceRunId: run.id,
        status: 'pending',
        snapshot: {
          evaluationDate: todayVn,
          expiryDate: addCalendarDays(todayVn, params.daysFromToday),
          daysRemaining: params.daysFromToday,
          isExpired: params.daysFromToday < 0,
          actionType: params.actionType,
          proposedQty,
          ruleSummaryText: `Tóm tắt quy tắc cho lô ${lot.lotCode}`,
        },
      },
    });

    return { lot, run, assessment, proposal };
  }

  async function createConfirmedOrderOutboundForLot(params: {
    productId: string;
    lotId: string;
    quantity: string;
    notes?: string;
  }) {
    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        agencyId,
        orderDate: todayVn,
        notes: params.notes ?? 'Đơn test T-015',
        items: [{ productId: params.productId, requestedQty: params.quantity }],
      })
      .expect(201);

    const orderId = orderRes.body.id as string;
    createdOrderIds.push(orderId);
    const orderItemId = orderRes.body.items[0].id as string;

    const outboundRes = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        items: [{ orderItemId, lotId: params.lotId, quantity: params.quantity }],
        notes: params.notes ?? 'Phiếu xuất ORDER test T-015',
      })
      .expect(201);

    return {
      orderId,
      orderItemId,
      receiptId: outboundRes.body.id as string,
      outboundNo: outboundRes.body.outboundNo as string,
    };
  }

  async function cleanupTestData() {
    const recentRuns = await prisma.analysisRun.findMany({
      where: {
        OR: [
          { createdAt: { gte: testStartedAt } },
          ...(createdRunIds.length > 0 ? [{ id: { in: createdRunIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const runIds = Array.from(new Set([...createdRunIds, ...recentRuns.map((r) => r.id)]));

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
      const executions = await prisma.treatmentExecution.findMany({
        where: { proposalId: { in: proposalIds } },
        select: { id: true },
      });
      const executionIds = executions.map((e) => e.id);
      if (executionIds.length > 0) {
        await prisma.treatmentExecutionUpdate.deleteMany({
          where: { executionId: { in: executionIds } },
        });
        await prisma.treatmentExecution.deleteMany({ where: { id: { in: executionIds } } });
      }
      await prisma.proposalDecision.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await prisma.llmExplanation.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await prisma.treatmentProposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    if (runIds.length > 0) {
      await prisma.lotRiskAssessment.deleteMany({ where: { analysisRunId: { in: runIds } } });
      await prisma.demandForecast.deleteMany({ where: { analysisRunId: { in: runIds } } });
      await prisma.analysisRun.deleteMany({ where: { id: { in: runIds } } });
    }

    const receiptItemsByLot =
      createdLotIds.length > 0
        ? await prisma.outboundReceiptItem.findMany({
            where: { lotId: { in: createdLotIds } },
            select: { outboundId: true },
          })
        : [];
    const receiptsByOrder =
      createdOrderIds.length > 0
        ? await prisma.outboundReceipt.findMany({
            where: { orderId: { in: createdOrderIds } },
            select: { id: true },
          })
        : [];
    const receiptIds = Array.from(
      new Set([
        ...receiptItemsByLot.map((i) => i.outboundId),
        ...receiptsByOrder.map((r) => r.id),
      ]),
    );

    if (receiptIds.length > 0) {
      await prisma.stockMovement.deleteMany({
        where: { sourceType: 'OUTBOUND_RECEIPT', sourceId: { in: receiptIds } },
      });
      await prisma.outboundReceiptItem.deleteMany({
        where: { outboundId: { in: receiptIds } },
      });
      await prisma.outboundReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    }

    if (createdOrderIds.length > 0) {
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

    if (createdLotIds.length > 0) {
      await prisma.lotRiskAssessment.deleteMany({ where: { lotId: { in: createdLotIds } } });
      await prisma.stockMovement.deleteMany({ where: { lotId: { in: createdLotIds } } });
      await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: createdLotIds } } });
      await prisma.lot.deleteMany({ where: { id: { in: createdLotIds } } });
    }

    await prisma.auditLog.deleteMany({
      where: {
        entityType: {
          in: ['treatment_proposal', 'treatment_execution', 'outbound_receipt', 'agency_order'],
        },
        createdAt: { gte: testStartedAt },
      },
    });

    createdLotIds.length = 0;
    createdOrderIds.length = 0;
    createdRunIds.length = 0;
  }

  beforeEach(() => {
    setupMlMock(1);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    try {
      await cleanupTestData();
      await prisma.demandHistory.deleteMany({
        where: { source: 'ACTUAL', createdAt: { gte: testStartedAt } },
      });
    } finally {
      await app.close();
    }
  });

  it('AC1: quanly phê duyệt → proposal_decisions + execution planned, tồn/movement không đổi; từ chối thiếu lý do → 400; có lý do → rejected không tạo execution', async () => {
    const f1 = await createPendingProposalFixture({
      suffix: 'AC1_APP',
      daysFromToday: 8,
      onHandQty: '251',
      actionType: 'CONTACT_AGENCY',
    });
    const f2 = await createPendingProposalFixture({
      suffix: 'AC1_REJ',
      daysFromToday: 10,
      onHandQty: '100',
      actionType: 'CONTACT_AGENCY',
    });

    const [bal1Before, movCountBefore] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: f1.lot.id } }),
      prisma.stockMovement.count(),
    ]);

    const approveRes = await request(app.getHttpServer())
      .post(`/api/proposals/${f1.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Liên hệ đại lý miền Trung trước thứ 6' })
      .expect(201);

    expect(approveRes.body.status).toBe('approved');
    expect(approveRes.body.decision.decision).toBe('approved');
    expect(approveRes.body.decision.decider.fullName).toBe('Nguyễn Văn Dương');
    expect(approveRes.body.execution.status).toBe('planned');
    expect(approveRes.body.execution.plannedQty).toBe('251.000');
    expect(approveRes.body.execution.actualQty).toBeNull();

    const [bal1After, movCountAfter, dbDecision, dbExecution] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: f1.lot.id } }),
      prisma.stockMovement.count(),
      prisma.proposalDecision.findUniqueOrThrow({ where: { proposalId: f1.proposal.id } }),
      prisma.treatmentExecution.findUniqueOrThrow({ where: { proposalId: f1.proposal.id } }),
    ]);

    expect(bal1After.onHandQty.equals(bal1Before.onHandQty)).toBe(true);
    expect(bal1After.version).toBe(bal1Before.version);
    expect(movCountAfter).toBe(movCountBefore);
    expect(dbDecision.decision).toBe('approved');
    expect(dbExecution.status).toBe('planned');
    expect(dbExecution.responsibleUserId).toBe(managerUserId);

    // Từ chối thiếu lý do → 400
    await request(app.getHttpServer())
      .post(`/api/proposals/${f2.proposal.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: '   ' })
      .expect(400);

    // Từ chối có lý do → rejected, không tạo execution
    const rejectRes = await request(app.getHttpServer())
      .post(`/api/proposals/${f2.proposal.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Đã có kế hoạch điều chuyển nội bộ' })
      .expect(201);

    expect(rejectRes.body.status).toBe('rejected');
    expect(rejectRes.body.decision.decision).toBe('rejected');
    expect(rejectRes.body.decision.reason).toBe('Đã có kế hoạch điều chuyển nội bộ');
    expect(rejectRes.body.execution).toBeNull();

    const rejExec = await prisma.treatmentExecution.findUnique({
      where: { proposalId: f2.proposal.id },
    });
    expect(rejExec).toBeNull();
  });

  it('AC2: quyết định lần 2 → 409; hai request phê duyệt/từ chối song song cùng đề xuất → đúng 1 thành công và chỉ 1 decision', async () => {
    const fSeq = await createPendingProposalFixture({
      suffix: 'AC2_SEQ',
      daysFromToday: 8,
      onHandQty: '150',
      actionType: 'CONTACT_AGENCY',
    });

    await request(app.getHttpServer())
      .post(`/api/proposals/${fSeq.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/proposals/${fSeq.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/proposals/${fSeq.proposal.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Thử từ chối sau khi đã duyệt' })
      .expect(409);

    // Đồng thời: approve & reject cùng đề xuất
    const fRace = await createPendingProposalFixture({
      suffix: 'AC2_RACE',
      daysFromToday: 8,
      onHandQty: '200',
      actionType: 'CONTACT_AGENCY',
    });

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/proposals/${fRace.proposal.id}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ note: 'Duyệt song song' }),
      request(app.getHttpServer())
        .post(`/api/proposals/${fRace.proposal.id}/reject`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reason: 'Từ chối song song' }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const decisionCount = await prisma.proposalDecision.count({
      where: { proposalId: fRace.proposal.id },
    });
    expect(decisionCount).toBe(1);
  });

  it('AC3: lô đã hết tồn hoặc bị đóng trước khi quyết định → 409, không có decision hay execution', async () => {
    const fZero = await createPendingProposalFixture({
      suffix: 'AC3_ZERO',
      daysFromToday: 8,
      onHandQty: '50',
      actionType: 'CONTACT_AGENCY',
    });
    await prisma.inventoryLotBalance.update({
      where: { lotId: fZero.lot.id },
      data: { onHandQty: new Prisma.Decimal('0') },
    });

    await request(app.getHttpServer())
      .post(`/api/proposals/${fZero.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(409);

    const [decZero, execZero] = await Promise.all([
      prisma.proposalDecision.findUnique({ where: { proposalId: fZero.proposal.id } }),
      prisma.treatmentExecution.findUnique({ where: { proposalId: fZero.proposal.id } }),
    ]);
    expect(decZero).toBeNull();
    expect(execZero).toBeNull();

    const fClosed = await createPendingProposalFixture({
      suffix: 'AC3_CLOSED',
      daysFromToday: 8,
      onHandQty: '50',
      lotStatus: 'closed',
      actionType: 'CONTACT_AGENCY',
    });
    await request(app.getHttpServer())
      .post(`/api/proposals/${fClosed.proposal.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Lô đã đóng' })
      .expect(409);
  });

  it('AC4: phân quyền 401/403 — nhanvien và admin không được duyệt/từ chối (403), nhanvien ghi kết quả được', async () => {
    const f = await createPendingProposalFixture({
      suffix: 'AC4_AUTH',
      daysFromToday: 10,
      onHandQty: '120',
      actionType: 'PRIORITIZE_FEFO',
    });

    // Không token → 401
    await request(app.getHttpServer()).post(`/api/proposals/${f.proposal.id}/approve`).expect(401);
    await request(app.getHttpServer())
      .post(`/api/proposals/${f.proposal.id}/reject`)
      .send({ reason: 'x' })
      .expect(401);
    await request(app.getHttpServer()).get('/api/executions').expect(401);

    // nhanvien & admin duyệt/từ chối → 403
    for (const token of [staffToken, adminToken]) {
      await request(app.getHttpServer())
        .post(`/api/proposals/${f.proposal.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/proposals/${f.proposal.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Không có quyền' })
        .expect(403);
    }

    // quanly duyệt → tạo execution; nhanvien đọc và ghi kết quả được
    const approved = await request(app.getHttpServer())
      .post(`/api/proposals/${f.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const executionId = approved.body.execution.id as string;

    await request(app.getHttpServer()).get(`/api/executions/${executionId}`).expect(401);
    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/updates`)
      .send({ status: 'in_progress' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/disposal`)
      .send({ quantity: '10' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/link-outbound`)
      .send({ outboundReceiptId: executionId })
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/executions')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'in_progress', actualQtyDelta: '30', note: 'Nhân viên cập nhật' })
      .expect(201);
  });

  it('AC5: ghi kết quả planned → in_progress (+120) → completed, mỗi lần 1 history, failed thiếu note 400, không quay lùi, tồn/movement không đổi', async () => {
    const f1 = await createPendingProposalFixture({
      suffix: 'AC5_FLOW',
      daysFromToday: 12,
      onHandQty: '251',
      actionType: 'CONTACT_AGENCY',
    });
    const f2 = await createPendingProposalFixture({
      suffix: 'AC5_FAIL',
      daysFromToday: 12,
      onHandQty: '80',
      actionType: 'PRIORITIZE_FEFO',
    });

    const app1 = await request(app.getHttpServer())
      .post(`/api/proposals/${f1.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const exec1Id = app1.body.execution.id as string;

    const app2 = await request(app.getHttpServer())
      .post(`/api/proposals/${f2.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const exec2Id = app2.body.execution.id as string;

    const [balBefore, movBefore] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: f1.lot.id } }),
      prisma.stockMovement.count(),
    ]);

    // Bước 1: planned -> in_progress (+120)
    const u1 = await request(app.getHttpServer())
      .post(`/api/executions/${exec1Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        status: 'in_progress',
        actualQtyDelta: '120',
        note: 'Đã liên hệ 3 đại lý',
        occurredOn: todayVn,
      })
      .expect(201);

    expect(u1.body.status).toBe('in_progress');
    expect(u1.body.actualQty).toBe('120.000');
    expect(u1.body.proposal.status).toBe('in_progress');
    expect(u1.body.updates).toHaveLength(1);
    expect(u1.body.updates[0].actualQtyDelta).toBe('120.000');

    // Không cho quay lùi in_progress -> planned
    await request(app.getHttpServer())
      .post(`/api/executions/${exec1Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'planned' })
      .expect(400);

    // Vượt planned_qty thiếu note → 400
    await request(app.getHttpServer())
      .post(`/api/executions/${exec1Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'in_progress', actualQtyDelta: '200' })
      .expect(400);

    // Bước 2: in_progress -> completed (+131)
    const u2 = await request(app.getHttpServer())
      .post(`/api/executions/${exec1Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        status: 'completed',
        actualQtyDelta: '131',
        note: 'Hoàn tất xử lý toàn bộ lượng đề xuất',
      })
      .expect(201);

    expect(u2.body.status).toBe('completed');
    expect(u2.body.actualQty).toBe('251.000');
    expect(u2.body.proposal.status).toBe('completed');
    expect(u2.body.updates).toHaveLength(2);

    // Đã completed không được sửa tiếp → 409
    await request(app.getHttpServer())
      .post(`/api/executions/${exec1Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'in_progress', note: 'Sửa lại' })
      .expect(409);

    // failed thiếu ghi chú → 400; có ghi chú → 201
    await request(app.getHttpServer())
      .post(`/api/executions/${exec2Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'failed' })
      .expect(400);

    const failRes = await request(app.getHttpServer())
      .post(`/api/executions/${exec2Id}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'failed', note: 'Không tìm được đại lý tiếp nhận' })
      .expect(201);
    expect(failRes.body.status).toBe('failed');

    // Kiểm tra KPI GET /api/executions
    const listRes = await request(app.getHttpServer())
      .get('/api/executions')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(listRes.body.kpi.approvedCount).toBeGreaterThanOrEqual(2);
    expect(new Prisma.Decimal(listRes.body.kpi.actualQtyTotal).gte('251')).toBe(true);

    // Bất biến 1: tồn kho và sổ biến động không đổi
    const [balAfter, movAfter] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: f1.lot.id } }),
      prisma.stockMovement.count(),
    ]);
    expect(balAfter.onHandQty.equals(balBefore.onHandQty)).toBe(true);
    expect(movAfter).toBe(movBefore);
  });

  it('AC6: disposal lô hết hạn 44 → phiếu DISPOSAL, tồn 0, movement -44; trả NCC lô blocked → RETURN; vượt tồn 409; CONTACT_AGENCY 400; đồng thời không âm tồn', async () => {
    // 1. Lô hết hạn tồn 44, DISPOSE 44
    const fDisp = await createPendingProposalFixture({
      suffix: 'AC6_DISP',
      daysFromToday: -5,
      onHandQty: '44',
      actionType: 'DISPOSE',
    });
    const appDisp = await request(app.getHttpServer())
      .post(`/api/proposals/${fDisp.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const execDispId = appDisp.body.execution.id as string;

    // Vượt tồn (45 > 44) → 409, tồn giữ nguyên
    await request(app.getHttpServer())
      .post(`/api/executions/${execDispId}/disposal`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ quantity: '45', notes: 'Thử vượt tồn' })
      .expect(409);

    const balAfterFail = await prisma.inventoryLotBalance.findUniqueOrThrow({
      where: { lotId: fDisp.lot.id },
    });
    expect(balAfterFail.onHandQty.toString()).toBe('44');

    // Lập phiếu hủy đúng 44
    const dispRes = await request(app.getHttpServer())
      .post(`/api/executions/${execDispId}/disposal`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ quantity: '44', notes: 'Biên bản hủy lô hết hạn' })
      .expect(201);

    expect(dispRes.body.outboundReceipt.outboundType).toBe('DISPOSAL');
    expect(dispRes.body.outboundReceipt.status).toBe('confirmed');
    expect(dispRes.body.outboundReceipt.order).toBeNull();
    expect(dispRes.body.outboundReceipt.outboundNo).toMatch(/^PX\d{10}$/);
    expect(dispRes.body.execution.actualQty).toBe('44.000');
    expect(dispRes.body.execution.linkedOutbound.id).toBe(dispRes.body.outboundReceipt.id);
    expect(dispRes.body.execution.status).toBe('in_progress');

    const [balZero, dispMoves] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: fDisp.lot.id } }),
      prisma.stockMovement.findMany({ where: { lotId: fDisp.lot.id } }),
    ]);
    expect(balZero.onHandQty.toString()).toBe('0');
    expect(dispMoves).toHaveLength(1);
    expect(dispMoves[0].movementType).toBe('DISPOSAL');
    expect(dispMoves[0].quantityDelta.toString()).toBe('-44');
    expect(dispMoves[0].balanceAfter.toString()).toBe('0');
    expect(dispMoves[0].sourceType).toBe('OUTBOUND_RECEIPT');
    expect(dispMoves[0].sourceId).toBe(dispRes.body.outboundReceipt.id);

    // 2. Lô blocked + RETURN_TO_SUPPLIER → được phép xuất trả NCC (không áp FEFO)
    const fRet = await createPendingProposalFixture({
      suffix: 'AC6_RET',
      daysFromToday: 5,
      onHandQty: '25',
      lotStatus: 'blocked',
      actionType: 'RETURN_TO_SUPPLIER',
    });
    const appRet = await request(app.getHttpServer())
      .post(`/api/proposals/${fRet.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const retRes = await request(app.getHttpServer())
      .post(`/api/executions/${appRet.body.execution.id}/disposal`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ quantity: '25', notes: 'Trả hàng lỗi về NCC' })
      .expect(201);
    expect(retRes.body.outboundReceipt.outboundType).toBe('RETURN_TO_SUPPLIER');

    const retMoves = await prisma.stockMovement.findMany({ where: { lotId: fRet.lot.id } });
    expect(retMoves).toHaveLength(1);
    expect(retMoves[0].movementType).toBe('RETURN');
    expect(retMoves[0].quantityDelta.toString()).toBe('-25');

    // 3. Phương án CONTACT_AGENCY gọi disposal → 400
    const fContact = await createPendingProposalFixture({
      suffix: 'AC6_CONTACT',
      daysFromToday: 10,
      onHandQty: '60',
      actionType: 'CONTACT_AGENCY',
    });
    const appContact = await request(app.getHttpServer())
      .post(`/api/proposals/${fContact.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/executions/${appContact.body.execution.id}/disposal`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ quantity: '10' })
      .expect(400);

    // 4. Đồng thời: 2 request disposal song song cùng execution vượt tồn (tồn 44, mỗi req 30)
    const fRace = await createPendingProposalFixture({
      suffix: 'AC6_RACE',
      daysFromToday: -2,
      onHandQty: '44',
      actionType: 'DISPOSE',
    });
    const appRace = await request(app.getHttpServer())
      .post(`/api/proposals/${fRace.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const raceExecId = appRace.body.execution.id as string;

    const [d1, d2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/executions/${raceExecId}/disposal`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ quantity: '30', notes: 'Hủy đợt A' }),
      request(app.getHttpServer())
        .post(`/api/executions/${raceExecId}/disposal`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ quantity: '30', notes: 'Hủy đợt B' }),
    ]);

    expect([d1.status, d2.status].sort((a, b) => a - b)).toEqual([201, 409]);
    const balRace = await prisma.inventoryLotBalance.findUniqueOrThrow({
      where: { lotId: fRace.lot.id },
    });
    expect(balRace.onHandQty.toString()).toBe('14');
    const raceMoves = await prisma.stockMovement.findMany({ where: { lotId: fRace.lot.id } });
    expect(raceMoves).toHaveLength(1);

    // 5. Đồng thời giữa xuất ORDER (confirmForOrder) và xuất trả NCC (disposal) trên cùng lô active
    const fCross = await createPendingProposalFixture({
      suffix: 'AC6_CROSS',
      daysFromToday: 30,
      onHandQty: '40',
      actionType: 'RETURN_TO_SUPPLIER',
    });
    const appCross = await request(app.getHttpServer())
      .post(`/api/proposals/${fCross.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const crossOrderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        agencyId,
        orderDate: todayVn,
        items: [{ productId: sp002Id, requestedQty: '30' }],
      })
      .expect(201);
    createdOrderIds.push(crossOrderRes.body.id as string);

    const [c1, c2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/executions/${appCross.body.execution.id}/disposal`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ quantity: '30', notes: 'Trả NCC song song' }),
      request(app.getHttpServer())
        .post(`/api/orders/${crossOrderRes.body.id}/outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [
            {
              orderItemId: crossOrderRes.body.items[0].id,
              lotId: fCross.lot.id,
              quantity: '30',
            },
          ],
        }),
    ]);

    expect([c1.status, c2.status].sort((a, b) => a - b)).toEqual([201, 409]);
    const balCross = await prisma.inventoryLotBalance.findUniqueOrThrow({
      where: { lotId: fCross.lot.id },
    });
    expect(balCross.onHandQty.toString()).toBe('10');
  });

  it('AC7: liên kết phiếu ORDER có lô → cộng đúng actual_qty; phiếu không có lô / không phải ORDER → 400; liên kết lặp (gồm A->B->A và song song) → 409', async () => {
    const f = await createPendingProposalFixture({
      suffix: 'AC7_LOT',
      productId: sp002Id,
      daysFromToday: 25,
      onHandQty: '200',
      proposedQty: '150',
      actionType: 'CONTACT_AGENCY',
    });
    const otherLotFixture = await createPendingProposalFixture({
      suffix: 'AC7_OTHER',
      productId: sp003Id,
      daysFromToday: 25,
      onHandQty: '100',
      actionType: 'DISPOSE',
    });

    const approved = await request(app.getHttpServer())
      .post(`/api/proposals/${f.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const executionId = approved.body.execution.id as string;

    // Tạo 2 phiếu ORDER chứa đúng lô f.lot (50 và 40) và 1 phiếu ORDER chứa lô khác
    const receiptA = await createConfirmedOrderOutboundForLot({
      productId: sp002Id,
      lotId: f.lot.id,
      quantity: '50',
    });
    const receiptB = await createConfirmedOrderOutboundForLot({
      productId: sp002Id,
      lotId: f.lot.id,
      quantity: '40',
    });
    const receiptOtherLot = await createConfirmedOrderOutboundForLot({
      productId: sp003Id,
      lotId: otherLotFixture.lot.id,
      quantity: '20',
    });

    // Tạo 1 phiếu DISPOSAL để kiểm chứng không được link phiếu khác loại ORDER
    const appOther = await request(app.getHttpServer())
      .post(`/api/proposals/${otherLotFixture.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const dispReceipt = await request(app.getHttpServer())
      .post(`/api/executions/${appOther.body.execution.id}/disposal`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ quantity: '10' })
      .expect(201);

    const [balBeforeLink, movBeforeLink] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: f.lot.id } }),
      prisma.stockMovement.count(),
    ]);

    // Kiểm GET /api/outbound-receipts?type=ORDER&lotId=... trả đúng phiếu chứa lô kèm matchedLotQty
    const candidateRes = await request(app.getHttpServer())
      .get(`/api/outbound-receipts?type=ORDER&lotId=${f.lot.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const candidateIds = (candidateRes.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(candidateIds).toContain(receiptA.receiptId);
    expect(candidateIds).toContain(receiptB.receiptId);
    expect(candidateIds).not.toContain(receiptOtherLot.receiptId);

    // Liên kết phiếu A (50) — kiểm đồng thời 2 request cùng phiếu A chỉ 1 thành công
    const [linkA1, linkA2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/executions/${executionId}/link-outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ outboundReceiptId: receiptA.receiptId }),
      request(app.getHttpServer())
        .post(`/api/executions/${executionId}/link-outbound`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ outboundReceiptId: receiptA.receiptId }),
    ]);
    expect([linkA1.status, linkA2.status].sort((a, b) => a - b)).toEqual([201, 409]);

    // Liên kết tiếp phiếu B (40) → tổng actual_qty = 90
    const linkB = await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/link-outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ outboundReceiptId: receiptB.receiptId })
      .expect(201);
    expect(linkB.body.actualQty).toBe('90.000');
    expect(linkB.body.linkedOutbounds).toHaveLength(2);

    // Liên kết lặp lại phiếu A sau khi đã link phiếu B (A -> B -> A) → 409
    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/link-outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ outboundReceiptId: receiptA.receiptId })
      .expect(409);

    // Phiếu ORDER không chứa lô → 400
    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/link-outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ outboundReceiptId: receiptOtherLot.receiptId })
      .expect(400);

    // Phiếu không phải ORDER (DISPOSAL) → 400
    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/link-outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ outboundReceiptId: dispReceipt.body.outboundReceipt.id })
      .expect(400);

    // Đề xuất DISPOSE gọi link-outbound → 400
    await request(app.getHttpServer())
      .post(`/api/executions/${appOther.body.execution.id}/link-outbound`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ outboundReceiptId: receiptOtherLot.receiptId })
      .expect(400);

    // Liên kết phiếu không làm đổi thêm tồn/movement
    const [balAfterLink, movAfterLink] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: f.lot.id } }),
      prisma.stockMovement.count(),
    ]);
    expect(balAfterLink.onHandQty.equals(balBeforeLink.onHandQty)).toBe(true);
    expect(movAfterLink).toBe(movBeforeLink);
  });

  it('AC8: lượt phân tích mới sau khi đã duyệt không đổi decision/execution và không tạo đề xuất mới cho lô đó', async () => {
    const expiryDate = new Date(`${addCalendarDays(todayVn, 8)}T00:00:00.000Z`);
    const receivedAt = new Date(`${addCalendarDays(todayVn, -30)}T00:00:00.000Z`);
    const lot = await prisma.lot.create({
      data: {
        productId: sp002Id,
        supplierId,
        lotCode: `${prefix}AC8`,
        expiryDate,
        receivedAt,
        initialQuantity: new Prisma.Decimal('220'),
        status: 'active',
        balance: { create: { onHandQty: new Prisma.Decimal('220') } },
      },
    });
    createdLotIds.push(lot.id);

    const run1 = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    createdRunIds.push(run1.id);
    expect(run1.status).toBe('succeeded');

    const proposal = await prisma.treatmentProposal.findFirstOrThrow({
      where: { lotId: lot.id },
    });

    // quanly duyệt + nhanvien cập nhật tiến độ
    const approvedRes = await request(app.getHttpServer())
      .post(`/api/proposals/${proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Duyệt trước lượt chạy 2' })
      .expect(201);
    const executionId = approvedRes.body.execution.id as string;

    await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/updates`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'in_progress', actualQtyDelta: '50', note: 'Đã đẩy được 50 đơn vị' })
      .expect(201);

    const [decisionBefore, execBefore] = await Promise.all([
      prisma.proposalDecision.findUniqueOrThrow({ where: { proposalId: proposal.id } }),
      prisma.treatmentExecution.findUniqueOrThrow({ where: { id: executionId } }),
    ]);

    // Chạy pipeline lượt 2
    const run2 = await pipelineService.run({ trigger: 'MANUAL', requestedBy: managerUserId });
    createdRunIds.push(run2.id);
    expect(run2.status).toBe('succeeded');
    expect(run2.metrics.skippedProposals).toBeGreaterThanOrEqual(1);

    const [proposalsAfter, decisionAfter, execAfter] = await Promise.all([
      prisma.treatmentProposal.findMany({ where: { lotId: lot.id } }),
      prisma.proposalDecision.findUniqueOrThrow({ where: { proposalId: proposal.id } }),
      prisma.treatmentExecution.findUniqueOrThrow({ where: { id: executionId } }),
    ]);

    expect(proposalsAfter).toHaveLength(1);
    expect(proposalsAfter[0].id).toBe(proposal.id);
    expect(proposalsAfter[0].status).toBe('in_progress');
    expect(decisionAfter.id).toBe(decisionBefore.id);
    expect(decisionAfter.decision).toBe('approved');
    expect(decisionAfter.reason).toBe('Duyệt trước lượt chạy 2');
    expect(execAfter.id).toBe(execBefore.id);
    expect(execAfter.status).toBe('in_progress');
    expect(execAfter.actualQty?.toString()).toBe('50');
  });

  it('T-022: quanly không có outbound.create nhưng vẫn lập phiếu hủy qua POST /api/executions/:id/disposal (201)', async () => {
    const fDisp = await createPendingProposalFixture({
      suffix: 'T022_MGR_DISP',
      daysFromToday: -3,
      onHandQty: '20',
      actionType: 'DISPOSE',
    });

    const approved = await request(app.getHttpServer())
      .post(`/api/proposals/${fDisp.proposal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'Quản lý duyệt hủy lô T-022' })
      .expect(201);
    const executionId = approved.body.execution.id as string;

    const dispRes = await request(app.getHttpServer())
      .post(`/api/executions/${executionId}/disposal`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ quantity: '20', notes: 'Quản lý lập phiếu hủy T-022' })
      .expect(201);

    expect(dispRes.body.outboundReceipt.outboundType).toBe('DISPOSAL');
    expect(dispRes.body.outboundReceipt.status).toBe('confirmed');

    const bal = await prisma.inventoryLotBalance.findUniqueOrThrow({
      where: { lotId: fDisp.lot.id },
    });
    expect(bal.onHandQty.toString()).toBe('0');
  });
});
