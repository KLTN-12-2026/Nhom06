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
import { useAuth } from '@/features/auth/hooks';
import { useProductsQuery } from '@/features/products/hooks';
import { useSuppliersQuery } from '@/features/suppliers/hooks';
import { ApiError } from '@/lib/api';
import { addDaysToIsoDate, getTodayIsoVn } from '@/lib/format';
import {
  useCreateInboundReceiptMutation,
  useInboundReceiptQuery,
  useUpdateInboundReceiptMutation,
} from '../hooks';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const QTY_REGEX = /^\d+(\.\d{1,3})?$/;
const COST_REGEX = /^\d+(\.\d{1,2})?$/;

const inboundItemSchema = z.object({
  productId: z.string().min(1, 'Vui lòng chọn sản phẩm'),
  lotCode: z.string(),
  expiryDate: z.string(),
  quantity: z.string(),
  unitCost: z.string(),
});

const inboundFormSchema = z
  .object({
    supplierId: z.string().min(1, 'Vui lòng chọn nhà cung cấp'),
    receiptDate: z.string().regex(ISO_DATE_REGEX, 'Vui lòng chọn ngày chứng từ hợp lệ'),
    notes: z.string(),
    items: z.array(inboundItemSchema).min(1, 'Phiếu nhập phải có ít nhất 1 dòng hàng'),
  })
  .superRefine((data, ctx) => {
    const lotExpiryByKey = new Map<string, string>();

    data.items.forEach((item, index) => {
      const normalizedLot = item.lotCode.replace(/\s+/g, '').toUpperCase();
      if (normalizedLot.length < 1 || normalizedLot.length > 80) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'lotCode'],
          message: 'Mã lô phải từ 1 đến 80 ký tự',
        });
      }

      if (!ISO_DATE_REGEX.test(item.expiryDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'expiryDate'],
          message: 'Vui lòng chọn hạn sử dụng',
        });
      } else if (ISO_DATE_REGEX.test(data.receiptDate) && item.expiryDate <= data.receiptDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'expiryDate'],
          message: 'Hạn sử dụng phải lớn hơn ngày chứng từ',
        });
      }

      const trimmedQty = item.quantity.trim();
      if (!QTY_REGEX.test(trimmedQty) || Number(trimmedQty) <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'quantity'],
          message: 'Số lượng phải lớn hơn 0 (tối đa 3 số thập phân)',
        });
      }

      const trimmedCost = item.unitCost.trim();
      if (trimmedCost !== '' && !COST_REGEX.test(trimmedCost)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'unitCost'],
          message: 'Đơn giá phải lớn hơn hoặc bằng 0 (tối đa 2 số thập phân)',
        });
      }

      if (item.productId && normalizedLot && ISO_DATE_REGEX.test(item.expiryDate)) {
        const key = `${item.productId}::${normalizedLot}`;
        const prevExpiry = lotExpiryByKey.get(key);
        if (!prevExpiry) {
          lotExpiryByKey.set(key, item.expiryDate);
        } else if (prevExpiry !== item.expiryDate) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'expiryDate'],
            message: 'Hai dòng cùng mã lô phải có cùng hạn sử dụng',
          });
        }
      }
    });
  });

type InboundFormValues = z.infer<typeof inboundFormSchema>;

const EMPTY_LINE = {
  productId: '',
  lotCode: '',
  expiryDate: '',
  quantity: '',
  unitCost: '',
};

export interface InboundFormPageProps {
  mode: 'create' | 'edit';
}

