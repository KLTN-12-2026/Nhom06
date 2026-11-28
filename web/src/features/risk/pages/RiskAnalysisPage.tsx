import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExpiryBar } from '@/components/common/ExpiryBar';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { formatDateVi, formatQuantity } from '@/lib/format';
import { AnalysisRunHistoryCard } from '../components/AnalysisRunHistoryCard';
import { LotRiskBasisDialog } from '../components/LotRiskBasisDialog';
import { RiskLevelBadge } from '../components/RiskLevelBadge';
import { mapRiskToExpiryBarSeverity, TRIGGER_SUBTITLE_LABELS } from '../constants';
import { useAnalysisRunsQuery, useLatestRiskQuery, useRunAnalysisMutation } from '../hooks';
import { type RiskAssessmentItem, type RiskLevel } from '../types';

export function RiskAnalysisPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [riskFilter, setRiskFilter] = useState<RiskLevel | ''>('');
  const [selectedLot, setSelectedLot] = useState<{ id: string; lotCode: string } | null>(null);

  const canRunAnalysis = hasPermission('analysis.run');
  const canReadProposals = hasPermission('proposals.read');

  const latestQuery = useLatestRiskQuery({ riskLevel: riskFilter });
  const runsQuery = useAnalysisRunsQuery({ limit: 20 });
  const runMutation = useRunAnalysisMutation();

  const latestRun = latestQuery.data?.run ?? null;
  const items = latestQuery.data?.items ?? [];

  const handleRunAnalysis = async () => {
    try {
      await runMutation.mutateAsync();
      showToast('Đã hoàn tất phân tích nguy cơ tồn dư.');
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Không thể chạy phân tích nguy cơ tồn dư, vui lòng thử lại sau.';
      showToast(message, 'error');
    }
  };

  const subtitle = latestRun
    ? `Lượt chạy gần nhất: ${TRIGGER_SUBTITLE_LABELS[latestRun.trigger]}, ${formatDateVi(latestRun.evaluationDate)} · ${formatQuantity(latestRun.lotCount)} lô`
    : 'Chưa có lượt phân tích nào';

  const handleRowOpen = (item: RiskAssessmentItem) => {
    setSelectedLot({ id: item.lot.id, lotCode: item.lot.lotCode });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân tích nguy cơ tồn dư"
        description={subtitle}
        actions={
          canRunAnalysis ? (
            <Button
              type="button"
              onClick={() => void handleRunAnalysis()}
              disabled={runMutation.isPending}
              className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
            >
              {runMutation.isPending ? 'Đang phân tích…' : 'Phân tích lại'}
            </Button>
          ) : undefined
        }
      />

      {/* Hộp ghi chú xanh giải thích cách tính FEFO (mockup 20) */}
      <div
        role="note"
        className="rounded-lg border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--text)]"
      >
        FEFO phân bổ nhu cầu cho lô hết hạn sớm trước; phần còn lại là tồn dư ước tính.
      </div>

      {/* Cảnh báo sản phẩm thiếu dự báo (PB22 AC8) */}
      {latestRun && latestRun.warnings.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-[var(--risk-medium-bar)]/40 bg-[var(--risk-medium-bg)] px-4 py-3 text-sm text-[var(--risk-medium-fg)]"
        >
          <span className="font-semibold">Lưu ý dữ liệu đầu vào: </span>
          Bỏ qua {latestRun.warnings.length} sản phẩm chưa có dự báo (
          {latestRun.warnings.map((w) => `${w.productCode} · ${w.lotCount} lô`).join(', ')}) để
          không sinh kết quả rủi ro giả.
        </div>
      )}

      {/* Card 1: Kết quả theo lô */}
      {latestQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--text-muted)]">
            Đang tải kết quả phân tích nguy cơ tồn dư...
          </CardContent>
        </Card>
      ) : latestQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-[var(--risk-critical-fg)]">
              {latestQuery.error instanceof ApiError
                ? latestQuery.error.message
                : 'Không thể tải kết quả phân tích nguy cơ tồn dư. Vui lòng thử lại.'}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void latestQuery.refetch();
                void runsQuery.refetch();
              }}
            >
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : latestRun === null ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Chưa có lượt phân tích nguy cơ tồn dư nào.{' '}
              {canRunAnalysis
                ? 'Bấm "Phân tích lại" để tính tồn dư ước tính và mức rủi ro cho các lô còn tồn.'
                : 'Liên hệ quản lý kho để chạy lượt phân tích đầu tiên.'}
            </p>
            {canRunAnalysis && (
              <Button
                type="button"
                onClick={() => void handleRunAnalysis()}
                disabled={runMutation.isPending}
                className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
              >
                {runMutation.isPending ? 'Đang phân tích…' : 'Phân tích lại'}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle id="lot-risk-table-heading" className="text-lg font-semibold">
              Kết quả theo lô
            </CardTitle>
            <Select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskLevel | '')}
              aria-label="Lọc theo mức rủi ro"
              className="h-9 w-full sm:w-48"
            >
              <option value="">Tất cả mức rủi ro</option>
              <option value="critical">Hết hạn</option>
              <option value="high">Nguy cấp</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </Select>
          </CardHeader>

          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
                {riskFilter
                  ? 'Không có lô nào thuộc mức rủi ro đã chọn.'
                  : 'Chưa có lô còn tồn nào được đánh giá trong lượt phân tích này.'}
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="lot-risk-table-heading"
                className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Sản phẩm</TableHead>
                      <TableHead scope="col">Mã lô</TableHead>
                      <TableHead scope="col">Hạn dùng còn lại</TableHead>
                      <TableHead scope="col" className="text-right">
                        Tồn lúc phân tích
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Nhu cầu phân bổ
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Tiêu thụ ước tính
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Tồn dư ước tính
                      </TableHead>
                      <TableHead scope="col">Rủi ro</TableHead>
                      <TableHead scope="col" className="w-24 text-right">
                        <span className="sr-only">Thao tác</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const hasSurplus = Number(item.estimatedSurplus) > 0;
                      return (
                        <TableRow
                          key={item.assessmentId}
                          tabIndex={0}
                          onClick={() => handleRowOpen(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleRowOpen(item);
                            }
                          }}
                          className="cursor-pointer hover:bg-[var(--surface-muted)]/60 focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none"
                        >
                          <TableCell className="whitespace-nowrap">
                            <div className="font-medium text-[var(--text)]">
                              {item.product.code}
                            </div>
                            <div className="max-w-[200px] truncate text-xs text-[var(--text-muted)]">
                              {item.product.name}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap text-[var(--text)]">
                            {item.lot.lotCode}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <ExpiryBar
                              daysRemaining={item.lot.daysRemaining}
                              severity={mapRiskToExpiryBarSeverity(item.riskLevel, item.isExpired)}
                              maxDays={60}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums whitespace-nowrap text-[var(--text)]">
                            {formatQuantity(item.onHandSnapshot)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap text-[var(--text)]">
                            {formatQuantity(item.allocatedDemand)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap text-[var(--text)]">
                            {formatQuantity(item.estimatedConsumption)}
                          </TableCell>
                          <TableCell
                            className={
                              hasSurplus
                                ? 'text-right font-semibold tabular-nums whitespace-nowrap text-[var(--risk-medium-kpi)]'
                                : 'text-right tabular-nums whitespace-nowrap text-[var(--text)]'
                            }
                          >
                            {formatQuantity(item.estimatedSurplus)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <RiskLevelBadge
                              riskLevel={item.riskLevel}
                              isExpired={item.isExpired}
                            />
                          </TableCell>
                          <TableCell
                            className="text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasSurplus && canReadProposals ? (
                              <Button asChild type="button" variant="secondary" size="sm">
                                <Link to={`/proposals?lotId=${item.lot.id}`}>Đề xuất</Link>
                              </Button>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card 2: Lịch sử lượt phân tích */}
      <AnalysisRunHistoryCard
        runs={runsQuery.data?.items}
        isLoading={runsQuery.isLoading}
        isError={runsQuery.isError}
        onRetry={() => void runsQuery.refetch()}
      />

      {/* Dialog Căn cứ tính */}
      <LotRiskBasisDialog
        lotId={selectedLot?.id ?? null}
        lotCodeHint={selectedLot?.lotCode}
        runId={latestRun?.id}
        onClose={() => setSelectedLot(null)}
      />
    </div>
  );
}
