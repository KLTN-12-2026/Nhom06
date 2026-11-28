import { useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { formatTimeOnDateVi } from '@/lib/format';
import { DemandHistoryChartCard } from '../components/DemandHistoryChartCard';
import { ProductForecastTableCard } from '../components/ProductForecastTableCard';
import { RunInfoCard } from '../components/RunInfoCard';
import {
  useDailyHistoryQuery,
  useLatestForecastQuery,
  useRunForecastMutation,
} from '../hooks';

export function ForecastPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canRunAnalysis = hasPermission('analysis.run');

  const latestQuery = useLatestForecastQuery();
  const historyQuery = useDailyHistoryQuery(90);
  const runMutation = useRunForecastMutation();

  const handleRunForecast = useCallback(async () => {
    try {
      await runMutation.mutateAsync({ horizonDays: 60 });
      showToast('Đã hoàn tất chạy dự báo nhu cầu.');
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Không thể chạy dự báo nhu cầu, vui lòng thử lại sau.';
      showToast(message, 'error');
    }
  }, [runMutation, showToast]);

  const latestRun = latestQuery.data?.run ?? null;
  const items = latestQuery.data?.items ?? [];

  const headerDescription = latestRun
    ? `Lượt chạy lúc ${formatTimeOnDateVi(latestRun.finishedAt)}`
    : 'Chưa có lượt chạy dự báo nào';

  const headerActions = useMemo(
    () =>
      canRunAnalysis ? (
        <Button
          type="button"
          onClick={() => void handleRunForecast()}
          disabled={runMutation.isPending}
          className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
        >
          {runMutation.isPending ? 'Đang chạy dự báo...' : 'Chạy dự báo'}
        </Button>
      ) : undefined,
    [canRunAnalysis, handleRunForecast, runMutation.isPending],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dự báo nhu cầu tiêu thụ"
        description={headerDescription}
        actions={headerActions}
      />

      {latestQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--text-muted)]">
            Đang tải dữ liệu dự báo nhu cầu...
          </CardContent>
        </Card>
      ) : latestQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-[var(--risk-critical-fg)]">
              {latestQuery.error instanceof ApiError
                ? latestQuery.error.message
                : 'Không thể tải dữ liệu dự báo nhu cầu. Vui lòng thử lại.'}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void latestQuery.refetch();
                void historyQuery.refetch();
              }}
            >
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : latestRun === null ? (
        <div className="space-y-6">
          <DemandHistoryChartCard
            items={historyQuery.data?.items ?? []}
            isLoading={historyQuery.isLoading}
            isError={historyQuery.isError}
          />
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                Chưa có lượt dự báo nào.{' '}
                {canRunAnalysis
                  ? 'Bấm "Chạy dự báo" để ước lượng nhu cầu tiêu thụ cho 60 ngày tới.'
                  : 'Liên hệ quản lý kho để chạy lượt dự báo đầu tiên.'}
              </p>
              {canRunAnalysis ? (
                <Button
                  type="button"
                  onClick={() => void handleRunForecast()}
                  disabled={runMutation.isPending}
                >
                  {runMutation.isPending ? 'Đang chạy dự báo...' : 'Chạy dự báo'}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <DemandHistoryChartCard
                items={historyQuery.data?.items ?? []}
                isLoading={historyQuery.isLoading}
                isError={historyQuery.isError}
              />
            </div>
            <div className="lg:col-span-5">
              <RunInfoCard run={latestRun} />
            </div>
          </div>

          <ProductForecastTableCard items={items} horizonDays={latestRun.horizonDays} />
        </>
      )}
    </div>
  );
}
