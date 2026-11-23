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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border py-4">
        <CardTitle className="text-lg">Ma trận quyền</CardTitle>
        <span className="text-xs text-[var(--text-muted)]">
          {data ? `${data.permissions.length} quyền thao tác` : 'Đang tải...'}
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
                <TableHead>Quyền</TableHead>
                {roleSets.map((role) => (
                  <TableHead key={role.code} className="w-28 text-center">
                    {role.shortLabel}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.permissions.map((perm) => (
                <TableRow key={perm.code}>
                  <TableCell>
                    <div className="text-sm text-[var(--text)]">
                      {perm.description || perm.code}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{perm.code}</div>
                  </TableCell>
                  {roleSets.map((role) => {
                    const allowed = role.permSet.has(perm.code);
                    return (
                      <TableCell key={role.code} className="text-center">
                        {allowed ? (
                          <span
                            aria-label={`${role.shortLabel} có quyền ${perm.code}`}
                            className="inline-flex items-center justify-center text-[var(--primary)]"
                          >
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span
                            aria-label={`${role.shortLabel} không có quyền ${perm.code}`}
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
