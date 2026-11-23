import { apiFetch } from '@/lib/api';
import {
  type DailyHistoryResponse,
  type ForecastRunRecord,
  type LatestForecastResponse,
  type RunForecastPayload,
} from './types';

export function getLatestForecast(): Promise<LatestForecastResponse> {
  return apiFetch<LatestForecastResponse>('/forecasts/latest');
}

export function getDailyDemandHistory(days = 90): Promise<DailyHistoryResponse> {
  return apiFetch<DailyHistoryResponse>(`/forecasts/history/daily?days=${days}`);
}

export function runForecast(payload: RunForecastPayload = {}): Promise<ForecastRunRecord> {
  return apiFetch<ForecastRunRecord>('/forecasts/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
