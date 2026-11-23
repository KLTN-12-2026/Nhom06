import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatIsoDateVi, formatNumberVi } from '../formatters';
import { type LatestForecastRun } from '../types';

interface RunInfoCardProps {
  run: LatestForecastRun;
}

export function RunInfoCard({ run }: RunInfoCardProps) {
  const isPrimaryModel = Boolean(run.modelVersion && run.modelVersion.startsWith('rf'));
  const modelDisplayName = isPrimaryModel
    ? 'Random Forest'
    : (run.modelVersion ?? 'Baseline');
  const roleLabel = isPrimaryModel ? 'Mô hình chính' : 'Baseline đối chiếu';

  const modelInfo = run.metrics?.modelInfo;
  const trainingDataLabel = modelInfo
    ? `Dữ liệu ${modelInfo.dataSource} (${formatIsoDateVi(modelInfo.trainStart)} – ${formatIsoDateVi(modelInfo.trainEnd)})`
    : run.dataSource === 'SIMULATED'
      ? 'Dữ liệu mô phỏng'
      : run.dataSource === 'ACTUAL'
        ? 'Dữ liệu thực tế'
        : 'Dữ liệu kết hợp (thực tế & mô phỏng)';

  const forecastPeriodLabel = run.forecastStart
    ? `${formatIsoDateVi(run.forecastStart)} – ${run.horizonDays} ngày`
    : `${run.horizonDays} ngày`;

  const modelMae = run.metrics?.model?.mean_mae;
  const baselineMae = run.metrics?.baseline?.mean_mae;
  const modelRmse = run.metrics?.model?.mean_rmse;

  const maeComparisonLabel =
    typeof modelMae === 'number' && typeof baselineMae === 'number'
      ? `${formatNumberVi(modelMae)} (baseline ${formatNumberVi(baselineMae)})`
      : typeof modelMae === 'number'
        ? formatNumberVi(modelMae)
        : 'chưa đánh giá';

  const skippedCount = run.metrics?.skipped?.length ?? 0;

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg font-semibold text-[var(--text)]">
          Thông tin lượt chạy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <dl className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Mô hình</dt>
            <dd className="text-right font-medium text-[var(--text)]">{modelDisplayName}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Phiên bản</dt>
            <dd className="text-right font-medium text-[var(--text)]">
              {run.modelVersion ?? '—'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Vai trò</dt>
            <dd className="text-right font-medium text-[var(--text)]">{roleLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-[var(--text-muted)]">Dữ liệu huấn luyện</dt>
            <dd className="text-right font-medium text-[var(--text)]">{trainingDataLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Kỳ dự báo</dt>
            <dd className="text-right font-medium text-[var(--text)]">{forecastPeriodLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-[var(--text-muted)]">MAE mô hình vs baseline</dt>
            <dd className="text-right font-medium tabular-nums text-[var(--text)]">
              {maeComparisonLabel}
            </dd>
          </div>
        </dl>

        <div className="rounded-md border border-border border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--text-muted)]">
          {typeof modelRmse === 'number'
            ? `RMSE mô hình: ${formatNumberVi(modelRmse)}. Đánh giá trên tập kiểm thử mô phỏng 60 ngày cuối.`
            : 'Chỉ số đánh giá sẽ hiển thị sau khi mô hình được kiểm thử với baseline.'}
          {skippedCount > 0
            ? ` Có ${skippedCount} sản phẩm dùng phương án dự phòng hoặc bị bỏ qua do thiếu lịch sử.`
            : ''}
        </div>
      </CardContent>
    </Card>
  );
}
