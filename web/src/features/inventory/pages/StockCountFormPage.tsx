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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { formatDate, formatQuantity } from '@/lib/format';
import {
  useCreateStockCountMutation,
  useInventoryLotsQuery,
  useStockCountQuery,
  useUpdateStockCountMutation,
} from '../hooks';
import { type InventoryLotItem } from '../types';

const QTY_REGEX = /^\d+(\.\d{1,3})?$/;
const DATETIME_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function getNowVnDatetimeLocal(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '2026';
  const month = byType.get('month') ?? '01';
  const day = byType.get('day') ?? '01';
  const hour = byType.get('hour') === '24' ? '00' : (byType.get('hour') ?? '00');
  const minute = byType.get('minute') ?? '00';
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toVnDatetimeLocal(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return getNowVnDatetimeLocal();
  }
  return getNowVnDatetimeLocal(parsed);
}

/**
 * Quy đổi số thập phân tối đa 3 chữ số sang số nguyên nghìn-phần để tính chênh lệch chính xác không lệch float.
 */
function parseScaledMilli(raw: string): number | null {
  const trimmed = raw.trim();
  if (!QTY_REGEX.test(trimmed)) {
    return null;
  }
  const [intPart, fracPart = ''] = trimmed.split('.');
  const fracPadded = fracPart.padEnd(3, '0');
  return Number(intPart) * 1000 + Number(fracPadded);
}

function formatScaledMilliDelta(diffMilli: number): {
  label: string;
  className: string;
} {
  if (diffMilli === 0) {
    return { label: '0', className: 'text-[var(--text-muted)]' };
  }
  const absStr = (Math.abs(diffMilli) / 1000).toString();
  if (diffMilli > 0) {
    return {
      label: `+${formatQuantity(absStr)}`,
      className: 'text-[var(--risk-low-fg)]',
    };
  }
  return {
    label: `-${formatQuantity(absStr)}`,
    className: 'text-[var(--risk-critical-fg)]',
  };
}

const stockCountRowSchema = z.object({
  lotId: z.string(),
  countedQty: z.string(),
  reason: z.string(),
});

function buildStockCountSchema(systemQtyLookup: (lotId: string) => string | undefined) {
  return z
    .object({
      countedAt: z
        .string()
        .regex(DATETIME_LOCAL_REGEX, 'Vui lòng chọn thời điểm kiểm kê hợp lệ'),
      note: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự'),
      items: z
        .array(stockCountRowSchema)
        .min(1, 'Phiếu kiểm kê phải có ít nhất 1 dòng lô hàng'),
    })
    .superRefine((data, ctx) => {
      const seenLots = new Set<string>();

      data.items.forEach((item, index) => {
        if (!item.lotId) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'lotId'],
            message: 'Vui lòng chọn lô hàng',
          });
        } else if (seenLots.has(item.lotId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'lotId'],
            message: 'Lô hàng bị trùng trong phiếu kiểm kê',
          });
        } else {
          seenLots.add(item.lotId);
        }

        const countedMilli = parseScaledMilli(item.countedQty);
        if (countedMilli === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'countedQty'],
            message: 'Số lượng đếm phải lớn hơn hoặc bằng 0 (tối đa 3 số thập phân)',
          });
          return;
        }

        const systemStr = item.lotId ? systemQtyLookup(item.lotId) : undefined;
        const systemMilli = systemStr !== undefined ? parseScaledMilli(systemStr) : null;
        if (systemMilli !== null && countedMilli !== systemMilli && item.reason.trim() === '') {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'reason'],
            message: 'Bắt buộc nhập lý do khi số đếm chênh lệch với tồn hệ thống',
          });
        }

        if (item.reason.trim().length > 500) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'reason'],
            message: 'Lý do chênh lệch tối đa 500 ký tự',
          });
        }
      });
    });
}

type StockCountFormValues = {
  countedAt: string;
  note: string;
  items: Array<{
    lotId: string;
    countedQty: string;
    reason: string;
  }>;
};

export interface StockCountFormPageProps {
  mode: 'create' | 'edit';
}

