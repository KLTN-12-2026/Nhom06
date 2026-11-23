import { ExpirySeverityBadge } from '@/components/common/RiskStatusBadge';
import { type ExpirySeverity } from '../types';

export interface LotExpiryStatusBadgeProps {
  expiryStatus: ExpirySeverity;
}

export function LotExpiryStatusBadge({ expiryStatus }: LotExpiryStatusBadgeProps) {
  return <ExpirySeverityBadge severity={expiryStatus} mode="inventory" />;
}
