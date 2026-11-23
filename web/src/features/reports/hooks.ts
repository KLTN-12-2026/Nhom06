import { useQuery } from '@tanstack/react-query';
import { fetchMonthlyInOut, fetchRiskReport, fetchStockLedger } from './api';
import {
  type MonthlyInOutParams,
  type RiskReportParams,
  type StockLedgerParams,
} from './types';

export function useStockLedgerQuery(params: StockLedgerParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'stock-ledger', params],
    queryFn: () => fetchStockLedger(params),
    enabled,
  });
}

export function useMonthlyInOutQuery(params: MonthlyInOutParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'stock-ledger-monthly', params],
    queryFn: () => fetchMonthlyInOut(params),
    enabled,
  });
}

export function useRiskReportQuery(params: RiskReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'risk', params],
    queryFn: () => fetchRiskReport(params),
    enabled,
  });
}
