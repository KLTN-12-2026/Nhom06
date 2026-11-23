import { BadGatewayException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExpiryThresholdsService } from '../../expiry/expiry-thresholds.service';
import { ForecastService, GeneratedForecastBundle } from '../forecast/forecast.service';
import { MlServiceError } from '../forecast/ml-client.service';
import { ProposalsLlmService } from '../proposals/proposals-llm.service';
import { ActualDemandSyncService } from './actual-demand-sync.service';
import { AnalysisPipelineService } from './analysis-pipeline.service';

describe('AnalysisPipelineService (T-013 AC2, AC4, AC5, AC6 & T-014 pipeline hook)', () => {
  function createMocks() {
    const txDemandForecastCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const txLotRiskCreateManyAndReturn = jest.fn().mockImplementation(async ({ data }) =>
      (data as Array<{ lotId: string }>).map((row, idx) => ({
        id: `risk-${idx + 1}`,
        lotId: row.lotId,
      })),
    );
    const txProposalFindMany = jest.fn().mockResolvedValue([]);
    const txProposalCreateManyAndReturn = jest.fn().mockImplementation(async ({ data }) =>
      (data as Array<{ lotId: string }>).map((row, idx) => ({
        id: `proposal-${idx + 1}`,
        lotId: row.lotId,
      })),
    );
    const txAnalysisRunUpdate = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'run-full-1',
      runType: 'FULL',
      triggerType: 'MANUAL',
      status: data.status,
      modelVersion: data.modelVersion,
      startedAt: new Date('2026-11-23T01:00:00.000Z'),
      finishedAt: data.finishedAt,
      createdAt: new Date('2026-11-23T01:00:00.000Z'),
      errorMessage: null,
      requester: { id: 'u-1', username: 'quanly', fullName: 'Nguyễn Văn Dương' },
    }));

    const prisma = {
      analysisRun: {
        create: jest.fn().mockResolvedValue({
          id: 'run-full-1',
          runType: 'FULL',
          triggerType: 'MANUAL',
          status: 'running',
          requestedBy: 'u-1',
          startedAt: new Date('2026-11-23T01:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({ id: 'run-full-1', status: 'failed' }),
      },
      lot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          demandForecast: { createMany: txDemandForecastCreateMany },
          lotRiskAssessment: { createManyAndReturn: txLotRiskCreateManyAndReturn },
          treatmentProposal: {
            findMany: txProposalFindMany,
            createManyAndReturn: txProposalCreateManyAndReturn,
          },
          analysisRun: { update: txAnalysisRunUpdate },
        }),
      ),
    } as unknown as PrismaService;

    const forecastService = {
      generateForecastForRun: jest.fn(),
    } as unknown as ForecastService;

    const expiryThresholdsService = {
      getMinDeliveryDays: jest.fn().mockResolvedValue(7),
    } as unknown as ExpiryThresholdsService;

    const actualDemandSyncService = {
      syncFromConfirmedOrderOutbounds: jest.fn().mockResolvedValue(0),
    } as unknown as ActualDemandSyncService;

    const proposalsLlmService = {
      explainProposalsBatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProposalsLlmService;

    const service = new AnalysisPipelineService(
      prisma,
      forecastService,
      expiryThresholdsService,
      actualDemandSyncService,
      proposalsLlmService,
    );

    return {
      service,
      prisma,
      forecastService,
      expiryThresholdsService,
      actualDemandSyncService,
      proposalsLlmService,
      txDemandForecastCreateMany,
      txLotRiskCreateManyAndReturn,
      txProposalFindMany,
      txProposalCreateManyAndReturn,
      txAnalysisRunUpdate,
    };
  }

  it('AC5: bắt lỗi P2002 từ partial unique index running và ném 409 Conflict', async () => {
    const { service, prisma } = createMocks();
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.6.0',
    });
    (prisma.analysisRun.create as jest.Mock).mockRejectedValueOnce(p2002);

    await expect(service.run({ trigger: 'MANUAL', requestedBy: 'u-1' })).rejects.toEqual(
      new ConflictException('Đang có lượt phân tích chạy'),
    );
  });

  it('AC4: khi ML lỗi → đánh dấu run failed kèm errorMessage, không ghi demand_forecasts / lot_risk_assessments / proposals nào và ném 502', async () => {
    const {
      service,
      prisma,
      forecastService,
      proposalsLlmService,
      txDemandForecastCreateMany,
      txLotRiskCreateManyAndReturn,
      txProposalCreateManyAndReturn,
    } = createMocks();

    (forecastService.generateForecastForRun as jest.Mock).mockRejectedValueOnce(
      new MlServiceError('Dịch vụ dự báo không phản hồi sau 10 giây tại SP005'),
    );

    await expect(service.run({ trigger: 'MANUAL', requestedBy: 'u-1' })).rejects.toEqual(
      new BadGatewayException('Dịch vụ dự báo không phản hồi'),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(txDemandForecastCreateMany).not.toHaveBeenCalled();
    expect(txLotRiskCreateManyAndReturn).not.toHaveBeenCalled();
    expect(txProposalCreateManyAndReturn).not.toHaveBeenCalled();
    expect(proposalsLlmService.explainProposalsBatch).not.toHaveBeenCalled();
    expect(prisma.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-full-1' },
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('SP005'),
          finishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('AC2 + AC6 + T-014: lưu dự báo, rủi ro, đề xuất trong 1 transaction; bỏ qua lô đã có đề xuất hoạt động; gọi LLM sau commit', async () => {
    const {
      service,
      prisma,
      forecastService,
      actualDemandSyncService,
      proposalsLlmService,
      txDemandForecastCreateMany,
      txLotRiskCreateManyAndReturn,
      txProposalFindMany,
      txProposalCreateManyAndReturn,
    } = createMocks();

    const bundle: GeneratedForecastBundle = {
      forecastRows: [
        {
          analysisRunId: 'run-full-1',
          productId: 'prod-1',
          forecastDate: new Date('2026-11-23T00:00:00.000Z'),
          forecastQty: new Prisma.Decimal('10'),
          baselineQty: new Prisma.Decimal('10'),
        },
      ],
      dailyForecastByProduct: new Map([
        ['prod-1', [{ date: '2026-11-23', qty: new Prisma.Decimal('10') }]],
      ]),
      modelVersion: 'rf-v1',
      metrics: {
        model: { mean_mae: 5.38, mean_rmse: 8.06 },
        baseline: { mean_mae: 6.65, mean_rmse: 9.17 },
        horizonDays: 60,
        productCount: 1,
        dataSource: 'MIXED',
        skipped: [
          {
            productCode: 'SP999',
            reason: 'Không đủ lịch sử tối thiểu (hiện có 0 ngày, cần ≥ 7 ngày)',
          },
        ],
      },
    };
    (forecastService.generateForecastForRun as jest.Mock).mockResolvedValueOnce(bundle);
    (actualDemandSyncService.syncFromConfirmedOrderOutbounds as jest.Mock).mockResolvedValueOnce(2);

    // Giả lập lot-existing đã có đề xuất hoạt động nên phải được bỏ qua
    txProposalFindMany.mockResolvedValueOnce([{ lotId: 'lot-existing' }]);

    (prisma.lot.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'lot-1',
        productId: 'prod-1',
        lotCode: 'L001',
        expiryDate: new Date('2026-12-03T00:00:00.000Z'),
        receivedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'active',
        product: {
          id: 'prod-1',
          code: 'SP001',
          name: 'Sản phẩm 1',
          unit: 'Lốc',
          status: 'active',
        },
        balance: { onHandQty: new Prisma.Decimal('100') },
      },
      {
        id: 'lot-existing',
        productId: 'prod-1',
        lotCode: 'L002',
        expiryDate: new Date('2026-11-01T00:00:00.000Z'),
        receivedAt: new Date('2026-09-01T00:00:00.000Z'),
        status: 'active',
        product: {
          id: 'prod-1',
          code: 'SP001',
          name: 'Sản phẩm 1',
          unit: 'Lốc',
          status: 'active',
        },
        balance: { onHandQty: new Prisma.Decimal('40') },
      },
      {
        id: 'lot-missing-forecast',
        productId: 'prod-999',
        lotCode: 'L999',
        expiryDate: new Date('2026-12-10T00:00:00.000Z'),
        receivedAt: new Date('2026-11-01T00:00:00.000Z'),
        status: 'active',
        product: {
          id: 'prod-999',
          code: 'SP999',
          name: 'Sản phẩm mới',
          unit: 'Thùng',
          status: 'active',
        },
        balance: { onHandQty: new Prisma.Decimal('50') },
      },
    ]);

    const result = await service.run({ trigger: 'MANUAL', requestedBy: 'u-1', horizonDays: 60 });

    expect(actualDemandSyncService.syncFromConfirmedOrderOutbounds).toHaveBeenCalledTimes(1);
    expect(txDemandForecastCreateMany).toHaveBeenCalledTimes(1);
    expect(txLotRiskCreateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(txProposalCreateManyAndReturn).toHaveBeenCalledTimes(1);

    const savedProposals = (
      txProposalCreateManyAndReturn.mock.calls[0][0] as {
        data: Array<{ lotId: string; status: string; actionType: string }>;
      }
    ).data;
    expect(savedProposals).toHaveLength(1);
    expect(savedProposals[0].lotId).toBe('lot-1');
    expect(savedProposals[0].status).toBe('pending');
    expect(savedProposals[0].actionType).toBe('CONTACT_AGENCY');

    expect(result.status).toBe('succeeded');
    expect(result.lotCount).toBe(2);
    expect(result.metrics.createdProposals).toBe(1);
    expect(result.metrics.skippedProposals).toBe(1);
    expect(result.metrics.warnings).toHaveLength(1);
    expect(proposalsLlmService.explainProposalsBatch).toHaveBeenCalledWith(
      [expect.objectContaining({ proposalId: 'proposal-1' })],
      3,
    );
  });

  it('T-014 bất biến 7: lỗi ngoài ý muốn ở batch LLM sau commit không làm đổi kết quả succeeded của lượt phân tích', async () => {
    const { service, prisma, forecastService, proposalsLlmService } = createMocks();

    const bundle: GeneratedForecastBundle = {
      forecastRows: [],
      dailyForecastByProduct: new Map([
        ['prod-1', [{ date: '2026-11-23', qty: new Prisma.Decimal('0') }]],
      ]),
      modelVersion: 'rf-v1',
      metrics: {
        model: { mean_mae: 1, mean_rmse: 1 },
        baseline: { mean_mae: 2, mean_rmse: 2 },
        horizonDays: 60,
        productCount: 1,
        dataSource: 'SIMULATED',
        skipped: [],
      },
    };
    (forecastService.generateForecastForRun as jest.Mock).mockResolvedValueOnce(bundle);
    (prisma.lot.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'lot-1',
        productId: 'prod-1',
        lotCode: 'L001',
        expiryDate: new Date('2026-11-28T00:00:00.000Z'),
        receivedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'active',
        product: {
          id: 'prod-1',
          code: 'SP001',
          name: 'Sản phẩm 1',
          unit: 'Lốc',
          status: 'active',
        },
        balance: { onHandQty: new Prisma.Decimal('20') },
      },
    ]);
    (proposalsLlmService.explainProposalsBatch as jest.Mock).mockRejectedValueOnce(
      new Error('Unexpected LLM batch crash'),
    );

    const result = await service.run({ trigger: 'MANUAL', requestedBy: 'u-1' });
    expect(result.status).toBe('succeeded');
    expect(prisma.analysisRun.update).not.toHaveBeenCalled();
  });
});
