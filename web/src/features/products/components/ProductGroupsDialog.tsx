import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import {
  useCreateProductGroupMutation,
  useProductGroupsQuery,
  useUpdateProductGroupMutation,
  useUpdateProductGroupStatusMutation,
} from '../hooks';
import { type ProductGroupItem } from '../types';

const groupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã phải có từ 2 đến 50 ký tự')
    .max(50, 'Mã phải có từ 2 đến 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ cái, chữ số, dấu _ hoặc -'),
  name: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên nhóm hàng')
    .max(150, 'Tên nhóm hàng tối đa 150 ký tự'),
  description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự').optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

interface ProductGroupsDialogProps {
  open: boolean;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function ProductGroupsDialog({
  open,
  canManage,
  onOpenChange,
  onSuccess,
}: ProductGroupsDialogProps) {
  const groupsQuery = useProductGroupsQuery();
  const createMutation = useCreateProductGroupMutation();
  const updateMutation = useUpdateProductGroupMutation();
  const statusMutation = useUpdateProductGroupStatusMutation();

  const [editingGroup, setEditingGroup] = useState<ProductGroupItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<ProductGroupItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: { code: '', name: '', description: '' },
  });

  useEffect(() => {
    if (!open) {
      setEditingGroup(null);
      setStatusTarget(null);
      setServerError(null);
      reset({ code: '', name: '', description: '' });
    }
  }, [open, reset]);

  const startEdit = (group: ProductGroupItem) => {
    setEditingGroup(group);
    setServerError(null);
    reset({
      code: group.code,
      name: group.name,
      description: group.description ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingGroup(null);
    setServerError(null);
    reset({ code: '', name: '', description: '' });
  };

  const onSubmit = async (values: GroupFormValues) => {
    setServerError(null);
    try {
      if (editingGroup) {
        await updateMutation.mutateAsync({
          id: editingGroup.id,
          payload: {
            name: values.name,
            description: values.description || null,
          },
        });
        onSuccess(`Đã cập nhật nhóm hàng ${editingGroup.code}.`);
        cancelEdit();
      } else {
        const created = await createMutation.mutateAsync({
          code: values.code.toUpperCase(),
          name: values.name,
          description: values.description || undefined,
        });
        onSuccess(`Đã thêm nhóm hàng ${created.code}.`);
        reset({ code: '', name: '', description: '' });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors) {
          for (const item of error.errors) {
            if (item.field === 'code' || item.field === 'name' || item.field === 'description') {
              setError(item.field, { message: item.message });
            }
          }
        }
        if (error.statusCode === 409 && !error.errors?.length) {
          setError('code', { message: error.message });
        }
        setServerError(error.message);
      } else {
        setServerError('Không thể lưu nhóm hàng. Vui lòng thử lại.');
      }
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!statusTarget) {
      return;
    }
    const nextStatus = statusTarget.status === 'active' ? 'inactive' : 'active';
    try {
      await statusMutation.mutateAsync({ id: statusTarget.id, status: nextStatus });
      onSuccess(
        nextStatus === 'inactive'
          ? `Đã ngừng nhóm hàng ${statusTarget.code}.`
          : `Đã kích hoạt lại nhóm hàng ${statusTarget.code}.`,
      );
      setStatusTarget(null);
    } catch (error) {
      setStatusTarget(null);
      setServerError(
        error instanceof ApiError ? error.message : 'Không thể đổi trạng thái nhóm hàng.',
      );
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nhóm hàng</DialogTitle>
            <DialogDescription>
              Nhóm hàng ngừng hoạt động vẫn hiển thị trên sản phẩm cũ nhưng không gán được cho sản
              phẩm mới.
            </DialogDescription>
          </DialogHeader>

          {canManage && (
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-3 rounded-md border border-border bg-[var(--surface-muted)] p-3.5"
            >
              <div className="text-sm font-medium text-[var(--text)]">
                {editingGroup ? `Sửa nhóm hàng ${editingGroup.code}` : 'Thêm nhóm hàng mới'}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="group-code">Mã nhóm</Label>
                  <Input
                    id="group-code"
                    placeholder="vd: DO_HOP"
                    disabled={Boolean(editingGroup)}
                    {...register('code')}
                  />
                  {errors.code && (
                    <p className="text-xs text-[var(--risk-critical-fg)]">{errors.code.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="group-name">Tên nhóm hàng</Label>
                  <Input id="group-name" placeholder="Đồ hộp" {...register('name')} />
                  {errors.name && (
                    <p className="text-xs text-[var(--risk-critical-fg)]">{errors.name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="group-description">Mô tả (tuỳ chọn)</Label>
                <Input
                  id="group-description"
                  placeholder="Ghi chú phân loại ngắn gọn"
                  {...register('description')}
                />
                {errors.description && (
                  <p className="text-xs text-[var(--risk-critical-fg)]">
                    {errors.description.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div
                  role="alert"
                  className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-3 py-2 text-xs text-[var(--risk-critical-fg)]"
                >
                  {serverError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                {editingGroup && (
                  <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                    Huỷ sửa
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving ? 'Đang lưu...' : editingGroup ? 'Lưu nhóm' : 'Thêm nhóm'}
                </Button>
              </div>
            </form>
          )}

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {groupsQuery.isLoading && (
              <div className="p-4 text-sm text-[var(--text-muted)]">Đang tải nhóm hàng...</div>
            )}
            {groupsQuery.data && groupsQuery.data.length === 0 && (
              <div className="p-4 text-sm text-[var(--text-muted)]">Chưa có nhóm hàng nào.</div>
            )}
            {groupsQuery.data && groupsQuery.data.length > 0 && (
              <ul className="divide-y divide-border">
                {groupsQuery.data.map((group) => (
                  <li
                    key={group.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text)]">{group.code}</span>
                        <span>{group.name}</span>
                        <StatusBadge
                          tone={group.status === 'active' ? 'active' : 'inactive'}
                          label={group.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                        />
                      </div>
                      {group.description && (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {group.description}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(group)}
                        >
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setStatusTarget(group)}
                        >
                          {group.status === 'active' ? 'Ngừng' : 'Kích hoạt'}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(next) => {
          if (!next) {
            setStatusTarget(null);
          }
        }}
        title={
          statusTarget?.status === 'active'
            ? `Ngừng nhóm hàng ${statusTarget.code}?`
            : `Kích hoạt lại nhóm hàng ${statusTarget?.code ?? ''}?`
        }
        description={
          statusTarget?.status === 'active'
            ? 'Sản phẩm đã thuộc nhóm này vẫn hiển thị bình thường, nhưng không thể gán nhóm này cho sản phẩm mới.'
            : 'Nhóm hàng sẽ có thể chọn lại khi tạo hoặc sửa sản phẩm.'
        }
        confirmLabel={statusTarget?.status === 'active' ? 'Xác nhận ngừng' : 'Xác nhận kích hoạt'}
        variant={statusTarget?.status === 'active' ? 'destructive' : 'default'}
        isPending={statusMutation.isPending}
        onConfirm={() => void handleConfirmToggleStatus()}
      />
    </>
  );
}
