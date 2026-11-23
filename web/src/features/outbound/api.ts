import { apiFetch } from '@/lib/api';
import {
  type ConfirmOrderOutboundPayload,
  type ConfirmOrderOutboundResponse,
  type OrderFefoPlan,
  type OutboundReceiptDetail,
  type OutboundReceiptListResponse,
} from './types';

export interface ListOutboundReceiptsParams {
  type?: string;
  orderId?: string;
  lotId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function fetchOrderFefoPlan(orderId: string): Promise<OrderFefoPlan> {
  return apiFetch<OrderFefoPlan>(`/orders/${orderId}/fefo-plan`);
}

export function confirmOrderOutbound(
  orderId: string,
  payload: ConfirmOrderOutboundPayload,
): Promise<ConfirmOrderOutboundResponse> {
  return apiFetch<ConfirmOrderOutboundResponse>(`/orders/${orderId}/outbound`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchOutboundReceipts(
  params: ListOutboundReceiptsParams = {},
): Promise<OutboundReceiptListResponse> {
  const query = new URLSearchParams();
  if (params.type) {
    query.set('type', params.type);
  }
  if (params.orderId) {
    query.set('orderId', params.orderId);
  }
  if (params.lotId) {
    query.set('lotId', params.lotId);
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
  return apiFetch<OutboundReceiptListResponse>(`/outbound-receipts${qs ? `?${qs}` : ''}`);
}

export function fetchOutboundReceiptDetail(id: string): Promise<OutboundReceiptDetail> {
  return apiFetch<OutboundReceiptDetail>(`/outbound-receipts/${id}`);
}
