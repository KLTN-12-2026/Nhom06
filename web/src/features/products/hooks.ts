import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProduct,
  createProductGroup,
  fetchProductGroups,
  fetchProducts,
  type ListProductsParams,
  updateProduct,
  updateProductGroup,
  updateProductGroupStatus,
  updateProductStatus,
} from './api';
import {
  type CatalogStatus,
  type CreateProductGroupPayload,
  type CreateProductPayload,
  type UpdateProductGroupPayload,
  type UpdateProductPayload,
} from './types';

export function useProductGroupsQuery(status?: string) {
  return useQuery({
    queryKey: ['product-groups', status ?? 'all'],
    queryFn: () => fetchProductGroups(status),
  });
}

export function useProductsQuery(params: ListProductsParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => fetchProducts(params),
  });
}

export function useCreateProductGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductGroupPayload) => createProductGroup(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    },
  });
}

export function useUpdateProductGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProductGroupPayload }) =>
      updateProductGroup(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProductGroupStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CatalogStatus }) =>
      updateProductGroupStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    },
  });
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProductPayload) => createProduct(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProductPayload }) =>
      updateProduct(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProductStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CatalogStatus }) =>
      updateProductStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
