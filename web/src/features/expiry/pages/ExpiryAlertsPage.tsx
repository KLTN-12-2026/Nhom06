import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { ExpiryBar } from '@/components/common/ExpiryBar';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { ExpirySeverityBadge } from '@/components/common/RiskStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { formatDateVi, formatQuantity, getVnTodayIso } from '@/lib/format';
import {
  useActiveProductsForExpiryQuery,
  useExpiryAlertsQuery,
  useExpiryAlertsSummaryQuery,
} from '../hooks';
import { type ExpiryAlertItem, type ExpiryAlertSeverity } from '../types';

export function ExpiryAlertsPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultDate = useMemo(() => getVnTodayIso(), []);
  const rawSeverity = searchParams.get('severity') ?? '';
  const initialSeverity: ExpiryAlertSeverity | '' =
    rawSeverity === 'expired' || rawSeverity === 'critical' || rawSeverity === 'warning'
      ? rawSeverity
      : '';

  const [date, setDate] = useState(defaultDate);
  const [severity, setSeverity] = useState<ExpiryAlertSeverity | ''>(initialSeverity);
  const [productId, setProductId] = useState('');
  const [expiryFrom, setExpiryFrom] = useState('');
  const [expiryTo, setExpiryTo] = useState('');
  const [maxDaysRemaining, setMaxDaysRemaining] = useState('');
  const [search, setSearch] = useState('');

  const canReadProducts = hasPermission('catalog.read');
  const canReadProposals = hasPermission('proposals.read');

  const productsQuery = useActiveProductsForExpiryQuery(canReadProducts);

  const summaryQuery = useExpiryAlertsSummaryQuery(date || undefined);
  const alertsQuery = useExpiryAlertsQuery({
    date: date || undefined,
    severity,
    productId,
    expiryFrom,
    expiryTo,
    maxDaysRemaining,
    search,
  });

  const evaluationDateLabel = formatDateVi(
    summaryQuery.data?.evaluationDate ?? alertsQuery.data?.evaluationDate ?? date,
  );

  const hasCustomFilter = Boolean(
    severity ||
      productId ||
      expiryFrom ||
      expiryTo ||
      maxDaysRemaining ||
      search ||
      date !== defaultDate,
  );

  const handleResetFilters = () => {
    setDate(defaultDate);
    setSeverity('');
    setProductId('');
    setExpiryFrom('');
    setExpiryTo('');
    setMaxDaysRemaining('');
    setSearch('');
    if (searchParams.size > 0) {
      setSearchParams({});
    }
  };

  const columns = useMemo<DataTableColumn<ExpiryAlertItem>[]>(
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
        render: (row) => row.lot.lotCode,
      },
      {
        key: 'expiryDate',
        header: 'Hạn sử dụng',
        cellClassName: 'tabular-nums whitespace-nowrap',
        render: (row) => (
          <span
            className={
              row.severity === 'expired' ? 'text-[var(--risk-expired-fg)] line-through' : ''
            }
          >
            {formatDateVi(row.expiryDate)}
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
            severity={row.severity}
            maxDays={Math.max(row.thresholdApplied.warningDays, 30)}
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
        key: 'severity',
        header: 'Tình trạng',
        cellClassName: 'whitespace-nowrap',
        render: (row) => <ExpirySeverityBadge severity={row.severity} />,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        headerClassName: 'w-32',
        cellClassName: 'whitespace-nowrap',
        render: (row) =>
          canReadProposals ? (
            <Button asChild type="button" variant="secondary" size="sm">
              <Link to={`/proposals?lotId=${row.lot.id}`}>Xem đề xuất</Link>
            </Button>
          ) : null,
      },
    ],
    [canReadProposals],
  );

  const headerActions = useMemo(
    () => (
      <>
        <Button asChild type="button" variant="secondary">
          <Link to="/expiry-thresholds">Ngưỡng cảnh báo</Link>
        </Button>
        {canReadProposals && (
          <Button
            asChild
            type="button"
            className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
          >
            <Link to="/proposals">Xem đề xuất xử lý</Link>
          </Button>
        )}
      </>
    ),
    [canReadProposals],
  );

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cảnh báo hàng cận hạn"
        description={`Cập nhật ngày ${evaluationDateLabel}`}
        actions={headerActions}
      />

      {/* 3 KPI cards đúng mockup 17 */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-[var(--text-muted)]">Đã hết hạn</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-critical-fg)]">
              {summary ? formatQuantity(summary.expired.lots) : '…'}
            </div>
            <div className="mt-1.5 text-sm text-[var(--text-muted)] tabular-nums">
              {summary ? `${formatQuantity(summary.expired.qty)} đơn vị` : 'Đang tính...'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-[var(--text-muted)]">Cận hạn</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--risk-medium-kpi)]">
              {summary ? formatQuantity(summary.nearExpiry.lots) : '…'}
            </div>
            <div className="mt-1.5 text-sm text-[var(--text-muted)] tabular-nums">
              {summary ? `${formatQuantity(summary.nearExpiry.qty)} đơn vị` : 'Đang tính...'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-[var(--text-muted)]">Ngưỡng chung</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tabular-nums text-[var(--text)]">
                {summary ? formatQuantity(summary.global.warningDays) : '…'}
              </span>
              <span className="text-sm text-[var(--text-muted)]">ngày</span>
            </div>
            <div className="mt-1.5 truncate text-sm text-[var(--text-muted)]">
              {summary ? summary.overridesSummary : 'Đang tải cấu hình...'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bộ lọc cảnh báo theo đặc tả PB19 */}
      <FilterBar>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã lô hoặc sản phẩm"
          aria-label="Tìm theo mã lô hoặc sản phẩm"
          className="h-10 w-full sm:w-60"
        />

        <Select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as ExpiryAlertSeverity | '')}
          aria-label="Lọc theo tình trạng"
          className="h-10 w-full sm:w-44"
        >
          <option value="">Tất cả tình trạng</option>
          <option value="expired">Hết hạn</option>
          <option value="critical">Nguy cấp</option>
          <option value="warning">Trung bình</option>
        </Select>

        {canReadProducts && (
          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Lọc theo sản phẩm"
            className="h-10 w-full sm:w-56"
          >
            <option value="">Tất cả sản phẩm</option>
            {(productsQuery.data?.items ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.code} · {product.name}
              </option>
            ))}
          </Select>
        )}

        <Input
          type="date"
          value={expiryFrom}
          onChange={(e) => setExpiryFrom(e.target.value)}
          aria-label="Hạn sử dụng từ ngày"
          title="Hạn sử dụng từ ngày"
          className="h-10 w-full sm:w-40"
        />

        <Input
          type="date"
          value={expiryTo}
          onChange={(e) => setExpiryTo(e.target.value)}
          aria-label="Hạn sử dụng đến ngày"
          title="Hạn sử dụng đến ngày"
          className="h-10 w-full sm:w-40"
        />

        <Input
          type="number"
          value={maxDaysRemaining}
          onChange={(e) => setMaxDaysRemaining(e.target.value)}
          placeholder="Còn tối đa (ngày)"
          aria-label="Số ngày còn lại tối đa"
          className="h-10 w-full tabular-nums sm:w-40"
        />

        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Ngày đánh giá"
          title="Ngày đánh giá"
          className="h-10 w-full sm:w-40"
        />

        {hasCustomFilter && (
          <Button type="button" variant="outline" onClick={handleResetFilters}>
            Đặt lại
          </Button>
        )}
      </FilterBar>

      <DataTable
        columns={columns}
        data={alertsQuery.data?.items}
        rowKey={(row) => row.lot.id}
        isLoading={alertsQuery.isLoading}
        isError={alertsQuery.isError}
        onRetry={() => {
          void alertsQuery.refetch();
          void summaryQuery.refetch();
        }}
        loadingText="Đang tải danh sách cảnh báo hàng cận hạn..."
        emptyText="Không có kết quả phù hợp"
        errorText="Không thể tải danh sách cảnh báo hàng cận hạn."
      />
    </div>
  );
}
