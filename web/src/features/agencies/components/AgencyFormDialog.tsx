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
  useCreateAgencyMutation,
  useUpdateAgencyMutation,
  useUpdateAgencyStatusMutation,
} from '../hooks';
import { type AgencyItem } from '../types';

const agencySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã phải có từ 2 đến 50 ký tự')
    .max(50, 'Mã phải có từ 2 đến 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ cái, chữ số, dấu _ hoặc -'),
  name: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên đại lý')
    .max(200, 'Tên đại lý tối đa 200 ký tự'),
  contactName: z.string().trim().max(150, 'Tên người liên hệ tối đa 150 ký tự'),
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

type AgencyFormValues = z.infer<typeof agencySchema>;

interface AgencyFormDialogProps {
  open: boolean;
  agency: AgencyItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function AgencyFormDialog({
  open,
  agency,
  onOpenChange,
  onSuccess,
}: AgencyFormDialogProps) {
  const isEditing = Boolean(agency);
  const createMutation = useCreateAgencyMutation();
  const updateMutation = useUpdateAgencyMutation();
  const statusMutation = useUpdateAgencyStatusMutation();

  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmStatusOpen, setConfirmStatusOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AgencyFormValues>({
    resolver: zodResolver(agencySchema),
    defaultValues: { code: '', name: '', contactName: '', phone: '', email: '', address: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: agency?.code ?? '',
        name: agency?.name ?? '',
        contactName: agency?.contactName ?? '',
        phone: agency?.phone ?? '',
        email: agency?.email ?? '',
        address: agency?.address ?? '',
      });
      setServerError(null);
      setConfirmStatusOpen(false);
    }
  }, [open, agency, reset]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: AgencyFormValues) => {
    setServerError(null);
    try {
      if (agency) {
        await updateMutation.mutateAsync({
          id: agency.id,
          payload: {
            name: values.name,
            contactName: values.contactName || null,
            phone: values.phone || null,
            email: values.email || null,
            address: values.address || null,
          },
        });
        onOpenChange(false);
        onSuccess(`Đã cập nhật đại lý ${agency.code}.`);
      } else {
        const created = await createMutation.mutateAsync({
          code: values.code.toUpperCase(),
          name: values.name,
          contactName: values.contactName || undefined,
          phone: values.phone || undefined,
          email: values.email || undefined,
          address: values.address || undefined,
        });
        onOpenChange(false);
        onSuccess(`Đã thêm đại lý ${created.code}.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (
              item.field === 'code' ||
              item.field === 'name' ||
              item.field === 'contactName' ||
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
        setServerError('Không thể lưu đại lý. Vui lòng thử lại.');
      }
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!agency) {
      return;
    }
    const nextStatus = agency.status === 'active' ? 'inactive' : 'active';
    try {
      await statusMutation.mutateAsync({ id: agency.id, status: nextStatus });
      setConfirmStatusOpen(false);
      onOpenChange(false);
      onSuccess(
        nextStatus === 'inactive'
          ? `Đã ngừng hoạt động đại lý ${agency.code}.`
          : `Đã kích hoạt lại đại lý ${agency.code}.`,
      );
    } catch (error) {
      setConfirmStatusOpen(false);
      setServerError(
        error instanceof ApiError ? error.message : 'Không thể đổi trạng thái đại lý.',
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? `Sửa đại lý ${agency?.code}` : 'Thêm đại lý'}</DialogTitle>
            <DialogDescription>
              Đơn hàng do nhân viên kho nhập hộ, đại lý không tự đăng nhập vào hệ thống.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="agency-code">Mã đại lý</Label>
                <Input
                  id="agency-code"
                  placeholder="vd: DL006"
                  disabled={isEditing}
                  {...register('code')}
                />
                {errors.code && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="agency-contact">Người liên hệ</Label>
                <Input
                  id="agency-contact"
                  placeholder="Nguyễn Minh Tâm"
                  {...register('contactName')}
                />
                {errors.contactName && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">
                    {errors.contactName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="agency-name">Tên đại lý</Label>
              <Input id="agency-name" placeholder="Đại lý Minh Hương" {...register('name')} />
              {errors.name && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="agency-phone">Điện thoại</Label>
                <Input id="agency-phone" placeholder="0905112233" {...register('phone')} />
                {errors.phone && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="agency-email">Email</Label>
                <Input
                  id="agency-email"
                  type="email"
                  placeholder="lienhe@daily.vn"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="agency-address">Địa chỉ</Label>
              <Input
                id="agency-address"
                placeholder="125 Hùng Vương, Hải Châu, Đà Nẵng"
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
                {agency && (
                  <Button
                    type="button"
                    variant={agency.status === 'active' ? 'destructive' : 'secondary'}
                    onClick={() => setConfirmStatusOpen(true)}
                    disabled={isPending || statusMutation.isPending}
                  >
                    {agency.status === 'active' ? 'Ngừng hoạt động' : 'Kích hoạt lại'}
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
                  {isPending ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm đại lý'}
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
          agency?.status === 'active'
            ? `Ngừng hoạt động ${agency.code}?`
            : `Kích hoạt lại ${agency?.code ?? ''}?`
        }
        description={
          agency?.status === 'active'
            ? 'Lịch sử đơn hàng vẫn giữ nguyên, nhưng đại lý này sẽ không chọn được cho đơn hàng mới.'
            : 'Đại lý sẽ chuyển về trạng thái Hoạt động và có thể chọn lại cho đơn hàng mới.'
        }
        confirmLabel={agency?.status === 'active' ? 'Xác nhận ngừng' : 'Xác nhận kích hoạt'}
        variant={agency?.status === 'active' ? 'destructive' : 'default'}
        isPending={statusMutation.isPending}
        onConfirm={() => void handleConfirmToggleStatus()}
      />
    </>
  );
}
