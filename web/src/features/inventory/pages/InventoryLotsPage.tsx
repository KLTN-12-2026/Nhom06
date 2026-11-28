import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { ExpiryBar } from '@/components/common/ExpiryBar';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { useProductGroupsQuery } from '@/features/products/hooks';
import { formatDate, formatQuantity } from '@/lib/format';
import { LotExpiryStatusBadge } from '../components/LotExpiryStatusBadge';
import { LotStatusDialog } from '../components/LotStatusDialog';
import {
  useInventoryLotsQuery,
  useInventorySummaryQuery,
  useUpdateLotStatusMutation,
} from '../hooks';
import {
  type ExpiryStatusFilter,
  type InventoryLotItem,
  type LotStatus,
} from '../types';

const PAGE_SIZE = 50;

export function InventoryLotsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canReadCatalog = hasPermission('catalog.read');
  const canManageLotStatus = hasPermission('stock_count.approve');

  const [searchParams, setSearchParams] = useSearchParams();
  const lotIdParam = searchParams.get('lotId') ?? '';

  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [groupId, setGroupId] = useState('');
  const [expiryStatus, setExpiryStatus] = useState<ExpiryStatusFilter | ''>('');
  const [lotStatus, setLotStatus] = useState<LotStatus | ''>('');
  const [includeEmpty, setIncludeEmpty] = useState(
    () => searchParams.get('includeEmpty') === 'true',
  );
  const [page, setPage] = useState(1);

  const [selectedLot, setSelectedLot] = useState<InventoryLotItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filterParams = useMemo(
    () => ({
      lotId: lotIdParam || undefined,
      search,
      groupId,
      expiryStatus,
      lotStatus,
      includeEmpty,
    }),
    [lotIdParam, search, groupId, expiryStatus, lotStatus, includeEmpty],
  );

  const groupsQuery = useProductGroupsQuery(canReadCatalog ? 'active' : undefined);
  const lotsQuery = useInventoryLotsQuery({ ...filterParams, page, pageSize: PAGE_SIZE });
  const summaryQuery = useInventorySummaryQuery(filterParams);
  const updateLotStatusMutation = useUpdateLotStatusMutation();

  const hasFilters = Boolean(
    lotIdParam || search.trim() || groupId || expiryStatus || lotStatus || includeEmpty,
  );
  const filteredLotCode =
    lotIdParam && lotsQuery.data?.items.length === 1 ? lotsQuery.data.items[0].lotCode : null;

  const handleClearLotFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('lotId');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setGroupId('');
    setExpiryStatus('');
    setLotStatus('');
    setIncludeEmpty(false);
    setPage(1);
    if (searchParams.size > 0) {
      setSearchParams({}, { replace: true });
    }
  };

  const handleOpenStatusDialog = (lot: InventoryLotItem) => {
    setSelectedLot(lot);
    setDialogOpen(true);
  };

  const handleConfirmStatusChange = async (
    lotId: string,
    nextStatus: 'active' | 'blocked',
    reason: string,
  ) => {
    await updateLotStatusMutation.mutateAsync({
      lotId,
      payload: { status: nextStatus, reason },
    });
    setDialogOpen(false);
    showToast(
      nextStatus === 'blocked'
        ? `Đã khóa lô ${selectedLot?.lotCode ?? ''}. Tồn kho không thay đổi.`
        : `Đã mở khóa lô ${selectedLot?.lotCode ?? ''}.`,
    );
    setSelectedLot(null);
  };

  const columns = useMemo<DataTableColumn<InventoryLotItem>[]>(
    () => [
      {
        key: 'product',
        header: 'Sản phẩm',
        render: (row) => (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-medium text-[var(--text)] whitespace-nowrap">
              {row.product.code}
            </span>
            <span className="text-[var(--text-muted)]">{row.product.name}</span>
          </div>
        ),
      },
      {
        key: 'lotCode',
        header: 'Mã lô',
        cellClassName: 'font-medium text-[var(--text)] whitespace-nowrap',
        render: (row) => row.lotCode,
      },
      {
        key: 'expiryDate',
        header: 'Hạn sử dụng',
        cellClassName: 'tabular-nums whitespace-nowrap',
        render: (row) => (
          <span
            className={
              row.expiryStatus === 'expired'
                ? 'text-[var(--risk-expired-fg)] line-through'
                : 'text-[var(--text)]'
            }
          >
            {formatDate(row.expiryDate)}
          </span>
        ),
      },
      {
        key: 'daysRemaining',
        header: 'Hạn dùng còn lại',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <ExpiryBar
            daysRemaining={row.daysRemaining}
            severity={row.expiryStatus}
            maxDays={Math.max(row.warningDays, 60)}
          />
        ),
      },
      {
        key: 'onHandQty',
        header: 'Tồn',
        align: 'right',
        cellClassName: 'font-medium tabular-nums text-[var(--text)] whitespace-nowrap',
        render: (row) => formatQuantity(row.onHandQty),
      },
      {
        key: 'unit',
        header: 'ĐVT',
        cellClassName: 'text-[var(--text-muted)] whitespace-nowrap',
        render: (row) => row.product.unit,
      },
      {
        key: 'status',
        header: 'Tình trạng',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <LotExpiryStatusBadge expiryStatus={row.expiryStatus} />
            {row.lotStatus === 'blocked' && <StatusBadge tone="critical" label="Đã khóa" />}
            {row.lotStatus === 'closed' && <StatusBadge tone="inactive" label="Đã đóng" />}
          </div>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <div className="inline-flex items-center justify-end gap-2">
            <Link
              to={`/stock-movements?lotId=${row.lotId}`}
              className="text-xs font-medium text-[var(--info)] hover:underline"
            >
              Lịch sử
            </Link>
            {canManageLotStatus && row.lotStatus !== 'closed' && (
              <Button
                type="button"
                size="sm"
                variant={row.lotStatus === 'blocked' ? 'secondary' : 'outline'}
                onClick={() => handleOpenStatusDialog(row)}
              >
                {row.lotStatus === 'blocked' ? 'Mở khóa' : 'Khóa lô'}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canManageLotStatus],
  );

  const summary = summaryQuery.data;
  const total = lotsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tồn kho theo lô"
        description="Theo dõi số lượng tồn theo từng lô"
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
              placeholder="Tìm theo mã lô, mã hoặc tên sản phẩm"
              aria-label="Tìm theo mã lô, mã hoặc tên sản phẩm"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full sm:w-64"
            />

            {canReadCatalog && (
              <Select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo nhóm hàng"
                className="h-10 w-full sm:w-48"
              >
                <option value="">Tất cả nhóm hàng</option>
                {(groupsQuery.data ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            )}

            <Select
              value={expiryStatus}
              onChange={(e) => {
                setExpiryStatus(e.target.value as ExpiryStatusFilter | '');
                setPage(1);
              }}
              aria-label="Lọc theo tình trạng hạn dùng"
              className="h-10 w-full sm:w-52"
            >
              <option value="">Tất cả tình trạng hạn dùng</option>
              <option value="expired">Hết hạn</option>
              <option value="near_expiry">Cận hạn</option>
              <option value="normal">Bình thường</option>
            </Select>

            <Select
              value={lotStatus}
              onChange={(e) => {
                setLotStatus(e.target.value as LotStatus | '');
                setPage(1);
              }}
              aria-label="Lọc theo trạng thái lô"
              className="h-10 w-full sm:w-44"
            >
              <option value="">Tất cả trạng thái lô</option>
              <option value="active">Hoạt động</option>
              <option value="blocked">Đã khóa</option>
              <option value="closed">Đã đóng</option>
            </Select>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--text)] select-none">
              <input
                type="checkbox"
                checked={includeEmpty}
                onChange={(e) => {
                  setIncludeEmpty(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-border accent-[var(--brand)]"
              />
              <span>Hiện lô tồn 0</span>
            </label>

            {lotIdParam && (
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--text)]">
                <span>
                  {filteredLotCode ? `Đang lọc lô ${filteredLotCode}` : 'Đang lọc theo một lô cụ thể'}
                </span>
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
        </div>

        <p
          aria-live="polite"
          className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-muted)]"
        >
          {summary
            ? `${formatQuantity(summary.lotCount)} lô · ${formatQuantity(summary.totalQty)} đơn vị`
            : 'Đang tính tồn kho...'}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={lotsQuery.data?.items}
        rowKey={(row) => row.lotId}
        isLoading={lotsQuery.isLoading}
        isError={lotsQuery.isError}
        onRetry={() => {
          void lotsQuery.refetch();
          void summaryQuery.refetch();
        }}
        loadingText="Đang tải tồn kho theo lô..."
        emptyText={
          hasFilters
            ? 'Không có lô hàng phù hợp bộ lọc.'
            : 'Chưa có lô hàng tồn kho nào. Xác nhận phiếu nhập để ghi nhận tồn kho.'
        }
        errorText="Không thể tải danh sách tồn kho theo lô."
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span className="tabular-nums">
            Trang {page} / {totalPages} ({formatQuantity(total)} lô)
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

      <LotStatusDialog
        lot={selectedLot}
        open={dialogOpen}
        isPending={updateLotStatusMutation.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedLot(null);
          }
        }}
        onSubmit={handleConfirmStatusChange}
      />
    </div>
  );
}
