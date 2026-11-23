import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';

const OUTBOUND_STATUS_CONFIG: Record<string, { tone: StatusTone; label: string }> = {
  confirmed: { tone: 'active', label: 'Đã xác nhận' },
  draft: { tone: 'neutral', label: 'Nháp' },
  cancelled: { tone: 'inactive', label: 'Đã hủy' },
};

export function OutboundStatusBadge({ status }: { status: string }) {
  const cfg = OUTBOUND_STATUS_CONFIG[status] ?? { tone: 'neutral' as StatusTone, label: status };
  return <StatusBadge tone={cfg.tone} label={cfg.label} />;
}
