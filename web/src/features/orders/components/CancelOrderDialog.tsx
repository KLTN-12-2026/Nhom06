import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const cancelOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập lý do hủy đơn hàng')
    .max(500, 'Lý do hủy tối đa 500 ký tự'),
});

type CancelOrderValues = z.infer<typeof cancelOrderSchema>;

export interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNo: string;
  isPartial: boolean;
  isPending: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderNo,
  isPartial,
  isPending,
  onConfirm,
}: CancelOrderDialogProps) {
  const form = useForm<CancelOrderValues>({
    resolver: zodResolver(cancelOrderSchema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ reason: '' });
    }
  }, [open, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onConfirm(values.reason.trim());
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy đơn hàng {orderNo}?</DialogTitle>
          <DialogDescription>
            Hủy đơn không thay đổi tồn kho và không ảnh hưởng các phiếu xuất đã xác nhận.
            {isPartial
              ? ' Phần hàng đã xuất trước đó vẫn được giữ nguyên; phần còn thiếu sẽ không xuất tiếp.'
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cancelOrderReason">Lý do hủy đơn</Label>
            <textarea
              id="cancelOrderReason"
              rows={3}
              placeholder="Nhập lý do hủy đơn hàng (bắt buộc)"
              aria-invalid={form.formState.errors.reason ? 'true' : undefined}
              aria-describedby={form.formState.errors.reason ? 'cancelOrderReason-error' : undefined}
              className="flex w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)] disabled:cursor-not-allowed disabled:opacity-50"
              {...form.register('reason')}
            />
            {form.formState.errors.reason && (
              <p
                id="cancelOrderReason-error"
                role="alert"
                className="text-xs text-[var(--risk-critical-fg)]"
              >
                {form.formState.errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Quay lại
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Đang xử lý...' : 'Xác nhận hủy đơn'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
