import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatIsoDateDdMm, formatIsoDateVi, formatNumberVi } from '../formatters';
import { type DailyHistoryItem } from '../types';

interface DemandHistoryChartCardProps {
  items: DailyHistoryItem[];
  isLoading: boolean;
  isError: boolean;
}

export function DemandHistoryChartCard({
  items,
  isLoading,
  isError,
}: DemandHistoryChartCardProps) {
  const chartData = items.map((item) => ({
    date: item.date,
    label: formatIsoDateDdMm(item.date),
    qty: Number(item.totalQty),
  }));

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border pb-4">
        <CardTitle className="text-lg font-semibold text-[var(--text)]">
          Nhu cầu thực tế 90 ngày gần nhất
        </CardTitle>
        <span className="text-sm text-[var(--text-muted)]">Tổng theo ngày, mọi sản phẩm</span>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
            Đang tải biểu đồ nhu cầu lịch sử...
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--risk-critical-fg)]">
            Không thể tải dữ liệu nhu cầu lịch sử.
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
            Chưa có dữ liệu lịch sử nhu cầu để hiển thị.
          </div>
        ) : (
          <div className="h-64 w-full" data-testid="demand-history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) => formatNumberVi(value)}
                />
                <Tooltip
                  labelFormatter={(_label, payload) => {
                    const row = payload?.[0]?.payload as { date?: string } | undefined;
                    return row?.date ? `Ngày ${formatIsoDateVi(row.date)}` : '';
                  }}
                  formatter={(value) => [
                    `${formatNumberVi(typeof value === 'number' ? value : Number(value))}`,
                    'Tổng nhu cầu',
                  ]}
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="qty"
                  name="Tổng nhu cầu"
                  stroke="var(--info)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--info)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