export function InboundFormPage({ mode }: InboundFormPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canReadReports = hasPermission('reports.read');
  const isEdit = mode === 'edit';
  const [submitError, setSubmitError] = useState<string | null>(null);
  const manualExpiryRowIdsRef = useRef<Set<string>>(new Set());
  const initializedEditIdRef = useRef<string | null>(null);

  const suppliersQuery = useSuppliersQuery({ status: 'active' });
  const productsQuery = useProductsQuery({ status: 'active', page: 1, pageSize: 100 });
  const receiptQuery = useInboundReceiptQuery(isEdit ? id : undefined);

  const createMutation = useCreateInboundReceiptMutation();
  const updateMutation = useUpdateInboundReceiptMutation(id ?? '');

  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const form = useForm<InboundFormValues>({
    resolver: zodResolver(inboundFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      supplierId: '',
      receiptDate: getTodayIsoVn(),
      notes: '',
      items: [{ ...EMPTY_LINE }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  // Khởi tạo giá trị form khi sửa phiếu nháp
  useEffect(() => {
    if (!isEdit || !receiptQuery.data) {
      return;
    }
    if (initializedEditIdRef.current === receiptQuery.data.id) {
      return;
    }
    initializedEditIdRef.current = receiptQuery.data.id;
    form.reset({
      supplierId: receiptQuery.data.supplier.id,
      receiptDate: receiptQuery.data.receiptDate,
      notes: receiptQuery.data.notes ?? '',
      items: receiptQuery.data.items.map((item) => ({
        productId: item.productId,
        lotCode: item.lotCode,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        unitCost: item.unitCost ?? '',
      })),
    });
  }, [isEdit, receiptQuery.data, form]);

  // Đánh dấu các dòng đã tải sẵn ở chế độ sửa là đã có HSD cố định (không tự ghi đè ngoài ý muốn)
  useEffect(() => {
    if (isEdit && initializedEditIdRef.current) {
      for (const field of fields) {
        manualExpiryRowIdsRef.current.add(field.id);
      }
    }
  }, [isEdit, fields]);

  const handleReceiptDateChange = (nextDate: string) => {
    form.setValue('receiptDate', nextDate, { shouldDirty: true, shouldValidate: true });
    if (!ISO_DATE_REGEX.test(nextDate)) {
      return;
    }
    const currentItems = form.getValues('items');
    fields.forEach((field, index) => {
      if (manualExpiryRowIdsRef.current.has(field.id)) {
        return;
      }
      const selectedProduct = productById.get(currentItems[index]?.productId ?? '');
      if (selectedProduct?.shelfLifeDays) {
        form.setValue(
          `items.${index}.expiryDate`,
          addDaysToIsoDate(nextDate, selectedProduct.shelfLifeDays),
          { shouldDirty: true },
        );
      }
    });
  };

  const handleProductChange = (index: number, fieldId: string, productId: string) => {
    form.setValue(`items.${index}.productId`, productId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (manualExpiryRowIdsRef.current.has(fieldId)) {
      return;
    }
    const product = productById.get(productId);
    const receiptDate = form.getValues('receiptDate');
    if (product?.shelfLifeDays && ISO_DATE_REGEX.test(receiptDate)) {
      form.setValue(
        `items.${index}.expiryDate`,
        addDaysToIsoDate(receiptDate, product.shelfLifeDays),
        { shouldDirty: true, shouldValidate: true },
      );
    }
  };

  const handleRemoveRow = (index: number, fieldId: string) => {
    manualExpiryRowIdsRef.current.delete(fieldId);
    remove(index);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const payload = {
      supplierId: values.supplierId,
      receiptDate: values.receiptDate,
      notes: values.notes.trim() || null,
      items: values.items.map((item) => ({
        productId: item.productId,
        lotCode: item.lotCode.replace(/\s+/g, '').toUpperCase(),
        expiryDate: item.expiryDate,
        quantity: item.quantity.trim(),
        ...(canReadReports
          ? { unitCost: item.unitCost.trim() === '' ? null : item.unitCost.trim() }
          : {}),
      })),
    };

    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);

      showToast(
        isEdit
          ? `Đã cập nhật phiếu nháp ${saved.receiptNo}.`
          : `Đã lưu phiếu nháp ${saved.receiptNo}.`,
      );
      navigate(`/inbound/${saved.id}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
        if (error.errors && error.errors.length > 0) {
          for (const fieldErr of error.errors) {
            form.setError(fieldErr.field as keyof InboundFormValues, {
              type: 'server',
              message: fieldErr.message,
            });
          }
        }
      } else {
        setSubmitError('Không thể lưu phiếu nhập. Vui lòng thử lại.');
      }
    }
  });

  const pageTitle =
    isEdit && receiptQuery.data
      ? `Sửa phiếu nhập ${receiptQuery.data.receiptNo}`
      : 'Lập phiếu nhập kho';

  if (isEdit && receiptQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title={pageTitle} description="Lưu phiếu nháp không làm thay đổi tồn kho" />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải thông tin phiếu nhập...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEdit && receiptQuery.isError) {
    return (
      <div className="space-y-5">
        <PageHeader title={pageTitle} description="Lưu phiếu nháp không làm thay đổi tồn kho" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          Không thể tải thông tin phiếu nhập.{' '}
          <button
            type="button"
            onClick={() => void receiptQuery.refetch()}
            className="underline"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (isEdit && receiptQuery.data && receiptQuery.data.status !== 'draft') {
    return (
      <div className="space-y-5">
        <PageHeader title={pageTitle} description="Lưu phiếu nháp không làm thay đổi tồn kho" />
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-[var(--text)]">
              Phiếu nhập <strong>{receiptQuery.data.receiptNo}</strong> không còn ở trạng thái nháp
              nên không thể chỉnh sửa.
            </p>
            <Button asChild variant="outline">
              <Link to={`/inbound/${receiptQuery.data.id}`}>Quay lại chi tiết phiếu</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const suppliers = suppliersQuery.data ?? [];
  const existingSupplier = receiptQuery.data?.supplier;
  const hasSupplierInActiveList = existingSupplier
    ? suppliers.some((s) => s.id === existingSupplier.id)
    : true;

  const {
    register,
    formState: { errors },
  } = form;

  const receiptDateReg = register('receiptDate');

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-6">
      <PageHeader title={pageTitle} description="Lưu phiếu nháp không làm thay đổi tồn kho" />

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-4 py-3 text-sm text-[var(--risk-critical-fg)]"
        >
          {submitError}
        </div>
      )}

      {/* Card thông tin chung (Mockup 07) */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplierId">Nhà cung cấp</Label>
              <Select
                id="supplierId"
                aria-invalid={errors.supplierId ? 'true' : undefined}
                aria-describedby={errors.supplierId ? 'supplierId-error' : undefined}
                {...register('supplierId')}
              >
                <option value="">Chọn nhà cung cấp</option>
                {!hasSupplierInActiveList && existingSupplier && (
                  <option value={existingSupplier.id}>
                    {existingSupplier.name} (Ngừng hoạt động)
                  </option>
                )}
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
              {errors.supplierId && (
                <p
                  id="supplierId-error"
                  role="alert"
                  className="text-xs text-[var(--risk-critical-fg)]"
                >
                  {errors.supplierId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiptDate">Ngày chứng từ</Label>
              <Input
                id="receiptDate"
                type="date"
                aria-invalid={errors.receiptDate ? 'true' : undefined}
                aria-describedby={errors.receiptDate ? 'receiptDate-error' : undefined}
                name={receiptDateReg.name}
                ref={receiptDateReg.ref}
                onBlur={receiptDateReg.onBlur}
                onChange={(e) => handleReceiptDateChange(e.target.value)}
              />
              {errors.receiptDate && (
                <p
                  id="receiptDate-error"
                  role="alert"
                  className="text-xs text-[var(--risk-critical-fg)]"
                >
                  {errors.receiptDate.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiptNoPreview">Số phiếu</Label>
              <Input
                id="receiptNoPreview"
                value={isEdit && receiptQuery.data ? receiptQuery.data.receiptNo : 'Tự sinh khi lưu'}
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
              placeholder="Ghi chú kiểm đếm, thời điểm giao nhận (tùy chọn)"
              {...register('notes')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card Dòng hàng (Mockup 07) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border py-4">
          <CardTitle>Dòng hàng</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ ...EMPTY_LINE })}
          >
            Thêm dòng
          </Button>
        </CardHeader>

        <CardContent className="space-y-5 p-0">
          {errors.items?.root?.message && (
            <p role="alert" className="px-6 pt-4 text-xs text-[var(--risk-critical-fg)]">
              {errors.items.root.message}
            </p>
          )}

          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-[var(--surface-muted)] text-left font-medium text-[var(--text-muted)]">
                  <th className={canReadReports ? 'px-4 py-3 w-[34%]' : 'px-4 py-3 w-[40%]'}>
                    Sản phẩm
                  </th>
                  <th className={canReadReports ? 'px-3 py-3 w-[16%]' : 'px-3 py-3 w-[20%]'}>
                    Mã lô
                  </th>
                  <th className={canReadReports ? 'px-3 py-3 w-[17%]' : 'px-3 py-3 w-[19%]'}>
                    Hạn sử dụng
                  </th>
                  <th
                    className={
                      canReadReports
                        ? 'px-3 py-3 w-[12%] text-right'
                        : 'px-3 py-3 w-[14%] text-right'
                    }
                  >
                    Số lượng
                  </th>
                  {canReadReports && <th className="px-3 py-3 w-[14%] text-right">Đơn giá</th>}
                  <th className="px-4 py-3 w-[7%] text-right">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fields.map((field, index) => {
                  const rowErrors = errors.items?.[index];
                  const productReg = register(`items.${index}.productId`);
                  const expiryReg = register(`items.${index}.expiryDate`);

                  return (
                    <tr key={field.id} className="align-top">
                      <td className="px-4 py-3">
                        <Select
                          aria-label={`Sản phẩm dòng ${index + 1}`}
                          aria-invalid={rowErrors?.productId ? 'true' : undefined}
                          aria-describedby={
                            rowErrors?.productId ? `item-${index}-product-error` : undefined
                          }
                          name={productReg.name}
                          ref={productReg.ref}
                          onBlur={productReg.onBlur}
                          onChange={(e) => handleProductChange(index, field.id, e.target.value)}
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
                            id={`item-${index}-product-error`}
                            role="alert"
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {rowErrors.productId.message}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <Input
                          aria-label={`Mã lô dòng ${index + 1}`}
                          placeholder="VD: L26112201"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={rowErrors?.lotCode ? 'true' : undefined}
                          aria-describedby={
                            rowErrors?.lotCode ? `item-${index}-lotCode-error` : undefined
                          }
                          {...register(`items.${index}.lotCode`)}
                        />
                        {rowErrors?.lotCode && (
                          <p
                            id={`item-${index}-lotCode-error`}
                            role="alert"
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {rowErrors.lotCode.message}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <Input
                          type="date"
                          aria-label={`Hạn sử dụng dòng ${index + 1}`}
                          aria-invalid={rowErrors?.expiryDate ? 'true' : undefined}
                          aria-describedby={
                            rowErrors?.expiryDate ? `item-${index}-expiry-error` : undefined
                          }
                          name={expiryReg.name}
                          ref={expiryReg.ref}
                          onBlur={expiryReg.onBlur}
                          onChange={(e) => {
                            manualExpiryRowIdsRef.current.add(field.id);
                            void expiryReg.onChange(e);
                          }}
                        />
                        {rowErrors?.expiryDate && (
                          <p
                            id={`item-${index}-expiry-error`}
                            role="alert"
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {rowErrors.expiryDate.message}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Số lượng dòng ${index + 1}`}
                          aria-invalid={rowErrors?.quantity ? 'true' : undefined}
                          aria-describedby={
                            rowErrors?.quantity ? `item-${index}-qty-error` : undefined
                          }
                          className="text-right tabular-nums"
                          {...register(`items.${index}.quantity`)}
                        />
                        {rowErrors?.quantity && (
                          <p
                            id={`item-${index}-qty-error`}
                            role="alert"
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {rowErrors.quantity.message}
                          </p>
                        )}
                      </td>

                      {canReadReports && (
                        <td className="px-3 py-3">
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`Đơn giá dòng ${index + 1}`}
                            aria-invalid={rowErrors?.unitCost ? 'true' : undefined}
                            aria-describedby={
                              rowErrors?.unitCost ? `item-${index}-cost-error` : undefined
                            }
                            className="text-right tabular-nums"
                            {...register(`items.${index}.unitCost`)}
                          />
                          {rowErrors?.unitCost && (
                            <p
                              id={`item-${index}-cost-error`}
                              role="alert"
                              className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                            >
                              {rowErrors.unitCost.message}
                            </p>
                          )}
                        </td>
                      )}

                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={fields.length <= 1}
                          onClick={() => handleRemoveRow(index, field.id)}
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

          {/* Ghi chú gợi ý HSD + nút Huỷ / Lưu phiếu nháp (Mockup 07) */}
          <div className="flex flex-col gap-3 border-t border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 rounded-md border border-[var(--border)] border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)]">
              Hạn sử dụng gợi ý theo hạn dùng danh nghĩa của sản phẩm, nhân viên vẫn phải đối chiếu
              với bao bì thực tế trước khi lưu.
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(isEdit && id ? `/inbound/${id}` : '/inbound')}
                disabled={isPending}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
                disabled={isPending}
              >
                {isPending ? 'Đang lưu...' : 'Lưu phiếu nháp'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
