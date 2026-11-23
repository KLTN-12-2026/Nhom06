import { apiFetch } from '@/lib/api';

export type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  ml: DependencyStatus;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}
