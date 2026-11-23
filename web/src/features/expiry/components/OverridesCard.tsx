import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatQuantity } from '@/lib/format';
import { type OverrideThreshold } from '../types';
import { formatOverrideTargetLabel } from '../utils';

interface OverridesCardProps {
  overrides: readonly OverrideThreshold[];
  canManage: boolean;
  onEdit: (item: OverrideThreshold) => void;
  onEnd: (item: OverrideThreshold) => void;
}

export function OverridesCard({ overrides, canManage, onEdit, onEnd }: OverridesCardProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg">Ngưỡng riêng</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {overrides.length === 0 ? (
          <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
            Chưa có ngưỡng riêng. Tất cả sản phẩm đang áp dụng cấu hình chung.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phạm vi</TableHead>
                  <TableHead>Áp dụng cho</TableHead>
                  <TableHead className="text-right">Số ngày</TableHead>
                  {canManage && <TableHead className="w-40 text-right" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="neutral">
                        {item.scope === 'PRODUCT' ? 'Sản phẩm' : 'Nhóm hàng'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[var(--text)]">
                      {formatOverrideTargetLabel(item)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                      {formatQuantity(item.warningDays)}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(item)}
                          >
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => onEnd(item)}
                          >
                            Kết thúc
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
