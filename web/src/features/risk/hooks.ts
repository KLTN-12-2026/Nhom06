import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AnalysisRunsParams,
  getAnalysisRuns,
  getLatestRisk,
  getLotRiskDetail,
  type LatestRiskParams,
  triggerAnalysisRun,
} from './api';

export const ANALYSIS_QUERY_KEYS = {
  all: ['analysis'] as const,
  latestRisk: (params: LatestRiskParams) => ['analysis', 'risk', 'latest', params] as const,
  lotDetail: (lotId: string, runId?: string) =>
    ['analysis', 'risk', 'lot', lotId, runId ?? 'latest'] as const,
  runs: (params: AnalysisRunsParams) => ['analysis', 'runs', params] as const,
};

export function useLatestRiskQuery(params: LatestRiskParams = {}) {
  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.latestRisk(params),
    queryFn: () => getLatestRisk(params),
  });
}

export function useAnalysisRunsQuery(params: AnalysisRunsParams = { limit: 20 }) {
  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.runs(params),
    queryFn: () => getAnalysisRuns(params),
  });
}

export function useLotRiskDetailQuery(lotId: string | null, runId?: string) {
  return useQuery({
    queryKey: ANALYSIS_QUERY_KEYS.lotDetail(lotId ?? '', runId),
    queryFn: () => getLotRiskDetail(lotId!, runId),
    enabled: Boolean(lotId),
  });
}

export function useRunAnalysisMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => triggerAnalysisRun(),
    onSettled: async () => {
      // Làm mới cả kết quả lẫn lịch sử lượt chạy và đề xuất xử lý (kể cả khi lượt vừa chạy thất bại)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ANALYSIS_QUERY_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: ['proposals'] }),
      ]);
    },
  });
}
