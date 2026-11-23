import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatDate, formatDateTime, formatQuantity } from '@/lib/format';
import { CancelStockCountDialog } from '../components/CancelStockCountDialog';
import { StockCountStatusBadge } from '../components/StockCountStatusBadge';
import {
  useApproveStockCountMutation,
  useCancelStockCountMutation,
  useStockCountQuery,
  useSubmitStockCountMutation,
} from '../hooks';

function formatVariance(raw: string): { label: string; className: string } {
  const num = Number(raw);
  if (!Number.isFinite(num) || num === 0) {
    return { label: '0', className: 'text-[var(--text-muted)]' };
  }
  if (num > 0) {
    return { label: `+${formatQuantity(raw)}`, className: 'text-[var(--risk-low-fg)]' };
  }
  return {
    label: `-${formatQuantity(raw.replace(/^-/, ''))}`,
    className: 'text-[var(--risk-critical-fg)]',
  };
}

export function StockCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionError, setActionError] = useState<{
    message: string;
    details?: string[];
  } | null>(null);

  const canCreate = hasPermission('stock_count.create');
  const canApprove = hasPermission('stock_count.approve');

  const countQuery = useStockCountQuery(id);
  const submitMutation = useSubmitStockCountMutation(id ?? '');
  const approveMutation = useApproveStockCountMutation(id ?? '');
  const cancelMutation = useCancelStockCountMutation(id ?? '');

  const stockCount = countQuery.data;
  const isCreator = Boolean(user && stockCount && user.id === stockCount.creator.id);
  const canCancelDraft = canCreate && isCreator;
  const hasAnyDrift = Boolean(stockCount?.items.some((item) => item.hasBalanceDrift));

  const headerActions = useMemo(() => {
    if (!stockCount) {
      return undefined;
    }
    if (stockCount.status === 'draft') {
      return (
        <>
          {canCreate && (
            <Button type="button" variant="secondary" asChild>
              <Link to={`/stock-counts/${stockCount.id}/edit`}>Sửa phiếu</Link>
            </Button>
          )}
          {canCancelDraft && (
            <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
              Hủy phiếu
            </Button>
          )}
          {canCreate && (
            <Button type="button" variant="default" onClick={() => setSubmitOpen(true)}>
              Gửi duyệt
            </Button>
          )}
        </>
      );
    }
    if (stockCount.status === 'submitted') {
      return (
        <>
          {canApprove && (
            <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
              Hủy phiếu
            </Button>
          )}
          {canApprove && (
            <Button type="button" variant="default" onClick={() => setApproveOpen(true)}>
              Duyệt điều chỉnh
            </Button>
          )}
          {!canApprove && <StockCountStatusBadge status={stockCount.status} />}
        </>
      );
    }
    return <StockCountStatusBadge status={stockCount.status} />;
  }, [stockCount, canCreate, canCancelDraft, canApprove]);

  const handleSubmitForApproval = async () => {
    if (!stockCount) {
      return;
    }
    setActionError(null);
    try {
      const updated = await submitMutation.mutateAsync();
      setSubmitOpen(false);
      showToast(`Đã gửi duyệt phiếu kiểm kê ${updated.countNo}. Tồn kho chưa thay đổi.`);
    } catch (error) {
      setSubmitOpen(false);
      if (error instanceof ApiError) {
        setActionError({
          message: error.message,
          details: error.errors?.map((e) => e.message),
        });
        showToast(error.message, 'error');
        if (error.statusCode === 409) {
          void countQuery.refetch();
        }
      } else {
        const fallback = 'Không thể gửi duyệt phiếu kiểm kê. Vui lòng thử lại.';
        setActionError({ message: fallback });
        showToast(fallback, 'error');
      }
    }
  };

  const handleApprove = async () => {
    if (!stockCount) {
      return;
    }
    setActionError(null);
    try {
      const updated = await approveMutation.mutateAsync();
      setApproveOpen(false);
      showToast(`Đã duyệt phiếu kiểm kê ${updated.countNo}. Tồn kho đã cập nhật.`);
    } catch (error) {
      setApproveOpen(false);
      if (error instanceof ApiError) {
        setActionError({
          message: error.message,
          details: error.errors?.map((e) => e.message),
        });
        showToast(error.message, 'error');
        if (error.statusCode === 409) {
          void countQuery.refetch();
        }
      } else {
        const fallback = 'Không thể duyệt phiếu kiểm kê. Vui lòng thử lại.';
        setActionError({ message: fallback });
        showToast(fallback, 'error');
      }
    }
  };

  const handleCancel = async (reason: string) => {
    if (!stockCount) {
      return;
    }
    setActionError(null);
    const updated = await cancelMutation.mutateAsync({ reason });
    setCancelOpen(false);
    showToast(`Đã hủy phiếu kiểm kê ${updated.countNo}.`);
  };

  if (countQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết phiếu kiểm kê" description="Đang tải thông tin chứng từ..." />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải chi tiết phiếu kiểm kê...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (countQuery.isError || !stockCount) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết phiếu kiểm kê" description="Không tìm thấy chứng từ yêu cầu" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          Không thể tải chi tiết phiếu kiểm kê.{' '}
          <button
            type="button"
            onClick={() => void countQuery.refetch()}
            className="underline"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const totalVarianceDisplay = formatVariance(stockCount.totalVarianceQty);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Phiếu kiểm kê ${stockCount.countNo}`}
        description={`Thời điểm đếm: ${formatDateTime(stockCount.countedAt)}`}
        actions={headerActions}
      />

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-4 py-3 text-sm text-[var(--risk-critical-fg)]"
        >
          <p className="font-medium">{actionError.message}</p>
          {actionError.details && actionError.details.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
              {actionError.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(stockCount.status === 'draft' || stockCount.status === 'submitted') && (
        <div
          role="note"
          className="rounded-md border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm text-[var(--text)]"
        >
          Phiếu kiểm kê chưa duyệt không làm thay đổi tồn kho. Khi duyệt, tồn từng lô được đặt
          bằng số đếm và ghi lịch sử điều chỉnh trong cùng một giao dịch.
        </div>
      )}

      {hasAnyDrift && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-medium-bar)]/40 bg-[var(--risk-medium-bg)] px-4 py-3 text-sm text-[var(--risk-medium-fg)]"
        >
          <strong>Cảnh báo biến động tồn:</strong> Một hoặc nhiều lô trong phiếu đã thay đổi tồn
          kho sau thời điểm lập kiểm kê. Hệ thống sẽ từ chối duyệt (409) để yêu cầu đối chiếu lại.
        </div>
      )}

      {stockCount.status === 'approved' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)]">
          <span>
            Phiếu đã được <strong>{stockCount.approver?.fullName ?? '—'}</strong> duyệt lúc{' '}
            {formatDateTime(stockCount.approvedAt)}. Các lô có chênh lệch đã được điều chỉnh tồn và
            ghi sổ biến động.
          </span>
          <Link
            to={`/stock-movements?sourceType=STOCK_COUNT&sourceId=${stockCount.id}`}
            className="font-medium text-[var(--info)] hover:underline whitespace-nowrap"
          >
            Xem lịch sử điều chỉnh
          </Link>
        </div>
      )}

      {stockCount.status === 'cancelled' && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--risk-expired-bg)] px-4 py-3 text-sm text-[var(--risk-expired-fg)]">
          <strong>Phiếu kiểm kê đã bị hủy.</strong> Tồn kho không thay đổi.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Chi tiết kiểm đếm theo lô</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Mã lô</TableHead>
                    <TableHead>Hạn sử dụng</TableHead>
                    <TableHead className="text-right">Tồn hệ thống</TableHead>
                    <TableHead className="text-right">Số đếm</TableHead>
                    <TableHead className="text-right">Chênh lệch</TableHead>
                    <TableHead>Lý do</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockCount.items.map((item) => {
                    const variance = formatVariance(item.varianceQty);
                    return (
                      <TableRow
                        key={item.id}
                        className={item.hasBalanceDrift ? 'bg-[var(--risk-medium-bg)]/40' : ''}
                      >
                        <TableCell>
                          <span className="font-medium text-[var(--text)]">
                            {item.product.code}
                          </span>{' '}
                          <span className="text-[var(--text-muted)]">{item.product.name}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium text-[var(--text)]">
                          {item.lotCode}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDate(item.expiryDate)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          <div>{formatQuantity(item.systemQty)}</div>
                          {item.hasBalanceDrift && (
                            <div className="text-xs text-[var(--risk-critical-fg)]">
                              Hiện tại: {formatQuantity(item.currentOnHandQty)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-[var(--text)]">
                          {formatQuantity(item.countedQty)}
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap text-right font-medium tabular-nums ${variance.className}`}
                        >
                          {variance.label}
                        </TableCell>
                        <TableCell className="text-sm text-[var(--text-muted)]">
                          {item.reason ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Thông tin phiếu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Số phiếu</span>
              <span className="font-medium text-[var(--text)]">{stockCount.countNo}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Trạng thái</span>
              <StockCountStatusBadge status={stockCount.status} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Thời điểm đếm</span>
              <span className="tabular-nums text-[var(--text)]">
                {formatDateTime(stockCount.countedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Người lập</span>
              <span className="text-[var(--text)]">{stockCount.creator.fullName}</span>
            </div>
            {stockCount.approver && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Người duyệt</span>
                <span className="text-[var(--text)]">{stockCount.approver.fullName}</span>
              </div>
            )}
            {stockCount.approvedAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Thời điểm duyệt</span>
                <span className="tabular-nums text-[var(--text)]">
                  {formatDateTime(stockCount.approvedAt)}
                </span>
              </div>
            )}
            <div className="border-t border-border pt-3 flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Số dòng kiểm kê</span>
              <span className="tabular-nums font-medium text-[var(--text)]">
                {stockCount.lineCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Số lô có chênh lệch</span>
              <span className="tabular-nums font-medium text-[var(--text)]">
                {stockCount.discrepancyCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Tổng chênh lệch</span>
              <span className={`tabular-nums font-semibold ${totalVarianceDisplay.className}`}>
                {totalVarianceDisplay.label}
              </span>
            </div>
            {stockCount.note && (
              <div className="border-t border-border pt-3 space-y-1">
                <div className="text-[var(--text-muted)]">Ghi chú</div>
                <p className="whitespace-pre-line text-[var(--text)]">{stockCount.note}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title={`Gửi duyệt phiếu kiểm kê ${stockCount.countNo}?`}
        description="Sau khi gửi duyệt, phiếu sẽ chuyển sang trạng thái Chờ duyệt để quản lý kiểm tra. Tồn kho vẫn chưa thay đổi cho tới khi được duyệt."
        confirmLabel="Gửi duyệt"
        isPending={submitMutation.isPending}
        onConfirm={() => void handleSubmitForApproval()}
      />

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Duyệt điều chỉnh phiếu ${stockCount.countNo}?`}
        description="Hệ thống sẽ kiểm tra lại tồn hiện tại từng lô, đặt tồn bằng số đếm cho các lô có chênh lệch và ghi lịch sử biến động trong cùng một giao dịch."
        confirmLabel="Duyệt điều chỉnh"
        isPending={approveMutation.isPending}
        onConfirm={() => void handleApprove()}
      />

      <CancelStockCountDialog
        countNo={stockCount.countNo}
        open={cancelOpen}
        isPending={cancelMutation.isPending}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancel}
      />
    </div>
  );
}
