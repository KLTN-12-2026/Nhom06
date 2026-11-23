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
import { type InventoryLotItem } from '../types';

const lotStatusReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập lý do khóa hoặc mở khóa lô')
    .max(500, 'Lý do tối đa 500 ký tự'),
});

type LotStatusFormValues = z.infer<typeof lotStatusReasonSchema>;

export interface LotStatusDialogProps {
  lot: InventoryLotItem | null;
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (lotId: string, nextStatus: 'active' | 'blocked', reason: string) => Promise<void>;
}

export function LotStatusDialog({
  lot,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: LotStatusDialogProps) {
  const isBlocking = lot?.lotStatus !== 'blocked';
  const nextStatus: 'active' | 'blocked' = isBlocking ? 'blocked' : 'active';

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<LotStatusFormValues>({
    resolver: zodResolver(lotStatusReasonSchema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
    }
  }, [open, lot?.lotId, reset]);

  const handleFormSubmit = handleSubmit(async (values) => {
    if (!lot) {
      return;
    }
    try {
      await onSubmit(lot.lotId, nextStatus, values.reason);
    } catch (error) {
      if (error instanceof ApiError) {
        const reasonErr = error.errors?.find((e) => e.field === 'reason');
        setError('reason', { message: reasonErr?.message ?? error.message });
      } else {
        setError('reason', { message: 'Không thể cập nhật trạng thái lô. Vui lòng thử lại.' });
      }
    }
  });

  const errorMessage = errors.reason?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBlocking
              ? `Khóa lô ${lot?.lotCode ?? ''}?`
              : `Mở khóa lô ${lot?.lotCode ?? ''}?`}
          </DialogTitle>
          <DialogDescription>
            {isBlocking
              ? 'Lô bị khóa sẽ bị loại khỏi phân bổ FEFO khi xuất kho nhưng số tồn hiện tại không thay đổi và vẫn hiển thị trong tồn kho.'
              : 'Lô sau khi mở khóa sẽ được phép tham gia phân bổ FEFO nếu đáp ứng điều kiện hạn dùng và tồn kho.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleFormSubmit(e)} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lot-status-reason">
              Lý do <span className="text-[var(--risk-critical-fg)]">*</span>
            </Label>
            <textarea
              id="lot-status-reason"
              rows={3}
              aria-invalid={errorMessage ? 'true' : 'false'}
              aria-describedby={errorMessage ? 'lot-status-reason-error' : undefined}
              placeholder={
                isBlocking
                  ? 'Ví dụ: Bao bì rách, tạm giữ chờ kiểm tra chất lượng'
                  : 'Ví dụ: Đã kiểm định đạt yêu cầu xuất kho'
              }
              className="w-full rounded-md border border-border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
              {...register('reason')}
            />
            {errorMessage && (
              <p
                id="lot-status-reason-error"
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
            <Button
              type="submit"
              variant={isBlocking ? 'destructive' : 'default'}
              disabled={isPending}
            >
              {isPending ? 'Đang xử lý...' : isBlocking ? 'Xác nhận khóa lô' : 'Xác nhận mở khóa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
