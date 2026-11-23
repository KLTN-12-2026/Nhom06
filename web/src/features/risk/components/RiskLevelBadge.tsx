import { RiskLevelBadge as SharedRiskLevelBadge } from '@/components/common/RiskStatusBadge';
import { type RiskLevel } from '../types';

export function RiskLevelBadge({
  riskLevel,
  isExpired,
}: {
  riskLevel: RiskLevel;
  isExpired?: boolean;
}) {
  return <SharedRiskLevelBadge level={riskLevel} isExpired={isExpired} />;
}
