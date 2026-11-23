import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ProductForecastSummaryItem,
  summarizeProductForecast,
} from './domain/forecast-metrics.domain';
import {
  aggregateDailyHistory,
  buildCompleteDailyHistory,
  formatIsoDateUtc,
} from './domain/history-series.domain';
import {
  MlClient,
  MlForecastResponse,
  MlMethodOverallMetrics,
  MlModelInfoResponse,
  MlServiceError,
} from './ml-client.service';

const DEFAULT_HORIZON_DAYS = 60;
const MIN_BASELINE_HISTORY_DAYS = 7;
const MIN_MODEL_HISTORY_DAYS = 28;
const FORECAST_RUN_TYPE = 'FORECAST';
const LATEST_FORECAST_RUN_TYPES = [FORECAST_RUN_TYPE, 'FULL'];

export interface ForecastSkippedItem {
  productCode: string;
  reason: string;
}

export interface ForecastRunMetrics {
  model: MlMethodOverallMetrics | null;
  baseline: MlMethodOverallMetrics | null;
  modelInfo?: {
    trainStart: string;
    trainEnd: string;
    nRows: number;
    dataSource: string;
  };
  horizonDays: number;
  productCount: number;
  dataSource: 'SIMULATED' | 'ACTUAL' | 'MIXED';
  skipped: ForecastSkippedItem[];
}

export interface LatestForecastRunView {
  id: string;
  modelVersion: string | null;
  finishedAt: Date | null;
  horizonDays: number;
  forecastStart: string | null;
  dataSource: 'SIMULATED' | 'ACTUAL' | 'MIXED';
  metrics: ForecastRunMetrics | null;
}

export interface LatestForecastResponse {
  run: LatestForecastRunView | null;
  items: ProductForecastSummaryItem[];
}

export interface GeneratedForecastBundle {
  forecastRows: Prisma.DemandForecastCreateManyInput[];
  dailyForecastByProduct: Map<string, Array<{ date: string; qty: Prisma.Decimal }>>;
  modelVersion: string | null;
  metrics: ForecastRunMetrics;
}

