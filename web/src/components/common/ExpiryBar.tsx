import { cn } from '@/lib/utils';

export type ExpiryBarSeverity = 'expired' | 'critical' | 'warning' | 'normal';

export interface ExpiryBarProps {
  daysRemaining: number;
  severity: ExpiryBarSeverity;
  /** Mốc quy đổi chiều dài thanh (mặc định 60 ngày hoặc theo ngưỡng cảnh báo). */
  maxDays?: number;
  className?: string;
}

const BAR_STYLES: Record<ExpiryBarSeverity, { fillClass: string; textClass: string }> = {
  expired: {
    fillClass: 'bg-[var(--track)]',
    textClass: 'text-[var(--risk-expired-fg)]',
  },
  critical: {
    fillClass: 'bg-[var(--risk-critical-fg)]',
    textClass: 'text-[var(--risk-critical-fg)]',
  },
  warning: {
    fillClass: 'bg-[var(--risk-medium-bar)]',
    textClass: 'text-[var(--risk-medium-fg)]',
  },
  normal: {
    fillClass: 'bg-[var(--primary)]',
    textClass: 'text-[var(--risk-low-fg)]',
  },
};

function formatDaysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) {
    return `quá ${Math.abs(daysRemaining)} ngày`;
  }
  return `còn ${daysRemaining} ngày`;
}

export function ExpiryBar({
  daysRemaining,
  severity,
  maxDays = 60,
  className,
}: ExpiryBarProps) {
  const style = BAR_STYLES[severity];
  const label = formatDaysRemainingLabel(daysRemaining);

  let fillPercent = 0;
  if (daysRemaining >= 0) {
    const safeMax = Math.max(maxDays, 1);
    fillPercent = Math.min(100, Math.max(6, Math.round((daysRemaining / safeMax) * 100)));
  }

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <div
        className="h-1.5 w-[110px] shrink-0 overflow-hidden rounded-full bg-[var(--track)]"
        aria-hidden="true"
      >
        {fillPercent > 0 && (
          <div
            className={cn('h-full rounded-full', style.fillClass)}
            style={{ width: `${fillPercent}%` }}
          />
        )}
      </div>
      <span className={cn('text-sm font-medium tabular-nums whitespace-nowrap', style.textClass)}>
        {label}
      </span>
    </div>
  );
}
