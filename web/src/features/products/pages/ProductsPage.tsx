import { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { PaginationBar } from '@/components/common/PaginationBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/hooks';
import { formatQuantity, formatShelfLife } from '@/lib/format';
import { ProductFormDialog } from '../components/ProductFormDialog';
import { ProductGroupsDialog } from '../components/ProductGroupsDialog';
import { useProductGroupsQuery, useProductsQuery } from '../hooks';
import { type ProductItem } from '../types';

const PAGE_SIZE = 50;

export function ProductsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);

  const canManage = hasPermission('catalog.manage');

  const groupsQuery = useProductGroupsQuery();
  const productsQuery = useProductsQuery({
    search,
    groupId,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const openCreate = () => {
    setEditingProduct(null);
    setFormOpen(true);
  };

  const openEdit = (product: ProductItem) => {
    setEditingProduct(product);
    setFormOpen(true);
  };

  const columns = useMemo<DataTableColumn<ProductItem>[]>(() => {
    const base: DataTableColumn<ProductItem>[] = [
      {
        key: 'code',
        header: 'Mã',
        cellClassName: 'font-medium text-[var(--text)] whitespace-nowrap',
        render: (row) => row.code,
      },
      {
        key: 'name',
        header: 'Tên sản phẩm',
        cellClassName: 'text-[var(--text)]',
        render: (row) => row.name,
      },
      {
        key: 'group',
        header: 'Nhóm hàng',
        cellClassName: 'text-[var(--text-muted)] whitespace-nowrap',
        render: (row) => row.group.name,
      },
      {
        key: 'unit',
        header: 'ĐVT',
        cellClassName: 'whitespace-nowrap',
        render: (row) => row.unit,
      },
      {
        key: 'shelfLifeDays',
        header: 'Hạn dùng',
        align: 'right',
        cellClassName: 'tabular-nums whitespace-nowrap',
        render: (row) => formatShelfLife(row.shelfLifeDays),
      },
      {
        key: 'onHandQty',
        header: 'Tồn hiện tại',
        align: 'right',
        cellClassName: 'tabular-nums font-medium text-[var(--text)] whitespace-nowrap',
        render: (row) => formatQuantity(row.onHandQty),
      },
      {
        key: 'status',
        header: 'Trạng thái',
        cellClassName: 'whitespace-nowrap',
        render: (row) => (
          <StatusBadge
            tone={row.status === 'active' ? 'active' : 'inactive'}
            label={row.status === 'active' ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}
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

  const totalCount = productsQuery.data?.total ?? 0;
  const countLabel =
    status === 'active'
      ? `${totalCount} mặt hàng đang kinh doanh`
      : status === 'inactive'
        ? `${totalCount} mặt hàng ngừng kinh doanh`
        : `${totalCount} mặt hàng`;

  const headerActions = useMemo(
    () => (
      <>
        <Button type="button" variant="secondary" onClick={() => setGroupsOpen(true)}>
          Nhóm hàng
        </Button>
        {canManage && (
          <Button
            type="button"
            className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
            onClick={openCreate}
          >
            Thêm sản phẩm
          </Button>
        )}
      </>
    ),
    [canManage],
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Sản phẩm" description={countLabel} actions={headerActions} />

      <FilterBar>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo mã hoặc tên sản phẩm"
          aria-label="Tìm theo mã hoặc tên sản phẩm"
          className="h-10 w-full sm:w-72"
        />
        <Select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo nhóm hàng"
          className="h-10 w-full sm:w-52"
        >
          <option value="">Tất cả nhóm hàng</option>
          {(groupsQuery.data ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái"
          className="h-10 w-full sm:w-48"
        >
          <option value="active">Đang kinh doanh</option>
          <option value="inactive">Ngừng kinh doanh</option>
          <option value="">Tất cả</option>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={productsQuery.data?.items}
        rowKey={(row) => row.id}
        isLoading={productsQuery.isLoading}
        isError={productsQuery.isError}
        onRetry={() => void productsQuery.refetch()}
        loadingText="Đang tải danh sách sản phẩm..."
        emptyText="Không có kết quả phù hợp"
        errorText="Không thể tải danh sách sản phẩm."
      />

      <PaginationBar
        page={page}
        pageSize={PAGE_SIZE}
        total={totalCount}
        onPageChange={setPage}
      />

      <ProductFormDialog
        open={formOpen}
        product={editingProduct}
        groups={groupsQuery.data ?? []}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) {
            setEditingProduct(null);
          }
        }}
        onSuccess={(message) => showToast(message)}
      />

      <ProductGroupsDialog
        open={groupsOpen}
        canManage={canManage}
        onOpenChange={setGroupsOpen}
        onSuccess={(message) => showToast(message)}
      />
    </div>
  );
}
