export type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  ml: DependencyStatus;
}

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type ExpirySeverity = 'expired' | 'critical' | 'warning' | 'normal';

export interface MonthlyInOutPoint {
  month: string;
  inbound: string;
  outbound: string;
}

export interface ValueAtRiskResult {
  amount: string;
  surplusQty: string;
  lotsWithoutCost: number;
}

export interface RiskLevelSummaryItem {
  level: RiskLevel;
  lots: number;
  surplusQty: string;
}

export interface DashboardTopLotItem {
  lotId: string;
  lotCode: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  onHandQty: string;
  expiryDate: string;
  daysRemaining: number;
  warningDays: number;
  expirySeverity: ExpirySeverity;
  riskLevel: RiskLevel | null;
  estimatedSurplusQty: string | null;
}

export interface DashboardPendingOrderItem {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  agency: {
    id: string;
    code: string;
    name: string;
  };
  itemCount: number;
}

export interface DashboardResponse {
  asOf: string;
  totalOnHand: string;
  lotsInStock: number;
  nearExpiry: {
    lots: number;
    qty: string;
  };
  expired: {
    lots: number;
    qty: string;
  };
  valueAtRisk: ValueAtRiskResult | null;
  monthlyInOut: MonthlyInOutPoint[];
  riskSummary: RiskLevelSummaryItem[] | null;
  topLots: DashboardTopLotItem[];
  pendingProposals: number | null;
  pendingOrders: DashboardPendingOrderItem[];
}
