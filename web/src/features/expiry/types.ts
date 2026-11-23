export type ThresholdScope = 'GLOBAL' | 'PRODUCT_GROUP' | 'PRODUCT';
export type ExpiryAlertSeverity = 'expired' | 'critical' | 'warning';

export interface GlobalThreshold {
  id: string;
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number;
  effectiveFrom: string;
}

export interface OverrideThreshold {
  id: string;
  scope: 'PRODUCT' | 'PRODUCT_GROUP';
  target: {
    id: string;
    code?: string;
    name: string;
  };
  warningDays: number;
  effectiveFrom: string;
}

export interface ActiveThresholdsResponse {
  global: GlobalThreshold;
  overrides: OverrideThreshold[];
}

export interface ThresholdHistoryItem {
  id: string;
  scope: ThresholdScope;
  target: {
    id: string;
    code?: string;
    name: string;
  } | null;
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string;
  };
}

export interface ThresholdHistoryResponse {
  items: ThresholdHistoryItem[];
}

export interface ExpiryAlertItem {
  lot: {
    id: string;
    lotCode: string;
    status: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
    group: {
      id: string;
      code: string;
      name: string;
    };
  };
  expiryDate: string;
  daysRemaining: number;
  onHandQty: string;
  severity: ExpiryAlertSeverity;
  thresholdApplied: {
    id: string;
    scope: ThresholdScope;
    warningDays: number;
    criticalDays: number;
  };
}

export interface ExpiryAlertsListResponse {
  evaluationDate: string;
  items: ExpiryAlertItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExpiryAlertsSummaryResponse {
  evaluationDate: string;
  expired: {
    lots: number;
    qty: string;
  };
  nearExpiry: {
    lots: number;
    qty: string;
  };
  totalAlertLots: number;
  global: {
    warningDays: number;
    criticalDays: number;
    minDeliveryDays: number;
  };
  overridesSummary: string;
}

export interface ExpiryAlertsFilterParams {
  date?: string;
  severity?: ExpiryAlertSeverity | '';
  productId?: string;
  expiryFrom?: string;
  expiryTo?: string;
  maxDaysRemaining?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateGlobalThresholdPayload {
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number;
}

export interface CreateOverrideThresholdPayload {
  scope: 'PRODUCT' | 'PRODUCT_GROUP';
  targetId: string;
  warningDays: number;
}

export interface UpdateOverrideThresholdPayload {
  warningDays: number;
}
