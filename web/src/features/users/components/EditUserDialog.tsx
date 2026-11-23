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
import { ApiError } from '@/lib/api';
import { useUpdateUserProfileMutation, useUpdateUserRoleMutation } from '../hooks';
import { type UserItem } from '../types';

const ROLE_OPTIONS = [
  { code: 'ADMIN', name: 'Quản trị viên' },
  { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
] as const;

const editUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Họ tên không được để trống'),
  email: z.string().trim().email('Email không đúng định dạng'),
  phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự').optional(),
  roleCode: z.string().min(1, 'Vui lòng chọn vai trò'),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

interface EditUserDialogProps {
  user: UserItem | null;
  isSelf: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function EditUserDialog({
  user,
  isSelf,
  canManageUsers,
  canManageRoles,
  onOpenChange,
  onSuccess,
}: EditUserDialogProps) {
  const updateProfileMutation = useUpdateUserProfileMutation();
  const updateRoleMutation = useUpdateUserRoleMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      roleCode: 'WAREHOUSE_STAFF',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? '',
        roleCode: user.role?.code ?? 'WAREHOUSE_STAFF',
      });
      setServerError(null);
    }
  }, [user, reset]);

  const isPending = updateProfileMutation.isPending || updateRoleMutation.isPending;
  const canEditRole = canManageRoles && !isSelf;

  const onSubmit = async (values: EditUserFormValues) => {
    if (!user) {
      return;
    }
    setServerError(null);

    try {
      const profileChanged =
        values.fullName !== user.fullName ||
        values.email !== user.email ||
        (values.phone || null) !== (user.phone || null);
      const roleChanged = canEditRole && values.roleCode !== user.role?.code;

      if (canManageUsers && profileChanged) {
        await updateProfileMutation.mutateAsync({
          id: user.id,
          payload: {
            fullName: values.fullName,
            email: values.email,
            phone: values.phone || null,
          },
        });
      }

      if (roleChanged) {
        await updateRoleMutation.mutateAsync({
          id: user.id,
          roleCode: values.roleCode,
        });
      }

      onOpenChange(false);
      onSuccess(`Đã cập nhật thông tin tài khoản ${user.username}.`);
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError('Không thể cập nhật tài khoản. Vui lòng thử lại.');
      }
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chi tiết tài khoản {user?.username}</DialogTitle>
          <DialogDescription>
            Cập nhật thông tin hồ sơ và vai trò. Mọi thay đổi được ghi vào nhật ký hệ thống.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
            <div className="space-y-1">
              <Label htmlFor="edit-fullname">Họ tên</Label>
              <Input
                id="edit-fullname"
                disabled={!canManageUsers}
                {...register('fullName')}
              />
              {errors.fullName && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.fullName.message}</p>
              )}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  disabled={!canManageUsers}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-phone">Số điện thoại</Label>
                <Input id="edit-phone" disabled={!canManageUsers} {...register('phone')} />
                {errors.phone && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-role">Vai trò</Label>
              <Select id="edit-role" disabled={!canEditRole} {...register('roleCode')}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </Select>
              {isSelf && (
                <p className="text-xs text-[var(--text-muted)]">
                  Không thể tự thay đổi vai trò của tài khoản đang đăng nhập.
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

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Quay lại
              </Button>
              {(canManageUsers || canEditRole) && (
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
