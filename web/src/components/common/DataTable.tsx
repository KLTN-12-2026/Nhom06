import { type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  data?: readonly T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  loadingText?: string;
  emptyText?: string;
  errorText?: string;
  onRowClick?: (row: T) => void;
  /** Lớp bổ sung cho thẻ table, ví dụ giảm khoảng đệm ô ở bảng nhiều cột. */
  tableClassName?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  isError = false,
  onRetry,
  loadingText = 'Đang tải dữ liệu...',
  emptyText = 'Không có kết quả phù hợp',
  errorText = 'Không thể tải dữ liệu. Vui lòng thử lại.',
  onRowClick,
  tableClassName,
}: DataTableProps<T>) {
  return (
    <Card>
      <CardContent className="p-0">
        {isLoading && (
          <div className="px-6 py-8 text-sm text-[var(--text-muted)]">{loadingText}</div>
        )}

        {isError && (
          <div className="m-6 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
            {errorText}{' '}
            {onRetry && (
              <button type="button" onClick={onRetry} className="underline">
                Thử lại
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && data && data.length === 0 && (
          <div className="px-6 py-8 text-sm text-[var(--text-muted)]">{emptyText}</div>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <div className="overflow-x-auto">
            <Table className={tableClassName}>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={cn(col.align === 'right' && 'text-right', col.headerClassName)}
                    >
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={
                      onRowClick
                        ? 'cursor-pointer hover:bg-[var(--surface-muted)]/60'
                        : 'hover:bg-[var(--surface-muted)]/40'
                    }
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(col.align === 'right' && 'text-right', col.cellClassName)}
                      >
                        {col.render(row)}
                      </TableCell>
                    ))}
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
