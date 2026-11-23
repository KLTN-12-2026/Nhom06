import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDailyDemandHistory, getLatestForecast, runForecast } from './api';
import { type RunForecastPayload } from './types';

export const FORECAST_QUERY_KEYS = {
  all: ['forecasts'] as const,
  latest: ['forecasts', 'latest'] as const,
  dailyHistory: (days: number) => ['forecasts', 'history', 'daily', days] as const,
};

export function useLatestForecastQuery() {
  return useQuery({
    queryKey: FORECAST_QUERY_KEYS.latest,
    queryFn: getLatestForecast,
  });
}

export function useDailyHistoryQuery(days = 90) {
  return useQuery({
    queryKey: FORECAST_QUERY_KEYS.dailyHistory(days),
    queryFn: () => getDailyDemandHistory(days),
  });
}

export function useRunForecastMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RunForecastPayload = { horizonDays: 60 }) => runForecast(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FORECAST_QUERY_KEYS.all });
    },
  });
}
