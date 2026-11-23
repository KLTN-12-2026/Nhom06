import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProductGroups, fetchProducts } from '@/features/products/api';
import {
  createOverrideThreshold,
  endOverrideThreshold,
  fetchActiveThresholds,
  fetchExpiryAlerts,
  fetchExpiryAlertsSummary,
  fetchThresholdHistory,
  updateGlobalThreshold,
  updateOverrideThreshold,
} from './api';
import {
  type CreateOverrideThresholdPayload,
  type ExpiryAlertsFilterParams,
  type ThresholdScope,
  type UpdateGlobalThresholdPayload,
  type UpdateOverrideThresholdPayload,
} from './types';

export const expiryKeys = {
  thresholds: ['expiry-thresholds'] as const,
  history: (params?: { scope?: ThresholdScope | ''; targetId?: string }) =>
    ['expiry-thresholds', 'history', params ?? {}] as const,
  alertsAll: ['expiry-alerts'] as const,
  alertsList: (params: ExpiryAlertsFilterParams) => ['expiry-alerts', 'list', params] as const,
  alertsSummary: (date?: string) => ['expiry-alerts', 'summary', date ?? 'today'] as const,
};

export function useActiveThresholdsQuery() {
  return useQuery({
    queryKey: expiryKeys.thresholds,
    queryFn: fetchActiveThresholds,
  });
}

export function useThresholdHistoryQuery(
  params?: { scope?: ThresholdScope | ''; targetId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: expiryKeys.history(params),
    queryFn: () => fetchThresholdHistory(params),
    enabled,
  });
}

export function useUpdateGlobalThresholdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateGlobalThresholdPayload) => updateGlobalThreshold(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expiryKeys.thresholds });
      void queryClient.invalidateQueries({ queryKey: expiryKeys.alertsAll });
    },
  });
}

export function useCreateOverrideThresholdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOverrideThresholdPayload) => createOverrideThreshold(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expiryKeys.thresholds });
      void queryClient.invalidateQueries({ queryKey: expiryKeys.alertsAll });
    },
  });
}

export function useUpdateOverrideThresholdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateOverrideThresholdPayload }) =>
      updateOverrideThreshold(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expiryKeys.thresholds });
      void queryClient.invalidateQueries({ queryKey: expiryKeys.alertsAll });
    },
  });
}

export function useEndOverrideThresholdMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => endOverrideThreshold(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expiryKeys.thresholds });
      void queryClient.invalidateQueries({ queryKey: expiryKeys.alertsAll });
    },
  });
}

export function useExpiryAlertsQuery(params: ExpiryAlertsFilterParams) {
  return useQuery({
    queryKey: expiryKeys.alertsList(params),
    queryFn: () => fetchExpiryAlerts(params),
  });
}

export function useExpiryAlertsSummaryQuery(
  date?: string,
  options?: { enabled?: boolean; retry?: boolean | number; staleTime?: number },
) {
  return useQuery({
    queryKey: expiryKeys.alertsSummary(date),
    queryFn: () => fetchExpiryAlertsSummary(date),
    enabled: options?.enabled ?? true,
    retry: options?.retry,
    staleTime: options?.staleTime,
  });
}

export function useActiveProductsForExpiryQuery(enabled = true) {
  return useQuery({
    queryKey: ['products', { status: 'active', pageSize: 100 }],
    queryFn: () => fetchProducts({ status: 'active', pageSize: 100 }),
    enabled,
  });
}

export function useActiveProductGroupsForExpiryQuery(enabled = true) {
  return useQuery({
    queryKey: ['product-groups', 'active'],
    queryFn: () => fetchProductGroups('active'),
    enabled,
  });
}
