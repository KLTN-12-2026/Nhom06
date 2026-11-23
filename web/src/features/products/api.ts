import { apiFetch } from '@/lib/api';
import {
  type CatalogStatus,
  type CreateProductGroupPayload,
  type CreateProductPayload,
  type ProductGroupItem,
  type ProductItem,
  type ProductListResponse,
  type UpdateProductGroupPayload,
  type UpdateProductPayload,
} from './types';

export interface ListProductsParams {
  search?: string;
  groupId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function fetchProductGroups(status?: string): Promise<ProductGroupItem[]> {
  const query = new URLSearchParams();
  if (status) {
    query.set('status', status);
  }
  const qs = query.toString();
  return apiFetch<ProductGroupItem[]>(`/product-groups${qs ? `?${qs}` : ''}`);
}

export function createProductGroup(payload: CreateProductGroupPayload): Promise<ProductGroupItem> {
  return apiFetch<ProductGroupItem>('/product-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProductGroup(
  id: string,
  payload: UpdateProductGroupPayload,
): Promise<ProductGroupItem> {
  return apiFetch<ProductGroupItem>(`/product-groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateProductGroupStatus(
  id: string,
  status: CatalogStatus,
): Promise<ProductGroupItem> {
  return apiFetch<ProductGroupItem>(`/product-groups/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchProducts(params: ListProductsParams = {}): Promise<ProductListResponse> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.groupId) {
    query.set('groupId', params.groupId);
  }
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.page) {
    query.set('page', String(params.page));
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize));
  }
  const qs = query.toString();
  return apiFetch<ProductListResponse>(`/products${qs ? `?${qs}` : ''}`);
}

export function createProduct(payload: CreateProductPayload): Promise<ProductItem> {
  return apiFetch<ProductItem>('/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProduct(id: string, payload: UpdateProductPayload): Promise<ProductItem> {
  return apiFetch<ProductItem>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateProductStatus(id: string, status: CatalogStatus): Promise<ProductItem> {
  return apiFetch<ProductItem>(`/products/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
