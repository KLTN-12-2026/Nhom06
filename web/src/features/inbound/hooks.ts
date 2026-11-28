import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelInboundReceipt,
  confirmInboundReceipt,
  createInboundReceipt,
  fetchInboundReceipt,
  fetchInboundReceipts,
  updateInboundReceipt,
} from './api';
import { type ListInboundReceiptsParams, type SaveInboundReceiptPayload } from './types';

export function useInboundReceiptsQuery(params: ListInboundReceiptsParams) {
  return useQuery({
    queryKey: ['inbound-receipts', params],
    queryFn: () => fetchInboundReceipts(params),
    placeholderData: keepPreviousData,
  });
}

export function useInboundReceiptQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['inbound-receipt', id],
    queryFn: () => fetchInboundReceipt(id!),
    enabled: Boolean(id),
  });
}

export function useCreateInboundReceiptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveInboundReceiptPayload) => createInboundReceipt(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbound-receipts'] });
    },
  });
}

export function useUpdateInboundReceiptMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveInboundReceiptPayload) => updateInboundReceipt(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inbound-receipt', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['inbound-receipts'] });
    },
  });
}

export function useCancelInboundReceiptMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelInboundReceipt(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inbound-receipt', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['inbound-receipts'] });
    },
  });
}

export function useConfirmInboundReceiptMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => confirmInboundReceipt(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inbound-receipt', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['inbound-receipts'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['lots'] });
    },
  });
}
