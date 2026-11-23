import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { formatDateVi } from '@/lib/format';
import { useUpdateGlobalThresholdMutation } from '../hooks';
import { type GlobalThreshold } from '../types';

const nonNegativeIntString = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Vui lòng nhập ${label}`)
    .refine((value) => /^\d+$/.test(value), `${label} phải là số nguyên không âm`);

const globalThresholdSchema = z
  .object({
    warningDays: nonNegativeIntString('Số ngày cảnh báo cận hạn'),
    criticalDays: nonNegativeIntString('Số ngày nguy cấp'),
    minDeliveryDays: nonNegativeIntString('Hạn dùng tối thiểu khi giao hàng'),
  })
  .superRefine((values, ctx) => {
    const warning = Number(values.warningDays);
    const critical = Number(values.criticalDays);
    if (!Number.isNaN(warning) && !Number.isNaN(critical) && critical > warning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['criticalDays'],
        message: 'Số ngày nguy cấp không được lớn hơn số ngày cảnh báo cận hạn',
      });
    }
  });

type GlobalThresholdFormValues = z.infer<typeof globalThresholdSchema>;

interface GlobalThresholdCardProps {
  global: GlobalThreshold;
  canManage: boolean;
  onSuccess: (message: string) => void;
}

export function GlobalThresholdCard({ global, canManage, onSuccess }: GlobalThresholdCardProps) {
  const updateMutation = useUpdateGlobalThresholdMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<GlobalThresholdFormValues>({
    resolver: zodResolver(globalThresholdSchema),
    defaultValues: {
      warningDays: String(global.warningDays),
      criticalDays: String(global.criticalDays),
      minDeliveryDays: String(global.minDeliveryDays),
    },
  });

  useEffect(() => {
    reset({
      warningDays: String(global.warningDays),
      criticalDays: String(global.criticalDays),
      minDeliveryDays: String(global.minDeliveryDays),
    });
  }, [global, reset]);

  const onSubmit = async (values: GlobalThresholdFormValues) => {
    setServerError(null);
    try {
      await updateMutation.mutateAsync({
        warningDays: Number(values.warningDays),
        criticalDays: Number(values.criticalDays),
        minDeliveryDays: Number(values.minDeliveryDays),
      });
      onSuccess('Đã lưu cấu hình ngưỡng chung.');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (
              item.field === 'warningDays' ||
              item.field === 'criticalDays' ||
              item.field === 'minDeliveryDays'
            ) {
              setError(item.field, { message: item.message });
            }
          }
        }
        setServerError(error.message);
      } else {
        setServerError('Không thể lưu cấu hình chung. Vui lòng thử lại.');
      }
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-lg">Cấu hình chung</CardTitle>
          <CardDescription>Hiệu lực từ {formatDateVi(global.effectiveFrom)}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="global-warning-days">Số ngày cảnh báo cận hạn</Label>
            <Input
              id="global-warning-days"
              type="number"
              min={0}
              disabled={!canManage}
              className="max-w-xs tabular-nums"
              {...register('warningDays')}
            />
            {errors.warningDays && (
              <p className="text-xs text-[var(--risk-critical-fg)]">{errors.warningDays.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="global-critical-days">Số ngày nguy cấp</Label>
            <Input
              id="global-critical-days"
              type="number"
              min={0}
              disabled={!canManage}
              className="max-w-xs tabular-nums"
              {...register('criticalDays')}
            />
            {errors.criticalDays && (
              <p className="text-xs text-[var(--risk-critical-fg)]">
                {errors.criticalDays.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="global-min-delivery-days">Hạn dùng tối thiểu khi giao hàng</Label>
            <Input
              id="global-min-delivery-days"
              type="number"
              min={0}
              disabled={!canManage}
              className="max-w-xs tabular-nums"
              {...register('minDeliveryDays')}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Lô còn ít hơn số ngày này sẽ bị loại trước khi xếp FEFO.
            </p>
            {errors.minDeliveryDays && (
              <p className="text-xs text-[var(--risk-critical-fg)]">
                {errors.minDeliveryDays.message}
              </p>
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

          {canManage && (
            <div className="pt-1">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
              >
                {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
