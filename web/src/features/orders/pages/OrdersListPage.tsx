import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAgenciesQuery } from '@/features/agencies/hooks';
import { useAuth } from '@/features/auth/hooks';
import { formatDate, formatQuantity } from '@/lib/format';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { useOrdersQuery } from '../hooks';
import { type AgencyOrderSummary } from '../types';

export function OrdersListPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('orders.create');
  const canCreateOutbound =
    hasPermission('outbound.create') && hasPermission('outbound.confirm');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const agenciesQuery = useAgenciesQuery({});
  const ordersQuery = useOrdersQuery({
    search,
    status,
    agencyId,
    from,
    to,
  });

  const hasFilters = Boolean(search.trim() || status || agencyId || from || to);

  const headerActions = useMemo(
    () =>
      canCreate ? (
        <Button asChild className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95">
          <Link to="/orders/new">Tạo đơn mới</Link>
        </Button>
      ) : undefined,
    [canCreate],
  );

  const columns = useMemo<DataTableColumn<AgencyOrderSummary>[]>(
    () => [
      {
        key: 'orderNo',
        header: 'Số đơn',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <Link
            to={`/orders/${row.id}`}
            className="font-medium text-[var(--info)] hover:underline"
          >
            {row.orderNo}
          </Link>
        ),
      },
      {
        key: 'agency',
        header: 'Đại lý',
        render: (row) => (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-[var(--text)]">{row.agency.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{row.agency.code}</span>
          </div>
        ),
      },
      {
        key: 'orderDate',
        header: 'Ngày đặt',
        cellClassName: 'whitespace-nowrap tabular-nums text-[var(--text)]',
        render: (row) => formatDate(row.orderDate),
      },
      {
        key: 'lineCount',
        header: 'Mặt hàng',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums',
        render: (row) => row.lineCount,
      },
      {
        key: 'totalRequestedQty',
        header: 'Tổng đặt',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums font-medium text-[var(--text)]',
        render: (row) => formatQuantity(row.totalRequestedQty),
      },
      {
        key: 'creator',
        header: 'Người tạo',
        cellClassName: 'whitespace-nowrap text-[var(--text-muted)]',
        render: (row) => row.creator.fullName,
      },
      {
        key: 'status',
        header: 'Trạng thái',
        cellClassName: 'whitespace-nowrap',
        render: (row) => <OrderStatusBadge status={row.status} />,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        cellClassName: 'whitespace-nowrap',
        render: (row) =>
          canCreateOutbound && (row.status === 'confirmed' || row.status === 'partial') ? (
            <Button
              asChild
              size="sm"
              className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
            >
              <Link to={`/orders/${row.id}/outbound`}>Tạo phiếu xuất</Link>
            </Button>
          ) : null,
      },
    ],
    [canCreateOutbound],
  );

  const pendingCount = ordersQuery.data?.pendingCount ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Đơn đặt hàng đại lý"
        description="Lập và theo dõi đơn đại lý"
        actions={headerActions}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="search" className="flex-1">
          <FilterBar>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo số đơn hoặc đại lý"
              aria-label="Tìm theo số đơn hoặc đại lý"
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
              <option value="confirmed">Chờ xuất</option>
              <option value="partial">Xuất một phần</option>
              <option value="fulfilled">Đã xuất đủ</option>
              <option value="cancelled">Đã hủy</option>
            </Select>
            <Select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              aria-label="Lọc theo đại lý"
              className="h-10 w-full sm:w-56"
            >
              <option value="">Tất cả đại lý</option>
              {(agenciesQuery.data ?? []).map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name} ({agency.code})
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Từ ngày đặt"
              title="Từ ngày đặt"
              className="h-10 w-full sm:w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Đến ngày đặt"
              title="Đến ngày đặt"
              className="h-10 w-full sm:w-40"
            />
          </FilterBar>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
          {pendingCount} đơn chờ xuất
        </p>
      </div>

      <DataTable
        columns={columns}
        data={ordersQuery.data?.items}
        rowKey={(row) => row.id}
        isLoading={ordersQuery.isLoading}
        isError={ordersQuery.isError}
        onRetry={() => void ordersQuery.refetch()}
        loadingText="Đang tải danh sách đơn đại lý..."
        emptyText={
          hasFilters
            ? 'Không có đơn hàng phù hợp bộ lọc.'
            : 'Chưa có đơn đặt hàng nào. Tạo đơn đại lý đầu tiên.'
        }
        errorText="Không thể tải danh sách đơn đặt hàng đại lý."
      />
    </div>
  );
}
