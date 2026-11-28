import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { type ProductGroupItem, type ProductItem } from '@/features/products/types';
import { ApiError } from '@/lib/api';
import { formatProductLabel } from '@/lib/format';
import { useCreateOverrideThresholdMutation, useUpdateOverrideThresholdMutation } from '../hooks';
import { type OverrideThreshold } from '../types';
import { formatOverrideTargetLabel } from '../utils';

const overrideSchema = z.object({
  scope: z.enum(['PRODUCT', 'PRODUCT_GROUP']),
  targetId: z.string().min(1, 'Vui lòng chọn đối tượng áp dụng'),
  warningDays: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập số ngày cảnh báo')
    .refine((value) => /^\d+$/.test(value), 'Số ngày cảnh báo phải là số nguyên không âm'),
});

type OverrideFormValues = z.infer<typeof overrideSchema>;

interface OverrideThresholdDialogProps {
  open: boolean;
  editing: OverrideThreshold | null;
  products: readonly ProductItem[];
  groups: readonly ProductGroupItem[];
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function OverrideThresholdDialog({
  open,
  editing,
  products,
  groups,
  onOpenChange,
  onSuccess,
}: OverrideThresholdDialogProps) {
  const isEditing = Boolean(editing);
  const createMutation = useCreateOverrideThresholdMutation();
  const updateMutation = useUpdateOverrideThresholdMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const activeProducts = products.filter((p) => p.status === 'active');
  const activeGroups = groups.filter((g) => g.status === 'active');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<OverrideFormValues>({
    resolver: zodResolver(overrideSchema),
    defaultValues: {
      scope: 'PRODUCT',
      targetId: '',
      warningDays: '',
    },
  });

  const selectedScope = watch('scope');

  useEffect(() => {
    if (open) {
      if (editing) {
        reset({
          scope: editing.scope,
          targetId: editing.target.id,
          warningDays: String(editing.warningDays),
        });
      } else {
        reset({
          scope: 'PRODUCT',
          targetId: activeProducts[0]?.id ?? '',
          warningDays: '',
        });
      }
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, reset]);

  const handleScopeChange = (nextScope: 'PRODUCT' | 'PRODUCT_GROUP') => {
    setValue('scope', nextScope, { shouldValidate: false });
    const nextDefault = nextScope === 'PRODUCT' ? activeProducts[0]?.id ?? '' : activeGroups[0]?.id ?? '';
    setValue('targetId', nextDefault, { shouldValidate: false });
    setServerError(null);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: OverrideFormValues) => {
    setServerError(null);
    const warningDays = Number(values.warningDays);

    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          payload: { warningDays },
        });
        onOpenChange(false);
        onSuccess(`Đã cập nhật ngưỡng riêng cho ${formatOverrideTargetLabel(editing)}.`);
      } else {
        await createMutation.mutateAsync({
          scope: values.scope,
          targetId: values.targetId,
          warningDays,
        });
        onOpenChange(false);
        onSuccess('Đã thêm ngưỡng riêng mới.');
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (item.field === 'scope' || item.field === 'targetId' || item.field === 'warningDays') {
              setError(item.field, { message: item.message });
            }
          }
        }
        if (error.statusCode === 409 && !error.errors?.length) {
          setError('targetId', { message: error.message });
        }
        setServerError(error.message);
      } else {
        setServerError('Không thể lưu ngưỡng riêng. Vui lòng thử lại.');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Sửa ngưỡng riêng' : 'Thêm ngưỡng riêng'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Cập nhật ngưỡng áp dụng từ hôm nay.'
              : 'Thiết lập số ngày cảnh báo theo sản phẩm hoặc nhóm hàng.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {isEditing && editing ? (
            <div className="rounded-md border border-border bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm">
              <div className="text-xs text-[var(--text-muted)]">
                {editing.scope === 'PRODUCT' ? 'Sản phẩm' : 'Nhóm hàng'}
              </div>
              <div className="mt-0.5 font-medium text-[var(--text)]">
                {formatOverrideTargetLabel(editing)}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="override-scope">Phạm vi</Label>
                <Select
                  id="override-scope"
                  value={selectedScope}
                  onChange={(e) => handleScopeChange(e.target.value as 'PRODUCT' | 'PRODUCT_GROUP')}
                >
                  <option value="PRODUCT">Sản phẩm</option>
                  <option value="PRODUCT_GROUP">Nhóm hàng</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="override-target">
                  {selectedScope === 'PRODUCT' ? 'Sản phẩm áp dụng' : 'Nhóm hàng áp dụng'}
                </Label>
                <Select id="override-target" {...register('targetId')}>
                  <option value="">
                    {selectedScope === 'PRODUCT' ? 'Chọn sản phẩm' : 'Chọn nhóm hàng'}
                  </option>
                  {selectedScope === 'PRODUCT'
                    ? activeProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {formatProductLabel(product.code, product.name)}
                        </option>
                      ))
                    : activeGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                </Select>
                {errors.targetId && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">
                    {errors.targetId.message}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="override-warning-days">Số ngày cảnh báo cận hạn</Label>
            <Input
              id="override-warning-days"
              type="number"
              min={0}
              placeholder="vd: 10"
              className="tabular-nums"
              {...register('warningDays')}
            />
            {errors.warningDays && (
              <p className="text-xs text-[var(--risk-critical-fg)]">{errors.warningDays.message}</p>
            )}
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-3 py-2 text-sm text-[var(--risk-critical-fg)]"
            >
              {serverError}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Quay lại
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm ngưỡng riêng'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