export function StockCountFormPage({ mode }: StockCountFormPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initializedEditId = useRef<string | null>(null);

  const isEdit = mode === 'edit';

  const lotsQuery = useInventoryLotsQuery({ includeEmpty: true, page: 1, pageSize: 100 });
  const existingQuery = useStockCountQuery(isEdit ? id : undefined);
  const createMutation = useCreateStockCountMutation();
  const updateMutation = useUpdateStockCountMutation(id ?? '');

  const availableLots = useMemo(
    () => (lotsQuery.data?.items ?? []).filter((lot) => lot.lotStatus !== 'closed'),
    [lotsQuery.data?.items],
  );

  const lotById = useMemo(() => {
    const map = new Map<string, InventoryLotItem>();
    for (const lot of availableLots) {
      map.set(lot.lotId, lot);
    }
    return map;
  }, [availableLots]);

  const existingSystemQtyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of existingQuery.data?.items ?? []) {
      map.set(item.lotId, item.systemQty);
    }
    return map;
  }, [existingQuery.data?.items]);

  const getSystemQtyForLot = useMemo(
    () => (lotId: string): string | undefined => {
      if (isEdit && existingSystemQtyMap.has(lotId)) {
        return existingSystemQtyMap.get(lotId);
      }
      return lotById.get(lotId)?.onHandQty;
    },
    [isEdit, existingSystemQtyMap, lotById],
  );

  const schema = useMemo(
    () => buildStockCountSchema(getSystemQtyForLot),
    [getSystemQtyForLot],
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<StockCountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      countedAt: getNowVnDatetimeLocal(),
      note: '',
      items: [{ lotId: '', countedQty: '', reason: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  useEffect(() => {
    if (!isEdit || !existingQuery.data) {
      return;
    }
    if (initializedEditId.current === existingQuery.data.id) {
      return;
    }
    initializedEditId.current = existingQuery.data.id;
    reset({
      countedAt: toVnDatetimeLocal(existingQuery.data.countedAt),
      note: existingQuery.data.note ?? '',
      items: existingQuery.data.items.map((item) => ({
        lotId: item.lotId,
        countedQty: item.countedQty,
        reason: item.reason ?? '',
      })),
    });
  }, [isEdit, existingQuery.data, reset]);

  const watchedItems = watch('items');
  const selectedLotIds = useMemo(
    () => new Set(watchedItems.map((item) => item.lotId).filter(Boolean)),
    [watchedItems],
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const payload = {
      countedAt: `${values.countedAt}:00+07:00`,
      note: values.note.trim() ? values.note.trim() : null,
      items: values.items.map((item) => ({
        lotId: item.lotId,
        countedQty: item.countedQty.trim(),
        reason: item.reason.trim() ? item.reason.trim() : null,
      })),
    };

    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);
      showToast(
        isEdit
          ? `Đã cập nhật phiếu kiểm kê ${saved.countNo}.`
          : `Đã lưu phiếu kiểm kê nháp ${saved.countNo}. Tồn kho chưa thay đổi.`,
      );
      navigate(`/stock-counts/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.errors && error.errors.length > 0) {
          for (const fieldError of error.errors) {
            if (
              fieldError.field === 'countedAt' ||
              fieldError.field === 'note' ||
              fieldError.field.startsWith('items.')
            ) {
              setError(fieldError.field as keyof StockCountFormValues, {
                message: fieldError.message,
              });
            }
          }
        }
        setSubmitError(error.message);
      } else {
        setSubmitError('Không thể lưu phiếu kiểm kê. Vui lòng thử lại.');
      }
    }
  });

  if (isEdit && existingQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Sửa phiếu kiểm kê" description="Đang tải dữ liệu phiếu..." />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải phiếu kiểm kê...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEdit && existingQuery.data && existingQuery.data.status !== 'draft') {
    return (
      <div className="space-y-5">
        <PageHeader
          title={`Phiếu kiểm kê ${existingQuery.data.countNo}`}
          description="Phiếu không còn ở trạng thái nháp"
        />
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-[var(--text)]">
              Chỉ được chỉnh sửa phiếu kiểm kê ở trạng thái nháp.
            </p>
            <Button asChild variant="secondary">
              <Link to={`/stock-counts/${existingQuery.data.id}`}>Quay lại chi tiết phiếu</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-6">
      <PageHeader
        title={
          isEdit
            ? `Sửa phiếu kiểm kê ${existingQuery.data?.countNo ?? ''}`
            : 'Lập phiếu kiểm kê kho'
        }
        description="Đối chiếu số đếm với tồn theo lô"
        actions={
          <>
            <Button type="button" variant="outline" asChild>
              <Link to={isEdit && id ? `/stock-counts/${id}` : '/stock-counts'}>Quay lại</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? 'Đang lưu...'
                : isEdit
                  ? 'Lưu thay đổi'
                  : 'Lưu phiếu nháp'}
            </Button>
          </>
        }
      />

      <div
        role="note"
        className="rounded-lg border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm text-[var(--text)]"
      >
        Tồn kho được cập nhật theo số đếm sau khi duyệt.
      </div>

      {submitError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-4 py-3 text-sm text-[var(--risk-critical-fg)]"
        >
          {submitError}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border py-4">
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="stock-count-counted-at">
              Thời điểm kiểm kê <span className="text-[var(--risk-critical-fg)]">*</span>
            </Label>
            <Input
              id="stock-count-counted-at"
              type="datetime-local"
              aria-invalid={errors.countedAt ? 'true' : 'false'}
              aria-describedby={errors.countedAt ? 'stock-count-counted-at-error' : undefined}
              {...register('countedAt')}
            />
            {errors.countedAt && (
              <p
                id="stock-count-counted-at-error"
                className="text-xs text-[var(--risk-critical-fg)]"
              >
                {errors.countedAt.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stock-count-note">Ghi chú</Label>
            <Input
              id="stock-count-note"
              type="text"
              placeholder="Ví dụ: Kiểm kê định kỳ cuối tháng khu A"
              aria-invalid={errors.note ? 'true' : 'false'}
              aria-describedby={errors.note ? 'stock-count-note-error' : undefined}
              {...register('note')}
            />
            {errors.note && (
              <p id="stock-count-note-error" className="text-xs text-[var(--risk-critical-fg)]">
                {errors.note.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border py-4">
          <CardTitle>Danh sách lô kiểm kê</CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => append({ lotId: '', countedQty: '', reason: '' })}
          >
            Thêm dòng
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {errors.items?.root?.message && (
            <p className="px-5 pt-4 text-xs text-[var(--risk-critical-fg)]">
              {errors.items.root.message}
            </p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Lô hàng</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Tồn hệ thống</TableHead>
                  <TableHead className="w-36 text-right whitespace-nowrap">Số đếm</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Chênh lệch</TableHead>
                  <TableHead className="min-w-[220px]">Lý do (bắt buộc khi lệch)</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const rowValue = watchedItems[index] ?? {
                    lotId: '',
                    countedQty: '',
                    reason: '',
                  };
                  const selectedLot = rowValue.lotId ? lotById.get(rowValue.lotId) : undefined;
                  const systemQtyStr = rowValue.lotId
                    ? getSystemQtyForLot(rowValue.lotId)
                    : undefined;
                  const systemMilli =
                    systemQtyStr !== undefined ? parseScaledMilli(systemQtyStr) : null;
                  const countedMilli = parseScaledMilli(rowValue.countedQty ?? '');
                  const diffMilli =
                    systemMilli !== null && countedMilli !== null
                      ? countedMilli - systemMilli
                      : null;
                  const diffDisplay =
                    diffMilli !== null ? formatScaledMilliDelta(diffMilli) : null;
                  const requiresReason = diffMilli !== null && diffMilli !== 0;

                  const lotError = errors.items?.[index]?.lotId?.message;
                  const countedError = errors.items?.[index]?.countedQty?.message;
                  const reasonError = errors.items?.[index]?.reason?.message;

                  return (
                    <TableRow key={field.id}>
                      <TableCell className="align-top">
                        <Select
                          aria-label={`Lô hàng dòng ${index + 1}`}
                          aria-invalid={lotError ? 'true' : 'false'}
                          aria-describedby={lotError ? `item-${index}-lot-error` : undefined}
                          {...register(`items.${index}.lotId`)}
                        >
                          <option value="">-- Chọn lô hàng --</option>
                          {availableLots.map((lot) => {
                            const usedInOtherRow =
                              lot.lotId !== rowValue.lotId && selectedLotIds.has(lot.lotId);
                            return (
                              <option
                                key={lot.lotId}
                                value={lot.lotId}
                                disabled={usedInOtherRow}
                              >
                                {lot.product.code} · {lot.lotCode} (HSD {formatDate(lot.expiryDate)}
                                {' · '}Tồn {formatQuantity(lot.onHandQty)} {lot.product.unit})
                              </option>
                            );
                          })}
                        </Select>
                        {lotError && (
                          <p
                            id={`item-${index}-lot-error`}
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {lotError}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="align-top pt-4 text-right tabular-nums whitespace-nowrap">
                        {systemQtyStr !== undefined ? (
                          <span>
                            {formatQuantity(systemQtyStr)}{' '}
                            <span className="text-xs text-[var(--text-muted)]">
                              {selectedLot?.product.unit ?? ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Số đếm dòng ${index + 1}`}
                          aria-invalid={countedError ? 'true' : 'false'}
                          aria-describedby={
                            countedError ? `item-${index}-counted-error` : undefined
                          }
                          className="text-right tabular-nums"
                          {...register(`items.${index}.countedQty`)}
                        />
                        {countedError && (
                          <p
                            id={`item-${index}-counted-error`}
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {countedError}
                          </p>
                        )}
                      </TableCell>

                      <TableCell
                        data-testid={`variance-row-${index}`}
                        className="align-top pt-4 text-right font-medium tabular-nums whitespace-nowrap"
                      >
                        {diffDisplay ? (
                          <span className={diffDisplay.className}>{diffDisplay.label}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <Input
                          type="text"
                          placeholder={
                            requiresReason
                              ? 'Bắt buộc nhập lý do chênh lệch'
                              : 'Không bắt buộc nếu khớp tồn'
                          }
                          aria-label={`Lý do dòng ${index + 1}`}
                          aria-invalid={reasonError ? 'true' : 'false'}
                          aria-describedby={
                            reasonError ? `item-${index}-reason-error` : undefined
                          }
                          {...register(`items.${index}.reason`)}
                        />
                        {reasonError && (
                          <p
                            id={`item-${index}-reason-error`}
                            className="mt-1 text-xs text-[var(--risk-critical-fg)]"
                          >
                            {reasonError}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="align-top text-right">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Xóa dòng ${index + 1}`}
                            onClick={() => remove(index)}
                          >
                            Xóa
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
