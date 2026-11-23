import { type ProposalActionType } from '@/features/proposals/types';
import { apiFetch } from '@/lib/api';
import {
  type CreateExecutionDisposalPayload,
  type CreateExecutionDisposalResponse,
  type ExecutionItem,
  type ExecutionsListResponse,
  type ExecutionStatus,
  type LinkExecutionOutboundPayload,
  type RecordExecutionUpdatePayload,
} from './types';

export interface ListExecutionsParams {
  status?: ExecutionStatus | '';
  actionType?: ProposalActionType | '';
}

export function getExecutions(params: ListExecutionsParams = {}): Promise<ExecutionsListResponse> {
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  if (params.actionType) {
    search.set('actionType', params.actionType);
  }
  const qs = search.toString();
  return apiFetch<ExecutionsListResponse>(qs ? `/executions?${qs}` : '/executions');
}

export function getExecutionDetail(id: string): Promise<ExecutionItem> {
  return apiFetch<ExecutionItem>(`/executions/${id}`);
}

export function recordExecutionUpdate(
  id: string,
  payload: RecordExecutionUpdatePayload,
): Promise<ExecutionItem> {
  return apiFetch<ExecutionItem>(`/executions/${id}/updates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createExecutionDisposal(
  id: string,
  payload: CreateExecutionDisposalPayload,
): Promise<CreateExecutionDisposalResponse> {
  return apiFetch<CreateExecutionDisposalResponse>(`/executions/${id}/disposal`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function linkExecutionOutbound(
  id: string,
  payload: LinkExecutionOutboundPayload,
): Promise<ExecutionItem> {
  return apiFetch<ExecutionItem>(`/executions/${id}/link-outbound`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
