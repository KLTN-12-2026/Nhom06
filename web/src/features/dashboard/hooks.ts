import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './api';

export function useHealthQuery() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
}
