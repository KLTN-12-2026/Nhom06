import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExpiryBar } from '@/components/common/ExpiryBar';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RiskLevelBadge } from '@/features/risk/components/RiskLevelBadge';
import { mapRiskToExpiryBarSeverity } from '@/features/risk/constants';
import { type RiskLevel } from '@/features/risk/types';
import { ApiError } from '@/lib/api';
import { formatQuantity } from '@/lib/format';
import { PROPOSAL_STATUS_META } from '../constants';
import { useProposalsQuery } from '../hooks';
import { type ProposalStatus } from '../types';

export function ProposalsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const lotIdParam = searchParams.get('lotId') ?? '';

  const [statusFilter, setStatusFilter] = useState<ProposalStatus | ''>('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | ''>('');

  const proposalsQuery = useProposalsQuery({
    status: statusFilter,
    riskLevel: riskFilter,
    lotId: lotIdParam || undefined,
  });

  const items = proposalsQuery.data?.items ?? [];
  const pendingCount = proposalsQuery.data?.summary.pending ?? 0;

  const hasFilters = Boolean(statusFilter || riskFilter || lotIdParam);

  const handleClearLotFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('lotId');
    setSearchParams(next, { replace: true });
  };

  const handleResetFilters = () => {
    setStatusFilter('');
    setRiskFilter('');
    if (lotIdParam) {
      handleClearLotFilter();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đề xuất xử lý hàng cận hạn"
        description={`${formatQuantity(pendingCount)} đề xuất chờ quyết định`}
      />

      {/* Hộp ghi chú xanh bất biến nghiệp vụ theo mockup 21 */}
      <div
        role="note"
        className="rounded-lg border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--text)]"
      >
        Phương án do bộ quy tắc nghiệp vụ sinh ra từ kết quả phân tích. Mô hình ngôn ngữ chỉ viết
        phần diễn giải. Quyết định thuộc về người quản lý, và việc phê duyệt không tự tạo chứng từ
        xuất hay trừ tồn.
      </div>

      {/* Bộ lọc trạng thái & mức rủi ro */}
      <FilterBar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProposalStatus | '')}
          aria-label="Lọc theo trạng thái"
          className="h-10 w-full sm:w-48"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="in_progress">Đang thực hiện</option>
          <option value="completed">Hoàn thành</option>
        </Select>

        <Select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as RiskLevel | '')}
          aria-label="Lọc theo mức rủi ro"
          className="h-10 w-full sm:w-48"
        >
          <option value="">Tất cả mức rủi ro</option>
          <option value="critical">Hết hạn</option>
          <option value="high">Nguy cấp</option>
          <option value="medium">Trung bình</option>
        </Select>

        {lotIdParam && (
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--text)]">
            <span>Đang lọc theo một lô cụ thể</span>
            <button
              type="button"
              onClick={handleClearLotFilter}
              className="font-medium text-[var(--info)] underline underline-offset-2 hover:opacity-80"
            >
              Xem tất cả lô
            </button>
          </div>
        )}

        {hasFilters && (
          <Button type="button" variant="outline" onClick={handleResetFilters}>
            Đặt lại
          </Button>
        )}
      </FilterBar>

      {/* Bảng đề xuất theo mockup 21 */}
      <Card>
        <CardContent className="p-0">
          {proposalsQuery.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              Đang tải danh sách đề xuất xử lý...
            </div>
          ) : proposalsQuery.isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-[var(--risk-critical-fg)]">
                {proposalsQuery.error instanceof ApiError
                  ? proposalsQuery.error.message
                  : 'Không thể tải danh sách đề xuất xử lý. Vui lòng thử lại.'}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void proposalsQuery.refetch()}
              >
                Thử lại
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              {hasFilters
                ? 'Không có đề xuất xử lý nào phù hợp với bộ lọc hiện tại.'
                : 'Chưa có đề xuất xử lý nào. Chạy phân tích nguy cơ tồn dư để hệ thống sinh đề xuất cho các lô có tồn dư.'}
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-label="Danh sách đề xuất xử lý hàng cận hạn"
              className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Sản phẩm</TableHead>
                    <TableHead scope="col">Mã lô</TableHead>
                    <TableHead scope="col">Hạn dùng còn lại</TableHead>
                    <TableHead scope="col" className="text-right">
                      Tồn dư
                    </TableHead>
                    <TableHead scope="col">Rủi ro</TableHead>
                    <TableHead scope="col">Phương án</TableHead>
                    <TableHead scope="col">Trạng thái</TableHead>
                    <TableHead scope="col" className="w-32 text-right">
                      <span className="sr-only">Thao tác</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const statusMeta = PROPOSAL_STATUS_META[item.status] ?? {
                      tone: 'neutral' as const,
                      label: item.status,
                    };

                    return (
                      <TableRow key={item.id} className="hover:bg-[var(--surface-muted)]/40">
                        <TableCell>
                          <div className="max-w-[260px] text-sm">
                            <span className="font-medium text-[var(--text)]">
                              {item.product.code}
                            </span>{' '}
                            <span className="text-[var(--text-muted)]">{item.product.name}</span>
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
                          {formatQuantity(item.proposedQty)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <RiskLevelBadge riskLevel={item.riskLevel} isExpired={item.isExpired} />
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm text-[var(--text)]">
                          {item.actionLabel}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge tone={statusMeta.tone} label={statusMeta.label} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button asChild type="button" variant="secondary" size="sm">
                            <Link to={`/proposals/${item.id}`}>Xem chi tiết</Link>
                          </Button>
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
    </div>
  );
}
