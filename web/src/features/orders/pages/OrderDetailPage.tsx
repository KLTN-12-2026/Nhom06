import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { OutboundStatusBadge } from '@/features/outbound/components/OutboundTypeBadge';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime, formatQuantity } from '@/lib/format';
import { CancelOrderDialog } from '../components/CancelOrderDialog';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { useCancelOrderMutation, useOrderDetailQuery } from '../hooks';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEditOrder = hasPermission('orders.create');
  const canCancelOrder = hasPermission('orders.cancel');
  const canConfirmOutbound =
    hasPermission('outbound.create') && hasPermission('outbound.confirm');

  const orderQuery = useOrderDetailQuery(id);
  const cancelMutation = useCancelOrderMutation(id ?? '');

  const order = orderQuery.data;

  const canBeEdited = Boolean(
    order &&
      canEditOrder &&
      order.status === 'confirmed' &&
      Number(order.totalFulfilledQty) === 0 &&
      order.outboundReceipts.length === 0,
  );
  const canBeCancelled = Boolean(
    order && canCancelOrder && (order.status === 'confirmed' || order.status === 'partial'),
  );
  const canCreateOutbound = Boolean(
    order &&
      canConfirmOutbound &&
      (order.status === 'confirmed' || order.status === 'partial') &&
      Number(order.totalRemainingQty) > 0,
  );

  const headerActions = useMemo(() => {
    if (!order) {
      return undefined;
    }
    if (!canBeEdited && !canBeCancelled && !canCreateOutbound) {
      return <OrderStatusBadge status={order.status} />;
    }
    return (
      <>
        {canBeEdited && (
          <Button type="button" variant="secondary" asChild>
            <Link to={`/orders/${order.id}/edit`}>Sửa đơn</Link>
          </Button>
        )}
        {canBeCancelled && (
          <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
            Hủy đơn
          </Button>
        )}
        {canCreateOutbound && (
          <Button asChild className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95">
            <Link to={`/orders/${order.id}/outbound`}>Tạo phiếu xuất</Link>
          </Button>
        )}
      </>
    );
  }, [order, canBeEdited, canBeCancelled, canCreateOutbound]);

  const handleCancelOrder = async (reason: string) => {
    if (!order) {
      return;
    }
    setActionError(null);
    try {
      const updated = await cancelMutation.mutateAsync({ reason });
      setCancelOpen(false);
      showToast(`Đã hủy đơn hàng ${updated.orderNo}.`);
    } catch (error) {
      setCancelOpen(false);
      if (error instanceof ApiError) {
        setActionError(error.message);
        showToast(error.message, 'error');
        if (error.statusCode === 409) {
          void orderQuery.refetch();
        }
      } else {
        const fallback = 'Không thể hủy đơn hàng. Vui lòng thử lại.';
        setActionError(fallback);
        showToast(fallback, 'error');
      }
    }
  };

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết đơn hàng" description="Đang tải thông tin đơn đại lý..." />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải chi tiết đơn hàng...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết đơn hàng" description="Không tìm thấy đơn hàng yêu cầu" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          Không thể tải chi tiết đơn hàng.{' '}
          <button type="button" onClick={() => void orderQuery.refetch()} className="underline">
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Đơn ${order.orderNo}`}
        description={order.agency.name}
        actions={headerActions}
      />

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-4 py-3 text-sm text-[var(--risk-critical-fg)]"
        >
          {actionError}
        </div>
      )}

      {/* Hộp giải thích bất biến 1 (Mockup 14) */}
      <div className="rounded-md border border-[var(--border)] border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)]">
        Tồn kho chỉ trừ khi xác nhận phiếu xuất. Số lượng đã xuất được theo dõi riêng với số lượng
        đặt.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Cột trái 2/3: Mặt hàng đặt + Danh sách phiếu xuất */}
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader className="border-b border-border py-4">
              <CardTitle>Mặt hàng đặt</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]">
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead className="text-right">Đặt</TableHead>
                      <TableHead className="text-right">Đã xuất</TableHead>
                      <TableHead className="text-right">Còn thiếu</TableHead>
                      <TableHead className="text-right">Tồn khả dụng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => {
                      const isShort =
                        Number(item.remainingQty) > 0 &&
                        Number(item.availableQty) < Number(item.remainingQty);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex flex-wrap items-baseline gap-1.5">
                              <span className="font-medium text-[var(--text)]">
                                {item.product.code}
                              </span>
                              <span className="text-[var(--text-muted)]">{item.product.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--text)]">
                            {formatQuantity(item.requestedQty)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--text)]">
                            {formatQuantity(item.fulfilledQty)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-[var(--text)]">
                            {formatQuantity(item.remainingQty)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium ${
                              isShort
                                ? 'text-[var(--risk-critical-fg)]'
                                : 'text-[var(--text)]'
                            }`}
                          >
                            {formatQuantity(item.availableQty)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border py-4">
              <CardTitle>Phiếu xuất liên quan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {order.outboundReceipts.length === 0 ? (
                <p className="p-6 text-sm text-[var(--text-muted)]">
                  Chưa có phiếu xuất nào cho đơn này.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]">
                        <TableHead>Số phiếu</TableHead>
                        <TableHead>Thời điểm xuất</TableHead>
                        <TableHead className="text-right">Số lô</TableHead>
                        <TableHead className="text-right">Tổng xuất</TableHead>
                        <TableHead>Người xác nhận</TableHead>
                        <TableHead>Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.outboundReceipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="whitespace-nowrap">
                            <Link
                              to={`/outbound/${receipt.id}`}
                              className="font-medium text-[var(--info)] hover:underline"
                            >
                              {receipt.outboundNo}
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {formatDateTime(receipt.confirmedAt)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {receipt.lotCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatQuantity(receipt.totalQuantity)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[var(--text-muted)]">
                            {receipt.confirmer?.fullName ?? '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <OutboundStatusBadge status={receipt.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cột phải 1/3: Thông tin đơn (Mockup 14) */}
        <div className="lg:col-span-4">
          <Card>
            <CardHeader className="border-b border-border py-4">
              <CardTitle>Thông tin đơn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-sm">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-3">
                <dt className="text-[var(--text-muted)]">Số đơn</dt>
                <dd className="min-w-0 break-words font-medium text-[var(--text)]">
                  {order.orderNo}
                </dd>

                <dt className="text-[var(--text-muted)]">Đại lý</dt>
                <dd className="min-w-0 break-words text-[var(--text)]">
                  {order.agency.name}{' '}
                  <span className="text-xs text-[var(--text-muted)]">({order.agency.code})</span>
                </dd>

                <dt className="text-[var(--text-muted)]">Ngày đặt</dt>
                <dd className="min-w-0 tabular-nums text-[var(--text)]">
                  {formatDate(order.orderDate)}
                </dd>

                <dt className="text-[var(--text-muted)]">Trạng thái</dt>
                <dd className="min-w-0">
                  <OrderStatusBadge status={order.status} />
                </dd>

                <dt className="text-[var(--text-muted)]">Người tạo</dt>
                <dd className="min-w-0 break-words text-[var(--text)]">{order.creator.fullName}</dd>

                {order.canceller && (
                  <>
                    <dt className="text-[var(--text-muted)]">Người hủy</dt>
                    <dd className="min-w-0 break-words text-[var(--text)]">
                      {order.canceller.fullName}
                    </dd>
                  </>
                )}

                {order.cancelledAt && (
                  <>
                    <dt className="text-[var(--text-muted)]">Thời điểm hủy</dt>
                    <dd className="min-w-0 tabular-nums text-[var(--text)]">
                      {formatDateTime(order.cancelledAt)}
                    </dd>
                  </>
                )}

                {order.notes && (
                  <>
                    <dt className="text-[var(--text-muted)]">Ghi chú</dt>
                    <dd className="min-w-0 break-words whitespace-pre-line text-[var(--text)]">
                      {order.notes}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderNo={order.orderNo}
        isPartial={order.status === 'partial'}
        isPending={cancelMutation.isPending}
        onConfirm={handleCancelOrder}
      />
    </div>
  );
}
