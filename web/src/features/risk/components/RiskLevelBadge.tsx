import { StatusBadge } from '@/components/common/StatusBadge';
import { RISK_BADGE_META } from '../constants';
import { type RiskLevel } from '../types';

export function RiskLevelBadge({
  riskLevel,
  isExpired,
}: {
  riskLevel: RiskLevel;
  isExpired?: boolean;
}) {
  const effectiveLevel: RiskLevel = isExpired ? 'critical' : riskLevel;
  const meta = RISK_BADGE_META[effectiveLevel];
  return <StatusBadge tone={meta.tone} label={meta.label} />;
}
