import { Badge } from '@/components/ui/badge';

export type StatusTone = 'active' | 'inactive' | 'warning' | 'critical' | 'neutral';

const TONE_MAP: Record<
  StatusTone,
  { variant: 'default' | 'warning' | 'critical' | 'neutral'; dotClass: string }
> = {
  active: { variant: 'default', dotClass: 'bg-[var(--risk-low-fg)]' },
  inactive: { variant: 'neutral', dotClass: 'bg-[var(--risk-expired-fg)]' },
  warning: { variant: 'warning', dotClass: 'bg-[var(--risk-medium-fg)]' },
  critical: { variant: 'critical', dotClass: 'bg-[var(--risk-critical-fg)]' },
  neutral: { variant: 'neutral', dotClass: 'bg-[var(--risk-expired-fg)]' },
};

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  className?: string;
}

export function StatusBadge({ tone, label, className }: StatusBadgeProps) {
  const style = TONE_MAP[tone];
  return (
    <Badge variant={style.variant} className={className}>
      <span className={`h-2 w-2 rounded-full ${style.dotClass}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}
