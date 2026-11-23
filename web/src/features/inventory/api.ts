import { apiFetch } from '@/lib/api';
import {
  type CancelStockCountPayload,
  type InventoryFilterParams,
  type InventoryLotsListResponse,
  type InventorySummaryResponse,
  type ListInventoryLotsParams,
  type ListStockCountsParams,
  type ListStockMovementsParams,
  type SaveStockCountPayload,
  type StockCountDetail,
  type StockCountListResponse,
  type StockMovementsListResponse,
  type UpdateLotStatusPayload,
} from './types';

function appendInventoryFilterParams(
  query: URLSearchParams,
  params: InventoryFilterParams,
): void {
  if (params.lotId) {
    query.set('lotId', params.lotId);
  }
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.groupId) {
    query.set('groupId', params.groupId);
  }
  if (params.productId) {
    query.set('productId', params.productId);
  }
  if (params.expiryStatus) {
    query.set('expiryStatus', params.expiryStatus);
  }
  if (params.expiryFrom) {
    query.set('expiryFrom', params.expiryFrom);
  }
  if (params.expiryTo) {
    query.set('expiryTo', params.expiryTo);
  }
  if (params.lotStatus) {
    query.set('lotStatus', params.lotStatus);
  }
  if (params.includeEmpty) {
    query.set('includeEmpty', 'true');
  }
}

export function fetchInventoryLots(
  params: ListInventoryLotsParams = {},
): Promise<InventoryLotsListResponse> {
  const query = new URLSearchParams();
  appendInventoryFilterParams(query, params);
  if (params.page) {
    query.set('page', String(params.page));
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize));
  }
  const qs = query.toString();
  return apiFetch<InventoryLotsListResponse>(`/inventory/lots${qs ? `?${qs}` : ''}`);
}

export function fetchInventorySummary(
  params: InventoryFilterParams = {},
): Promise<InventorySummaryResponse> {
  const query = new URLSearchParams();
  appendInventoryFilterParams(query, params);
  const qs = query.toString();
  return apiFetch<InventorySummaryResponse>(`/inventory/summary${qs ? `?${qs}` : ''}`);
}

export function updateLotStatus(lotId: string, payload: UpdateLotStatusPayload): Promise<unknown> {
  return apiFetch(`/lots/${lotId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function fetchStockMovements(
  params: ListStockMovementsParams = {},
): Promise<StockMovementsListResponse> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.movementType) {
    query.set('movementType', params.movementType);
  }
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }
  if (params.sourceType) {
    query.set('sourceType', params.sourceType);
  }
  if (params.sourceId) {
    query.set('sourceId', params.sourceId);
  }
  if (params.lotId) {
    query.set('lotId', params.lotId);
  }
  if (params.productId) {
    query.set('productId', params.productId);
  }
  if (params.page) {
    query.set('page', String(params.page));
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize));
  }
  const qs = query.toString();
  return apiFetch<StockMovementsListResponse>(`/stock-movements${qs ? `?${qs}` : ''}`);
}

export function fetchStockCounts(
  params: ListStockCountsParams = {},
): Promise<StockCountListResponse> {
  const query = new URLSearchParams();
  if (params.status) {
    query.set('status', params.status);
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
  return apiFetch<StockCountListResponse>(`/stock-counts${qs ? `?${qs}` : ''}`);
}

export function fetchStockCount(id: string): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>(`/stock-counts/${id}`);
}

export function createStockCount(payload: SaveStockCountPayload): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>('/stock-counts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateStockCount(
  id: string,
  payload: SaveStockCountPayload,
): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>(`/stock-counts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function submitStockCount(id: string): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>(`/stock-counts/${id}/submit`, {
    method: 'POST',
  });
}

export function approveStockCount(id: string): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>(`/stock-counts/${id}/approve`, {
    method: 'POST',
  });
}

export function cancelStockCount(
  id: string,
  payload: CancelStockCountPayload,
): Promise<StockCountDetail> {
  return apiFetch<StockCountDetail>(`/stock-counts/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
