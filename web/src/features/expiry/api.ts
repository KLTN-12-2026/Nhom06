import { apiFetch } from '@/lib/api';
import {
  type ActiveThresholdsResponse,
  type CreateOverrideThresholdPayload,
  type ExpiryAlertsFilterParams,
  type ExpiryAlertsListResponse,
  type ExpiryAlertsSummaryResponse,
  type GlobalThreshold,
  type OverrideThreshold,
  type ThresholdHistoryItem,
  type ThresholdHistoryResponse,
  type ThresholdScope,
  type UpdateGlobalThresholdPayload,
  type UpdateOverrideThresholdPayload,
} from './types';

function toQueryString(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== '') {
      sp.set(key, String(value).trim());
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function fetchActiveThresholds(): Promise<ActiveThresholdsResponse> {
  return apiFetch<ActiveThresholdsResponse>('/expiry-thresholds');
}

export function fetchThresholdHistory(params?: {
  scope?: ThresholdScope | '';
  targetId?: string;
}): Promise<ThresholdHistoryResponse> {
  const qs = toQueryString({
    scope: params?.scope,
    targetId: params?.targetId,
  });
  return apiFetch<ThresholdHistoryResponse>(`/expiry-thresholds/history${qs}`);
}

export function updateGlobalThreshold(
  payload: UpdateGlobalThresholdPayload,
): Promise<GlobalThreshold> {
  return apiFetch<GlobalThreshold>('/expiry-thresholds/global', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createOverrideThreshold(
  payload: CreateOverrideThresholdPayload,
): Promise<OverrideThreshold> {
  return apiFetch<OverrideThreshold>('/expiry-thresholds/overrides', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOverrideThreshold(
  id: string,
  payload: UpdateOverrideThresholdPayload,
): Promise<OverrideThreshold> {
  return apiFetch<OverrideThreshold>(`/expiry-thresholds/overrides/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function endOverrideThreshold(id: string): Promise<ThresholdHistoryItem> {
  return apiFetch<ThresholdHistoryItem>(`/expiry-thresholds/overrides/${id}/end`, {
    method: 'POST',
  });
}

export function fetchExpiryAlerts(
  params: ExpiryAlertsFilterParams,
): Promise<ExpiryAlertsListResponse> {
  const qs = toQueryString({
    date: params.date,
    severity: params.severity,
    productId: params.productId,
    expiryFrom: params.expiryFrom,
    expiryTo: params.expiryTo,
    maxDaysRemaining: params.maxDaysRemaining,
    search: params.search,
    page: params.page,
    pageSize: params.pageSize,
  });
  return apiFetch<ExpiryAlertsListResponse>(`/expiry-alerts${qs}`);
}

export function fetchExpiryAlertsSummary(date?: string): Promise<ExpiryAlertsSummaryResponse> {
  const qs = toQueryString({ date });
  return apiFetch<ExpiryAlertsSummaryResponse>(`/expiry-alerts/summary${qs}`);
}
