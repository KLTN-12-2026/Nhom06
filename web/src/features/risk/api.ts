import { apiFetch } from '@/lib/api';
import {
  type AnalysisRunHistoryResponse,
  type LatestRiskResponse,
  type LotRiskDetailResponse,
  type RiskLevel,
  type TriggerAnalysisResponse,
} from './types';

export interface LatestRiskParams {
  riskLevel?: RiskLevel | '';
  productId?: string;
}

export interface AnalysisRunsParams {
  status?: string;
  trigger?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function getLatestRisk(params: LatestRiskParams = {}): Promise<LatestRiskResponse> {
  const search = new URLSearchParams();
  if (params.riskLevel) {
    search.set('riskLevel', params.riskLevel);
  }
  if (params.productId) {
    search.set('productId', params.productId);
  }
  const qs = search.toString();
  return apiFetch<LatestRiskResponse>(`/analysis/risk/latest${qs ? `?${qs}` : ''}`);
}

export function getLotRiskDetail(lotId: string, runId?: string): Promise<LotRiskDetailResponse> {
  const qs = runId ? `?runId=${encodeURIComponent(runId)}` : '';
  return apiFetch<LotRiskDetailResponse>(`/analysis/risk/lots/${encodeURIComponent(lotId)}${qs}`);
}

export function getAnalysisRuns(
  params: AnalysisRunsParams = {},
): Promise<AnalysisRunHistoryResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.trigger) search.set('trigger', params.trigger);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiFetch<AnalysisRunHistoryResponse>(`/analysis/runs${qs ? `?${qs}` : ''}`);
}

export function triggerAnalysisRun(): Promise<TriggerAnalysisResponse> {
  return apiFetch<TriggerAnalysisResponse>('/analysis/runs', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
