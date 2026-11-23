import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSupplier,
  fetchSuppliers,
  type ListSuppliersParams,
  updateSupplier,
  updateSupplierStatus,
} from './api';
import {
  type CreateSupplierPayload,
  type SupplierStatus,
  type UpdateSupplierPayload,
} from './types';

export function useSuppliersQuery(params: ListSuppliersParams) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: () => fetchSuppliers(params),
  });
}

export function useCreateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSupplierPayload) => createSupplier(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useUpdateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSupplierPayload }) =>
      updateSupplier(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useUpdateSupplierStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupplierStatus }) =>
      updateSupplierStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