@Injectable()
export class ForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClient,
  ) {}

  /**
   * Chạy bước dự báo cho toàn bộ sản phẩm active và trả về dữ liệu trên bộ nhớ
   * (chưa ghi DB) để tái sử dụng chung giữa `ForecastService.runForecast` (FORECAST)
   * và `AnalysisPipelineService.run` (FULL).
   */
  async generateForecastForRun(
    runId: string,
    horizonDays = DEFAULT_HORIZON_DAYS,
  ): Promise<GeneratedForecastBundle> {
    const products = await this.prisma.product.findMany({
      where: { status: 'active' },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    const productIds = products.map((product) => product.id);
    const historyRows =
      productIds.length > 0
        ? await this.prisma.demandHistory.findMany({
            where: { productId: { in: productIds } },
            select: { productId: true, historyDate: true, qty: true, source: true },
            orderBy: { historyDate: 'asc' },
          })
        : [];

    const historyByProduct = new Map<
      string,
      Array<{ date: Date; qty: Prisma.Decimal; source: string }>
    >();
    let hasSimulated = false;
    let hasActual = false;

    for (const row of historyRows) {
      if (row.source === 'ACTUAL') hasActual = true;
      if (row.source === 'SIMULATED') hasSimulated = true;
      const list = historyByProduct.get(row.productId) ?? [];
      list.push({ date: row.historyDate, qty: row.qty, source: row.source });
      historyByProduct.set(row.productId, list);
    }

    const modelInfo: MlModelInfoResponse = await this.mlClient.getModelInfo();

    const skipped: ForecastSkippedItem[] = [];
    const forecastRows: Prisma.DemandForecastCreateManyInput[] = [];
    const dailyForecastByProduct = new Map<string, Array<{ date: string; qty: Prisma.Decimal }>>();
    let resolvedModelVersion: string | null = null;
    let fallbackBaselineVersion: string | null = null;
    let forecastedProductCount = 0;

    // Gọi tuần tự từng sản phẩm để tránh quá tải worker ML và dừng ngay khi gặp lỗi
    for (const product of products) {
      const rawHistory = historyByProduct.get(product.id) ?? [];
      const completeHistory = buildCompleteDailyHistory(rawHistory);

      if (completeHistory.length < MIN_BASELINE_HISTORY_DAYS) {
        skipped.push({
          productCode: product.code,
          reason: `Không đủ lịch sử tối thiểu (hiện có ${completeHistory.length} ngày, cần ≥ ${MIN_BASELINE_HISTORY_DAYS} ngày)`,
        });
        continue;
      }

      let modelResponse: MlForecastResponse | null = null;
      if (completeHistory.length >= MIN_MODEL_HISTORY_DAYS) {
        modelResponse = await this.mlClient.forecast({
          product_code: product.code,
          history: completeHistory,
          horizon_days: horizonDays,
          method: 'model',
        });
        resolvedModelVersion = modelResponse.model_version;
      } else {
        skipped.push({
          productCode: product.code,
          reason: `Không đủ ${MIN_MODEL_HISTORY_DAYS} ngày lịch sử cho mô hình (hiện có ${completeHistory.length} ngày), chỉ dùng baseline`,
        });
      }

      const baselineResponse = await this.mlClient.forecast({
        product_code: product.code,
        history: completeHistory,
        horizon_days: horizonDays,
        method: 'baseline',
      });
      fallbackBaselineVersion = baselineResponse.model_version;

      const baselineByDate = new Map(
        baselineResponse.forecast.map((point) => [point.date, point.qty]),
      );

      const primaryForecast = modelResponse ? modelResponse.forecast : baselineResponse.forecast;
      const productSeries: Array<{ date: string; qty: Prisma.Decimal }> = [];

      for (const point of primaryForecast) {
        const baselineQty = baselineByDate.get(point.date);
        const forecastDecimal = new Prisma.Decimal(point.qty.toString());
        forecastRows.push({
          analysisRunId: runId,
          productId: product.id,
          forecastDate: new Date(`${point.date}T00:00:00.000Z`),
          forecastQty: forecastDecimal,
          baselineQty:
            baselineQty !== undefined ? new Prisma.Decimal(baselineQty.toString()) : null,
        });
        productSeries.push({ date: point.date, qty: forecastDecimal });
      }

      dailyForecastByProduct.set(product.id, productSeries);
      forecastedProductCount += 1;
    }

    const dataSource: 'SIMULATED' | 'ACTUAL' | 'MIXED' =
      hasActual && hasSimulated ? 'MIXED' : hasActual ? 'ACTUAL' : 'SIMULATED';

    const modelOverall = modelInfo.metrics?.methods?.random_forest ?? null;
    const baselineOverall = modelInfo.metrics?.methods?.moving_average_7 ?? null;

    const metrics: ForecastRunMetrics = {
      model: modelOverall,
      baseline: baselineOverall,
      modelInfo: {
        trainStart: modelInfo.train_start,
        trainEnd: modelInfo.train_end,
        nRows: modelInfo.n_rows,
        dataSource: modelInfo.data_source,
      },
      horizonDays,
      productCount: forecastedProductCount,
      dataSource,
      skipped,
    };

    const finalModelVersion =
      resolvedModelVersion ?? modelInfo.model_version ?? fallbackBaselineVersion;

    return {
      forecastRows,
      dailyForecastByProduct,
      modelVersion: finalModelVersion,
      metrics,
    };
  }

  async runForecast(horizonDays = DEFAULT_HORIZON_DAYS, requestedBy?: string) {
    let run;
    try {
      run = await this.prisma.analysisRun.create({
        data: {
          runType: FORECAST_RUN_TYPE,
          triggerType: 'MANUAL',
          status: 'running',
          requestedBy: requestedBy ?? null,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Đang có lượt phân tích chạy');
      }
      throw error;
    }

    try {
      const bundle = await this.generateForecastForRun(run.id, horizonDays);

      // Ghi toàn bộ demand_forecasts và hoàn tất analysis_runs trong một DB transaction ở cuối
      const finishedRun = await this.prisma.$transaction(async (tx) => {
        if (bundle.forecastRows.length > 0) {
          await tx.demandForecast.createMany({ data: bundle.forecastRows });
        }

        return tx.analysisRun.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            modelVersion: bundle.modelVersion,
            metrics: bundle.metrics as unknown as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        });
      });

      return finishedRun;
    } catch (error) {
      const errorMessage =
        error instanceof MlServiceError
          ? error.message
          : error instanceof Error
            ? `Lỗi khi chạy lượt dự báo: ${error.message}`
            : 'Lỗi không xác định khi chạy lượt dự báo';

      await this.prisma.analysisRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage,
        },
      });

      if (error instanceof MlServiceError) {
        throw new BadGatewayException('Dịch vụ dự báo không phản hồi');
      }
      throw error;
    }
  }

  async listRuns(limit = 10) {
    return this.prisma.analysisRun.findMany({
      where: { runType: FORECAST_RUN_TYPE },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        runType: true,
        triggerType: true,
        status: true,
        modelVersion: true,
        metrics: true,
        startedAt: true,
        finishedAt: true,
        errorMessage: true,
        createdAt: true,
        requester: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });
  }

  async getLatest(): Promise<LatestForecastResponse> {
    const latestRun = await this.prisma.analysisRun.findFirst({
      where: {
        runType: { in: LATEST_FORECAST_RUN_TYPES },
        status: 'succeeded',
        demandForecasts: { some: {} },
      },
      orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latestRun) {
      return { run: null, items: [] };
    }

    const forecastRows = await this.prisma.demandForecast.findMany({
      where: { analysisRunId: latestRun.id },
      select: {
        productId: true,
        forecastDate: true,
        forecastQty: true,
        baselineQty: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ product: { code: 'asc' } }, { forecastDate: 'asc' }],
    });

    const groupedByProduct = new Map<
      string,
      {
        productId: string;
        code: string;
        name: string;
        forecastTotal: Prisma.Decimal;
        baselineTotal: Prisma.Decimal;
        dayCount: number;
      }
    >();
    let minForecastDate: string | null = null;

    for (const row of forecastRows) {
      const isoDate = formatIsoDateUtc(row.forecastDate);
      if (minForecastDate === null || isoDate < minForecastDate) {
        minForecastDate = isoDate;
      }

      const existing = groupedByProduct.get(row.productId);
      if (!existing) {
        groupedByProduct.set(row.productId, {
          productId: row.product.id,
          code: row.product.code,
          name: row.product.name,
          forecastTotal: new Prisma.Decimal(row.forecastQty),
          baselineTotal: row.baselineQty
            ? new Prisma.Decimal(row.baselineQty)
            : new Prisma.Decimal(0),
          dayCount: 1,
        });
      } else {
        existing.forecastTotal = existing.forecastTotal.add(row.forecastQty);
        if (row.baselineQty) {
          existing.baselineTotal = existing.baselineTotal.add(row.baselineQty);
        }
        existing.dayCount += 1;
      }
    }

    const productIds = Array.from(groupedByProduct.keys());
    const balances =
      productIds.length > 0
        ? await this.prisma.inventoryLotBalance.findMany({
            where: {
              lot: {
                productId: { in: productIds },
              },
            },
            select: {
              onHandQty: true,
              lot: {
                select: { productId: true },
              },
            },
          })
        : [];

    const onHandByProduct = new Map<string, Prisma.Decimal>();
    for (const balance of balances) {
      const current = onHandByProduct.get(balance.lot.productId) ?? new Prisma.Decimal(0);
      onHandByProduct.set(balance.lot.productId, current.add(balance.onHandQty));
    }

    const parsedMetrics = this.parseMetrics(latestRun.metrics);
    const horizonDays =
      parsedMetrics?.horizonDays ??
      (groupedByProduct.size > 0
        ? Array.from(groupedByProduct.values())[0].dayCount
        : DEFAULT_HORIZON_DAYS);

    const items = Array.from(groupedByProduct.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((entry) =>
        summarizeProductForecast({
          productId: entry.productId,
          code: entry.code,
          name: entry.name,
          forecastTotalQty: entry.forecastTotal,
          baselineTotalQty: entry.baselineTotal,
          onHandQty: onHandByProduct.get(entry.productId) ?? new Prisma.Decimal(0),
          horizonDays,
        }),
      );

    return {
      run: {
        id: latestRun.id,
        modelVersion: latestRun.modelVersion,
        finishedAt: latestRun.finishedAt,
        horizonDays,
        forecastStart: minForecastDate,
        dataSource: parsedMetrics?.dataSource ?? 'SIMULATED',
        metrics: parsedMetrics,
      },
      items,
    };
  }

  async getProductForecast(productId: string, runId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, code: true, name: true, unit: true },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    let targetRun;
    if (runId) {
      targetRun = await this.prisma.analysisRun.findFirst({
        where: { id: runId, runType: { in: LATEST_FORECAST_RUN_TYPES } },
        select: { id: true, modelVersion: true, status: true, finishedAt: true },
      });
      if (!targetRun) {
        throw new NotFoundException('Không tìm thấy lượt dự báo yêu cầu');
      }
    } else {
      targetRun = await this.prisma.analysisRun.findFirst({
        where: {
          runType: { in: LATEST_FORECAST_RUN_TYPES },
          status: 'succeeded',
          demandForecasts: { some: {} },
        },
        orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, modelVersion: true, status: true, finishedAt: true },
      });
    }

    if (!targetRun) {
      return { product, run: null, items: [] };
    }

    const rows = await this.prisma.demandForecast.findMany({
      where: {
        analysisRunId: targetRun.id,
        productId: product.id,
      },
      orderBy: { forecastDate: 'asc' },
      select: {
        forecastDate: true,
        forecastQty: true,
        baselineQty: true,
      },
    });

    return {
      product,
      run: targetRun,
      items: rows.map((row) => ({
        forecastDate: formatIsoDateUtc(row.forecastDate),
        forecastQty: new Prisma.Decimal(row.forecastQty).toFixed(3),
        baselineQty: row.baselineQty ? new Prisma.Decimal(row.baselineQty).toFixed(3) : null,
      })),
    };
  }

  async getDailyHistory(days = 90) {
    const recentDateRows = await this.prisma.demandHistory.findMany({
      distinct: ['historyDate'],
      select: { historyDate: true },
      orderBy: { historyDate: 'desc' },
      take: days,
    });

    if (recentDateRows.length === 0) {
      return {
        days,
        dataSource: 'SIMULATED' as const,
        items: [],
      };
    }

    const oldestIncludedDate = recentDateRows[recentDateRows.length - 1].historyDate;

    const historyRows = await this.prisma.demandHistory.findMany({
      where: {
        historyDate: { gte: oldestIncludedDate },
      },
      select: {
        productId: true,
        historyDate: true,
        qty: true,
        source: true,
      },
      orderBy: { historyDate: 'asc' },
    });

    let hasSimulated = false;
    let hasActual = false;
    for (const row of historyRows) {
      if (row.source === 'ACTUAL') hasActual = true;
      if (row.source === 'SIMULATED') hasSimulated = true;
    }

    const dataSource: 'SIMULATED' | 'ACTUAL' | 'MIXED' =
      hasActual && hasSimulated ? 'MIXED' : hasActual ? 'ACTUAL' : 'SIMULATED';

    const items = aggregateDailyHistory(
      historyRows.map((row) => ({
        productId: row.productId,
        date: row.historyDate,
        qty: row.qty,
        source: row.source,
      })),
      days,
    );

    return {
      days,
      dataSource,
      items,
    };
  }

  private parseMetrics(raw: Prisma.JsonValue | null): ForecastRunMetrics | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const record = raw as Record<string, unknown>;
    // Lượt FULL (AnalysisPipelineService) lưu ForecastRunMetrics trong khóa con `metrics.forecast`
    if (
      'forecast' in record &&
      record.forecast &&
      typeof record.forecast === 'object' &&
      !Array.isArray(record.forecast)
    ) {
      return record.forecast as unknown as ForecastRunMetrics;
    }
    return raw as unknown as ForecastRunMetrics;
  }
}
