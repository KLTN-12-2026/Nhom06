import {
  EXPIRY_ALERT_BADGE_META,
  EXPIRY_INVENTORY_BADGE_META,
  RISK_LEVEL_BADGE_META,
  type SharedExpirySeverity,
  type SharedRiskLevel,
} from './risk-status-meta';
import { StatusBadge } from './StatusBadge';

export interface RiskLevelBadgeProps {
  level: SharedRiskLevel;
  isExpired?: boolean;
  className?: string;
}

/**
 * Badge mức rủi ro tồn dư thống nhất theo DESIGN.md mục 2.
 * Dùng chung ở Dashboard, Phân tích tồn dư, Báo cáo rủi ro và Đề xuất xử lý.
 */
export function RiskLevelBadge({ level, isExpired, className }: RiskLevelBadgeProps) {
  const effectiveLevel: SharedRiskLevel = isExpired ? 'critical' : level;
  const meta = RISK_LEVEL_BADGE_META[effectiveLevel];
  return <StatusBadge tone={meta.tone} label={meta.label} className={className} />;
}

export interface ExpirySeverityBadgeProps {
  severity: SharedExpirySeverity;
  /** 'alert' (mặc định): 4 mức theo mockup 17; 'inventory': 3 mức Hết hạn / Cận hạn / Bình thường theo mockup 11. */
  mode?: 'alert' | 'inventory';
  className?: string;
}

/**
 * Badge tình trạng hạn sử dụng thống nhất theo DESIGN.md mục 2.
 */
export function ExpirySeverityBadge({
  severity,
  mode = 'alert',
  className,
}: ExpirySeverityBadgeProps) {
  const meta =
    mode === 'inventory'
      ? EXPIRY_INVENTORY_BADGE_META[severity]
      : EXPIRY_ALERT_BADGE_META[severity];
  return <StatusBadge tone={meta.tone} label={meta.label} className={className} />;
}
