import { apiFetch } from '@/lib/api';
import { type DashboardResponse, type DependencyStatus, type HealthResponse } from './types';

export type { DependencyStatus, HealthResponse };

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>('/reports/dashboard');
}
