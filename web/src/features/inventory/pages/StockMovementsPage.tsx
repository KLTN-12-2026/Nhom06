import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { MovementTypeBadge } from '../components/MovementTypeBadge';
import { useStockMovementsQuery } from '../hooks';
import {
  type MovementSourceType,
  type MovementType,
  type StockMovementItem,
} from '../types';

const PAGE_SIZE = 50;

const SOURCE_TYPE_LABEL: Record<MovementSourceType, string> = {
  INBOUND_RECEIPT: 'Phiếu nhập',
  OUTBOUND_RECEIPT: 'Phiếu xuất',
  STOCK_COUNT: 'Phiếu kiểm kê',
};

function formatDeltaDisplay(raw: string): { text: string; isPositive: boolean } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-')) {
    return {
      text: `-${formatQuantity(trimmed.slice(1))}`,
      isPositive: false,
    };
  }
  const clean = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return {
    text: `+${formatQuantity(clean)}`,
    isPositive: true,
  };
}

export function StockMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLotId = searchParams.get('lotId') ?? '';
  const initialProductId = searchParams.get('productId') ?? '';
  const initialSourceType = (searchParams.get('sourceType') ?? '') as MovementSourceType | '';
  const initialSourceId = searchParams.get('sourceId') ?? '';
  const initialFrom = searchParams.get('from') ?? '';
  const initialTo = searchParams.get('to') ?? '';

  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState<MovementType | ''>('');
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [page, setPage] = useState(1);

  const movementsQuery = useStockMovementsQuery({
    search,
    movementType,
    from,
    to,
    lotId: initialLotId || undefined,
    productId: initialProductId || undefined,
    sourceType: initialSourceType || undefined,
    sourceId: initialSourceId || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasFilters = Boolean(
    search.trim() ||
      movementType ||
      from ||
      to ||
      initialLotId ||
      initialProductId ||
      initialSourceType ||
      initialSourceId,
  );

  const handleResetFilters = () => {
    setSearch('');
    setMovementType('');
    setFrom('');
    setTo('');
    setPage(1);
    if (searchParams.size > 0) {
      setSearchParams({});
    }
  };

  const columns = useMemo<DataTableColumn<StockMovementItem>[]>(
    () => [
      {
        key: 'occurredAt',
        header: 'Thời điểm',
        cellClassName: 'tabular-nums whitespace-nowrap text-[var(--text)]',
        render: (row) => formatDateTime(row.occurredAt),
      },
      {
        key: 'movementType',
        header: 'Nghiệp vụ',
        cellClassName: 'whitespace-nowrap',
        render: (row) => <MovementTypeBadge movementType={row.movementType} />,
      },
      {
        key: 'product',
        header: 'Sản phẩm',
        headerClassName: 'min-w-[180px]',
        render: (row) => (
          <div className="min-w-[180px] max-w-[240px]">
            <div className="font-medium text-[var(--text)]">{row.product.code}</div>
            <div className="line-clamp-2 text-[var(--text-muted)]">{row.product.name}</div>
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
        key: 'quantityDelta',
        header: 'Thay đổi',
        align: 'right',
        cellClassName: 'font-medium tabular-nums whitespace-nowrap',
        render: (row) => {
          const { text, isPositive } = formatDeltaDisplay(row.quantityDelta);
          return (
            <span
              className={
                isPositive ? 'text-[var(--risk-low-fg)]' : 'text-[var(--risk-critical-fg)]'
              }
            >
              {text}
            </span>
          );
        },
      },
      {
        key: 'balanceAfter',
        header: 'Tồn sau',
        align: 'right',
        cellClassName: 'tabular-nums font-medium text-[var(--text)] whitespace-nowrap',
        render: (row) => formatQuantity(row.balanceAfter),
      },
      {
        key: 'source',
        header: 'Chứng từ',
        cellClassName: 'whitespace-nowrap',
        render: (row) => {
          const typeLabel = SOURCE_TYPE_LABEL[row.source.type] ?? row.source.type;
          // Cột Nghiệp vụ đã ghi loại phiếu nên ở đây chỉ hiện số phiếu; tên đầy đủ để đọc màn hình và rê chuột
          const fullLabel = row.source.documentNo
            ? `${typeLabel}: ${row.source.documentNo}`
            : typeLabel;
          const label = row.source.documentNo ?? typeLabel;
          return row.source.url ? (
            <Link
              to={row.source.url}
              aria-label={fullLabel}
              title={fullLabel}
              className="font-medium text-[var(--info)] hover:underline"
            >
              {label}
            </Link>
          ) : (
            <span className="text-[var(--text-muted)]">{label}</span>
          );
        },
      },
      {
        key: 'actor',
        header: 'Người thực hiện',
        cellClassName: 'whitespace-nowrap text-[var(--text-muted)]',
        render: (row) => row.actor.fullName,
      },
    ],
    [],
  );

  const total = movementsQuery.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lịch sử biến động tồn kho"
        description="Tra cứu lịch sử nhập, xuất, điều chỉnh"
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
              placeholder="Tìm theo mã lô, sản phẩm hoặc số chứng từ"
              aria-label="Tìm theo mã lô, sản phẩm hoặc số chứng từ"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full sm:w-72"
            />

            <Select
              value={movementType}
              onChange={(e) => {
                setMovementType(e.target.value as MovementType | '');
                setPage(1);
              }}
              aria-label="Lọc theo nghiệp vụ"
              className="h-10 w-full sm:w-44"
            >
              <option value="">Tất cả nghiệp vụ</option>
              <option value="INBOUND">Nhập</option>
              <option value="OUTBOUND">Xuất</option>
              <option value="ADJUSTMENT">Điều chỉnh</option>
              <option value="RETURN">Trả hàng</option>
              <option value="DISPOSAL">Hủy</option>
            </Select>

            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Từ ngày"
              title="Từ ngày biến động (giờ VN)"
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
              title="Đến ngày biến động (giờ VN)"
              className="h-10 w-full sm:w-40"
            />

            {hasFilters && (
              <Button type="button" variant="outline" onClick={handleResetFilters}>
                Đặt lại
              </Button>
            )}
          </FilterBar>
        </div>

        <p className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
          {formatQuantity(total)} biến động
        </p>
      </div>

      <DataTable
        tableClassName="[&_td]:px-3 [&_th]:px-3"
        columns={columns}
        data={movementsQuery.data?.items}
        rowKey={(row) => row.id}
        isLoading={movementsQuery.isLoading}
        isError={movementsQuery.isError}
        onRetry={() => void movementsQuery.refetch()}
        loadingText="Đang tải lịch sử biến động tồn kho..."
        emptyText={
          hasFilters
            ? 'Không có biến động tồn kho phù hợp bộ lọc.'
            : 'Chưa có lịch sử biến động tồn kho nào.'
        }
        errorText="Không thể tải lịch sử biến động tồn kho."
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
