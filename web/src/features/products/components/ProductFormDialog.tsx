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
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import {
  useCreateProductMutation,
  useUpdateProductMutation,
  useUpdateProductStatusMutation,
} from '../hooks';
import { type ProductGroupItem, type ProductItem } from '../types';

const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã phải có từ 2 đến 50 ký tự')
    .max(50, 'Mã phải có từ 2 đến 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ cái, chữ số, dấu _ hoặc -'),
  name: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên sản phẩm')
    .max(200, 'Tên sản phẩm tối đa 200 ký tự'),
  groupId: z.string().min(1, 'Vui lòng chọn nhóm hàng'),
  unit: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập đơn vị tính')
    .max(30, 'Đơn vị tính tối đa 30 ký tự'),
  shelfLifeDays: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (/^\d+$/.test(value) && Number(value) > 0),
      'Hạn dùng phải là số nguyên dương (ngày)',
    ),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormDialogProps {
  open: boolean;
  product: ProductItem | null;
  groups: readonly ProductGroupItem[];
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function ProductFormDialog({
  open,
  product,
  groups,
  onOpenChange,
  onSuccess,
}: ProductFormDialogProps) {
  const isEditing = Boolean(product);
  const createMutation = useCreateProductMutation();
  const updateMutation = useUpdateProductMutation();
  const statusMutation = useUpdateProductStatusMutation();

  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmStatusOpen, setConfirmStatusOpen] = useState(false);

  const activeGroups = groups.filter((g) => g.status === 'active');
  const selectableGroups =
    product && !activeGroups.some((g) => g.id === product.group.id)
      ? [
          ...activeGroups,
          {
            id: product.group.id,
            code: product.group.code,
            name: `${product.group.name} (Ngừng hoạt động)`,
            description: null,
            status: 'inactive' as const,
          },
        ]
      : activeGroups;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: '',
      name: '',
      groupId: '',
      unit: '',
      shelfLifeDays: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: product?.code ?? '',
        name: product?.name ?? '',
        groupId: product?.group.id ?? activeGroups[0]?.id ?? '',
        unit: product?.unit ?? '',
        shelfLifeDays: product?.shelfLifeDays ? String(product.shelfLifeDays) : '',
      });
      setServerError(null);
      setConfirmStatusOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, reset]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: ProductFormValues) => {
    setServerError(null);
    const parsedShelfLife = values.shelfLifeDays === '' ? null : Number(values.shelfLifeDays);

    try {
      if (product) {
        await updateMutation.mutateAsync({
          id: product.id,
          payload: {
            name: values.name,
            groupId: values.groupId,
            unit: values.unit,
            shelfLifeDays: parsedShelfLife,
          },
        });
        onOpenChange(false);
        onSuccess(`Đã cập nhật sản phẩm ${product.code}.`);
      } else {
        const created = await createMutation.mutateAsync({
          code: values.code.toUpperCase(),
          name: values.name,
          groupId: values.groupId,
          unit: values.unit,
          shelfLifeDays: parsedShelfLife ?? undefined,
        });
        onOpenChange(false);
        onSuccess(`Đã thêm sản phẩm ${created.code}.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (
              item.field === 'code' ||
              item.field === 'name' ||
              item.field === 'groupId' ||
              item.field === 'unit' ||
              item.field === 'shelfLifeDays'
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
        setServerError('Không thể lưu sản phẩm. Vui lòng thử lại.');
      }
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!product) {
      return;
    }
    const nextStatus = product.status === 'active' ? 'inactive' : 'active';
    try {
      await statusMutation.mutateAsync({ id: product.id, status: nextStatus });
      setConfirmStatusOpen(false);
      onOpenChange(false);
      onSuccess(
        nextStatus === 'inactive'
          ? `Đã ngừng kinh doanh sản phẩm ${product.code}.`
          : `Đã kích hoạt lại sản phẩm ${product.code}.`,
      );
    } catch (error) {
      setConfirmStatusOpen(false);
      setServerError(
        error instanceof ApiError ? error.message : 'Không thể đổi trạng thái sản phẩm.',
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? `Sửa sản phẩm ${product?.code}` : 'Thêm sản phẩm'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Cập nhật thông tin sản phẩm.' : 'Nhập thông tin sản phẩm lưu kho.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="product-code">Mã sản phẩm</Label>
                <Input
                  id="product-code"
                  placeholder="vd: SP021"
                  disabled={isEditing}
                  {...register('code')}
                />
                {errors.code && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="product-group">Nhóm hàng</Label>
                <Select id="product-group" {...register('groupId')}>
                  <option value="">Chọn nhóm hàng</option>
                  {selectableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
                {errors.groupId && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.groupId.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="product-name">Tên sản phẩm</Label>
              <Input
                id="product-name"
                placeholder="Sữa tươi tiệt trùng 1L"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-[var(--risk-critical-fg)]">{errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="product-unit">Đơn vị tính</Label>
                <Input id="product-unit" placeholder="Thùng, Lốc, Hộp..." {...register('unit')} />
                {errors.unit && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">{errors.unit.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="product-shelf-life">Hạn dùng chuẩn (ngày)</Label>
                <Input
                  id="product-shelf-life"
                  type="number"
                  min={1}
                  placeholder="vd: 180"
                  {...register('shelfLifeDays')}
                />
                {errors.shelfLifeDays && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">
                    {errors.shelfLifeDays.message}
                  </p>
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

            <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 sm:justify-between">
              <div>
                {product && (
                  <Button
                    type="button"
                    variant={product.status === 'active' ? 'destructive' : 'secondary'}
                    onClick={() => setConfirmStatusOpen(true)}
                    disabled={isPending || statusMutation.isPending}
                  >
                    {product.status === 'active' ? 'Ngừng kinh doanh' : 'Kích hoạt lại'}
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
                  {isPending ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
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
          product?.status === 'active'
            ? `Ngừng kinh doanh ${product.code}?`
            : `Kích hoạt lại ${product?.code ?? ''}?`
        }
        description={
          product?.status === 'active'
            ? 'Lịch sử chứng từ và các lô hiện có vẫn giữ nguyên, nhưng sản phẩm này sẽ không chọn được cho giao dịch mới.'
            : 'Sản phẩm sẽ chuyển về trạng thái Đang kinh doanh và có thể chọn lại cho các giao dịch mới.'
        }
        confirmLabel={product?.status === 'active' ? 'Xác nhận ngừng' : 'Xác nhận kích hoạt'}
        variant={product?.status === 'active' ? 'destructive' : 'default'}
        isPending={statusMutation.isPending}
        onConfirm={() => void handleConfirmToggleStatus()}
      />
    </>
  );
}
