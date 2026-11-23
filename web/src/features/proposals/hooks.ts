import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  explainProposal,
  getProposalDetail,
  getProposals,
  getProposalsSummary,
  type ListProposalsParams,
} from './api';

export const PROPOSALS_QUERY_KEYS = {
  all: ['proposals'] as const,
  summary: () => ['proposals', 'summary'] as const,
  list: (params: ListProposalsParams) => ['proposals', 'list', params] as const,
  detail: (id: string) => ['proposals', 'detail', id] as const,
};

export function useProposalsSummaryQuery(options?: {
  enabled?: boolean;
  retry?: boolean;
  staleTime?: number;
}) {
  return useQuery({
    queryKey: PROPOSALS_QUERY_KEYS.summary(),
    queryFn: getProposalsSummary,
    enabled: options?.enabled,
    retry: options?.retry,
    staleTime: options?.staleTime,
  });
}

export function useProposalsQuery(params: ListProposalsParams = {}) {
  return useQuery({
    queryKey: PROPOSALS_QUERY_KEYS.list(params),
    queryFn: () => getProposals(params),
  });
}

export function useProposalDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: PROPOSALS_QUERY_KEYS.detail(id ?? ''),
    queryFn: () => getProposalDetail(id!),
    enabled: Boolean(id),
  });
}

export function useExplainProposalMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { simulateFailure?: boolean }) => explainProposal(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROPOSALS_QUERY_KEYS.detail(id) });
    },
  });
}
