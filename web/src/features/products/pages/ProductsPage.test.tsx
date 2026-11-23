import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { ProductsPage } from './ProductsPage';

const MOCK_GROUPS = [
  { id: 'g-sua', code: 'SUA', name: 'Sữa', description: null, status: 'active' as const },
  { id: 'g-ngk', code: 'NGK', name: 'Nước giải khát', description: null, status: 'active' as const },
];

const MOCK_ACTIVE_PRODUCTS = {
  items: [
    {
      id: 'p-1',
      code: 'SP001',
      name: 'Sữa tươi tiệt trùng 1L',
      group: { id: 'g-sua', code: 'SUA', name: 'Sữa' },
      unit: 'Thùng',
      shelfLifeDays: 180,
      onHandQty: '2131',
      status: 'active' as const,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

const MOCK_INACTIVE_PRODUCTS = {
  items: [
    {
      id: 'p-2',
      code: 'SP099',
      name: 'Sữa ngừng kinh doanh',
      group: { id: 'g-sua', code: 'SUA', name: 'Sữa' },
      unit: 'Thùng',
      shelfLifeDays: 90,
      onHandQty: '0',
      status: 'inactive' as const,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

function renderProductsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ProductsPage />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function mockFetchForUser(authUser: AuthUser) {
  localStorage.setItem('kho_ai_access_token', 'test-token');
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => authUser } as Response;
    }
    if (url.includes('/product-groups')) {
      return { ok: true, status: 200, json: async () => MOCK_GROUPS } as Response;
    }
    if (url.includes('/products')) {
      const data = url.includes('status=inactive') ? MOCK_INACTIVE_PRODUCTS : MOCK_ACTIVE_PRODUCTS;
      return { ok: true, status: 200, json: async () => data } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ProductsPage (AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng các cột theo mockup, nút Thêm/Sửa khi có quyền catalog.manage và lọc được trạng thái', async () => {
    const adminUser: AuthUser = {
      id: 'u-admin',
      username: 'admin',
      fullName: 'Phan Thanh Đức',
      role: { code: 'ADMIN', name: 'Quản trị viên' },
      permissions: ['catalog.read', 'catalog.manage'],
    };

    const fetchSpy = mockFetchForUser(adminUser);
    const user = userEvent.setup();

    renderProductsPage();

    await waitFor(() => {
      expect(screen.getByText('SP001')).toBeInTheDocument();
    });

    expect(screen.getByText('Sữa tươi tiệt trùng 1L')).toBeInTheDocument();
    expect(screen.getByText('180 ngày')).toBeInTheDocument();
    expect(screen.getByText('2.131')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm sản phẩm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhóm hàng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();

    const statusSelect = screen.getByLabelText('Lọc theo trạng thái');
    await user.selectOptions(statusSelect, 'inactive');

    await waitFor(() => {
      expect(screen.getByText('SP099')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/products?status=inactive'),
      expect.anything(),
    );
  });

  it('ẩn nút Thêm sản phẩm và Sửa khi người dùng không có quyền catalog.manage', async () => {
    const readOnlyUser: AuthUser = {
      id: 'u-readonly',
      username: 'viewer',
      fullName: 'Người xem',
      role: { code: 'VIEWER', name: 'Chỉ xem' },
      permissions: ['catalog.read'],
    };

    mockFetchForUser(readOnlyUser);
    renderProductsPage();

    await waitFor(() => {
      expect(screen.getByText('SP001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Thêm sản phẩm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  });
});
