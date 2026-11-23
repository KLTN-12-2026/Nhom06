import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MonthlyInOutChartCard } from '@/features/dashboard/components/MonthlyInOutChartCard';
import { useProductGroupsQuery } from '@/features/products/hooks';
import { formatQuantity } from '@/lib/format';
import { useMonthlyInOutQuery, useStockLedgerQuery } from '../hooks';
import { type StockLedgerParams } from '../types';

export interface StockLedgerTabProps {
  appliedFilters: Required<Pick<StockLedgerParams, 'from' | 'to'>> & { groupId: string };
  onApplyFilters: (next: { from: string; to: string; groupId: string }) => void;
}

function formatAdjustmentCell(raw: string): string {
  const num = Number(raw);
  if (Number.isNaN(num) || num === 0) {
    return '—';
  }
  return num > 0 ? `+${formatQuantity(num)}` : `-${formatQuantity(Math.abs(num))}`;
}

export function StockLedgerTab({ appliedFilters, onApplyFilters }: StockLedgerTabProps) {
  const [fromInput, setFromInput] = useState(appliedFilters.from);
  const [toInput, setToInput] = useState(appliedFilters.to);
  const [groupIdInput, setGroupIdInput] = useState(appliedFilters.groupId);
  const [filterError, setFilterError] = useState<string | null>(null);

  const groupsQuery = useProductGroupsQuery();
  const ledgerQuery = useStockLedgerQuery({
    from: appliedFilters.from,
    to: appliedFilters.to,
    groupId: appliedFilters.groupId || undefined,
  });
  const monthlyQuery = useMonthlyInOutQuery({
    months: 12,
    groupId: appliedFilters.groupId || undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromInput || !toInput) {
      setFilterError('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.');
      return;
    }
    if (fromInput > toInput) {
      setFilterError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
      return;
    }
    setFilterError(null);
    onApplyFilters({ from: fromInput, to: toInput, groupId: groupIdInput });
  };

  const data = ledgerQuery.data;

  return (
    <div className="space-y-6">
      {/* Bộ lọc kỳ báo cáo & nhóm hàng (bám mockup 28) */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[170px]">
            <label
              htmlFor="nxt-from"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Từ ngày
            </label>
            <Input
              id="nxt-from"
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
            />
          </div>

          <div className="w-[170px]">
            <label
              htmlFor="nxt-to"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Đến ngày
            </label>
            <Input
              id="nxt-to"
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
            />
          </div>

          <div className="w-[220px]">
            <label
              htmlFor="nxt-group"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Nhóm hàng
            </label>
            <Select
              id="nxt-group"
              value={groupIdInput}
              onChange={(e) => setGroupIdInput(e.target.value)}
            >
              <option value="">Tất cả</option>
              {(groupsQuery.data ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="submit"
            className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-90"
          >
            Xem báo cáo
          </Button>
        </div>

        {filterError && (
          <p className="text-xs font-medium text-[var(--risk-critical-fg)]">{filterError}</p>
        )}
      </form>

      {/* Biểu đồ biến động 12 tháng */}
      <MonthlyInOutChartCard
        title="Biến động 12 tháng"
        data={monthlyQuery.data}
        isLoading={monthlyQuery.isLoading}
        isError={monthlyQuery.isError}
        onRetry={() => void monthlyQuery.refetch()}
      />

      {/* Bảng Tổng hợp theo sản phẩm */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border py-4">
          <CardTitle className="text-lg font-semibold text-[var(--text)]">
            Tổng hợp theo sản phẩm
          </CardTitle>
          <span className="text-xs text-[var(--text-muted)]">
            Tồn cuối kỳ = tồn đầu kỳ + nhập − xuất ± điều chỉnh
          </span>
        </CardHeader>

        <CardContent className="p-0">
          {ledgerQuery.isLoading && (
            <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
              Đang tổng hợp số liệu nhập — xuất — tồn...
            </div>
          )}

          {ledgerQuery.isError && (
            <div className="m-6 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
              Không thể tải báo cáo nhập — xuất — tồn.{' '}
              <button
                type="button"
                onClick={() => void ledgerQuery.refetch()}
                className="underline"
              >
                Thử lại
              </button>
            </div>
          )}

          {!ledgerQuery.isLoading && !ledgerQuery.isError && data && data.items.length === 0 && (
            <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
              Chưa có dữ liệu nhập — xuất — tồn trong kỳ đã chọn.
            </div>
          )}

          {!ledgerQuery.isLoading && !ledgerQuery.isError && data && data.items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>ĐVT</TableHead>
                      <TableHead className="text-right">Tồn đầu kỳ</TableHead>
                      <TableHead className="text-right">Nhập</TableHead>
                      <TableHead className="text-right">Xuất</TableHead>
                      <TableHead className="text-right">Điều chỉnh</TableHead>
                      <TableHead className="text-right">Tồn cuối kỳ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((row) => {
                      const movementsUrl = `/stock-movements?productId=${encodeURIComponent(
                        row.product.id,
                      )}&from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}`;

                      return (
                        <TableRow key={row.product.id}>
                          <TableCell>
                            <Link
                              to={movementsUrl}
                              className="group inline-flex flex-wrap items-baseline gap-1.5"
                            >
                              <span className="font-medium text-[var(--text)] group-hover:text-[var(--info)] group-hover:underline">
                                {row.product.code}
                              </span>
                              <span className="text-[var(--text-muted)] group-hover:text-[var(--info)]">
                                {row.product.name}
                              </span>
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[var(--text-muted)]">
                            {row.product.unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--text)]">
                            {formatQuantity(row.opening)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--text)]">
                            {formatQuantity(row.inbound)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--text)]">
                            {formatQuantity(row.outbound)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--text-muted)]">
                            {formatAdjustmentCell(row.adjustment)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-[var(--text)]">
                            {formatQuantity(row.closing)}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {/* Dòng Tổng (tham khảo) */}
                    <TableRow className="border-t-2 border-border bg-[var(--surface-muted)]/40 font-semibold">
                      <TableCell className="font-semibold text-[var(--text)]">Tổng</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums text-[var(--text)]">
                        {formatQuantity(data.totals.opening)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-[var(--text)]">
                        {formatQuantity(data.totals.inbound)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-[var(--text)]">
                        {formatQuantity(data.totals.outbound)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-[var(--text)]">
                        {formatAdjustmentCell(data.totals.adjustment)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-[var(--text)]">
                        {formatQuantity(data.totals.closing)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="border-t border-border px-6 py-3 text-xs text-[var(--text-muted)]">
                Lưu ý: Dòng Tổng chỉ mang tính tham khảo, không dùng để so sánh giữa các mặt hàng có
                đơn vị tính khác nhau. Bấm vào từng sản phẩm để xem lịch sử biến động trong kỳ.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
