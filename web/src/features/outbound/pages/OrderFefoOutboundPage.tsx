import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ExpiryBar } from '@/components/common/ExpiryBar';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { formatDate, formatQuantity } from '@/lib/format';
import { FefoStepBar } from '../components/FefoStepBar';
import { useConfirmOrderOutboundMutation, useOrderFefoPlanQuery } from '../hooks';

const QTY_PATTERN = /^\d+(\.\d{1,3})?$/;

/** Quy đổi chuỗi số thập phân tối đa 3 chữ số sang số nguyên phần nghìn để cộng/so sánh không lệch float. */
function parseMilli(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 0;
  }
  if (!QTY_PATTERN.test(trimmed)) {
    return null;
  }
  const [intPart, fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(3, '0');
  const value = Number(intPart) * 1000 + Number(paddedFrac);
  return Number.isSafeInteger(value) ? value : null;
}

function formatMilliToDecimalString(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const frac = milli % 1000;
  if (frac === 0) {
    return String(whole);
  }
  return `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}

export function OrderFefoOutboundPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canConfirm = hasPermission('outbound.create') && hasPermission('outbound.confirm');

  const planQuery = useOrderFefoPlanQuery(id);
  const confirmMutation = useConfirmOrderOutboundMutation(id ?? '');

  const [qtyByKey, setQtyByKey] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const plan = planQuery.data;

  // Khởi tạo / cập nhật lại gợi ý FEFO mỗi lần tải kế hoạch mới (kể cả sau khi 409 refetch)
  useEffect(() => {
    if (!plan) {
      return;
    }
    const next: Record<string, string> = {};
    for (const item of plan.items) {
      for (const lot of item.lots) {
        next[`${item.orderItemId}::${lot.lotId}`] = lot.allocateQty;
      }
    }
    setQtyByKey(next);
  }, [plan, planQuery.dataUpdatedAt]);

  const validation = useMemo(() => {
    const lotErrors: Record<string, string> = {};
    const itemErrors: Record<string, string> = {};
    const itemWarnings: Record<string, string[]> = {};
    const itemSelectedMilli: Record<string, number> = {};
    let totalSelectedMilli = 0;
    let totalRemainingMilli = 0;
    let selectedLotCount = 0;

    if (!plan) {
      return {
        lotErrors,
        itemErrors,
        itemWarnings,
        itemSelectedMilli,
        totalSelectedMilli,
        totalRemainingMilli,
        selectedLotCount,
        hasError: false,
      };
    }

    for (const item of plan.items) {
      const remainingMilli = parseMilli(item.remainingQty) ?? 0;
      totalRemainingMilli += remainingMilli;
      let sumForItem = 0;
      let itemHasFormatError = false;

      const selectedByLotId = new Map<string, number>();

      for (const lot of item.lots) {
        const key = `${item.orderItemId}::${lot.lotId}`;
        const rawVal = qtyByKey[key] ?? lot.allocateQty;
        const parsed = parseMilli(rawVal);
        const onHandMilli = parseMilli(lot.onHandQty) ?? 0;

        if (parsed === null) {
          lotErrors[key] = 'Số lượng không hợp lệ (tối đa 3 số thập phân)';
          itemHasFormatError = true;
          selectedByLotId.set(lot.lotId, 0);
          continue;
        }
        if (parsed > onHandMilli) {
          lotErrors[key] = `Lượng xuất không được vượt tồn khả dụng của lô (${formatQuantity(lot.onHandQty)})`;
        }
        selectedByLotId.set(lot.lotId, parsed);
        sumForItem += parsed;
        if (parsed > 0) {
          selectedLotCount += 1;
        }
      }

      itemSelectedMilli[item.orderItemId] = sumForItem;
      totalSelectedMilli += sumForItem;

      if (!itemHasFormatError && sumForItem > remainingMilli) {
        itemErrors[item.orderItemId] =
          `Tổng lượng xuất (${formatQuantity(formatMilliToDecimalString(sumForItem))}) vượt quá phần còn thiếu của dòng đơn (${formatQuantity(item.remainingQty)})`;
      }

      // Kiểm cảnh báo bỏ qua thứ tự FEFO (không chặn)
      const warningsForItem: string[] = [];
      for (let i = 0; i < item.lots.length; i += 1) {
        const current = item.lots[i];
        const currentSelected = selectedByLotId.get(current.lotId) ?? 0;
        if (currentSelected <= 0) {
          continue;
        }
        for (let j = 0; j < i; j += 1) {
          const earlier = item.lots[j];
          if (earlier.expiryDate >= current.expiryDate) {
            continue;
          }
          const earlierOnHand = parseMilli(earlier.onHandQty) ?? 0;
          const earlierSelected = selectedByLotId.get(earlier.lotId) ?? 0;
          if (earlierSelected < earlierOnHand) {
            warningsForItem.push(
              `Đang chọn xuất lô ${current.lotCode} (HSD ${formatDate(current.expiryDate)}) trong khi lô ${earlier.lotCode} (HSD sớm hơn ${formatDate(earlier.expiryDate)}) vẫn còn tồn khả dụng.`,
            );
            break;
          }
        }
      }
      if (warningsForItem.length > 0) {
        itemWarnings[item.orderItemId] = warningsForItem;
      }
    }

    const hasError = Object.keys(lotErrors).length > 0 || Object.keys(itemErrors).length > 0;

    return {
      lotErrors,
      itemErrors,
      itemWarnings,
      itemSelectedMilli,
      totalSelectedMilli,
      totalRemainingMilli,
      selectedLotCount,
      hasError,
    };
  }, [plan, qtyByKey]);

  const canSubmit =
    canConfirm &&
    !validation.hasError &&
    validation.totalSelectedMilli > 0 &&
    !confirmMutation.isPending;

  const isPartialShipment = validation.totalSelectedMilli < validation.totalRemainingMilli;
  const totalFefoWarnings = Object.values(validation.itemWarnings).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  const headerActions = useMemo(() => {
    if (!plan) {
      return undefined;
    }
    return (
      <>
        <Button type="button" variant="outline" asChild>
          <Link to={`/orders/${plan.orderId}`}>Huỷ</Link>
        </Button>
        {canConfirm && (
          <Button
            type="button"
            variant="default"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
          >
            Xác nhận xuất kho
          </Button>
        )}
      </>
    );
  }, [plan, canConfirm, canSubmit]);

  const handleConfirmOutbound = async () => {
    if (!plan) {
      return;
    }
    setActionError(null);

    const payloadItems: Array<{ orderItemId: string; lotId: string; quantity: string }> = [];
    for (const item of plan.items) {
      for (const lot of item.lots) {
        const key = `${item.orderItemId}::${lot.lotId}`;
        const parsed = parseMilli(qtyByKey[key] ?? lot.allocateQty);
        if (parsed && parsed > 0) {
          payloadItems.push({
            orderItemId: item.orderItemId,
            lotId: lot.lotId,
            quantity: formatMilliToDecimalString(parsed),
          });
        }
      }
    }

    try {
      const created = await confirmMutation.mutateAsync({
        items: payloadItems,
        notes: notes.trim() || null,
      });
      setConfirmOpen(false);
      const statusNote =
        created.orderStatus === 'partial'
          ? ' Đơn chuyển trạng thái Xuất một phần.'
          : ' Đơn đã xuất đủ.';
      showToast(`Đã xác nhận phiếu xuất ${created.outboundNo}. Tồn kho đã cập nhật.${statusNote}`);
      navigate(`/outbound/${created.id}`, { replace: true });
    } catch (error) {
      setConfirmOpen(false);
      if (error instanceof ApiError) {
        setActionError(error.message);
        showToast(error.message, 'error');
        if (error.statusCode === 409) {
          void planQuery.refetch();
        }
      } else {
        const fallback = 'Không thể xác nhận xuất kho. Vui lòng thử lại.';
        setActionError(fallback);
        showToast(fallback, 'error');
      }
    }
  };

  if (planQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Lập phiếu xuất kho" description="Đang tính gợi ý phân bổ FEFO..." />
        <Card>
          <CardContent className="p-6 text-sm text-[var(--text-muted)]">
            Đang tải kế hoạch phân bổ FEFO...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (planQuery.isError || !plan) {
    const errMsg =
      planQuery.error instanceof ApiError
        ? planQuery.error.message
        : 'Không thể tải kế hoạch phân bổ FEFO cho đơn hàng này.';
    return (
      <div className="space-y-5">
        <PageHeader title="Lập phiếu xuất kho" description="Không thể tạo bản phân bổ FEFO" />
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]"
        >
          {errMsg}{' '}
          <button type="button" onClick={() => void planQuery.refetch()} className="underline">
            Thử lại
          </button>
        </div>
        {id && (
          <Button variant="outline" asChild>
            <Link to={`/orders/${id}`}>Quay lại chi tiết đơn</Link>
          </Button>
        )}
      </div>
    );
  }

  const totalSelectedFormatted = formatQuantity(
    formatMilliToDecimalString(validation.totalSelectedMilli),
  );

  const confirmDialogDescription = [
    `Xuất tổng ${totalSelectedFormatted} đơn vị từ ${validation.selectedLotCount} lô cho đơn ${plan.orderNo}. Tồn kho sẽ giảm ngay và phiếu xuất đã xác nhận không thể sửa hay hủy.`,
    isPartialShipment
      ? 'Đơn chưa xuất đủ số lượng đặt và sẽ chuyển sang trạng thái Xuất một phần.'
      : 'Đơn sẽ chuyển sang trạng thái Đã xuất đủ.',
    totalFefoWarnings > 0
      ? `Lưu ý: có ${totalFefoWarnings} cảnh báo bỏ qua lô hạn dùng sớm hơn còn tồn.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Phiếu xuất cho đơn ${plan.orderNo}`}
        description={plan.agency.name}
        actions={headerActions}
      />

      {/* Thanh 4 bước minh họa (Mockup 15) */}
      <FefoStepBar />

      {/* Hộp ghi chú xanh giải thích lọc trước khi xếp FEFO (Mockup 15) */}
      <div className="rounded-md border border-[var(--note-border)] bg-[var(--note-bg)] px-4 py-3 text-sm text-[var(--text)]">
        Hệ thống loại các lô đã hết hạn và các lô còn dưới{' '}
        <strong>{plan.minDeliveryDays} ngày</strong> hạn dùng, rồi mới xếp phần còn lại theo hạn sử
        dụng tăng dần và rót lần lượt. Đây mới là <strong>bản phân bổ dự kiến</strong> — tồn kho
        chưa thay đổi cho đến khi bạn xác nhận.
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-4 py-3 text-sm text-[var(--risk-critical-fg)]"
        >
          {actionError}
        </div>
      )}

      {/* Mỗi mặt hàng đặt là một card (Mockup 15) */}
      <div className="space-y-6">
        {plan.items.map((item) => {
          const remainingMilli = parseMilli(item.remainingQty) ?? 0;
          const selectedMilli = validation.itemSelectedMilli[item.orderItemId] ?? 0;
          const selectedDisplay = formatQuantity(formatMilliToDecimalString(selectedMilli));
          const isShort = selectedMilli < remainingMilli;
          const itemError = validation.itemErrors[item.orderItemId];
          const itemWarnings = validation.itemWarnings[item.orderItemId] ?? [];

          return (
            <Card key={item.orderItemId}>
              <CardHeader className="flex flex-col gap-1 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base font-semibold text-[var(--text)]">
                  {item.product.code} — {item.product.name}
                </CardTitle>
                <div className="text-sm text-[var(--text-muted)]">
                  {Number(item.fulfilledQty) > 0 ? (
                    <>
                      Còn thiếu{' '}
                      <strong className="tabular-nums text-[var(--text)]">
                        {formatQuantity(item.remainingQty)}
                      </strong>{' '}
                      / Đặt{' '}
                      <span className="tabular-nums">{formatQuantity(item.requestedQty)}</span>{' '}
                      {item.product.unit}
                    </>
                  ) : (
                    <>
                      Đặt{' '}
                      <strong className="tabular-nums text-[var(--text)]">
                        {formatQuantity(item.requestedQty)}
                      </strong>{' '}
                      {item.product.unit}
                    </>
                  )}{' '}
                  · phân bổ được{' '}
                  <strong
                    className={`tabular-nums ${
                      isShort ? 'text-[var(--risk-critical-fg)]' : 'text-[var(--risk-low-fg)]'
                    }`}
                  >
                    {selectedDisplay}
                  </strong>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {itemError && (
                  <div
                    role="alert"
                    className="border-b border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] px-6 py-2.5 text-xs font-medium text-[var(--risk-critical-fg)]"
                  >
                    {itemError}
                  </div>
                )}

                {itemWarnings.length > 0 && (
                  <div
                    role="status"
                    className="border-b border-[var(--border)] bg-[var(--risk-medium-bg)] px-6 py-2.5 text-xs text-[var(--risk-medium-fg)]"
                  >
                    {itemWarnings.map((warning) => (
                      <p key={warning}>Cảnh báo thứ tự FEFO: {warning}</p>
                    ))}
                  </div>
                )}

                {remainingMilli === 0 ? (
                  <p className="px-6 py-4 text-sm text-[var(--risk-low-fg)]">
                    Mặt hàng này đã xuất đủ số lượng đặt.
                  </p>
                ) : item.lots.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-[var(--risk-critical-fg)]">
                    Không có lô đủ điều kiện giao cho mặt hàng này.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-[var(--surface-muted)] text-left font-medium text-[var(--text-muted)]">
                          <th className="w-12 px-4 py-3 text-center">#</th>
                          <th className="px-4 py-3">Mã lô</th>
                          <th className="px-4 py-3">Hạn sử dụng</th>
                          <th className="px-4 py-3">Hạn dùng còn lại</th>
                          <th className="px-4 py-3 text-right">Tồn khả dụng</th>
                          <th className="w-40 px-4 py-3 text-right">Lượng xuất</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {item.lots.map((lot) => {
                          const key = `${item.orderItemId}::${lot.lotId}`;
                          const value = qtyByKey[key] ?? lot.allocateQty;
                          const errorMsg = validation.lotErrors[key];

                          return (
                            <tr key={lot.lotId} className="align-middle">
                              <td className="px-4 py-3 text-center tabular-nums text-[var(--text-muted)]">
                                {lot.rank}
                              </td>
                              <td className="px-4 py-3 font-medium text-[var(--text)]">
                                {lot.lotCode}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-[var(--text)]">
                                {formatDate(lot.expiryDate)}
                              </td>
                              <td className="px-4 py-3">
                                <ExpiryBar
                                  daysRemaining={lot.daysRemaining}
                                  severity={lot.severity}
                                />
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">
                                {formatQuantity(lot.onHandQty)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={`Lượng xuất lô ${lot.lotCode}`}
                                  aria-invalid={errorMsg ? 'true' : undefined}
                                  value={value}
                                  disabled={!canConfirm}
                                  onChange={(e) =>
                                    setQtyByKey((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  className="ml-auto h-9 w-28 text-right tabular-nums"
                                />
                                {errorMsg && (
                                  <p
                                    role="alert"
                                    className="mt-1 text-right text-xs text-[var(--risk-critical-fg)]"
                                  >
                                    {errorMsg}
                                  </p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Khối Lô bị loại trước khi xếp FEFO (Mockup 15) */}
                {item.excludedLots.length > 0 && (
                  <div className="border-t border-border bg-[var(--excluded-row-bg)]">
                    <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                      Lô bị loại trước khi xếp FEFO ({item.excludedLots.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] border-collapse text-sm">
                        <tbody className="divide-y divide-border">
                          {item.excludedLots.map((lot) => (
                            <tr key={lot.lotId} className="bg-[var(--excluded-row-bg)]">
                              <td className="w-12 px-4 py-3" />
                              <td className="px-4 py-3 font-medium text-[var(--text-muted)] line-through">
                                {lot.lotCode}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-[var(--text-muted)] line-through">
                                {formatDate(lot.expiryDate)}
                              </td>
                              <td className="px-4 py-3">
                                <ExpiryBar
                                  daysRemaining={lot.daysRemaining}
                                  severity={lot.severity}
                                />
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                                {formatQuantity(lot.onHandQty)}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)]">
                                {lot.reason}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Ghi chú phiếu xuất + Card tổng kết & xác nhận (Mockup 15) */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="outboundNotes">Ghi chú phiếu xuất (tùy chọn)</Label>
            <Input
              id="outboundNotes"
              placeholder="Biển số xe, người nhận hàng, ghi chú xuất kho..."
              value={notes}
              disabled={!canConfirm}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Tổng lượng sẽ xuất</p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--text)]">
                {totalSelectedFormatted}
              </p>
            </div>

            <div className="flex-1 rounded-md border border-[var(--border)] border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)] lg:max-w-lg">
              Khi xác nhận, hệ thống kiểm tra lại tồn ngay tại thời điểm đó trước khi trừ, để tránh
              hai người cùng xuất một lô.
            </div>

            {canConfirm && (
              <Button
                type="button"
                variant="default"
                disabled={!canSubmit}
                onClick={() => setConfirmOpen(true)}
                className="shrink-0"
              >
                Xác nhận xuất kho
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Xác nhận xuất kho cho đơn ${plan.orderNo}?`}
        description={confirmDialogDescription}
        confirmLabel="Xác nhận xuất kho"
        isPending={confirmMutation.isPending}
        onConfirm={() => void handleConfirmOutbound()}
      />
    </div>
  );
}
