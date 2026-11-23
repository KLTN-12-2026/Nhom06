export type ForecastAssessment = 'BALANCED' | 'OVERSTOCK';

export interface MethodMetricSummary {
  mean_mae: number;
  mean_rmse: number;
  pooled_rmse?: number;
}

export interface ForecastSkippedItem {
  productCode: string;
  reason: string;
}

export interface ForecastRunMetrics {
  model: MethodMetricSummary | null;
  baseline: MethodMetricSummary | null;
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

export interface LatestForecastRun {
  id: string;
  modelVersion: string | null;
  finishedAt: string | null;
  horizonDays: number;
  forecastStart: string | null;
  dataSource: 'SIMULATED' | 'ACTUAL' | 'MIXED';
  metrics: ForecastRunMetrics | null;
}

export interface ProductForecastSummaryItem {
  productId: string;
  code: string;
  name: string;
  forecastQty: string;
  baselineQty: string;
  onHandQty: string;
  daysToSellOut: number | null;
  assessment: ForecastAssessment;
}

export interface LatestForecastResponse {
  run: LatestForecastRun | null;
  items: ProductForecastSummaryItem[];
}

export interface DailyHistoryItem {
  date: string;
  totalQty: string;
}

export interface DailyHistoryResponse {
  days: number;
  dataSource: 'SIMULATED' | 'ACTUAL' | 'MIXED';
  items: DailyHistoryItem[];
}

export interface RunForecastPayload {
  horizonDays?: number;
}

export interface ForecastRunRecord {
  id: string;
  runType: string;
  triggerType: string;
  status: string;
  modelVersion: string | null;
  metrics: ForecastRunMetrics | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}
