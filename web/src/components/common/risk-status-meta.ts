import { type StatusTone } from './StatusBadge';

export type SharedRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type SharedExpirySeverity = 'expired' | 'critical' | 'warning' | 'normal';

export const RISK_LEVEL_BADGE_META: Record<
  SharedRiskLevel,
  { tone: StatusTone; label: string }
> = {
  critical: { tone: 'neutral', label: 'Hết hạn' },
  high: { tone: 'critical', label: 'Nguy cấp' },
  medium: { tone: 'warning', label: 'Trung bình' },
  low: { tone: 'active', label: 'Thấp' },
};

export const EXPIRY_ALERT_BADGE_META: Record<
  SharedExpirySeverity,
  { tone: StatusTone; label: string }
> = {
  expired: { tone: 'neutral', label: 'Hết hạn' },
  critical: { tone: 'critical', label: 'Nguy cấp' },
  warning: { tone: 'warning', label: 'Trung bình' },
  normal: { tone: 'active', label: 'Bình thường' },
};

export const EXPIRY_INVENTORY_BADGE_META: Record<
  SharedExpirySeverity,
  { tone: StatusTone; label: string }
> = {
  expired: { tone: 'neutral', label: 'Hết hạn' },
  critical: { tone: 'warning', label: 'Cận hạn' },
  warning: { tone: 'warning', label: 'Cận hạn' },
  normal: { tone: 'active', label: 'Bình thường' },
};
