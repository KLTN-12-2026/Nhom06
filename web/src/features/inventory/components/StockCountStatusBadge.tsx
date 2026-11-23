import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';
import { type StockCountStatus } from '../types';

const STATUS_META: Record<StockCountStatus, { tone: StatusTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Nháp' },
  submitted: { tone: 'warning', label: 'Chờ duyệt' },
  approved: { tone: 'active', label: 'Đã duyệt' },
  cancelled: { tone: 'inactive', label: 'Đã hủy' },
};

export interface StockCountStatusBadgeProps {
  status: StockCountStatus;
}

export function StockCountStatusBadge({ status }: StockCountStatusBadgeProps) {
  const meta = STATUS_META[status];
  return <StatusBadge tone={meta.tone} label={meta.label} />;
}
