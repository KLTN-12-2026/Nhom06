import { useQuery } from '@tanstack/react-query';
import { fetchAuditLogFacets, fetchAuditLogs } from './api';
import { type AuditLogsQueryParams } from './types';

export const AUDIT_LOGS_QUERY_KEY = ['audit-logs'] as const;
export const AUDIT_LOG_FACETS_QUERY_KEY = ['audit-logs', 'facets'] as const;

export function useAuditLogsQuery(params: AuditLogsQueryParams) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, params],
    queryFn: () => fetchAuditLogs(params),
  });
}

export function useAuditLogFacetsQuery() {
  return useQuery({
    queryKey: AUDIT_LOG_FACETS_QUERY_KEY,
    queryFn: fetchAuditLogFacets,
    staleTime: 60_000,
  });
}
