import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAgenciesQuery } from '@/features/agencies/hooks';
import { useProductsQuery } from '@/features/products/hooks';
import { ApiError } from '@/lib/api';
import { getTodayIsoVn } from '@/lib/format';
import { useCreateOrderMutation, useOrderDetailQuery, useUpdateOrderMutation } from '../hooks';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const QTY_REGEX = /^\d+(\.\d{1,3})?$/;

const orderItemSchema = z.object({
  productId: z.string().min(1, 'Vui lòng chọn sản phẩm'),
  requestedQty: z.string(),
});

const orderFormSchema = z
  .object({
    agencyId: z.string().min(1, 'Vui lòng chọn đại lý'),
    orderDate: z.string().regex(ISO_DATE_REGEX, 'Vui lòng chọn ngày đặt hợp lệ'),
    notes: z.string(),
    items: z.array(orderItemSchema).min(1, 'Đơn hàng phải có ít nhất 1 mặt hàng'),
  })
  .superRefine((data, ctx) => {
    const seenProducts = new Set<string>();

    data.items.forEach((item, index) => {
      if (item.productId) {
        if (seenProducts.has(item.productId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'productId'],
            message: 'Sản phẩm bị trùng trong cùng đơn hàng',
          });
        } else {
          seenProducts.add(item.productId);
        }
      }

      const trimmedQty = item.requestedQty.trim();
      if (!QTY_REGEX.test(trimmedQty) || Number(trimmedQty) <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'requestedQty'],
          message: 'Số lượng đặt phải lớn hơn 0 (tối đa 3 số thập phân)',
        });
      }
    });
  });

type OrderFormValues = z.infer<typeof orderFormSchema>;

const EMPTY_LINE = {
  productId: '',
  requestedQty: '',
};

export interface OrderFormPageProps {
  mode: 'create' | 'edit';
}

