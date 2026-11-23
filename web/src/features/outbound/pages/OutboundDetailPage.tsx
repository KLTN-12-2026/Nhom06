import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
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
import { formatDate, formatDateTime, formatQuantity } from '@/lib/format';
import { OutboundStatusBadge, OutboundTypeBadge } from '../components/OutboundTypeBadge';
import { useOutboundReceiptDetailQuery } from '../hooks';
import { getOutboundTypeLabel } from '../types';

export function OutboundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const receiptQuery = useOutboundReceiptDetailQuery(id);
  const receipt = receiptQuery.data;

  if (receiptQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết phiếu xuất" description="Đang tải thông tin chứng từ xuất..." />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải chi tiết phiếu xuất...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (receiptQuery.isError || !receipt) {
    return (
      <div className="space-y-5">
        <PageHeader title="Chi tiết phiếu xuất" description="Không tìm thấy chứng từ yêu cầu" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          Không thể tải chi tiết phiếu xuất kho.{' '}
          <button type="button" onClick={() => void receiptQuery.refetch()} className="underline">
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Phiếu xuất ${receipt.outboundNo}`}
        description={
          receipt.order
            ? `${getOutboundTypeLabel(receipt.outboundType)} · ${receipt.order.agency.name}`
            : getOutboundTypeLabel(receipt.outboundType)
        }
        actions={
          <div className="flex items-center gap-2">
            {receipt.order && (
              <Button variant="outline" asChild>
                <Link to={`/orders/${receipt.order.id}`}>Xem đơn {receipt.order.orderNo}</Link>
              </Button>
            )}
            <OutboundStatusBadge status={receipt.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border py-4">
              <CardTitle>Chi tiết dòng xuất theo lô</CardTitle>
              <span className="text-sm text-[var(--text-muted)]">
                {receipt.lotCount} lô · Tổng xuất{' '}
                <strong className="tabular-nums text-[var(--text)]">
                  {formatQuantity(receipt.totalQuantity)}
                </strong>
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]">
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Mã lô</TableHead>
                      <TableHead>Hạn sử dụng</TableHead>
                      <TableHead className="text-right">Số lượng xuất</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipt.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <span className="font-medium text-[var(--text)]">
                              {item.product.code}
                            </span>
                            <span className="text-[var(--text-muted)]">{item.product.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-[var(--text)]">
                          {item.lotCode}
                        </TableCell>
                        <TableCell className="tabular-nums text-[var(--text)]">
                          {formatDate(item.expiryDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-[var(--text)]">
                          {formatQuantity(item.quantity)} {item.product.unit}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card>
            <CardHeader className="border-b border-border py-4">
              <CardTitle>Thông tin phiếu xuất</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm">
              <dl className="grid grid-cols-[120px_1fr] gap-y-3">
                <dt className="text-[var(--text-muted)]">Số phiếu</dt>
                <dd className="font-medium text-[var(--text)]">{receipt.outboundNo}</dd>

                <dt className="text-[var(--text-muted)]">Loại xuất</dt>
                <dd>
                  <OutboundTypeBadge type={receipt.outboundType} />
                </dd>

                <dt className="text-[var(--text-muted)]">Đơn liên quan</dt>
                <dd>
                  {receipt.order ? (
                    <Link
                      to={`/orders/${receipt.order.id}`}
                      className="font-medium text-[var(--info)] hover:underline"
                    >
                      {receipt.order.orderNo}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </dd>

                <dt className="text-[var(--text-muted)]">Đại lý</dt>
                <dd className="text-[var(--text)]">
                  {receipt.order ? receipt.order.agency.name : '—'}
                </dd>

                <dt className="text-[var(--text-muted)]">Người xác nhận</dt>
                <dd className="text-[var(--text)]">
                  {receipt.confirmer?.fullName ?? receipt.creator.fullName}
                </dd>

                <dt className="text-[var(--text-muted)]">Thời điểm xuất</dt>
                <dd className="tabular-nums text-[var(--text)]">
                  {formatDateTime(receipt.confirmedAt)}
                </dd>

                {receipt.notes && (
                  <>
                    <dt className="text-[var(--text-muted)]">Ghi chú</dt>
                    <dd className="whitespace-pre-line text-[var(--text)]">{receipt.notes}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
