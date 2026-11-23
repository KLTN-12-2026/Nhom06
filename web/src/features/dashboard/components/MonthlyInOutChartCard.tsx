import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMonthShort, formatQuantity } from '@/lib/format';
import { type MonthlyInOutPoint } from '../types';

export interface MonthlyInOutChartCardProps {
  title: string;
  data?: MonthlyInOutPoint[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function MonthlyInOutChartCard({
  title,
  data,
  isLoading = false,
  isError = false,
  onRetry,
}: MonthlyInOutChartCardProps) {
  const chartData = useMemo(
    () =>
      (data ?? []).map((point) => ({
        month: point.month,
        label: formatMonthShort(point.month),
        inboundNum: Number(point.inbound) || 0,
        outboundNum: Number(point.outbound) || 0,
      })),
    [data],
  );

  const hasAnyMovement = chartData.some((d) => d.inboundNum > 0 || d.outboundNum > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border py-4">
        <CardTitle className="text-lg font-semibold text-[var(--text)]">{title}</CardTitle>
        <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--info)]" aria-hidden="true" />
            Nhập
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-out)]" aria-hidden="true" />
            Xuất
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {isLoading && (
          <div className="flex h-[240px] items-center justify-center text-sm text-[var(--text-muted)]">
            Đang tải biểu đồ nhập — xuất 12 tháng...
          </div>
        )}

        {isError && (
          <div className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
            Không thể tải dữ liệu biến động 12 tháng.{' '}
            {onRetry && (
              <button type="button" onClick={onRetry} className="underline">
                Thử lại
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && !hasAnyMovement && (
          <div className="flex h-[240px] items-center justify-center text-sm text-[var(--text-muted)]">
            Chưa có chứng từ nhập hoặc xuất kho đã xác nhận trong 12 tháng gần nhất.
          </div>
        )}

        {!isLoading && !isError && hasAnyMovement && (
          <div className="h-[240px] w-full" data-testid="monthly-inout-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barGap={3}
              >
                <CartesianGrid
                  strokeDasharray="0"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(value: number) => formatQuantity(value)}
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatQuantity(typeof value === 'number' || typeof value === 'string' ? value : 0),
                    String(name ?? ''),
                  ]}
                  labelFormatter={(label: unknown) => `Tháng ${String(label ?? '')}`}
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar
                  dataKey="inboundNum"
                  name="Nhập"
                  fill="var(--info)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                />
                <Bar
                  dataKey="outboundNum"
                  name="Xuất"
                  fill="var(--chart-out)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
