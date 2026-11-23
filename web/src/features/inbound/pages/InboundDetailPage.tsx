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
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatQuantity,
  formatRelativeTime,
} from '@/lib/format';
import { InboundStatusBadge } from '../components/InboundStatusBadge';
import {
  useCancelInboundReceiptMutation,
  useConfirmInboundReceiptMutation,
  useInboundReceiptQuery,
} from '../hooks';

export function InboundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canCreate = hasPermission('inbound.create');
  const canConfirm = hasPermission('inbound.confirm');

  const receiptQuery = useInboundReceiptQuery(id);
  const confirmMutation = useConfirmInboundReceiptMutation(id ?? '');
  const cancelMutation = useCancelInboundReceiptMutation(id ?? '');

  const receipt = receiptQuery.data;

  const headerActions = useMemo(() => {
    if (!receipt) {
      return undefined;
    }
    if (receipt.status !== 'draft') {
      return <InboundStatusBadge status={receipt.status} />;
    }
    return (
      <>
        {canCreate && (
          <Button type="button" variant="secondary" asChild>
            <Link to={`/inbound/${receipt.id}/edit`}>Sửa phiếu</Link>
          </Button>
        )}
        {canCreate && (
          <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
            Hủy phiếu
          </Button>
        )}
        {canConfirm && (
          <Button type="button" variant="default" onClick={() => setConfirmOpen(true)}>
            Xác nhận nhập kho
          </Button>
        )}
      </>
    );
  }, [receipt, canCreate, canConfirm]);

  const handleConfirm = async () => {
    if (!receipt) {
      return;
    }
    setActionError(null);
    try {
      const updated = await confirmMutation.mutateAsync();
      setConfirmOpen(false);
      showToast(`Đã xác nhận phiếu ${updated.receiptNo}. Tồn kho đã cập nhật.`);
    } catch (error) {
      setConfirmOpen(false);
      if (error instanceof ApiError) {
        if (error.statusCode === 409) {
          showToast(error.message, 'error');
          void receiptQuery.refetch();
        } else {
          setActionError(error.message);
          showToast(error.message, 'error');
        }
      } else {
        const fallback = 'Không thể xác nhận phiếu nhập. Vui lòng thử lại.';
        setActionError(fallback);
        showToast(fallback, 'error');
      }
    }
  };

  const handleCancel = async () => {
    if (!receipt) {
      return;
    }
    setActionError(null);
    try {
      const updated = await cancelMutation.mutateAsync();
      setCancelOpen(false);
      showToast(`Đã hủy phiếu nhập ${updated.receiptNo}.`);
    } catch (error) {
      setCancelOpen(false);
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
        if (error.statusCode === 409) {
          void receiptQuery.refetch();
        } else {
          setActionError(error.message);
        }
      } else {
        const fallback = 'Không thể hủy phiếu nhập. Vui lòng thử lại.';
        setActionError(fallback);
        showToast(fallback, 'error');
      }
    }
  };

  if (receiptQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết phiếu nhập" description="Đang tải thông tin chứng từ..." />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải chi tiết phiếu nhập...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (receiptQuery.isError || !receipt) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết phiếu nhập" description="Không tìm thấy chứng từ yêu cầu" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          Không thể tải chi tiết phiếu nhập.{' '}
          <button
            type="button"
            onClick={() => void receiptQuery.refetch()}
            className="underline"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Phiếu nhập ${receipt.receiptNo}`}
        description={receipt.supplier.name}
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

      {/* Hộp thông báo trạng thái (Mockup 08 / 10) */}
      {receipt.status === 'draft' && (
        <div className="rounded-md border border-[var(--risk-medium-bar)]/30 bg-[var(--risk-medium-bg)] px-4 py-3 text-sm text-[var(--risk-medium-fg)]">
          <strong>Phiếu đang ở trạng thái nháp.</strong> Tồn kho chưa thay đổi. Khi xác nhận, hệ
          thống cộng số lượng vào từng lô và ghi một dòng vào lịch sử biến động, tất cả trong cùng
          một giao dịch.
          {receipt.notes ? ` Ghi chú: ${receipt.notes}` : ''}
        </div>
      )}

      {receipt.status === 'confirmed' && (
        <div className="rounded-md border border-[var(--border)] border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)]">
          Phiếu đã được <strong>{receipt.confirmer?.fullName ?? '—'}</strong> xác nhận{' '}
          {formatRelativeTime(receipt.confirmedAt)}. Tồn kho đã cộng{' '}
          {formatQuantity(receipt.totalQuantity)} đơn vị. Phiếu đã xác nhận không được sửa.
        </div>
      )}

      {receipt.status === 'cancelled' && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--risk-expired-bg)] px-4 py-3 text-sm text-[var(--risk-expired-fg)]">
          <strong>Phiếu đã bị hủy.</strong> Tồn kho chưa thay đổi. Phiếu đã hủy không thể chỉnh sửa
          hoặc xác nhận.
        </div>
      )}

      {/* Bố cục 2/3 Dòng hàng + 1/3 Thông tin phiếu (Mockup 08 & 10) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Dòng hàng</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Mã lô</TableHead>
                    <TableHead>Hạn sử dụng</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="font-medium text-[var(--text)]">{item.product.code}</span>{' '}
                        <span className="text-[var(--text-muted)]">{item.product.name}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-[var(--text)]">
                        {item.lotCode}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDate(item.expiryDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatQuantity(item.quantity)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(item.unitCost)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(item.lineTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-[var(--surface)] font-semibold">
                    <TableCell colSpan={3} className="text-[var(--text)]">
                      Tổng
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-[var(--text)]">
                      {formatQuantity(receipt.totalQuantity)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-[var(--text)]">
                      {formatCurrency(receipt.totalAmount, true)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 h-fit">
          <CardHeader className="border-b border-border py-4">
            <CardTitle>Thông tin phiếu</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-12 gap-2">
                <dt className="col-span-5 text-[var(--text-muted)]">Số phiếu</dt>
                <dd className="col-span-7 min-w-0 break-words font-medium text-[var(--text)]">
                  {receipt.receiptNo}
                </dd>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <dt className="col-span-5 text-[var(--text-muted)]">Nhà cung cấp</dt>
                <dd className="col-span-7 min-w-0 break-words font-medium text-[var(--text)]">
                  {receipt.supplier.name}
                </dd>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <dt className="col-span-5 text-[var(--text-muted)]">Ngày chứng từ</dt>
                <dd className="col-span-7 min-w-0 tabular-nums text-[var(--text)]">
                  {formatDate(receipt.receiptDate)}
                </dd>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <dt className="col-span-5 text-[var(--text-muted)]">Người lập</dt>
                <dd className="col-span-7 min-w-0 break-words text-[var(--text)]">
                  {receipt.creator.fullName}
                </dd>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <dt className="col-span-5 text-[var(--text-muted)]">Người xác nhận</dt>
                <dd className="col-span-7 min-w-0 break-words text-[var(--text)]">
                  {receipt.confirmer ? receipt.confirmer.fullName : '—'}
                </dd>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <dt className="col-span-5 text-[var(--text-muted)]">Thời điểm xác nhận</dt>
                <dd
                  className="col-span-7 min-w-0 text-[var(--text)]"
                  title={receipt.confirmedAt ? formatDateTime(receipt.confirmedAt) : undefined}
                >
                  {receipt.confirmedAt ? formatRelativeTime(receipt.confirmedAt) : '—'}
                </dd>
              </div>
              {receipt.status !== 'draft' && receipt.notes && (
                <div className="grid grid-cols-12 gap-2">
                  <dt className="col-span-5 text-[var(--text-muted)]">Ghi chú</dt>
                  <dd className="col-span-7 min-w-0 break-words text-[var(--text)]">
                    {receipt.notes}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Hộp thoại xác nhận nhập kho (Mockup 09) */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Xác nhận nhập kho phiếu ${receipt.receiptNo}?`}
        description="Tồn kho sẽ tăng theo từng lô. Phiếu đã xác nhận không sửa được nữa."
        cancelLabel="Quay lại"
        confirmLabel="Xác nhận nhập kho"
        variant="default"
        isPending={confirmMutation.isPending}
        onConfirm={() => void handleConfirm()}
      />

      {/* Hộp thoại hủy phiếu nháp */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Hủy phiếu nhập ${receipt.receiptNo}?`}
        description="Phiếu sẽ chuyển sang trạng thái Đã hủy và không thể sửa hoặc xác nhận. Tồn kho không thay đổi."
        cancelLabel="Quay lại"
        confirmLabel="Hủy phiếu"
        variant="destructive"
        isPending={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
