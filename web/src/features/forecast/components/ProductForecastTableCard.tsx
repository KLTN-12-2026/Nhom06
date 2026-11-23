import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatIntegerVi, formatNumberVi } from '../formatters';
import { type ForecastAssessment, type ProductForecastSummaryItem } from '../types';

interface ProductForecastTableCardProps {
  items: ProductForecastSummaryItem[];
  horizonDays: number;
}

function AssessmentBadge({ assessment }: { assessment: ForecastAssessment }) {
  const isOverstock = assessment === 'OVERSTOCK';
  return (
    <StatusBadge
      tone={isOverstock ? 'warning' : 'active'}
      label={isOverstock ? 'Tồn nhiều hơn nhu cầu' : 'Cân đối'}
    />
  );
}

export function ProductForecastTableCard({
  items,
  horizonDays,
}: ProductForecastTableCardProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg font-semibold text-[var(--text)]">
          Nhu cầu dự báo {horizonDays} ngày tới theo sản phẩm
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
            Lượt dự báo này chưa có dữ liệu sản phẩm.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]">
                  <TableHead className="min-w-[260px]">Sản phẩm</TableHead>
                  <TableHead className="text-right">Nhu cầu dự báo</TableHead>
                  <TableHead className="text-right">Tồn hiện tại</TableHead>
                  <TableHead className="text-right">Số ngày bán hết</TableHead>
                  <TableHead className="min-w-[200px]">Đánh giá</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell>
                      <span className="font-medium text-[var(--text)]">{item.code}</span>{' '}
                      <span className="text-[var(--text-muted)]">{item.name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[var(--text)]">
                      {formatNumberVi(item.forecastQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[var(--text)]">
                      {formatNumberVi(item.onHandQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[var(--text)]">
                      {item.daysToSellOut !== null
                        ? `${formatIntegerVi(item.daysToSellOut)} ngày`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <AssessmentBadge assessment={item.assessment} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
