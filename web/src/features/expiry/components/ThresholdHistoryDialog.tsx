import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateVi } from '@/lib/format';
import { useThresholdHistoryQuery } from '../hooks';
import { type ThresholdScope } from '../types';

interface ThresholdHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCOPE_LABELS: Record<ThresholdScope, string> = {
  GLOBAL: 'Chung',
  PRODUCT_GROUP: 'Nhóm hàng',
  PRODUCT: 'Sản phẩm',
};

export function ThresholdHistoryDialog({ open, onOpenChange }: ThresholdHistoryDialogProps) {
  const historyQuery = useThresholdHistoryQuery(undefined, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lịch sử cấu hình ngưỡng cảnh báo HSD</DialogTitle>
          <DialogDescription>
            Mọi thay đổi ngưỡng đều đóng bản cũ và tạo bản mới để truy vết lịch sử.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          {historyQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-[var(--text-muted)]">Đang tải lịch sử...</div>
          ) : historyQuery.isError ? (
            <div className="px-4 py-6 text-sm text-[var(--risk-critical-fg)]">
              Không thể tải lịch sử cấu hình.{' '}
              <button
                type="button"
                onClick={() => void historyQuery.refetch()}
                className="underline"
              >
                Thử lại
              </button>
            </div>
          ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--text-muted)]">Chưa có bản ghi nào.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phạm vi</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead className="text-right">Cảnh báo</TableHead>
                  <TableHead className="text-right">Nguy cấp</TableHead>
                  <TableHead className="text-right">Tối thiểu giao</TableHead>
                  <TableHead>Hiệu lực</TableHead>
                  <TableHead>Người tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={item.effectiveTo ? 'neutral' : 'default'}>
                        {SCOPE_LABELS[item.scope]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.scope === 'GLOBAL'
                        ? 'Toàn kho'
                        : item.target
                          ? item.target.code && item.scope === 'PRODUCT'
                            ? `${item.target.code} — ${item.target.name}`
                            : item.target.name
                          : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {item.warningDays} ngày
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {item.scope === 'GLOBAL' ? `${item.criticalDays} ngày` : 'Theo chung'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {item.scope === 'GLOBAL' && item.minDeliveryDays !== null
                        ? `${item.minDeliveryDays} ngày`
                        : 'Theo chung'}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateVi(item.effectiveFrom)} →{' '}
                      {item.effectiveTo ? formatDateVi(item.effectiveTo) : 'Đang hiệu lực'}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {item.createdBy.fullName}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
