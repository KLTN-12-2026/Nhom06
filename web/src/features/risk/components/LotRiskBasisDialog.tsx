import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import {
  formatDateTime,
  formatDateVi,
  formatEstimatedQuantity,
  formatProductLabel,
  formatQuantity,
} from '@/lib/format';
import { useLotRiskDetailQuery } from '../hooks';
import { RiskLevelBadge } from './RiskLevelBadge';

export interface LotRiskBasisDialogProps {
  lotId: string | null;
  lotCodeHint?: string;
  runId?: string;
  onClose: () => void;
}

export function LotRiskBasisDialog({
  lotId,
  lotCodeHint,
  runId,
  onClose,
}: LotRiskBasisDialogProps) {
  const detailQuery = useLotRiskDetailQuery(lotId, runId);
  const assessment = detailQuery.data?.assessment;
  const basis = assessment?.basis;
  const hasSurplus = assessment ? Number(assessment.estimatedSurplus) > 0 : false;

  return (
    <Dialog open={Boolean(lotId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>
            Căn cứ tính - Lô {assessment?.lot.lotCode ?? lotCodeHint ?? '…'}
          </DialogTitle>
          <DialogDescription>
            {assessment
              ? formatProductLabel(assessment.product.code, assessment.product.name)
              : 'Chi tiết phương pháp phân bổ FEFO và số liệu nguồn của lô'}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Đang tải căn cứ tính toán của lô...
          </div>
        ) : detailQuery.isError || !assessment || !basis ? (
          <div className="space-y-3 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
            <p>
              {detailQuery.error instanceof ApiError
                ? detailQuery.error.message
                : 'Không thể tải căn cứ tính toán cho lô này.'}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void detailQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-[var(--surface-muted)] px-4 py-3">
              <div className="space-y-0.5">
                <div className="text-xs text-[var(--text-muted)]">Mức rủi ro phân loại</div>
                <div className="flex items-center gap-2">
                  <RiskLevelBadge
                    riskLevel={assessment.riskLevel}
                    isExpired={assessment.isExpired}
                  />
                  <span className="text-xs text-[var(--text-muted)]">
                    (Ngưỡng nguy cấp: còn ≤ {basis.highRiskDaysThreshold} ngày có tồn dư)
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-[var(--text-muted)]">
                <div>Phân tích lúc {formatDateTime(assessment.calculatedAt)}</div>
                <div>Mô hình: {basis.modelVersion ?? 'chưa xác định'}</div>
              </div>
            </div>

            {/* Lưới 6 con số căn cứ FEFO */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Tồn lúc phân tích</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">
                  {formatQuantity(assessment.onHandSnapshot)} {assessment.product.unit}
                </div>
              </div>
              <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Nhu cầu trong cửa sổ</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">
                  {formatEstimatedQuantity(basis.demandWindow)}
                </div>
              </div>
              <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Lô FEFO trước đã tiêu thụ</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">
                  {formatEstimatedQuantity(basis.consumedByEarlierLots)}
                </div>
              </div>
              <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Nhu cầu phân bổ</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">
                  {formatEstimatedQuantity(assessment.allocatedDemand)}
                </div>
              </div>
              <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Tiêu thụ ước tính</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text)]">
                  {formatEstimatedQuantity(assessment.estimatedConsumption)}
                </div>
              </div>
              <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Tồn dư ước tính</div>
                <div
                  className={
                    hasSurplus
                      ? 'mt-1 text-base font-semibold tabular-nums text-[var(--risk-medium-kpi)]'
                      : 'mt-1 text-base font-semibold tabular-nums text-[var(--text)]'
                  }
                >
                  {formatEstimatedQuantity(assessment.estimatedSurplus)}
                </div>
              </div>
            </div>

            {/* Chi tiết cửa sổ bán và tham số */}
            <dl className="divide-y divide-border rounded-md border border-border">
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Ngày đánh giá (VN)</dt>
                <dd className="font-medium tabular-nums text-[var(--text)]">
                  {formatDateVi(basis.evaluationDate)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Hạn sử dụng</dt>
                <dd className="font-medium tabular-nums text-[var(--text)]">
                  {formatDateVi(basis.expiryDate)} (
                  {basis.daysRemaining < 0
                    ? `quá ${Math.abs(basis.daysRemaining)} ngày`
                    : `còn ${basis.daysRemaining} ngày`}
                  )
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Hạn dùng tối thiểu khi giao</dt>
                <dd className="font-medium tabular-nums text-[var(--text)]">
                  {basis.minDeliveryDays} ngày
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Cửa sổ bán hợp lệ</dt>
                <dd className="font-medium tabular-nums text-[var(--text)]">
                  {basis.windowStart && basis.windowEnd
                    ? `${formatDateVi(basis.windowStart)} - ${formatDateVi(basis.windowEnd)} (${basis.windowDays} ngày)`
                    : '0 ngày (không hấp thụ nhu cầu)'}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Thứ tự phân bổ FEFO</dt>
                <dd className="font-medium text-[var(--text)]">
                  {basis.fefoOrder !== null
                    ? `Hạng #${basis.fefoOrder}`
                    : basis.ineligibleReason ?? 'Không tham gia phân bổ'}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Kỳ dự báo nguồn</dt>
                <dd className="font-medium tabular-nums text-[var(--text)]">
                  {formatDateVi(basis.forecastHorizonStart)} -{' '}
                  {formatDateVi(basis.forecastHorizonEnd)} ({basis.inHorizonDays} ngày trong cửa sổ)
                </dd>
              </div>
              {basis.extrapolatedDays > 0 && (
                <div className="flex flex-wrap justify-between gap-2 bg-[var(--note-bg)] px-4 py-2.5">
                  <dt className="text-[var(--text)]">Ngoại suy vượt kỳ dự báo</dt>
                  <dd className="font-medium tabular-nums text-[var(--text)]">
                    {basis.extrapolatedDays} ngày ×{' '}
                    {formatEstimatedQuantity(basis.extrapolatedDailyRate)}
                    /ngày (TB 7 ngày cuối)
                  </dd>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">Mã lượt phân tích</dt>
                <dd className="font-mono text-xs text-[var(--text)]">
                  {basis.forecastRunId ?? detailQuery.data?.run.id}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
