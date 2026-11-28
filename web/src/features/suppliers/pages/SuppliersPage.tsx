import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { SupplierFormDialog } from '../components/SupplierFormDialog';
import { useSuppliersQuery } from '../hooks';
import { type SupplierItem } from '../types';

export function SuppliersPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);

  const canManage = hasPermission('catalog.manage');
  const suppliersQuery = useSuppliersQuery({ search, status });

  const openCreate = () => {
    setEditingSupplier(null);
    setFormOpen(true);
  };

  const openEdit = (supplier: SupplierItem) => {
    setEditingSupplier(supplier);
    setFormOpen(true);
  };

  const columns = useMemo<DataTableColumn<SupplierItem>[]>(() => {
    const base: DataTableColumn<SupplierItem>[] = [
      {
        key: 'code',
        header: 'Mã',
        cellClassName: 'font-medium text-[var(--text)] whitespace-nowrap',
        render: (row) => row.code,
      },
      {
        key: 'name',
        header: 'Tên',
        cellClassName: 'text-[var(--text)]',
        render: (row) => row.name,
      },
      {
        key: 'phone',
        header: 'Điện thoại',
        cellClassName: 'tabular-nums whitespace-nowrap',
        render: (row) => row.phone ?? '—',
      },
      {
        key: 'address',
        header: 'Địa chỉ',
        cellClassName: 'text-[var(--text-muted)]',
        render: (row) => row.address ?? '—',
      },
      {
        key: 'status',
        header: 'Trạng thái',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <StatusBadge
            tone={row.status === 'active' ? 'active' : 'inactive'}
            label={row.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động'}
          />
        ),
      },
    ];

    if (canManage) {
      base.push({
        key: 'actions',
        header: '',
        align: 'right',
        headerClassName: 'w-20',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
            Sửa
          </Button>
        ),
      });
    }

    return base;
  }, [canManage]);

  const headerActions = useMemo(
    () =>
      canManage ? (
        <Button
          type="button"
          className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
          onClick={openCreate}
        >
          Thêm nhà cung cấp
        </Button>
      ) : undefined,
    [canManage],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhà cung cấp"
        description="Quản lý thông tin nhà cung cấp"
        actions={headerActions}
      />

      <FilterBar>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã hoặc tên"
          aria-label="Tìm theo mã hoặc tên nhà cung cấp"
          className="h-10 w-full sm:w-72"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Lọc theo trạng thái"
          className="h-10 w-full sm:w-48"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Ngừng hoạt động</option>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={suppliersQuery.data}
        rowKey={(row) => row.id}
        isLoading={suppliersQuery.isLoading}
        isError={suppliersQuery.isError}
        onRetry={() => void suppliersQuery.refetch()}
        loadingText="Đang tải danh sách nhà cung cấp..."
        emptyText="Không có kết quả phù hợp"
        errorText="Không thể tải danh sách nhà cung cấp."
      />

      <SupplierFormDialog
        open={formOpen}
        supplier={editingSupplier}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) {
            setEditingSupplier(null);
          }
        }}
        onSuccess={(message) => showToast(message)}
      />
    </div>
  );
}
