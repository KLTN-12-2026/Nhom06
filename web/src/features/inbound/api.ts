import { apiFetch } from '@/lib/api';
import {
  type InboundReceiptDetail,
  type InboundReceiptListResponse,
  type ListInboundReceiptsParams,
  type SaveInboundReceiptPayload,
} from './types';

export function fetchInboundReceipts(
  params: ListInboundReceiptsParams = {},
): Promise<InboundReceiptListResponse> {
  const query = new URLSearchParams();
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.supplierId) {
    query.set('supplierId', params.supplierId);
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
  return apiFetch<InboundReceiptListResponse>(`/inbound-receipts${qs ? `?${qs}` : ''}`);
}

export function fetchInboundReceipt(id: string): Promise<InboundReceiptDetail> {
  return apiFetch<InboundReceiptDetail>(`/inbound-receipts/${id}`);
}

export function createInboundReceipt(
  payload: SaveInboundReceiptPayload,
): Promise<InboundReceiptDetail> {
  return apiFetch<InboundReceiptDetail>('/inbound-receipts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateInboundReceipt(
  id: string,
  payload: SaveInboundReceiptPayload,
): Promise<InboundReceiptDetail> {
  return apiFetch<InboundReceiptDetail>(`/inbound-receipts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function cancelInboundReceipt(id: string): Promise<InboundReceiptDetail> {
  return apiFetch<InboundReceiptDetail>(`/inbound-receipts/${id}/cancel`, {
    method: 'POST',
  });
}

export function confirmInboundReceipt(id: string): Promise<InboundReceiptDetail> {
  return apiFetch<InboundReceiptDetail>(`/inbound-receipts/${id}/confirm`, {
    method: 'POST',
  });
}
