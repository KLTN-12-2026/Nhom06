import { apiFetch } from '@/lib/api';
import {
  type AuditLogFacetsResponse,
  type AuditLogsListResponse,
  type AuditLogsQueryParams,
} from './types';

export function fetchAuditLogs(params: AuditLogsQueryParams = {}): Promise<AuditLogsListResponse> {
  const searchParams = new URLSearchParams();
  if (params.eventType) {
    searchParams.set('eventType', params.eventType);
  }
  if (params.entityType) {
    searchParams.set('entityType', params.entityType);
  }
  if (params.actorUserId) {
    searchParams.set('actorUserId', params.actorUserId);
  }
  if (params.from) {
    searchParams.set('from', params.from);
  }
  if (params.to) {
    searchParams.set('to', params.to);
  }
  if (params.search?.trim()) {
    searchParams.set('search', params.search.trim());
  }
  if (params.page) {
    searchParams.set('page', String(params.page));
  }
  if (params.pageSize) {
    searchParams.set('pageSize', String(params.pageSize));
  }
  const qs = searchParams.toString();
  return apiFetch<AuditLogsListResponse>(`/audit-logs${qs ? `?${qs}` : ''}`);
}

export function fetchAuditLogFacets(): Promise<AuditLogFacetsResponse> {
  return apiFetch<AuditLogFacetsResponse>('/audit-logs/facets');
}
