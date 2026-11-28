import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatIsoDateVi, formatNumberVi } from '../formatters';
import { type LatestForecastRun } from '../types';

interface RunInfoCardProps {
  run: LatestForecastRun;
}

export function RunInfoCard({ run }: RunInfoCardProps) {
  const isPrimaryModel = Boolean(run.modelVersion && run.modelVersion.startsWith('rf'));
  const modelDisplayName = isPrimaryModel
    ? `Random Forest (${run.modelVersion})`
    : 'Trung bình 7 ngày';

  const modelInfo = run.metrics?.modelInfo;
  const trainingPeriodLabel = modelInfo
    ? `${formatIsoDateVi(modelInfo.trainStart)} - ${formatIsoDateVi(modelInfo.trainEnd)}`
    : 'Chưa có thông tin';
  const isSimulatedData =
    run.dataSource === 'SIMULATED' || modelInfo?.dataSource.toLowerCase().includes('mô phỏng');

  const forecastPeriodLabel = run.forecastStart
    ? `${run.horizonDays} ngày từ ${formatIsoDateVi(run.forecastStart)}`
    : `${run.horizonDays} ngày`;

  const modelMae = isPrimaryModel
    ? run.metrics?.model?.mean_mae
    : run.metrics?.baseline?.mean_mae;
  const comparisonMae = isPrimaryModel ? run.metrics?.baseline?.mean_mae : undefined;
  const modelRmse = isPrimaryModel
    ? run.metrics?.model?.mean_rmse
    : run.metrics?.baseline?.mean_rmse;

  const skippedCount = run.metrics?.skipped?.length ?? 0;

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg font-semibold text-[var(--text)]">
          Thông tin lượt chạy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-3 text-[13px]">
          <dt className="text-[var(--text-muted)]">Mô hình</dt>
          <dd className="whitespace-nowrap text-right font-medium text-[var(--text)]">
            {modelDisplayName}
          </dd>
          <dt className="text-[var(--text-muted)]">Dữ liệu huấn luyện</dt>
          <dd className="whitespace-nowrap text-right font-medium text-[var(--text)]">
            {trainingPeriodLabel}{' '}
            {isSimulatedData ? (
              <span className="font-normal text-[var(--text-muted)]">(mô phỏng)</span>
            ) : null}
          </dd>
          <dt className="text-[var(--text-muted)]">Kỳ dự báo</dt>
          <dd className="whitespace-nowrap text-right font-medium text-[var(--text)]">
            {forecastPeriodLabel}
          </dd>
          <dt className="text-[var(--text-muted)]">Sai số MAE</dt>
          <dd className="text-right font-medium tabular-nums text-[var(--text)]">
            {typeof modelMae === 'number' ? formatNumberVi(modelMae) : 'Chưa đánh giá'}
            {typeof comparisonMae === 'number' ? (
              <span className="block text-xs font-normal text-[var(--text-muted)]">
                Trung bình 7 ngày: {formatNumberVi(comparisonMae)}
              </span>
            ) : null}
          </dd>
          <dt className="text-[var(--text-muted)]">Sai số RMSE</dt>
          <dd className="text-right font-medium tabular-nums text-[var(--text)]">
            {typeof modelRmse === 'number' ? formatNumberVi(modelRmse) : 'Chưa đánh giá'}
          </dd>
        </dl>

        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Đánh giá trên 60 ngày cuối của dữ liệu.
          {skippedCount > 0
            ? ` Có ${skippedCount} sản phẩm dùng phương án dự phòng hoặc bị bỏ qua do thiếu lịch sử.`
            : ''}
        </p>
      </CardContent>
    </Card>
  );
}
