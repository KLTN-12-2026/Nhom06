import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RiskLevelBadge } from '@/components/common/RiskStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type RiskLevel } from '@/features/dashboard/types';
import { useProductsQuery } from '@/features/products/hooks';
import { formatDateTime, formatDateVi, formatQuantity } from '@/lib/format';
import { useRiskReportQuery } from '../hooks';
import { type RiskReportParams } from '../types';

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  new: 'Mới tạo',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn tất',
  expired: 'Hết hiệu lực',
  cancelled: 'Đã huỷ',
};

const EXECUTION_STATUS_LABELS: Record<string, string> = {
  planned: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn tất',
  failed: 'Không hoàn thành',
  cancelled: 'Đã huỷ',
};

export function RiskReportTab() {
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [productIdInput, setProductIdInput] = useState('');
  const [riskLevelInput, setRiskLevelInput] = useState<RiskLevel | ''>('');
  const [proposalStatusInput, setProposalStatusInput] = useState('');
  const [executionStatusInput, setExecutionStatusInput] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);

  const [applied, setApplied] = useState<RiskReportParams>({});

  const productsQuery = useProductsQuery({ page: 1, pageSize: 100 });
  const reportQuery = useRiskReportQuery(applied);
  const data = reportQuery.data;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromInput && toInput && fromInput > toInput) {
      setFilterError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
      return;
    }
    setFilterError(null);
    setApplied({
      from: fromInput || undefined,
      to: toInput || undefined,
      productId: productIdInput || undefined,
      riskLevel: riskLevelInput || undefined,
      proposalStatus: proposalStatusInput || undefined,
      executionStatus: executionStatusInput || undefined,
    });
  };

  const handleReset = () => {
    setFromInput('');
    setToInput('');
    setProductIdInput('');
    setRiskLevelInput('');
    setProposalStatusInput('');
    setExecutionStatusInput('');
    setFilterError(null);
    setApplied({});
  };

  const totalProposalsCount = data
    ? Object.values(data.proposalsByStatus).reduce((acc, n) => acc + n, 0)
    : 0;
  const completedExecutionsCount = data?.executionsByStatus.completed ?? 0;

  return (
    <div className="space-y-6">
      {/* Bộ lọc báo cáo rủi ro */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-[155px]">
            <label
              htmlFor="risk-from"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Từ ngày
            </label>
            <Input
              id="risk-from"
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
            />
          </div>

          <div className="w-full sm:w-[155px]">
            <label
              htmlFor="risk-to"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Đến ngày
            </label>
            <Input
              id="risk-to"
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
            />
          </div>

          <div className="w-full sm:w-[210px]">
            <label
              htmlFor="risk-product"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Sản phẩm
            </label>
            <Select
              id="risk-product"
              value={productIdInput}
              onChange={(e) => setProductIdInput(e.target.value)}
            >
              <option value="">Tất cả sản phẩm</option>
              {(productsQuery.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-[155px]">
            <label
              htmlFor="risk-level"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Mức rủi ro
            </label>
            <Select
              id="risk-level"
              value={riskLevelInput}
              onChange={(e) => setRiskLevelInput(e.target.value as RiskLevel | '')}
            >
              <option value="">Tất cả</option>
              <option value="critical">Hết hạn</option>
              <option value="high">Nguy cấp</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </Select>
          </div>

          <div className="w-full sm:w-[165px]">
            <label
              htmlFor="risk-proposal-status"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Trạng thái duyệt
            </label>
            <Select
              id="risk-proposal-status"
              value={proposalStatusInput}
              onChange={(e) => setProposalStatusInput(e.target.value)}
            >
              <option value="">Tất cả</option>
              {Object.entries(PROPOSAL_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-[175px]">
            <label
              htmlFor="risk-exec-status"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Trạng thái thực hiện
            </label>
            <Select
              id="risk-exec-status"
              value={executionStatusInput}
              onChange={(e) => setExecutionStatusInput(e.target.value)}
            >
              <option value="">Tất cả</option>
              {Object.entries(EXECUTION_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="submit"
            className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-90"
          >
            Xem báo cáo
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            Đặt lại
          </Button>
        </div>

        {filterError && (
          <p className="text-xs font-medium text-[var(--risk-critical-fg)]">{filterError}</p>
        )}
      </form>

      {reportQuery.isLoading && (
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            Đang tải báo cáo rủi ro cận hạn...
          </CardContent>
        </Card>
      )}

      {reportQuery.isError && (
        <div className="rounded-lg border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
          Không thể tải báo cáo rủi ro cận hạn.{' '}
          <button type="button" onClick={() => void reportQuery.refetch()} className="underline">
            Thử lại
          </button>
        </div>
      )}

      {data && (
        <>
          {/* KPI cận hạn / hết hạn / đề xuất / hoàn tất */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-[var(--surface)] p-5">
              <div className="text-sm font-medium text-[var(--text-muted)]">Lô cận hạn</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-medium-kpi)]">
                {formatQuantity(data.expiry.nearExpiry.lots)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                {formatQuantity(data.expiry.nearExpiry.qty)} đơn vị (tính đến{' '}
                {formatDateVi(data.expiry.evaluationDate)})
              </div>
            </div>

            <div className="rounded-lg border border-border bg-[var(--surface)] p-5">
              <div className="text-sm font-medium text-[var(--text-muted)]">Lô đã hết hạn</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-critical-fg)]">
                {formatQuantity(data.expiry.expired.lots)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                {formatQuantity(data.expiry.expired.qty)} đơn vị còn tồn
              </div>
            </div>

            <div className="rounded-lg border border-border bg-[var(--surface)] p-5">
              <div className="text-sm font-medium text-[var(--text-muted)]">Lô có đề xuất xử lý</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--text)]">
                {formatQuantity(totalProposalsCount)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                Mỗi lô chỉ tính theo lượt phân tích mới nhất
              </div>
            </div>

            <div className="rounded-lg border border-border bg-[var(--surface)] p-5">
              <div className="text-sm font-medium text-[var(--text-muted)]">Hoàn tất thực hiện</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-low-fg)]">
                {formatQuantity(completedExecutionsCount)}
              </div>
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                {data.latestRun?.finishedAt
                  ? `Lượt gần nhất: ${formatDateTime(data.latestRun.finishedAt)}`
                  : 'Chưa có lượt phân tích hoàn tất'}
              </div>
            </div>
          </div>

          {/* Ghi chú trạng thái dữ liệu phân tích / thực tế */}
          {!data.latestRun && (
            <div className="rounded-lg border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm text-[var(--text)]">
              Chưa có dữ liệu phân tích rủi ro cận hạn. Cần chạy phân tích tồn dư để thống kê tồn dư
              ước tính và đề xuất xử lý.
            </div>
          )}

          {data.latestRun && !data.hasSufficientActualData && (
            <div className="rounded-lg border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm text-[var(--text)]">
              Chưa đủ dữ liệu thực tế để đánh giá hiệu quả xử lý. Các con số dự báo và tồn dư ước
              tính chỉ mang tính tham khảo từ lượt phân tích.
            </div>
          )}

          {/* 2 bảng đếm đề xuất theo trạng thái duyệt và trạng thái thực hiện */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-border py-4">
                <CardTitle className="text-base font-semibold text-[var(--text)]">
                  Đề xuất theo trạng thái phê duyệt
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trạng thái phê duyệt</TableHead>
                      <TableHead className="text-right">Số lô</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(PROPOSAL_STATUS_LABELS).map(([key, label]) => (
                      <TableRow key={key}>
                        <TableCell className="text-[var(--text)]">{label}</TableCell>
                        <TableCell className="text-right tabular-nums text-[var(--text)]">
                          {formatQuantity(data.proposalsByStatus[key] ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border py-4">
                <CardTitle className="text-base font-semibold text-[var(--text)]">
                  Đề xuất theo trạng thái thực hiện
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trạng thái thực hiện</TableHead>
                      <TableHead className="text-right">Số lô</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(EXECUTION_STATUS_LABELS).map(([key, label]) => (
                      <TableRow key={key}>
                        <TableCell className="text-[var(--text)]">{label}</TableCell>
                        <TableCell className="text-right tabular-nums text-[var(--text)]">
                          {formatQuantity(data.executionsByStatus[key] ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Bảng chi tiết theo lô (tách rõ lượng dự báo · tồn dư ước tính · lượng xử lý thực tế) */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border py-4">
              <CardTitle className="text-lg font-semibold text-[var(--text)]">
                Chi tiết theo lô (lượt phân tích mới nhất)
              </CardTitle>
              <span className="text-xs text-[var(--text-muted)]">
                Tách riêng số dự báo, tồn dư ước tính và lượng xử lý thực tế
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {data.lots.length === 0 ? (
                <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
                  Không có lô hàng nào phù hợp bộ lọc hiện tại.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sản phẩm</TableHead>
                        <TableHead>Lô / HSD</TableHead>
                        <TableHead>Mức rủi ro</TableHead>
                        <TableHead className="text-right">Lượng dự báo</TableHead>
                        <TableHead className="text-right">Tồn dư ước tính</TableHead>
                        <TableHead className="text-right">Lượng xử lý thực tế</TableHead>
                        <TableHead>Đề xuất &amp; Thực hiện</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.lots.map((row) => (
                        <TableRow key={row.lot.id}>
                          <TableCell>
                            <div className="min-w-[160px]">
                              <span className="font-medium text-[var(--text)]">
                                {row.product.code}
                              </span>{' '}
                              <span className="text-[var(--text-muted)]">
                                {row.product.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="font-medium text-[var(--text)]">
                              {row.lot.lotCode}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] tabular-nums">
                              HSD {formatDateVi(row.lot.expiryDate)}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <RiskLevelBadge level={row.riskLevel} />
                          </TableCell>
                            <TableCell className="text-right tabular-nums whitespace-nowrap text-[var(--text)]">
                              {formatQuantity(row.forecastDemand)} {row.product.unit}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums whitespace-nowrap text-[var(--text)]">
                              {formatQuantity(row.estimatedSurplus)} {row.product.unit}
                            </TableCell>
                            <TableCell className="text-right tabular-nums whitespace-nowrap">
                              {row.actualHandledQty !== null ? (
                                <span className="font-medium text-[var(--text)]">
                                  {formatQuantity(row.actualHandledQty)} {row.product.unit}
                                </span>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)]">
                                  Chưa có dữ liệu thực tế
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex flex-col gap-0.5 text-xs">
                                {row.proposalId ? (
                                  <Link
                                    to={`/proposals/${row.proposalId}`}
                                    className="font-medium text-[var(--info)] hover:underline"
                                  >
                                    {PROPOSAL_STATUS_LABELS[row.proposalStatus ?? ''] ??
                                      'Xem đề xuất'}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-muted)]">Chưa có đề xuất</span>
                                )}
                                {row.executionStatus && (
                                  <span className="text-[var(--text-muted)]">
                                    Thực hiện:{' '}
                                    {EXECUTION_STATUS_LABELS[row.executionStatus] ??
                                      row.executionStatus}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
