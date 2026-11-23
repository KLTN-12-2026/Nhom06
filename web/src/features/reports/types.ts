import { type MonthlyInOutPoint, type RiskLevel, type RiskLevelSummaryItem } from '@/features/dashboard/types';

export interface StockLedgerProductRef {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface StockLedgerItem {
  product: StockLedgerProductRef;
  opening: string;
  inbound: string;
  outbound: string;
  adjustment: string;
  closing: string;
}

export interface StockLedgerTotals {
  opening: string;
  inbound: string;
  outbound: string;
  adjustment: string;
  closing: string;
}

export interface StockLedgerResponse {
  from: string;
  to: string;
  items: StockLedgerItem[];
  totals: StockLedgerTotals;
}

export interface StockLedgerParams {
  from?: string;
  to?: string;
  groupId?: string;
  productId?: string;
  lotId?: string;
}

export interface MonthlyInOutParams {
  months?: number;
  groupId?: string;
}

export interface RiskReportLatestRun {
  id: string;
  runType: string;
  modelVersion: string | null;
  finishedAt: string | null;
}

export interface RiskReportLotItem {
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    status: string;
    onHandQty: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  forecastDemand: string;
  estimatedSurplus: string;
  actualHandledQty: string | null;
  riskLevel: RiskLevel;
  actionType: string | null;
  proposalStatus: string | null;
  executionStatus: string | null;
  runId: string;
  proposalId: string | null;
}

export interface RiskReportResponse {
  latestRun: RiskReportLatestRun | null;
  expiry: {
    evaluationDate: string;
    nearExpiry: { lots: number; qty: string };
    expired: { lots: number; qty: string };
  };
  byRiskLevel: RiskLevelSummaryItem[];
  proposalsByStatus: Record<string, number>;
  executionsByStatus: Record<string, number>;
  hasSufficientActualData: boolean;
  lots: RiskReportLotItem[];
}

export interface RiskReportParams {
  from?: string;
  to?: string;
  productId?: string;
  riskLevel?: RiskLevel | '';
  proposalStatus?: string;
  executionStatus?: string;
}

export type { MonthlyInOutPoint };
