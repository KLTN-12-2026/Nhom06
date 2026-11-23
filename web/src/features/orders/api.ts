import { apiFetch } from '@/lib/api';
import {
  type AgencyOrderDetail,
  type AgencyOrderListResponse,
  type CancelAgencyOrderPayload,
  type SaveAgencyOrderPayload,
} from './types';

export interface ListOrdersParams {
  status?: string;
  agencyId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function fetchOrders(params: ListOrdersParams = {}): Promise<AgencyOrderListResponse> {
  const query = new URLSearchParams();
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.agencyId) {
    query.set('agencyId', params.agencyId);
  }
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.page) {
    query.set('page', String(params.page));
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize));
  }
  const qs = query.toString();
  return apiFetch<AgencyOrderListResponse>(`/orders${qs ? `?${qs}` : ''}`);
}

export function fetchOrderDetail(id: string): Promise<AgencyOrderDetail> {
  return apiFetch<AgencyOrderDetail>(`/orders/${id}`);
}

export function createOrder(payload: SaveAgencyOrderPayload): Promise<AgencyOrderDetail> {
  return apiFetch<AgencyOrderDetail>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOrder(
  id: string,
  payload: SaveAgencyOrderPayload,
): Promise<AgencyOrderDetail> {
  return apiFetch<AgencyOrderDetail>(`/orders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function cancelOrder(
  id: string,
  payload: CancelAgencyOrderPayload,
): Promise<AgencyOrderDetail> {
  return apiFetch<AgencyOrderDetail>(`/orders/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
