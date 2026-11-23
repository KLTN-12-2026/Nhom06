import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { useOutboundReceiptsQuery } from '@/features/outbound/hooks';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatQuantity, getVnTodayIso } from '@/lib/format';
import {
  EXECUTION_STATUS_META,
  getAllowedNextStatuses,
  isDisposalAction,
  isLinkableOrderAction,
} from '../constants';
import {
  useCreateExecutionDisposalMutation,
  useLinkExecutionOutboundMutation,
  useRecordExecutionUpdateMutation,
} from '../hooks';
import { type ExecutionItem, type ExecutionStatus } from '../types';

const DECIMAL_RE = /^\d+(\.\d{1,3})?$/;

const updateSchema = z
  .object({
    status: z.enum(['in_progress', 'completed', 'failed', 'cancelled']),
    actualQtyDelta: z
      .string()
      .trim()
      .refine((v) => v === '' || (DECIMAL_RE.test(v) && Number(v) >= 0), {
        message: 'Lượng thực tế phải lớn hơn hoặc bằng 0 (tối đa 3 chữ số thập phân)',
      }),
    occurredOn: z.string().trim(),
    note: z.string(),
  })
  .superRefine((values, ctx) => {
    if (
      (values.status === 'failed' || values.status === 'cancelled') &&
      values.note.trim().length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Vui lòng nhập ghi chú khi đánh dấu không thực hiện được hoặc hủy',
      });
    }
  });

type UpdateFormValues = z.infer<typeof updateSchema>;

