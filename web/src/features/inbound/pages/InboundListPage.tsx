import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { useSuppliersQuery } from '@/features/suppliers/hooks';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/format';
import { InboundStatusBadge } from '../components/InboundStatusBadge';
import { useInboundReceiptsQuery } from '../hooks';
import { type InboundReceiptSummary } from '../types';

export function InboundListPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('inbound.create');
  const canReadReports = hasPermission('reports.read');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const suppliersQuery = useSuppliersQuery({});
  const receiptsQuery = useInboundReceiptsQuery({
    search,
    status,
    supplierId,
    from,
    to,
  });

  const hasFilters = Boolean(search.trim() || status || supplierId || from || to);

  const headerActions = useMemo(
    () =>
      canCreate ? (
        <Button
          asChild
          className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
        >
          <Link to="/inbound/new">Lập phiếu nhập</Link>
        </Button>
      ) : undefined,
    [canCreate],
  );

  const items = receiptsQuery.data?.items;
  const hasMoneyInResponse =
    items && items.length > 0
      ? items.some((row) => row.totalAmount !== undefined)
      : canReadReports;
  const showMoneyColumn = canReadReports && hasMoneyInResponse;

  const columns = useMemo<DataTableColumn<InboundReceiptSummary>[]>(() => {
    const baseColumns: DataTableColumn<InboundReceiptSummary>[] = [
      {
        key: 'receiptNo',
        header: 'Số phiếu',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <Link
            to={`/inbound/${row.id}`}
            className="font-medium text-[var(--info)] hover:underline"
          >
            {row.receiptNo}
          </Link>
        ),
      },
      {
        key: 'supplier',
        header: 'Nhà cung cấp',
        cellClassName: 'text-[var(--text)]',
        render: (row) => row.supplier.name,
      },
      {
        key: 'receiptDate',
        header: 'Ngày chứng từ',
        cellClassName: 'whitespace-nowrap tabular-nums text-[var(--text)]',
        render: (row) => formatDate(row.receiptDate),
      },
      {
        key: 'lineCount',
        header: 'Số dòng',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums',
        render: (row) => row.lineCount,
      },
      {
        key: 'totalQuantity',
        header: 'Tổng lượng',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums font-medium text-[var(--text)]',
        render: (row) => formatQuantity(row.totalQuantity),
      },
    ];

    if (showMoneyColumn) {
      baseColumns.push({
        key: 'totalAmount',
        header: 'Giá trị',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums',
        render: (row) => formatCurrency(row.totalAmount),
      });
    }

    baseColumns.push(
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
        render: (row) => <InboundStatusBadge status={row.status} />,
      },
    );

    return baseColumns;
  }, [showMoneyColumn]);

  const total = receiptsQuery.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Phiếu nhập kho"
        description="Lập và theo dõi phiếu nhập"
        actions={headerActions}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="search" className="flex-1">
          <FilterBar>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo số phiếu hoặc nhà cung cấp"
              aria-label="Tìm theo số phiếu hoặc nhà cung cấp"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full sm:w-64"
            />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Lọc theo trạng thái"
              className="h-10 w-full sm:w-44"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="draft">Nháp</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="cancelled">Đã hủy</option>
            </Select>
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              aria-label="Lọc theo nhà cung cấp"
              className="h-10 w-full sm:w-56"
            >
              <option value="">Tất cả nhà cung cấp</option>
              {(suppliersQuery.data ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Từ ngày"
              title="Từ ngày chứng từ"
              className="h-10 w-full sm:w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Đến ngày"
              title="Đến ngày chứng từ"
              className="h-10 w-full sm:w-40"
            />
          </FilterBar>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
          {total > 0 ? `${total} phiếu nhập` : '0 phiếu nhập'}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={receiptsQuery.data?.items}
        rowKey={(row) => row.id}
        isLoading={receiptsQuery.isLoading}
        isError={receiptsQuery.isError}
        onRetry={() => void receiptsQuery.refetch()}
        loadingText="Đang tải danh sách phiếu nhập..."
        emptyText={
          hasFilters
            ? 'Không có phiếu nhập phù hợp bộ lọc.'
            : 'Chưa có phiếu nhập nào. Lập phiếu nhập đầu tiên.'
        }
        errorText="Không thể tải danh sách phiếu nhập."
      />
    </div>
  );
}
