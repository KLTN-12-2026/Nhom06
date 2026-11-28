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
import { ApiError } from '@/lib/api';
import { useResetUserPasswordMutation } from '../hooks';
import { type UserItem } from '../types';

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
      .max(100, 'Mật khẩu mới không được vượt quá 100 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới'),
  })
  .superRefine((values, ctx) => {
    if (values.confirmPassword && values.newPassword !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Mật khẩu nhập lại không khớp',
      });
    }
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordDialogProps {
  user: UserItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function ResetPasswordDialog({
  user,
  onOpenChange,
  onSuccess,
}: ResetPasswordDialogProps) {
  const resetMutation = useResetUserPasswordMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!user) {
      reset();
      setServerError(null);
    }
  }, [user, reset]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!user) {
      return;
    }
    setServerError(null);
    try {
      await resetMutation.mutateAsync({
        id: user.id,
        payload: {
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        },
      });
      onOpenChange(false);
      onSuccess(`Đã đặt lại mật khẩu cho tài khoản ${user.username}.`);
    } catch (error) {
      if (error instanceof ApiError) {
        let mappedFieldError = false;
        if (error.errors && error.errors.length > 0) {
          for (const item of error.errors) {
            if (item.field === 'newPassword' || item.field === 'confirmPassword') {
              setError(item.field, { message: item.message });
              mappedFieldError = true;
            }
          }
        }
        if (!mappedFieldError) {
          setServerError(error.message);
        }
      } else {
        setServerError('Không thể đặt lại mật khẩu. Vui lòng thử lại.');
      }
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu cho {user?.username}</DialogTitle>
          <DialogDescription>
            Thiết lập mật khẩu mới cho {user?.fullName ?? 'tài khoản này'} (tối thiểu 8 ký tự).
          </DialogDescription>
        </DialogHeader>

        {user && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
            <div className="space-y-1">
              <Label htmlFor="reset-new-password">Mật khẩu mới</Label>
              <Input
                id="reset-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Tối thiểu 8 ký tự"
                aria-invalid={Boolean(errors.newPassword)}
                {...register('newPassword')}
              />
              {errors.newPassword && (
                <p role="alert" className="text-xs text-[var(--risk-critical-fg)]">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="reset-confirm-password">Nhập lại mật khẩu mới</Label>
              <Input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p role="alert" className="text-xs text-[var(--risk-critical-fg)]">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="text-xs leading-relaxed text-[var(--text-muted)]">
              Tài khoản này sẽ bị đăng xuất khỏi mọi phiên đang mở.
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
                disabled={resetMutation.isPending}
              >
                Quay lại
              </Button>
              <Button type="submit" disabled={resetMutation.isPending}>
                {resetMutation.isPending ? 'Đang lưu...' : 'Xác nhận đặt lại'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
