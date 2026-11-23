import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type PermissionMatrixResponse } from '../types';
import { groupPermissionsForMatrix } from './permission-matrix-groups';

const SHORT_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị',
  WAREHOUSE_MANAGER: 'Quản lý kho',
  WAREHOUSE_STAFF: 'Nhân viên',
};

interface PermissionMatrixCardProps {
  data?: PermissionMatrixResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PermissionMatrixCard({
  data,
  isLoading,
  isError,
  onRetry,
}: PermissionMatrixCardProps) {
  const roleSets = (data?.roles ?? []).map((role) => ({
    ...role,
    shortLabel: SHORT_ROLE_LABELS[role.code] ?? role.name,
    permSet: new Set(role.permissionCodes),
  }));

  const groupedRows = data ? groupPermissionsForMatrix(data.permissions) : [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border py-4">
        <CardTitle className="text-lg">Ma trận quyền</CardTitle>
        <span className="text-xs tabular-nums text-[var(--text-muted)]">
          {data ? `${groupedRows.length} quyền thao tác` : 'Đang tải...'}
        </span>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading && (
          <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
            Đang tải ma trận phân quyền từ cơ sở dữ liệu...
          </div>
        )}

        {isError && (
          <div className="m-6 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
            Không thể tải ma trận phân quyền.{' '}
            <button type="button" onClick={onRetry} className="underline">
              Thử lại
            </button>
          </div>
        )}

        {data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Quyền</TableHead>
                {roleSets.map((role) => (
                  <TableHead key={role.code} className="w-28 whitespace-nowrap text-center">
                    {role.shortLabel}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div
                      className="text-sm text-[var(--text)]"
                      title={`Mã quyền DB: ${row.codes.join(', ')}`}
                    >
                      {row.label}
                    </div>
                  </TableCell>
                  {roleSets.map((role) => {
                    const allowed = row.codes.every((code) => role.permSet.has(code));
                    return (
                      <TableCell key={role.code} className="text-center">
                        {allowed ? (
                          <span
                            aria-label={`${role.shortLabel} có quyền ${row.label}`}
                            className="inline-flex items-center justify-center text-[var(--primary)]"
                          >
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span
                            aria-label={`${role.shortLabel} không có quyền ${row.label}`}
                            className="inline-block h-1 w-1 rounded-full bg-[var(--track)]"
                          />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
