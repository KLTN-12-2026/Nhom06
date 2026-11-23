import { useQuery } from '@tanstack/react-query';
import { fetchDashboard, fetchHealth } from './api';

export function useHealthQuery(enabled = true) {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealth,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });
}

export function useDashboardQuery() {
  return useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: fetchDashboard,
  });
}