export interface ExecutionResultDialogProps {
  execution: ExecutionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExecutionResultDialog({
  execution,
  open,
  onOpenChange,
}: ExecutionResultDialogProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const updateMutation = useRecordExecutionUpdateMutation();
  const disposalMutation = useCreateExecutionDisposalMutation();
  const linkOutboundMutation = useLinkExecutionOutboundMutation();

  const [formError, setFormError] = useState<string | null>(null);
  const [disposalQty, setDisposalQty] = useState('');
  const [disposalNotes, setDisposalNotes] = useState('');
  const [disposalError, setDisposalError] = useState<string | null>(null);
  const [confirmDisposalOpen, setConfirmDisposalOpen] = useState(false);

  const [selectedOutboundId, setSelectedOutboundId] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const allowedStatuses = useMemo(
    () => (execution ? getAllowedNextStatuses(execution.status) : []),
    [execution],
  );

  const defaultStatus: 'in_progress' | 'completed' | 'failed' | 'cancelled' =
    execution?.status === 'in_progress' ? 'in_progress' : 'in_progress';

  const form = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: defaultStatus,
      actualQtyDelta: '',
      occurredOn: getVnTodayIso(),
      note: '',
    },
  });

  const showDisposalSection = Boolean(
    execution &&
      isDisposalAction(execution.proposal.actionType) &&
      hasPermission('executions.update') &&
      hasPermission('outbound.confirm'),
  );
  const showLinkOutboundSection = Boolean(
    execution &&
      isLinkableOrderAction(execution.proposal.actionType) &&
      hasPermission('executions.update'),
  );

  const orderOutboundsQuery = useOutboundReceiptsQuery(
    {
      type: 'ORDER',
      lotId: execution?.lot.id,
      pageSize: 50,
    },
    { enabled: open && showLinkOutboundSection && Boolean(execution?.lot.id) },
  );

  const linkedIds = useMemo(
    () => new Set((execution?.linkedOutbounds ?? []).map((item) => item.id)),
    [execution],
  );

  const availableOrderOutbounds = useMemo(
    () => (orderOutboundsQuery.data?.items ?? []).filter((item) => !linkedIds.has(item.id)),
    [orderOutboundsQuery.data?.items, linkedIds],
  );

  useEffect(() => {
    if (!open || !execution) {
      return;
    }
    form.reset({
      status: execution.status === 'planned' ? 'in_progress' : 'in_progress',
      actualQtyDelta: '',
      occurredOn: getVnTodayIso(),
      note: '',
    });
    setFormError(null);
    setDisposalError(null);
    setDisposalNotes('');
    setConfirmDisposalOpen(false);
    setSelectedOutboundId('');
    setLinkError(null);

    const onHandNum = Number(execution.lot.currentOnHandQty);
    const remainingNum = Number(execution.remainingQty);
    const suggested = Math.max(0, Math.min(onHandNum, remainingNum));
    setDisposalQty(suggested > 0 ? String(suggested) : '');
  }, [open, execution, form]);

  if (!execution) {
    return null;
  }

  const isBusy =
    updateMutation.isPending || disposalMutation.isPending || linkOutboundMutation.isPending;
  const selectedStatus = form.watch('status');
  const deltaRaw = form.watch('actualQtyDelta');
  const plannedNum = Number(execution.plannedQty);
  const currentActualNum = execution.actualQty !== null ? Number(execution.actualQty) : 0;
  const deltaNum = deltaRaw && DECIMAL_RE.test(deltaRaw.trim()) ? Number(deltaRaw.trim()) : 0;
  const exceedsPlanned = currentActualNum + deltaNum > plannedNum;
  const noteRequired =
    selectedStatus === 'failed' || selectedStatus === 'cancelled' || exceedsPlanned;

  const isReturnAction = execution.proposal.actionType === 'RETURN_TO_SUPPLIER';
  const disposalActionLabel = isReturnAction ? 'Lập phiếu trả NCC' : 'Lập phiếu hủy';
  const disposalTypeLabel = isReturnAction ? 'Trả nhà cung cấp' : 'Xuất hủy';

  const onSubmitUpdate = form.handleSubmit(async (values) => {
    setFormError(null);
    if (exceedsPlanned && values.note.trim().length === 0) {
      form.setError('note', {
        type: 'manual',
        message: 'Tổng lượng thực tế vượt lượng đề xuất, vui lòng nhập ghi chú lý do',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: execution.id,
        payload: {
          status: values.status as ExecutionStatus,
          ...(values.actualQtyDelta.trim() !== ''
            ? { actualQtyDelta: values.actualQtyDelta.trim() }
            : {}),
          note: values.note.trim().length > 0 ? values.note.trim() : null,
          ...(values.occurredOn.trim() !== '' ? { occurredOn: values.occurredOn.trim() } : {}),
        },
      });
      showToast('Đã cập nhật kết quả thực hiện phương án.');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        let mapped = false;
        for (const item of error.errors ?? []) {
          if (
            item.field === 'status' ||
            item.field === 'actualQtyDelta' ||
            item.field === 'note' ||
            item.field === 'occurredOn'
          ) {
            form.setError(item.field, { type: 'server', message: item.message });
            mapped = true;
          }
        }
        if (!mapped) {
          setFormError(error.message);
        }
        return;
      }
      setFormError('Không thể lưu kết quả thực hiện. Vui lòng thử lại.');
    }
  });

  const handleRequestDisposal = () => {
    const trimmed = disposalQty.trim();
    if (!trimmed || !DECIMAL_RE.test(trimmed) || Number(trimmed) <= 0) {
      setDisposalError('Số lượng xuất phải lớn hơn 0 và tối đa 3 chữ số thập phân.');
      return;
    }
    setDisposalError(null);
    setConfirmDisposalOpen(true);
  };

  const handleConfirmDisposal = async () => {
    try {
      const res = await disposalMutation.mutateAsync({
        id: execution.id,
        payload: {
          quantity: disposalQty.trim(),
          notes: disposalNotes.trim().length > 0 ? disposalNotes.trim() : null,
        },
      });
      setConfirmDisposalOpen(false);
      showToast(
        `Đã lập ${disposalTypeLabel.toLowerCase()} ${res.outboundReceipt.outboundNo} và cập nhật tiến độ.`,
      );
      onOpenChange(false);
    } catch (error) {
      setConfirmDisposalOpen(false);
      setDisposalError(
        error instanceof ApiError
          ? error.message
          : 'Không thể lập phiếu xuất. Vui lòng kiểm tra tồn kho và thử lại.',
      );
    }
  };

  const handleLinkOutbound = async () => {
    if (!selectedOutboundId) {
      setLinkError('Vui lòng chọn một phiếu xuất theo đơn để liên kết.');
      return;
    }
    setLinkError(null);
    try {
      await linkOutboundMutation.mutateAsync({
        id: execution.id,
        payload: { outboundReceiptId: selectedOutboundId },
      });
      showToast('Đã liên kết phiếu xuất theo đơn vào kết quả thực hiện.');
      onOpenChange(false);
    } catch (error) {
      setLinkError(
        error instanceof ApiError
          ? error.message
          : 'Không thể liên kết phiếu xuất lúc này. Vui lòng thử lại.',
      );
    }
  };

  const statusError = form.formState.errors.status?.message;
  const deltaError = form.formState.errors.actualQtyDelta?.message;
  const dateError = form.formState.errors.occurredOn?.message;
  const noteError = form.formState.errors.note?.message;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ghi kết quả thực hiện</DialogTitle>
            <DialogDescription>
              Lô {execution.lot.lotCode} · {execution.product.code} — {execution.product.name}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-[var(--surface-muted)] p-3 text-xs sm:grid-cols-3">
            <div>
              <div className="text-[var(--text-muted)]">Phương án</div>
              <div className="mt-0.5 font-medium text-[var(--text)]">
                {execution.proposal.actionLabel}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Đã xử lý / Đề xuất</div>
              <div className="mt-0.5 font-medium tabular-nums text-[var(--text)]">
                {execution.actualQty !== null ? formatQuantity(execution.actualQty) : '0'} /{' '}
                {formatQuantity(execution.plannedQty)} {execution.product.unit}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Tồn lô hiện tại</div>
              <div className="mt-0.5 font-medium tabular-nums text-[var(--text)]">
                {formatQuantity(execution.lot.currentOnHandQty)} {execution.product.unit}
              </div>
            </div>
          </div>

          {/* Phần 1: Ghi nhận tiến độ thủ công (không làm đổi tồn kho) */}
          <form onSubmit={onSubmitUpdate} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exec-status">Tiến độ thực hiện</Label>
              <Select
                id="exec-status"
                aria-invalid={statusError ? 'true' : 'false'}
                aria-describedby={statusError ? 'exec-status-error' : undefined}
                disabled={isBusy}
                {...form.register('status')}
              >
                {allowedStatuses.map((status) => (
                  <option key={status} value={status}>
                    {EXECUTION_STATUS_META[status].label}
                  </option>
                ))}
              </Select>
              {statusError && (
                <p id="exec-status-error" className="text-xs text-[var(--risk-critical-fg)]">
                  {statusError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="exec-qty-delta">
                  Lượng thực tế ghi nhận thêm ({execution.product.unit})
                </Label>
                <Input
                  id="exec-qty-delta"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ví dụ: 120"
                  aria-invalid={deltaError ? 'true' : 'false'}
                  aria-describedby={deltaError ? 'exec-qty-delta-error' : undefined}
                  disabled={isBusy}
                  {...form.register('actualQtyDelta')}
                />
                {deltaError && (
                  <p id="exec-qty-delta-error" className="text-xs text-[var(--risk-critical-fg)]">
                    {deltaError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exec-occurred-on">Ngày thực hiện</Label>
                <Input
                  id="exec-occurred-on"
                  type="date"
                  aria-invalid={dateError ? 'true' : 'false'}
                  aria-describedby={dateError ? 'exec-occurred-on-error' : undefined}
                  disabled={isBusy}
                  {...form.register('occurredOn')}
                />
                {dateError && (
                  <p id="exec-occurred-on-error" className="text-xs text-[var(--risk-critical-fg)]">
                    {dateError}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exec-note">
                Ghi chú{noteRequired ? ' (bắt buộc)' : ' (tùy chọn)'}
              </Label>
              <textarea
                id="exec-note"
                rows={3}
                disabled={isBusy}
                aria-invalid={noteError ? 'true' : 'false'}
                aria-describedby={noteError ? 'exec-note-error' : undefined}
                placeholder="Ghi lại kết quả làm việc với đại lý hoặc lý do thay đổi tiến độ"
                className="w-full rounded-md border border-border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)] disabled:cursor-not-allowed disabled:opacity-60"
                {...form.register('note')}
              />
              {noteError && (
                <p id="exec-note-error" role="alert" className="text-xs text-[var(--risk-critical-fg)]">
                  {noteError}
                </p>
              )}
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-3 py-2 text-xs text-[var(--risk-critical-fg)]"
              >
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => onOpenChange(false)}
              >
                Đóng
              </Button>
              <Button type="submit" disabled={isBusy}>
                {updateMutation.isPending ? 'Đang lưu...' : 'Lưu kết quả'}
              </Button>
            </DialogFooter>
          </form>

          {/* Phần 2A: Lập phiếu hủy / phiếu trả NCC (chỉ DISPOSE / RETURN_TO_SUPPLIER) */}
          {showDisposalSection && (
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Chứng từ xuất giảm tồn kho ({disposalTypeLabel})
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Tạo trực tiếp phiếu xuất đã xác nhận cho lô {execution.lot.lotCode} (cho phép lô
                  hết hạn hoặc bị khóa). Tồn lô giảm ngay và ghi sổ biến động.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="exec-disposal-qty">
                    Số lượng xuất ({execution.product.unit})
                  </Label>
                  <Input
                    id="exec-disposal-qty"
                    type="text"
                    inputMode="decimal"
                    value={disposalQty}
                    onChange={(e) => {
                      setDisposalQty(e.target.value);
                      if (disposalError) {
                        setDisposalError(null);
                      }
                    }}
                    aria-invalid={disposalError ? 'true' : 'false'}
                    aria-describedby={disposalError ? 'exec-disposal-error' : undefined}
                    disabled={isBusy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exec-disposal-notes">Ghi chú phiếu xuất</Label>
                  <Input
                    id="exec-disposal-notes"
                    type="text"
                    value={disposalNotes}
                    onChange={(e) => setDisposalNotes(e.target.value)}
                    placeholder="Số biên bản hoặc lý do xuất"
                    disabled={isBusy}
                  />
                </div>
              </div>

              {disposalError && (
                <p
                  id="exec-disposal-error"
                  role="alert"
                  className="text-xs text-[var(--risk-critical-fg)]"
                >
                  {disposalError}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isBusy}
                  onClick={handleRequestDisposal}
                >
                  {disposalActionLabel}
                </Button>
              </div>
            </div>
          )}

          {/* Phần 2B: Liên kết phiếu xuất ORDER đã xác nhận (chỉ CONTACT_AGENCY / PRIORITIZE_FEFO) */}
          {showLinkOutboundSection && (
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">Phiếu xuất liên quan</h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Chọn phiếu xuất theo đơn hàng (ORDER) đã xác nhận có chứa lô{' '}
                  {execution.lot.lotCode}. Lượng thực tế sẽ cộng đúng theo số lượng lô trong phiếu,
                  không trừ tồn thêm.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exec-link-outbound">Chọn phiếu xuất ORDER</Label>
                <Select
                  id="exec-link-outbound"
                  value={selectedOutboundId}
                  onChange={(e) => {
                    setSelectedOutboundId(e.target.value);
                    if (linkError) {
                      setLinkError(null);
                    }
                  }}
                  aria-invalid={linkError ? 'true' : 'false'}
                  aria-describedby={linkError ? 'exec-link-error' : undefined}
                  disabled={isBusy || orderOutboundsQuery.isLoading}
                >
                  <option value="">
                    {orderOutboundsQuery.isLoading
                      ? 'Đang tải danh sách phiếu xuất...'
                      : availableOrderOutbounds.length === 0
                        ? 'Chưa có phiếu xuất ORDER phù hợp chưa liên kết'
                        : '-- Chọn phiếu xuất ORDER --'}
                  </option>
                  {availableOrderOutbounds.map((receipt) => (
                    <option key={receipt.id} value={receipt.id}>
                      {receipt.outboundNo}
                      {receipt.order ? ` · ${receipt.order.orderNo} (${receipt.order.agency.name})` : ''}
                      {receipt.matchedLotQty
                        ? ` · ${formatQuantity(receipt.matchedLotQty)} ${execution.product.unit}`
                        : ''}
                      {receipt.confirmedAt ? ` · ${formatDateTime(receipt.confirmedAt)}` : ''}
                    </option>
                  ))}
                </Select>
                {linkError && (
                  <p
                    id="exec-link-error"
                    role="alert"
                    className="text-xs text-[var(--risk-critical-fg)]"
                  >
                    {linkError}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isBusy || availableOrderOutbounds.length === 0}
                  onClick={() => void handleLinkOutbound()}
                >
                  {linkOutboundMutation.isPending ? 'Đang liên kết...' : 'Liên kết phiếu xuất'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDisposalOpen}
        onOpenChange={(next) => !disposalMutation.isPending && setConfirmDisposalOpen(next)}
        title={`Xác nhận ${disposalActionLabel.toLowerCase()}?`}
        description={`Tồn lô ${execution.lot.lotCode} sẽ giảm ${formatQuantity(disposalQty)} ${execution.product.unit} bằng phiếu xuất ${disposalTypeLabel}. Thao tác này ghi sổ biến động tồn kho và không thể hoàn tác.`}
        confirmLabel={disposalActionLabel}
        cancelLabel="Quay lại"
        variant="destructive"
        isPending={disposalMutation.isPending}
        onConfirm={() => void handleConfirmDisposal()}
      />
    </>
  );
}
