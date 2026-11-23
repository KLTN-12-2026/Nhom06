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
import { useCreateUserMutation } from '../hooks';

const ROLE_OPTIONS = [
  { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  { code: 'ADMIN', name: 'Quản trị viên' },
] as const;

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Chỉ dùng chữ cái, chữ số và ký tự . _ -'),
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên'),
  email: z.string().trim().email('Email không đúng định dạng'),
  phone: z.string().trim().max(30, 'Số điện thoại tối đa 30 ký tự').optional(),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  roleCode: z.string().min(1, 'Vui lòng chọn vai trò'),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateUserDialogProps) {
  const createMutation = useCreateUserMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: '',
      fullName: '',
      email: '',
      phone: '',
      password: '',
      roleCode: 'WAREHOUSE_STAFF',
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: CreateUserFormValues) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync({
        username: values.username,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
        roleCode: values.roleCode,
      });
      onOpenChange(false);
      onSuccess(`Đã tạo tài khoản ${values.username}.`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (
              item.field === 'username' ||
              item.field === 'fullName' ||
              item.field === 'email' ||
              item.field === 'phone' ||
              item.field === 'password' ||
              item.field === 'roleCode'
            ) {
              setError(item.field, { message: item.message });
            }
          }
        }
        setServerError(error.message);
      } else {
        setServerError('Không thể tạo tài khoản. Vui lòng thử lại.');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm tài khoản nội bộ</DialogTitle>
          <DialogDescription>
            Tài khoản mới áp dụng ngay cho nhân sự kho. Đại lý và nhà cung cấp không có tài khoản.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="create-username">Tên đăng nhập</Label>
              <Input id="create-username" placeholder="vd: nhanvien2" {...register('username')} />
              {errors.username && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.username.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-fullname">Họ tên</Label>
              <Input id="create-fullname" placeholder="Nguyễn Văn A" {...register('fullName')} />
              {errors.fullName && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.fullName.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="ten@kho-ai.local"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-phone">Số điện thoại</Label>
              <Input id="create-phone" placeholder="Tuỳ chọn" {...register('phone')} />
              {errors.phone && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.phone.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="create-password">Mật khẩu ban đầu</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-role">Vai trò</Label>
              <Select id="create-role" {...register('roleCode')}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.code} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </Select>
              {errors.roleCode && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.roleCode.message}</p>
              )}
            </div>
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
              disabled={createMutation.isPending}
            >
              Quay lại
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang lưu...' : 'Tạo tài khoản'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
