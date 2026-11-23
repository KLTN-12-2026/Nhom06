import { apiFetch } from '@/lib/api';
import {
  type CreateSupplierPayload,
  type SupplierItem,
  type SupplierStatus,
  type UpdateSupplierPayload,
} from './types';

export interface ListSuppliersParams {
  search?: string;
  status?: string;
}

export function fetchSuppliers(params: ListSuppliersParams = {}): Promise<SupplierItem[]> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.status) {
    query.set('status', params.status);
  }
  const qs = query.toString();
  return apiFetch<SupplierItem[]>(`/suppliers${qs ? `?${qs}` : ''}`);
}

export function createSupplier(payload: CreateSupplierPayload): Promise<SupplierItem> {
  return apiFetch<SupplierItem>('/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateSupplier(id: string, payload: UpdateSupplierPayload): Promise<SupplierItem> {
  return apiFetch<SupplierItem>(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateSupplierStatus(id: string, status: SupplierStatus): Promise<SupplierItem> {
  return apiFetch<SupplierItem>(`/suppliers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
