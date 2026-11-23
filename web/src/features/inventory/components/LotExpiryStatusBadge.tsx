import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';
import { type ExpirySeverity } from '../types';

const EXPIRY_STATUS_META: Record<ExpirySeverity, { tone: StatusTone; label: string }> = {
  expired: { tone: 'neutral', label: 'Hết hạn' },
  critical: { tone: 'warning', label: 'Cận hạn' },
  warning: { tone: 'warning', label: 'Cận hạn' },
  normal: { tone: 'active', label: 'Bình thường' },
};

export interface LotExpiryStatusBadgeProps {
  expiryStatus: ExpirySeverity;
}

export function LotExpiryStatusBadge({ expiryStatus }: LotExpiryStatusBadgeProps) {
  const meta = EXPIRY_STATUS_META[expiryStatus];
  return <StatusBadge tone={meta.tone} label={meta.label} />;
}
