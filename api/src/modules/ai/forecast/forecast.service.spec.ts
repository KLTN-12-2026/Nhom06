import { BadGatewayException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForecastService } from './forecast.service';
import { MlClient, MlServiceError } from './ml-client.service';

function makeDailyHistory(productId: string, count: number) {
  const start = new Date('2026-01-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return {
      productId,
      historyDate: d,
      qty: new Prisma.Decimal(20),
      source: 'SIMULATED',
    };
  });
}

describe('ForecastService (T-012 AC4, AC5)', () => {
  function createMocks() {
    const txDemandForecastCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const txAnalysisRunUpdate = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'run-1',
      runType: 'FORECAST',
      triggerType: 'MANUAL',
      ...data,
    }));

    const prisma = {
      analysisRun: {
        create: jest.fn().mockResolvedValue({
          id: 'run-1',
          runType: 'FORECAST',
          triggerType: 'MANUAL',
          status: 'running',
          requestedBy: 'user-1',
          startedAt: new Date('2026-11-23T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({ id: 'run-1', status: 'failed' }),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      demandHistory: {
        findMany: jest.fn(),
      },
      demandForecast: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      inventoryLotBalance: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          demandForecast: { createMany: txDemandForecastCreateMany },
          analysisRun: { update: txAnalysisRunUpdate },
        }),
      ),
    } as unknown as PrismaService;

    const mlClient = {
      getModelInfo: jest.fn().mockResolvedValue({
        model_version: 'rf-v1',
        trained_at: '2026-11-23T00:00:00Z',
        train_start: '2024-12-01',
        train_end: '2026-09-23',
        n_rows: 12680,
        features: ['lag_1'],
        params: { n_estimators: 200 },
        data_source: 'mô phỏng',
        metrics: {
          test_days: 60,
          methods: {
            random_forest: { mean_mae: 5.38, mean_rmse: 8.06, pooled_rmse: 8.96 },
            moving_average_7: { mean_mae: 6.65, mean_rmse: 9.17, pooled_rmse: 10.16 },
          },
        },
      }),
      forecast: jest.fn(),
    } as unknown as MlClient;

    return { prisma, mlClient, txDemandForecastCreateMany, txAnalysisRunUpdate };
  }

  it('AC4: khi MlClient lỗi ở sản phẩm thứ 5 → đánh dấu run failed kèm errorMessage, không ghi demand_forecasts nào và ném 502', async () => {
    const { prisma, mlClient, txDemandForecastCreateMany } = createMocks();
    const products = Array.from({ length: 6 }, (_, i) => ({
      id: `prod-${i + 1}`,
      code: `SP00${i + 1}`,
      name: `Sản phẩm ${i + 1}`,
      status: 'active',
    }));

    (prisma.product.findMany as jest.Mock).mockResolvedValue(products);
    (prisma.demandHistory.findMany as jest.Mock).mockResolvedValue(
      products.flatMap((p) => makeDailyHistory(p.id, 30)),
    );

    (mlClient.forecast as jest.Mock).mockImplementation(async (req: { product_code: string; method: string }) => {
      if (req.product_code === 'SP005') {
        throw new MlServiceError('Hết thời gian chờ ML ở SP005');
      }
      return {
        product_code: req.product_code,
        method: req.method,
        model_version: req.method === 'model' ? 'rf-v1' : 'moving-avg-7-v1',
        generated_at: '2026-11-23T00:00:00Z',
        forecast: [{ date: '2026-02-01', qty: 15 }],
      };
    });

    const service = new ForecastService(prisma, mlClient);

    await expect(service.runForecast(1, 'user-1')).rejects.toEqual(
      new BadGatewayException('Dịch vụ dự báo không phản hồi'),
    );

    expect(txDemandForecastCreateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('SP005'),
          finishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('AC5: bắt lỗi P2002 khi đã có lượt chạy running và ném ConflictException 409', async () => {
    const { prisma, mlClient } = createMocks();
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.6.0',
    });
    (prisma.analysisRun.create as jest.Mock).mockRejectedValue(p2002);

    const service = new ForecastService(prisma, mlClient);

    await expect(service.runForecast(60, 'user-1')).rejects.toEqual(
      new ConflictException('Đang có lượt phân tích chạy'),
    );
  });

  it('sản phẩm có 10 ngày lịch sử (< 28) chỉ gọi baseline và ghi vào metrics.skipped; sản phẩm < 7 ngày được bỏ qua', async () => {
    const { prisma, mlClient, txDemandForecastCreateMany, txAnalysisRunUpdate } = createMocks();
    const products = [
      { id: 'p-short', code: 'SP001', name: 'Ngắn', status: 'active' },
      { id: 'p-tiny', code: 'SP002', name: 'Rất ngắn', status: 'active' },
    ];
    (prisma.product.findMany as jest.Mock).mockResolvedValue(products);
    (prisma.demandHistory.findMany as jest.Mock).mockResolvedValue([
      ...makeDailyHistory('p-short', 10),
      ...makeDailyHistory('p-tiny', 3),
    ]);
    (mlClient.forecast as jest.Mock).mockResolvedValue({
      product_code: 'SP001',
      method: 'baseline',
      model_version: 'moving-avg-7-v1',
      generated_at: '2026-11-23T00:00:00Z',
      forecast: [
        { date: '2026-01-11', qty: 20 },
        { date: '2026-01-12', qty: 20 },
      ],
    });

    const service = new ForecastService(prisma, mlClient);
    await service.runForecast(2, 'user-1');

    expect(mlClient.forecast).toHaveBeenCalledTimes(1);
    expect(mlClient.forecast).toHaveBeenCalledWith(
      expect.objectContaining({ product_code: 'SP001', method: 'baseline', horizon_days: 2 }),
    );
    expect(txDemandForecastCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: 'p-short',
          forecastQty: new Prisma.Decimal('20'),
          baselineQty: new Prisma.Decimal('20'),
        }),
      ]),
    });
    expect(txAnalysisRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'succeeded',
          metrics: expect.objectContaining({
            skipped: expect.arrayContaining([
              expect.objectContaining({ productCode: 'SP001' }),
              expect.objectContaining({ productCode: 'SP002' }),
            ]),
          }),
        }),
      }),
    );
  });

  it('T-019 AC4: getLatest đọc lượt FULL succeeded có demand_forecasts và mở metrics.forecast giữ nguyên hợp đồng', async () => {
    const { prisma, mlClient } = createMocks();
    const fullRunFinishedAt = new Date('2026-11-23T07:00:00.000Z');
    (prisma.analysisRun.findFirst as jest.Mock).mockResolvedValue({
      id: 'run-full-1',
      runType: 'FULL',
      status: 'succeeded',
      modelVersion: 'rf-v1',
      finishedAt: fullRunFinishedAt,
      metrics: {
        evaluationDate: '2026-11-23',
        minDeliveryDays: 7,
        lotCount: 40,
        riskCounts: { expired: 4, high: 1, medium: 2, low: 33 },
        surplusLotCount: 7,
        createdProposals: 7,
        skippedProposals: 0,
        actualSyncedCount: 10,
        forecast: {
          model: { mean_mae: 5.38, mean_rmse: 8.06, pooled_rmse: 8.96 },
          baseline: { mean_mae: 6.65, mean_rmse: 9.17, pooled_rmse: 10.16 },
          modelInfo: {
            trainStart: '2024-12-01',
            trainEnd: '2026-09-23',
            nRows: 12680,
            dataSource: 'mô phỏng',
          },
          horizonDays: 60,
          productCount: 1,
          dataSource: 'MIXED',
          skipped: [],
        },
        warnings: [],
      },
    });
    (prisma.demandForecast.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'prod-1',
        forecastDate: new Date('2026-11-24T00:00:00.000Z'),
        forecastQty: new Prisma.Decimal('15.000'),
        baselineQty: new Prisma.Decimal('12.000'),
        product: { id: 'prod-1', code: 'SP001', name: 'Sữa tươi 180ml' },
      },
      {
        productId: 'prod-1',
        forecastDate: new Date('2026-11-25T00:00:00.000Z'),
        forecastQty: new Prisma.Decimal('15.000'),
        baselineQty: new Prisma.Decimal('12.000'),
        product: { id: 'prod-1', code: 'SP001', name: 'Sữa tươi 180ml' },
      },
    ]);
    (prisma.inventoryLotBalance.findMany as jest.Mock).mockResolvedValue([
      { onHandQty: new Prisma.Decimal('100.000'), lot: { productId: 'prod-1' } },
    ]);

    const service = new ForecastService(prisma, mlClient);
    const result = await service.getLatest();

    expect(prisma.analysisRun.findFirst).toHaveBeenCalledWith({
      where: {
        runType: { in: ['FORECAST', 'FULL'] },
        status: 'succeeded',
        demandForecasts: { some: {} },
      },
      orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result.run).toEqual({
      id: 'run-full-1',
      modelVersion: 'rf-v1',
      finishedAt: fullRunFinishedAt,
      horizonDays: 60,
      forecastStart: '2026-11-24',
      dataSource: 'MIXED',
      metrics: expect.objectContaining({
        model: { mean_mae: 5.38, mean_rmse: 8.06, pooled_rmse: 8.96 },
        baseline: { mean_mae: 6.65, mean_rmse: 9.17, pooled_rmse: 10.16 },
        horizonDays: 60,
        dataSource: 'MIXED',
      }),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      code: 'SP001',
      forecastQty: '30.000',
      baselineQty: '24.000',
      onHandQty: '100.000',
    });
  });

  it('T-019 AC4: getProductForecast hỗ trợ cả lượt FULL (theo runId lẫn mặc định mới nhất)', async () => {
    const { prisma, mlClient } = createMocks();
    (prisma.product.findUnique as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      code: 'SP001',
      name: 'Sữa tươi 180ml',
      unit: 'Thùng',
    });
    (prisma.analysisRun.findFirst as jest.Mock).mockResolvedValue({
      id: 'run-full-1',
      modelVersion: 'rf-v1',
      status: 'succeeded',
      finishedAt: new Date('2026-11-23T07:00:00.000Z'),
    });
    (prisma.demandForecast.findMany as jest.Mock).mockResolvedValue([
      {
        forecastDate: new Date('2026-11-24T00:00:00.000Z'),
        forecastQty: new Prisma.Decimal('18.500'),
        baselineQty: new Prisma.Decimal('16.000'),
      },
    ]);

    const service = new ForecastService(prisma, mlClient);
    const res = await service.getProductForecast('prod-1');

    expect(prisma.analysisRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          runType: { in: ['FORECAST', 'FULL'] },
          status: 'succeeded',
          demandForecasts: { some: {} },
        },
      }),
    );
    expect(res.run?.id).toBe('run-full-1');
    expect(res.items).toEqual([
      { forecastDate: '2026-11-24', forecastQty: '18.500', baselineQty: '16.000' },
    ]);
  });
});
