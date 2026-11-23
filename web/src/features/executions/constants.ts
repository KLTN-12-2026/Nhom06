import { type StatusTone } from '@/components/common/StatusBadge';
import { type ProposalActionType } from '@/features/proposals/types';
import { type ExecutionStatus } from './types';

export const EXECUTION_STATUS_META: Record<
  ExecutionStatus,
  { tone: StatusTone; label: string }
> = {
  planned: { tone: 'warning', label: 'Chưa bắt đầu' },
  in_progress: { tone: 'warning', label: 'Đang thực hiện' },
  completed: { tone: 'active', label: 'Hoàn thành' },
  failed: { tone: 'critical', label: 'Không thực hiện được' },
  cancelled: { tone: 'inactive', label: 'Đã hủy' },
};

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'completed',
  'failed',
  'cancelled',
] as const;

export function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return TERMINAL_EXECUTION_STATUSES.includes(status);
}

export function getAllowedNextStatuses(current: ExecutionStatus): ExecutionStatus[] {
  if (isTerminalExecutionStatus(current)) {
    return [];
  }
  return ['in_progress', 'completed', 'failed', 'cancelled'];
}

export function isDisposalAction(actionType: ProposalActionType): boolean {
  return actionType === 'DISPOSE' || actionType === 'RETURN_TO_SUPPLIER';
}

export function isLinkableOrderAction(actionType: ProposalActionType): boolean {
  return actionType === 'CONTACT_AGENCY' || actionType === 'PRIORITIZE_FEFO';
}
