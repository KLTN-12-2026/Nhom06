import { cn } from '@/lib/utils';
import { type MovementType } from '../types';

const MOVEMENT_TYPE_META: Record<MovementType, { label: string; className: string }> = {
  INBOUND: {
    label: 'Nhập',
    className:
      'border border-[var(--risk-low-fg)]/20 bg-[var(--risk-low-bg)] text-[var(--risk-low-fg)]',
  },
  OUTBOUND: {
    label: 'Xuất',
    className: 'border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)]',
  },
  ADJUSTMENT: {
    label: 'Điều chỉnh',
    className:
      'border border-[var(--risk-medium-fg)]/20 bg-[var(--risk-medium-bg)] text-[var(--risk-medium-fg)]',
  },
  RETURN: {
    label: 'Trả hàng',
    className:
      'border border-[var(--info)]/25 bg-[var(--note-bg)] text-[var(--info)]',
  },
  DISPOSAL: {
    label: 'Hủy',
    className:
      'border border-[var(--risk-critical-fg)]/20 bg-[var(--risk-critical-bg)] text-[var(--risk-critical-fg)]',
  },
};

export interface MovementTypeBadgeProps {
  movementType: MovementType;
}

export function MovementTypeBadge({ movementType }: MovementTypeBadgeProps) {
  const meta = MOVEMENT_TYPE_META[movementType];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
