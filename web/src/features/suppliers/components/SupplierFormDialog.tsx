import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
import {
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useUpdateSupplierStatusMutation,
} from '../hooks';
import { type SupplierItem } from '../types';

const supplierSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã phải có từ 2 đến 50 ký tự')
    .max(50, 'Mã phải có từ 2 đến 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ cái, chữ số, dấu _ hoặc -'),
  name: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên nhà cung cấp')
    .max(200, 'Tên nhà cung cấp tối đa 200 ký tự'),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[0-9+\s]{8,15}$/.test(v),
      'Số điện thoại chỉ gồm chữ số, dấu + hoặc khoảng trắng (8–15 ký tự)',
    ),
  email: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || z.string().email().safeParse(v).success,
      'Email không đúng định dạng',
    ),
  address: z.string().trim().max(500, 'Địa chỉ tối đa 500 ký tự'),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

interface SupplierFormDialogProps {
  open: boolean;
  supplier: SupplierItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function SupplierFormDialog({
  open,
  supplier,
  onOpenChange,
  onSuccess,
}: SupplierFormDialogProps) {
  const isEditing = Boolean(supplier);
  const createMutation = useCreateSupplierMutation();
  const updateMutation = useUpdateSupplierMutation();
  const statusMutation = useUpdateSupplierStatusMutation();

  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmStatusOpen, setConfirmStatusOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { code: '', name: '', phone: '', email: '', address: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: supplier?.code ?? '',
        name: supplier?.name ?? '',
        phone: supplier?.phone ?? '',
        email: supplier?.email ?? '',
        address: supplier?.address ?? '',
      });
      setServerError(null);
      setConfirmStatusOpen(false);
    }
  }, [open, supplier, reset]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: SupplierFormValues) => {
    setServerError(null);
    try {
      if (supplier) {
        await updateMutation.mutateAsync({
          id: supplier.id,
          payload: {
            name: values.name,
            phone: values.phone || null,
            email: values.email || null,
            address: values.address || null,
          },
        });
        onOpenChange(false);
        onSuccess(`Đã cập nhật nhà cung cấp ${supplier.code}.`);
      } else {
        const created = await createMutation.mutateAsync({
          code: values.code.toUpperCase(),
          name: values.name,
          phone: values.phone || undefined,
          email: values.email || undefined,
          address: values.address || undefined,
        });
        onOpenChange(false);
        onSuccess(`Đã thêm nhà cung cấp ${created.code}.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (
              item.field === 'code' ||
              item.field === 'name' ||
              item.field === 'phone' ||
              item.field === 'email' ||
              item.field === 'address'
            ) {
              setError(item.field, { message: item.message });
            }
          }
        }
        if (error.statusCode === 409 && !error.errors?.length) {
          setError('code', { message: error.message });
        }
        setServerError(error.message);
      } else {
        setServerError('Không thể lưu nhà cung cấp. Vui lòng thử lại.');
      }
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!supplier) {
      return;
    }
    const nextStatus = supplier.status === 'active' ? 'inactive' : 'active';
    try {
      await statusMutation.mutateAsync({ id: supplier.id, status: nextStatus });
      setConfirmStatusOpen(false);
      onOpenChange(false);
      onSuccess(
        nextStatus === 'inactive'
          ? `Đã ngừng hoạt động nhà cung cấp ${supplier.code}.`
          : `Đã kích hoạt lại nhà cung cấp ${supplier.code}.`,
      );
    } catch (error) {
      setConfirmStatusOpen(false);
      setServerError(
        error instanceof ApiError ? error.message : 'Không thể đổi trạng thái nhà cung cấp.',
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? `Sửa nhà cung cấp ${supplier?.code}` : 'Thêm nhà cung cấp'}
            </DialogTitle>
            <DialogDescription>Nhập thông tin nguồn cung lô hàng.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="supplier-code">Mã nhà cung cấp</Label>
                <Input
                  id="supplier-code"
                  placeholder="vd: NCC004"
                  disabled={isEditing}
                  {...register('code')}
                />
                {errors.code && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="supplier-phone">Điện thoại</Label>
                <Input id="supplier-phone" placeholder="02363886688" {...register('phone')} />
                {errors.phone && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="supplier-name">Tên nhà cung cấp</Label>
              <Input
                id="supplier-name"
                placeholder="Công ty CP Sữa Việt Nam, CN Đà Nẵng"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                type="email"
                placeholder="lienhe@nhacungcap.vn"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="supplier-address">Địa chỉ</Label>
              <Input
                id="supplier-address"
                placeholder="36 Nguyễn Văn Linh, Hải Châu, Đà Nẵng"
                {...register('address')}
              />
              {errors.address && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.address.message}</p>
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

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 sm:justify-between">
              <div>
                {supplier && (
                  <Button
                    type="button"
                    variant={supplier.status === 'active' ? 'destructive' : 'secondary'}
                    onClick={() => setConfirmStatusOpen(true)}
                    disabled={isPending || statusMutation.isPending}
                  >
                    {supplier.status === 'active' ? 'Ngừng hoạt động' : 'Kích hoạt lại'}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  Quay lại
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm nhà cung cấp'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmStatusOpen}
        onOpenChange={setConfirmStatusOpen}
        title={
          supplier?.status === 'active'
            ? `Ngừng hoạt động ${supplier.code}?`
            : `Kích hoạt lại ${supplier?.code ?? ''}?`
        }
        description={
          supplier?.status === 'active'
            ? 'Lịch sử phiếu nhập vẫn giữ nguyên, nhưng nhà cung cấp này sẽ không chọn được cho phiếu nhập mới.'
            : 'Nhà cung cấp sẽ chuyển về trạng thái Hoạt động và có thể chọn lại cho giao dịch mới.'
        }
        confirmLabel={supplier?.status === 'active' ? 'Xác nhận ngừng' : 'Xác nhận kích hoạt'}
        variant={supplier?.status === 'active' ? 'destructive' : 'default'}
        isPending={statusMutation.isPending}
        onConfirm={() => void handleConfirmToggleStatus()}
      />
    </>
  );
}
