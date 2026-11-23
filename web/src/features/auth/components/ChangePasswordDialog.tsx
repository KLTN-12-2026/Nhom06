import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useToast } from '@/components/common/toast-context';
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
import { useAuth, useChangePasswordMutation } from '../hooks';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: z
      .string()
      .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
      .max(100, 'Mật khẩu mới không được vượt quá 100 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới'),
  })
  .superRefine((values, ctx) => {
    if (
      values.currentPassword &&
      values.newPassword &&
      values.newPassword === values.currentPassword
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newPassword'],
        message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
      });
    }
    if (values.confirmPassword && values.newPassword !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Mật khẩu nhập lại không khớp',
      });
    }
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const changePasswordMutation = useChangePasswordMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setServerError(null);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      onOpenChange(false);
      showToast('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      await logout({ skipServerRequest: true });
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        let mappedFieldError = false;
        if (error.errors && error.errors.length > 0) {
          for (const item of error.errors) {
            if (
              item.field === 'currentPassword' ||
              item.field === 'newPassword' ||
              item.field === 'confirmPassword'
            ) {
              setError(item.field, { message: item.message });
              mappedFieldError = true;
            }
          }
        }
        if (!mappedFieldError) {
          setServerError(error.message);
        }
      } else {
        setServerError('Không thể đổi mật khẩu. Vui lòng thử lại.');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
          <DialogDescription>
            Cập nhật mật khẩu mới cho tài khoản đang đăng nhập (tối thiểu 8 ký tự).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
          <div className="space-y-1">
            <Label htmlFor="change-current-password">Mật khẩu hiện tại</Label>
            <Input
              id="change-current-password"
              type="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu hiện tại"
              aria-invalid={Boolean(errors.currentPassword)}
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p role="alert" className="text-xs text-[var(--risk-critical-fg)]">
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="change-new-password">Mật khẩu mới</Label>
            <Input
              id="change-new-password"
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
            <Label htmlFor="change-confirm-password">Nhập lại mật khẩu mới</Label>
            <Input
              id="change-confirm-password"
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

          <div className="rounded-md border-l-4 border-[var(--info)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">
            Sau khi đổi mật khẩu, bạn sẽ được đăng xuất khỏi mọi phiên đang mở và cần đăng nhập lại.
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
              disabled={changePasswordMutation.isPending}
            >
              Quay lại
            </Button>
            <Button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? 'Đang lưu...' : 'Đổi mật khẩu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
