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
import { ApiError } from '@/lib/api';

const cancelReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập lý do hủy phiếu kiểm kê')
    .max(500, 'Lý do hủy tối đa 500 ký tự'),
});

type CancelFormValues = z.infer<typeof cancelReasonSchema>;

export interface CancelStockCountDialogProps {
  countNo: string;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelStockCountDialog({
  countNo,
  open,
  isPending,
  onOpenChange,
  onConfirm,
}: CancelStockCountDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CancelFormValues>({
    resolver: zodResolver(cancelReasonSchema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
    }
  }, [open, reset]);

  const handleFormSubmit = handleSubmit(async (values) => {
    try {
      await onConfirm(values.reason);
    } catch (error) {
      if (error instanceof ApiError) {
        const reasonErr = error.errors?.find((e) => e.field === 'reason');
        setError('reason', { message: reasonErr?.message ?? error.message });
      } else {
        setError('reason', { message: 'Không thể hủy phiếu kiểm kê. Vui lòng thử lại.' });
      }
    }
  });

  const errorMessage = errors.reason?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy phiếu kiểm kê {countNo}?</DialogTitle>
          <DialogDescription>
            Hủy phiếu kiểm kê không làm thay đổi tồn kho. Phiếu đã hủy không thể chỉnh sửa hoặc
            duyệt điều chỉnh.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleFormSubmit(e)} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-stock-count-reason">
              Lý do hủy <span className="text-[var(--risk-critical-fg)]">*</span>
            </Label>
            <textarea
              id="cancel-stock-count-reason"
              rows={3}
              aria-invalid={errorMessage ? 'true' : 'false'}
              aria-describedby={errorMessage ? 'cancel-stock-count-reason-error' : undefined}
              placeholder="Ví dụ: Kiểm đếm lại toàn kho sau khi hoàn tất phiếu nhập cuối ngày"
              className="w-full rounded-md border border-border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
              {...register('reason')}
            />
            {errorMessage && (
              <p
                id="cancel-stock-count-reason-error"
                className="text-xs text-[var(--risk-critical-fg)]"
              >
                {errorMessage}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Quay lại
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? 'Đang xử lý...' : 'Xác nhận hủy phiếu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
