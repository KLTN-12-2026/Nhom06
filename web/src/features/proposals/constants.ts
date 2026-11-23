import { type StatusTone } from '@/components/common/StatusBadge';
import { type ProposalActionType, type ProposalStatus } from './types';

export const PROPOSAL_STATUS_META: Record<ProposalStatus, { tone: StatusTone; label: string }> = {
  new: { tone: 'neutral', label: 'Mới' },
  pending: { tone: 'warning', label: 'Chờ duyệt' },
  approved: { tone: 'active', label: 'Đã duyệt' },
  rejected: { tone: 'critical', label: 'Từ chối' },
  in_progress: { tone: 'warning', label: 'Đang thực hiện' },
  completed: { tone: 'active', label: 'Hoàn thành' },
};

export const PROPOSAL_ACTION_LABELS: Record<ProposalActionType, string> = {
  DISPOSE: 'Loại bỏ và lập biên bản huỷ',
  CONTACT_AGENCY: 'Liên hệ đại lý đẩy hàng',
  PRIORITIZE_FEFO: 'Ưu tiên xuất theo FEFO',
  RETURN_TO_SUPPLIER: 'Trả nhà cung cấp',
  CONSIDER_PROMOTION: 'Cân nhắc khuyến mãi',
};

export function formatRemainingDaysText(daysRemaining: number): string {
  if (daysRemaining < 0) {
    return `Quá ${Math.abs(daysRemaining)} ngày`;
  }
  return `${daysRemaining} ngày`;
}
