import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmOrderOutbound,
  fetchOrderFefoPlan,
  fetchOutboundReceiptDetail,
  fetchOutboundReceipts,
  type ListOutboundReceiptsParams,
} from './api';
import { type ConfirmOrderOutboundPayload } from './types';

export function useOrderFefoPlanQuery(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', 'fefo-plan', orderId],
    queryFn: () => fetchOrderFefoPlan(orderId!),
    enabled: Boolean(orderId),
  });
}

export function useConfirmOrderOutboundMutation(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ConfirmOrderOutboundPayload) => confirmOrderOutbound(orderId, payload),
    onSuccess: (created) => {
      queryClient.setQueryData(['outbound-receipts', 'detail', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'fefo-plan', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['outbound-receipts'] });
      void queryClient.invalidateQueries({ queryKey: ['lots'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useOutboundReceiptsQuery(
  params: ListOutboundReceiptsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['outbound-receipts', params],
    queryFn: () => fetchOutboundReceipts(params),
    enabled: options?.enabled,
  });
}

export function useOutboundReceiptDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['outbound-receipts', 'detail', id],
    queryFn: () => fetchOutboundReceiptDetail(id!),
    enabled: Boolean(id),
  });
}
