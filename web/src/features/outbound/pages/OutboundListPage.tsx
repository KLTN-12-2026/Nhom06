import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { OutboundStatusBadge, OutboundTypeBadge } from '../components/OutboundTypeBadge';
import { useOutboundReceiptsQuery } from '../hooks';
import { type OutboundReceiptSummary } from '../types';

const PAGE_SIZE = 50;

export function OutboundListPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const receiptsQuery = useOutboundReceiptsQuery({
    search,
    type,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasFilters = Boolean(search.trim() || type || from || to);

  const columns = useMemo<DataTableColumn<OutboundReceiptSummary>[]>(
    () => [
      {
        key: 'outboundNo',
        header: 'Số phiếu',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <Link
            to={`/outbound/${row.id}`}
            className="font-medium text-[var(--info)] hover:underline"
          >
            {row.outboundNo}
          </Link>
        ),
      },
      {
        key: 'order',
        header: 'Đơn / Loại xuất',
        cellClassName: 'whitespace-nowrap',
        render: (row) =>
          row.order ? (
            <Link
              to={`/orders/${row.order.id}`}
              className="font-medium text-[var(--info)] hover:underline"
            >
              {row.order.orderNo}
            </Link>
          ) : (
            <OutboundTypeBadge type={row.outboundType} />
          ),
      },
      {
        key: 'agency',
        header: 'Đại lý',
        render: (row) =>
          row.order ? (
            <span className="text-[var(--text)]">{row.order.agency.name}</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          ),
      },
      {
        key: 'confirmedAt',
        header: 'Ngày xuất',
        cellClassName: 'whitespace-nowrap tabular-nums text-[var(--text)]',
        render: (row) => formatDateTime(row.confirmedAt),
      },
      {
        key: 'lotCount',
        header: 'Số lô',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums',
        render: (row) => row.lotCount,
      },
      {
        key: 'totalQuantity',
        header: 'Tổng xuất',
        align: 'right',
        cellClassName: 'whitespace-nowrap tabular-nums font-medium text-[var(--text)]',
        render: (row) => formatQuantity(row.totalQuantity),
      },
      {
        key: 'status',
        header: 'Trạng thái',
        cellClassName: 'whitespace-nowrap',
        render: (row) => <OutboundStatusBadge status={row.status} />,
      },
    ],
    [],
  );

  const total = receiptsQuery.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Phiếu xuất kho"
        description="Theo dõi hàng đã xuất theo từng lô"
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
              placeholder="Tìm theo số phiếu xuất, số đơn hoặc đại lý"
              aria-label="Tìm theo số phiếu xuất, số đơn hoặc đại lý"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full sm:w-72"
            />
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo loại xuất"
              className="h-10 w-full sm:w-44"
            >
              <option value="">Tất cả loại xuất</option>
              <option value="ORDER">Xuất theo đơn</option>
              <option value="RETURN_TO_SUPPLIER">Trả nhà cung cấp</option>
              <option value="DISPOSAL">Xuất hủy</option>
              <option value="OTHER">Xuất khác</option>
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Từ ngày xuất"
              title="Từ ngày xuất"
              className="h-10 w-full sm:w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              aria-label="Đến ngày xuất"
              title="Đến ngày xuất"
              className="h-10 w-full sm:w-40"
            />
          </FilterBar>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
          {total} phiếu xuất
        </p>
      </div>

      <DataTable
        columns={columns}
        data={receiptsQuery.data?.items}
        rowKey={(row) => row.id}
        isLoading={receiptsQuery.isLoading}
        isError={receiptsQuery.isError}
        onRetry={() => void receiptsQuery.refetch()}
        loadingText="Đang tải danh sách phiếu xuất..."
        emptyText={
          hasFilters
            ? 'Không có phiếu xuất phù hợp bộ lọc.'
            : 'Chưa có phiếu xuất kho nào được xác nhận.'
        }
        errorText="Không thể tải danh sách phiếu xuất kho."
      />

      <PaginationBar
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />
    </div>
  );
}
