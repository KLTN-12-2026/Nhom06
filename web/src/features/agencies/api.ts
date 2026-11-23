import { apiFetch } from '@/lib/api';
import {
  type AgencyItem,
  type AgencyStatus,
  type CreateAgencyPayload,
  type UpdateAgencyPayload,
} from './types';

export interface ListAgenciesParams {
  search?: string;
  status?: string;
}

export function fetchAgencies(params: ListAgenciesParams = {}): Promise<AgencyItem[]> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.status) {
    query.set('status', params.status);
  }
  const qs = query.toString();
  return apiFetch<AgencyItem[]>(`/agencies${qs ? `?${qs}` : ''}`);
}

export function createAgency(payload: CreateAgencyPayload): Promise<AgencyItem> {
  return apiFetch<AgencyItem>('/agencies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAgency(id: string, payload: UpdateAgencyPayload): Promise<AgencyItem> {
  return apiFetch<AgencyItem>(`/agencies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateAgencyStatus(id: string, status: AgencyStatus): Promise<AgencyItem> {
  return apiFetch<AgencyItem>(`/agencies/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
