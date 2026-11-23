import { apiFetch, apiFetchBlob } from '@/lib/api';
import {
  type MonthlyInOutParams,
  type MonthlyInOutPoint,
  type RiskReportParams,
  type RiskReportResponse,
  type StockLedgerParams,
  type StockLedgerResponse,
} from './types';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function buildStockLedgerXlsxPath(params: StockLedgerParams): string {
  const qs = buildQueryString({
    from: params.from,
    to: params.to,
    groupId: params.groupId,
    productId: params.productId,
    lotId: params.lotId,
  });
  return `/reports/stock-ledger.xlsx${qs}`;
}

export function fetchStockLedger(params: StockLedgerParams): Promise<StockLedgerResponse> {
  const qs = buildQueryString({
    from: params.from,
    to: params.to,
    groupId: params.groupId,
    productId: params.productId,
    lotId: params.lotId,
  });
  return apiFetch<StockLedgerResponse>(`/reports/stock-ledger${qs}`);
}

export function fetchMonthlyInOut(params: MonthlyInOutParams): Promise<MonthlyInOutPoint[]> {
  const qs = buildQueryString({
    months: params.months ?? 12,
    groupId: params.groupId,
  });
  return apiFetch<MonthlyInOutPoint[]>(`/reports/stock-ledger/monthly${qs}`);
}

export function downloadStockLedgerXlsx(
  params: StockLedgerParams,
): Promise<{ blob: Blob; filename: string | null }> {
  return apiFetchBlob(buildStockLedgerXlsxPath(params));
}

export function fetchRiskReport(params: RiskReportParams): Promise<RiskReportResponse> {
  const qs = buildQueryString({
    from: params.from,
    to: params.to,
    productId: params.productId,
    riskLevel: params.riskLevel,
    proposalStatus: params.proposalStatus,
    executionStatus: params.executionStatus,
  });
  return apiFetch<RiskReportResponse>(`/reports/risk${qs}`);
}
