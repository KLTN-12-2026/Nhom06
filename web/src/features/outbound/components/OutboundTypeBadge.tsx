import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';
import { getOutboundTypeLabel } from '../types';

const OUTBOUND_STATUS_CONFIG: Record<string, { tone: StatusTone; label: string }> = {
  confirmed: { tone: 'active', label: 'Đã xác nhận' },
  draft: { tone: 'neutral', label: 'Nháp' },
  cancelled: { tone: 'inactive', label: 'Đã hủy' },
};

const OUTBOUND_TYPE_TONES: Record<string, StatusTone> = {
  ORDER: 'active',
  RETURN_TO_SUPPLIER: 'warning',
  DISPOSAL: 'critical',
  OTHER: 'neutral',
};

export function OutboundStatusBadge({ status }: { status: string }) {
  const cfg = OUTBOUND_STATUS_CONFIG[status] ?? { tone: 'neutral' as StatusTone, label: status };
  return <StatusBadge tone={cfg.tone} label={cfg.label} />;
}

export function OutboundTypeBadge({ type }: { type: string }) {
  const tone = OUTBOUND_TYPE_TONES[type] ?? 'neutral';
  return <StatusBadge tone={tone} label={getOutboundTypeLabel(type)} />;
}
