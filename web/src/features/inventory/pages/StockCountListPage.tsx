import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { StockCountStatusBadge } from '../components/StockCountStatusBadge';
import { useStockCountsQuery } from '../hooks';
import { type StockCountStatus, type StockCountSummary } from '../types';

const PAGE_SIZE = 50;

function formatVarianceText(raw: string): { label: string; className: string } {
  const num = Number(raw);
  if (!Number.isFinite(num) || num === 0) {
    return { label: '0', className: 'text-[var(--text-muted)]' };
  }
  if (num > 0) {
    return {
      label: `+${formatQuantity(raw)}`,
      className: 'text-[var(--risk-low-fg)]',
    };
  }
  return {
    label: `-${formatQuantity(raw.replace(/^-/, ''))}`,
    className: 'text-[var(--risk-critical-fg)]',
  };
}

export function StockCountListPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('stock_count.create');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StockCountStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const countsQuery = useStockCountsQuery({
    search,
    status,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasFilters = Boolean(search.trim() || status || from || to);

  const headerActions = useMemo(
    () =>
      canCreate ? (
        <Button asChild className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95">
          <Link to="/stock-counts/new">Lập phiếu kiểm kê</Link>
        </Button>
      ) : undefined,
    [canCreate],
  );

  const columns = useMemo<DataTableColumn<StockCountSummary>[]>(
    () => [
      {
        key: 'countNo',
        header: 'Số phiếu',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <Link
            to={`/stock-counts/${row.id}`}
            className="font-medium text-[var(--info)] hover:underline"
          >
            {row.countNo}
          </Link>
        ),
      },
      {
        key: 'countedAt',
        header: 'Thời điểm đếm',
        cellClassName: 'whitespace-nowrap tabular-nums text-[var(--text)]',
        render: (row) => formatDateTime(row.countedAt),
      },
      {
        key: 'lineCount',
        header: 'Số dòng',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums',
        render: (row) => row.lineCount,
      },
      {
        key: 'totalVarianceQty',
        header: 'Tổng chênh lệch',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums font-medium',
        render: (row) => {
          const variance = formatVarianceText(row.totalVarianceQty);
          return <span className={variance.className}>{variance.label}</span>;
        },
      },
      {
        key: 'creator',
        header: 'Người lập',
        cellClassName: 'whitespace-nowrap text-[var(--text-muted)]',
        render: (row) => row.creator.fullName,
      },
      {
        key: 'status',
        header: 'Trạng thái',
        cellClassName: 'whitespace-nowrap',
        render: (row) => <StockCountStatusBadge status={row.status} />,
      },
    ],
    [],
  );

  const total = countsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Phiếu kiểm kê kho"
        description="Lập và duyệt phiếu kiểm kê"
        actions={headerActions}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="search" className="flex-1">
          <FilterBar>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo số phiếu hoặc người lập"
              aria-label="Tìm theo số phiếu hoặc người lập"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full sm:w-64"
            />
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StockCountStatus | '');
                setPage(1);
              }}
              aria-label="Lọc theo trạng thái"
              className="h-10 w-full sm:w-44"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="draft">Nháp</option>
              <option value="submitted">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="cancelled">Đã hủy</option>
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Từ ngày"
              title="Từ ngày kiểm kê"
              className="h-10 w-full sm:w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              aria-label="Đến ngày"
              title="Đến ngày kiểm kê"
              className="h-10 w-full sm:w-40"
            />
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
              >
                Đặt lại
              </Button>
            )}
          </FilterBar>
        </div>

        <p className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
          {formatQuantity(total)} phiếu kiểm kê
        </p>
      </div>

      <DataTable
        columns={columns}
        data={countsQuery.data?.items}
        rowKey={(row) => row.id}
        isLoading={countsQuery.isLoading}
        isError={countsQuery.isError}
        onRetry={() => void countsQuery.refetch()}
        loadingText="Đang tải danh sách phiếu kiểm kê..."
        emptyText={
          hasFilters
            ? 'Không có phiếu kiểm kê phù hợp bộ lọc.'
            : 'Chưa có phiếu kiểm kê nào. Lập phiếu kiểm kê đầu tiên để đối chiếu tồn thực tế.'
        }
        errorText="Không thể tải danh sách phiếu kiểm kê."
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span className="tabular-nums">
            Trang {page} / {totalPages} ({formatQuantity(total)} phiếu)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trang trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
