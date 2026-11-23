import { type RiskLevel } from '@/features/risk/types';
import { apiFetch } from '@/lib/api';
import {
  type ExplainProposalResponse,
  type ProposalActionType,
  type ProposalDetailResponse,
  type ProposalsListResponse,
  type ProposalStatus,
  type ProposalSummaryResponse,
} from './types';

export interface ListProposalsParams {
  status?: ProposalStatus | '';
  riskLevel?: RiskLevel | '';
  actionType?: ProposalActionType | '';
  lotId?: string;
  productId?: string;
}

export function getProposalsSummary(): Promise<ProposalSummaryResponse> {
  return apiFetch<ProposalSummaryResponse>('/proposals/summary');
}

export function getProposals(params: ListProposalsParams = {}): Promise<ProposalsListResponse> {
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  if (params.riskLevel) {
    search.set('riskLevel', params.riskLevel);
  }
  if (params.actionType) {
    search.set('actionType', params.actionType);
  }
  if (params.lotId) {
    search.set('lotId', params.lotId);
  }
  if (params.productId) {
    search.set('productId', params.productId);
  }
  const qs = search.toString();
  return apiFetch<ProposalsListResponse>(qs ? `/proposals?${qs}` : '/proposals');
}

export function getProposalDetail(id: string): Promise<ProposalDetailResponse> {
  return apiFetch<ProposalDetailResponse>(`/proposals/${id}`);
}

export function explainProposal(
  id: string,
  payload: { simulateFailure?: boolean } = {},
): Promise<ExplainProposalResponse> {
  return apiFetch<ExplainProposalResponse>(`/proposals/${id}/explain`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function approveProposal(
  id: string,
  payload: { note?: string | null; responsibleUserId?: string } = {},
): Promise<ProposalDetailResponse> {
  return apiFetch<ProposalDetailResponse>(`/proposals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function rejectProposal(
  id: string,
  payload: { reason: string },
): Promise<ProposalDetailResponse> {
  return apiFetch<ProposalDetailResponse>(`/proposals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
