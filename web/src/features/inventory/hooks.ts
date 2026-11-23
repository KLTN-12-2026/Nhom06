import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveStockCount,
  cancelStockCount,
  createStockCount,
  fetchInventoryLots,
  fetchInventorySummary,
  fetchStockCount,
  fetchStockCounts,
  fetchStockMovements,
  submitStockCount,
  updateLotStatus,
  updateStockCount,
} from './api';
import {
  type CancelStockCountPayload,
  type InventoryFilterParams,
  type ListInventoryLotsParams,
  type ListStockCountsParams,
  type ListStockMovementsParams,
  type SaveStockCountPayload,
  type UpdateLotStatusPayload,
} from './types';

export function useInventoryLotsQuery(params: ListInventoryLotsParams, enabled = true) {
  return useQuery({
    queryKey: ['inventory-lots', params],
    queryFn: () => fetchInventoryLots(params),
    enabled,
  });
}

export function useInventorySummaryQuery(params: InventoryFilterParams, enabled = true) {
  return useQuery({
    queryKey: ['inventory-summary', params],
    queryFn: () => fetchInventorySummary(params),
    enabled,
  });
}

export function useUpdateLotStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lotId, payload }: { lotId: string; payload: UpdateLotStatusPayload }) =>
      updateLotStatus(lotId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-lots'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['lots'] });
      void queryClient.invalidateQueries({ queryKey: ['expiry-alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['expiry-alerts-summary'] });
    },
  });
}

export function useStockMovementsQuery(params: ListStockMovementsParams) {
  return useQuery({
    queryKey: ['stock-movements', params],
    queryFn: () => fetchStockMovements(params),
  });
}

export function useStockCountsQuery(params: ListStockCountsParams) {
  return useQuery({
    queryKey: ['stock-counts', params],
    queryFn: () => fetchStockCounts(params),
  });
}

export function useStockCountQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['stock-count', id],
    queryFn: () => fetchStockCount(id!),
    enabled: Boolean(id),
  });
}

export function useCreateStockCountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveStockCountPayload) => createStockCount(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}

export function useUpdateStockCountMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveStockCountPayload) => updateStockCount(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['stock-count', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}

export function useSubmitStockCountMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitStockCount(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['stock-count', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}

export function useApproveStockCountMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => approveStockCount(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['stock-count', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-lots'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      void queryClient.invalidateQueries({ queryKey: ['lots'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['expiry-alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['expiry-alerts-summary'] });
    },
  });
}

export function useCancelStockCountMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CancelStockCountPayload) => cancelStockCount(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['stock-count', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}
