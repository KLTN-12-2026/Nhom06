import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/toast-context';
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
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { CreateUserDialog } from '../components/CreateUserDialog';
import { EditUserDialog } from '../components/EditUserDialog';
import { PermissionMatrixCard } from '../components/PermissionMatrixCard';
import { RoleNotesCard } from '../components/RoleNotesCard';
import {
  usePermissionMatrixQuery,
  useUpdateUserStatusMutation,
  useUsersQuery,
} from '../hooks';
import { type UserItem } from '../types';

export function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<UserItem | null>(null);

  const canManageUsers = hasPermission('users.manage');
  const canReadRoles = hasPermission('roles.read');
  const canManageRoles = hasPermission('roles.manage');

  const usersQuery = useUsersQuery({ search, status: statusFilter });
  const matrixQuery = usePermissionMatrixQuery(canReadRoles);
  const updateStatusMutation = useUpdateUserStatusMutation();

  const handleConfirmStatusToggle = async () => {
    if (!statusTarget) {
      return;
    }
    const nextStatus = statusTarget.status === 'active' ? 'locked' : 'active';
    try {
      await updateStatusMutation.mutateAsync({ id: statusTarget.id, status: nextStatus });
      showToast(
        nextStatus === 'locked'
          ? `Đã khoá tài khoản ${statusTarget.username}.`
          : `Đã mở khoá tài khoản ${statusTarget.username}.`,
      );
      setStatusTarget(null);
    } catch (error) {
      showToast(
        error instanceof ApiError ? error.message : 'Không thể cập nhật trạng thái tài khoản.',
        'error',
      );
    }
  };

  const headerActions = useMemo(
    () =>
      canManageUsers ? (
        <Button
          type="button"
          className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
          onClick={() => setCreateOpen(true)}
        >
          Thêm tài khoản
        </Button>
      ) : undefined,
    [canManageUsers],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài khoản và phân quyền"
        description="Ba vai trò nội bộ; đại lý và nhà cung cấp không có tài khoản đăng nhập"
        actions={headerActions}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Cột trái: Tài khoản + Ma trận quyền (8/12 trên màn rộng >= 1280px; xếp dọc thoáng ở 390–1024px) */}
        <div className="min-w-0 space-y-6 xl:col-span-8">
          <Card>
            <CardHeader className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg">Tài khoản</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên đăng nhập, họ tên, email..."
                  aria-label="Tìm kiếm tài khoản"
                  className="h-9 w-full sm:w-64"
                />
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Lọc theo trạng thái"
                  className="h-9 w-full sm:w-40"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="active">Hoạt động</option>
                  <option value="locked">Đã khoá</option>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {usersQuery.isLoading && (
                <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
                  Đang tải danh sách tài khoản...
                </div>
              )}

              {usersQuery.isError && (
                <div className="m-6 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
                  Không thể tải danh sách tài khoản.{' '}
                  <button
                    type="button"
                    onClick={() => void usersQuery.refetch()}
                    className="underline"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {usersQuery.data && usersQuery.data.length === 0 && (
                <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
                  Không tìm thấy tài khoản nào phù hợp. Hãy thay đổi từ khóa tìm kiếm hoặc bộ lọc.
                </div>
              )}

              {usersQuery.data && usersQuery.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên đăng nhập</TableHead>
                      <TableHead>Họ tên</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      {canManageUsers && <TableHead className="w-28 text-right">Thao tác</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersQuery.data.map((item) => {
                      const isSelf = item.id === currentUser?.id;
                      const isActive = item.status === 'active';

                      return (
                        <TableRow
                          key={item.id}
                          onClick={() => setEditingUser(item)}
                          className="cursor-pointer hover:bg-[var(--surface-muted)]/60"
                        >
                          <TableCell className="whitespace-nowrap font-medium text-[var(--text)]">
                            {item.username}
                          </TableCell>
                          <TableCell>
                            <div className="whitespace-nowrap">{item.fullName}</div>
                            <div className="text-xs text-[var(--text-muted)]">{item.email}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {item.role?.name ?? 'Chưa gán'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <StatusBadge
                              tone={isActive ? 'active' : 'critical'}
                              label={isActive ? 'Hoạt động' : 'Đã khoá'}
                            />
                          </TableCell>
                          {canManageUsers && (
                            <TableCell
                              className="whitespace-nowrap text-right"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isSelf && isActive}
                                title={
                                  isSelf && isActive
                                    ? 'Không thể tự khoá tài khoản đang đăng nhập'
                                    : undefined
                                }
                                onClick={() => setStatusTarget(item)}
                              >
                                {isActive ? 'Khoá' : 'Mở khoá'}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {canReadRoles && (
            <PermissionMatrixCard
              data={matrixQuery.data}
              isLoading={matrixQuery.isLoading}
              isError={matrixQuery.isError}
              onRetry={() => void matrixQuery.refetch()}
            />
          )}
        </div>

        {/* Cột phải: Ghi chú phân quyền (4/12 trên màn rộng >= 1280px) */}
        <div className="min-w-0 xl:col-span-4">
          <RoleNotesCard />
        </div>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(message) => showToast(message)}
      />

      <EditUserDialog
        user={editingUser}
        isSelf={editingUser?.id === currentUser?.id}
        canManageUsers={canManageUsers}
        canManageRoles={canManageRoles}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
          }
        }}
        onSuccess={(message) => showToast(message)}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setStatusTarget(null);
          }
        }}
        title={
          statusTarget?.status === 'active'
            ? `Khoá tài khoản ${statusTarget.username}?`
            : `Mở khoá tài khoản ${statusTarget?.username ?? ''}?`
        }
        description={
          statusTarget?.status === 'active'
            ? 'Tài khoản này sẽ không thể đăng nhập và mọi phiên làm việc hiện tại sẽ bị chấm dứt ngay lập tức. Toàn bộ chứng từ lịch sử đã lập vẫn được bảo toàn.'
            : 'Tài khoản sẽ hoạt động trở lại và có thể đăng nhập bằng mật khẩu hiện có.'
        }
        confirmLabel={statusTarget?.status === 'active' ? 'Xác nhận khoá' : 'Xác nhận mở khoá'}
        variant={statusTarget?.status === 'active' ? 'destructive' : 'default'}
        isPending={updateStatusMutation.isPending}
        onConfirm={() => void handleConfirmStatusToggle()}
      />
    </div>
  );
}
