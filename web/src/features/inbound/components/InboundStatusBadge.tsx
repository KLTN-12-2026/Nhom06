import { StatusBadge } from '@/components/common/StatusBadge';
import { type InboundReceiptStatus } from '../types';

export interface InboundStatusBadgeProps {
  status: InboundReceiptStatus;
  className?: string;
}

export function InboundStatusBadge({ status, className }: InboundStatusBadgeProps) {
  if (status === 'confirmed') {
    return <StatusBadge tone="active" label="Đã xác nhận" className={className} />;
  }
  if (status === 'cancelled') {
    return (
      <StatusBadge
        tone="inactive"
        label="Đã hủy"
        className={className ? `line-through ${className}` : 'line-through'}
      />
    );
  }
  return <StatusBadge tone="neutral" label="Nháp" className={className} />;
}