export function OrderFormPage({ mode }: OrderFormPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isEdit = mode === 'edit';
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initializedEditIdRef = useRef<string | null>(null);

  const agenciesQuery = useAgenciesQuery({ status: 'active' });
  const productsQuery = useProductsQuery({ status: 'active', page: 1, pageSize: 100 });
  const orderQuery = useOrderDetailQuery(isEdit ? id : undefined);

  const createMutation = useCreateOrderMutation();
  const updateMutation = useUpdateOrderMutation(id ?? '');

  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      agencyId: '',
      orderDate: getTodayIsoVn(),
      notes: '',
      items: [{ ...EMPTY_LINE }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  useEffect(() => {
    if (!isEdit || !orderQuery.data) {
      return;
    }
    if (initializedEditIdRef.current === orderQuery.data.id) {
      return;
    }
    initializedEditIdRef.current = orderQuery.data.id;
    form.reset({
      agencyId: orderQuery.data.agency.id,
      orderDate: orderQuery.data.orderDate,
      notes: orderQuery.data.notes ?? '',
      items: orderQuery.data.items.map((item) => ({
        productId: item.productId,
        requestedQty: item.requestedQty,
      })),
    });
  }, [isEdit, orderQuery.data, form]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const payload = {
      agencyId: values.agencyId,
      orderDate: values.orderDate,
      notes: values.notes.trim() || null,
      items: values.items.map((item) => ({
        productId: item.productId,
        requestedQty: item.requestedQty.trim(),
      })),
    };

    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);

      showToast(
        isEdit
          ? `Đã cập nhật đơn hàng ${saved.orderNo}.`
          : `Đã tạo đơn ${saved.orderNo}. Tồn kho chưa thay đổi.`,
      );
      navigate(`/orders/${saved.id}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
        if (error.errors && error.errors.length > 0) {
          for (const fieldErr of error.errors) {
            form.setError(fieldErr.field as keyof OrderFormValues, {
              type: 'server',
              message: fieldErr.message,
            });
          }
        }
      } else {
        setSubmitError('Không thể lưu đơn hàng đại lý. Vui lòng thử lại.');
      }
    }
  });

  const pageTitle =
    isEdit && orderQuery.data ? `Sửa đơn ${orderQuery.data.orderNo}` : 'Tạo đơn đặt hàng đại lý';

  if (isEdit && orderQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title={pageTitle} description="Tạo đơn không làm giảm tồn kho" />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải thông tin đơn hàng...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEdit && orderQuery.isError) {
    return (
      <div className="space-y-5">
        <PageHeader title={pageTitle} description="Tạo đơn không làm giảm tồn kho" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          Không thể tải thông tin đơn hàng.{' '}
          <button type="button" onClick={() => void orderQuery.refetch()} className="underline">
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const canEditLoadedOrder =
    !isEdit ||
    !orderQuery.data ||
    (orderQuery.data.status === 'confirmed' && Number(orderQuery.data.totalFulfilledQty) === 0);

  if (isEdit && orderQuery.data && !canEditLoadedOrder) {
    return (
      <div className="space-y-5">
        <PageHeader title={pageTitle} description="Tạo đơn không làm giảm tồn kho" />
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-[var(--text)]">
              Đơn hàng <strong>{orderQuery.data.orderNo}</strong> đã phát sinh xuất kho hoặc không
              còn ở trạng thái chờ xuất nên không thể chỉnh sửa.
            </p>
            <Button asChild variant="outline">
              <Link to={`/orders/${orderQuery.data.id}`}>Quay lại chi tiết đơn</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agencies = agenciesQuery.data ?? [];
  const existingAgency = orderQuery.data?.agency;
  const hasAgencyInActiveList = existingAgency
    ? agencies.some((a) => a.id === existingAgency.id)
    : true;

  const {
    register,
    watch,
    formState: { errors },
  } = form;

  const watchedItems = watch('items');

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-6">
      <PageHeader title={pageTitle} description="Tạo đơn không làm giảm tồn kho" />

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-4 py-3 text-sm text-[var(--risk-critical-fg)]"
        >
          {submitError}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="agencyId">Đại lý</Label>
              <Select
                id="agencyId"
                aria-invalid={errors.agencyId ? 'true' : undefined}
                aria-describedby={errors.agencyId ? 'agencyId-error' : undefined}
                {...register('agencyId')}
              >
                <option value="">Chọn đại lý</option>
                {!hasAgencyInActiveList && existingAgency && (
                  <option value={existingAgency.id}>
                    {existingAgency.name} (Ngừng hoạt động)
                  </option>
                )}
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name} ({agency.code})
                  </option>
                ))}
              </Select>
              {errors.agencyId && (
                <p
                  id="agencyId-error"
                  role="alert"
                  className="text-xs text-[var(--risk-critical-fg)]"
                >
                  {errors.agencyId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orderDate">Ngày đặt</Label>
              <Input
                id="orderDate"
                type="date"
                aria-invalid={errors.orderDate ? 'true' : undefined}
                aria-describedby={errors.orderDate ? 'orderDate-error' : undefined}
                {...register('orderDate')}
              />
              {errors.orderDate && (
                <p
                  id="orderDate-error"
                  role="alert"
                  className="text-xs text-[var(--risk-critical-fg)]"
                >
                  {errors.orderDate.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="orderNoPreview">Số đơn</Label>
              <Input
                id="orderNoPreview"
                value={isEdit && orderQuery.data ? orderQuery.data.orderNo : 'Tự sinh khi lưu'}
                readOnly
                disabled
                className="bg-[var(--surface-muted)] text-[var(--text-muted)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input
              id="notes"
              placeholder="Yêu cầu giao hàng, liên hệ đại lý (tùy chọn)"
              {...register('notes')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border py-4">
          <CardTitle>Mặt hàng đặt</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ ...EMPTY_LINE })}
          >
            Thêm mặt hàng
          </Button>
        </CardHeader>

        <CardContent className="space-y-5 p-0">
          {errors.items?.root?.message && (
            <p role="alert" className="px-6 pt-4 text-xs text-[var(--risk-critical-fg)]">
              {errors.items.root.message}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-[var(--surface-muted)] text-left font-medium text-[var(--text)]">
                  <th className="w-[58%] px-4 py-3">Sản phẩm</th>
                  <th className="w-[14%] px-3 py-3">ĐVT</th>
                  <th className="w-[18%] px-3 py-3 text-right">Số lượng đặt</th>
                  <th className="w-[10%] px-4 py-3 text-right">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fields.map((field, index) => {
                  const rowErrors = errors.items?.[index];
                  const selectedProductId = watchedItems?.[index]?.productId ?? '';
                  const selectedProduct = productById.get(selectedProductId);

                  return (
                    <tr key={field.id} className="align-top">
                      <td className="px-4 py-3">
                        <Select
                          aria-label={`Sản phẩm dòng ${index + 1}`}
                          aria-invalid={rowErrors?.productId ? 'true' : undefined}
                          aria-describedby={
                            rowErrors?.productId ? `order-item-${index}-product-error` : undefined
                          }
                          {...register(`items.${index}.productId`)}
                        >
                          <option value="">Chọn sản phẩm</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.code} — {product.name}
                            </option>
                          ))}
                        </Select>
                        {rowErrors?.productId && (
                          <p
                            id={`order-item-${index}-product-error`}
                            role="alert"
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {rowErrors.productId.message}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-5 text-[var(--text-muted)]">
                        {selectedProduct?.unit ?? '—'}
                      </td>

                      <td className="px-3 py-3">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Số lượng đặt dòng ${index + 1}`}
                          aria-invalid={rowErrors?.requestedQty ? 'true' : undefined}
                          aria-describedby={
                            rowErrors?.requestedQty ? `order-item-${index}-qty-error` : undefined
                          }
                          className="text-right tabular-nums"
                          {...register(`items.${index}.requestedQty`)}
                        />
                        {rowErrors?.requestedQty && (
                          <p
                            id={`order-item-${index}-qty-error`}
                            role="alert"
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {rowErrors.requestedQty.message}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={fields.length <= 1}
                          onClick={() => remove(index)}
                          aria-label={`Xoá dòng ${index + 1}`}
                        >
                          Xoá
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 rounded-md border border-[var(--border)] border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)]">
              Đơn chỉ ghi nhận nhu cầu của đại lý. Tồn kho chưa bị trừ cho đến khi lập và xác nhận
              phiếu xuất kho theo lô.
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(isEdit && id ? `/orders/${id}` : '/orders')}
                disabled={isPending}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
                disabled={isPending}
              >
                {isPending ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo đơn hàng'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
