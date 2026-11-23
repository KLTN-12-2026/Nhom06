import { type ExpiryBarSeverity } from '@/components/common/ExpiryBar';
import { type StatusTone } from '@/components/common/StatusBadge';
import { type AnalysisTriggerType, type RiskLevel } from './types';

export const RISK_BADGE_META: Record<RiskLevel, { tone: StatusTone; label: string }> = {
  critical: { tone: 'neutral', label: 'Hết hạn' },
  high: { tone: 'critical', label: 'Nguy cấp' },
  medium: { tone: 'warning', label: 'Trung bình' },
  low: { tone: 'active', label: 'Thấp' },
};

export const TRIGGER_LABELS: Record<AnalysisTriggerType, string> = {
  MANUAL: 'Thủ công',
  SCHEDULED: 'Theo lịch',
  STOCK_CHANGE: 'Khi tồn thay đổi',
};

export const TRIGGER_SUBTITLE_LABELS: Record<AnalysisTriggerType, string> = {
  MANUAL: 'thủ công',
  SCHEDULED: 'theo lịch',
  STOCK_CHANGE: 'khi tồn thay đổi',
};

export function mapRiskToExpiryBarSeverity(
  riskLevel: RiskLevel,
  isExpired: boolean,
): ExpiryBarSeverity {
  if (isExpired || riskLevel === 'critical') {
    return 'expired';
  }
  if (riskLevel === 'high') {
    return 'critical';
  }
  if (riskLevel === 'medium') {
    return 'warning';
  }
  return 'normal';
}
