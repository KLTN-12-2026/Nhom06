import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PROPOSALS_QUERY_KEYS } from '@/features/proposals/hooks';
import {
  createExecutionDisposal,
  getExecutionDetail,
  getExecutions,
  linkExecutionOutbound,
  type ListExecutionsParams,
  recordExecutionUpdate,
} from './api';
import {
  type CreateExecutionDisposalPayload,
  type LinkExecutionOutboundPayload,
  type RecordExecutionUpdatePayload,
} from './types';

export const EXECUTIONS_QUERY_KEYS = {
  all: ['executions'] as const,
  list: (params: ListExecutionsParams) => ['executions', 'list', params] as const,
  detail: (id: string) => ['executions', 'detail', id] as const,
};

export function useExecutionsQuery(params: ListExecutionsParams = {}) {
  return useQuery({
    queryKey: EXECUTIONS_QUERY_KEYS.list(params),
    queryFn: () => getExecutions(params),
  });
}

export function useExecutionDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: EXECUTIONS_QUERY_KEYS.detail(id ?? ''),
    queryFn: () => getExecutionDetail(id!),
    enabled: Boolean(id),
  });
}

export function useRecordExecutionUpdateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecordExecutionUpdatePayload }) =>
      recordExecutionUpdate(id, payload),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EXECUTIONS_QUERY_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: EXECUTIONS_QUERY_KEYS.detail(variables.id) }),
        queryClient.invalidateQueries({ queryKey: PROPOSALS_QUERY_KEYS.all }),
      ]);
    },
  });
}

export function useCreateExecutionDisposalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateExecutionDisposalPayload }) =>
      createExecutionDisposal(id, payload),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EXECUTIONS_QUERY_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: EXECUTIONS_QUERY_KEYS.detail(variables.id) }),
        queryClient.invalidateQueries({ queryKey: PROPOSALS_QUERY_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: ['outbound-receipts'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['expiry-alerts'] }),
      ]);
    },
  });
}

export function useLinkExecutionOutboundMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LinkExecutionOutboundPayload }) =>
      linkExecutionOutbound(id, payload),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EXECUTIONS_QUERY_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: EXECUTIONS_QUERY_KEYS.detail(variables.id) }),
        queryClient.invalidateQueries({ queryKey: PROPOSALS_QUERY_KEYS.all }),
      ]);
    },
  });
}
