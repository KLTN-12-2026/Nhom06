import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOrder,
  createOrder,
  fetchOrderDetail,
  fetchOrders,
  type ListOrdersParams,
  updateOrder,
} from './api';
import { type CancelAgencyOrderPayload, type SaveAgencyOrderPayload } from './types';

export function useOrdersQuery(params: ListOrdersParams) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => fetchOrders(params),
  });
}

export function useOrderDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => fetchOrderDetail(id!),
    enabled: Boolean(id),
  });
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveAgencyOrderPayload) => createOrder(payload),
    onSuccess: (created) => {
      queryClient.setQueryData(['orders', 'detail', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrderMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveAgencyOrderPayload) => updateOrder(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['orders', 'detail', updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'fefo-plan', updated.id] });
    },
  });
}

export function useCancelOrderMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CancelAgencyOrderPayload) => cancelOrder(id, payload),
    onSuccess: (cancelled) => {
      queryClient.setQueryData(['orders', 'detail', cancelled.id], cancelled);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'fefo-plan', cancelled.id] });
    },
  });
}
