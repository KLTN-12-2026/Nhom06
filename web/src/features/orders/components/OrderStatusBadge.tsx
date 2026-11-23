import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';

const ORDER_STATUS_CONFIG: Record<string, { tone: StatusTone; label: string; className?: string }> =
  {
    confirmed: { tone: 'warning', label: 'Chờ xuất' },
    partial: { tone: 'warning', label: 'Xuất một phần' },
    fulfilled: { tone: 'active', label: 'Đã xuất đủ' },
    cancelled: { tone: 'inactive', label: 'Đã hủy', className: 'line-through' },
  };

export function OrderStatusBadge({ status }: { status: string }) {
  const config = ORDER_STATUS_CONFIG[status] ?? { tone: 'neutral' as StatusTone, label: status };
  return <StatusBadge tone={config.tone} label={config.label} className={config.className} />;
}
