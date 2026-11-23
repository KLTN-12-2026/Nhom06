import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type AgencyOrderListResponse } from '../types';
import { OrdersListPage } from './OrdersListPage';

const SAMPLE_LIST: AgencyOrderListResponse = {
  items: [
    {
      id: 'ord-1',
      orderNo: 'DH2611230001',
      orderDate: '2026-11-23',
      status: 'confirmed',
      notes: null,
      agency: { id: 'ag-1', code: 'DL001', name: 'Đại lý Minh Tâm Hải Châu' },
      creator: { id: 'u-1', fullName: 'Trương Thành Lê' },
      canceller: null,
      cancelledAt: null,
      createdAt: '2026-11-23T08:00:00.000Z',
      updatedAt: '2026-11-23T08:00:00.000Z',
      lineCount: 3,
      totalRequestedQty: '305',
      totalFulfilledQty: '0',
      totalRemainingQty: '305',
    },
    {
      id: 'ord-2',
      orderNo: 'DH2611220002',
      orderDate: '2026-11-22',
      status: 'fulfilled',
      notes: null,
      agency: { id: 'ag-2', code: 'DL002', name: 'Đại lý Hải Vân' },
      creator: { id: 'u-1', fullName: 'Trương Thành Lê' },
      canceller: null,
      cancelledAt: null,
      createdAt: '2026-11-22T08:00:00.000Z',
      updatedAt: '2026-11-22T09:00:00.000Z',
      lineCount: 2,
      totalRequestedQty: '95',
      totalFulfilledQty: '95',
      totalRemainingQty: '0',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  pendingCount: 1,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/orders']}>
            <OrdersListPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('OrdersListPage (AC10)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị danh sách đơn đúng cột, ẩn nút Tạo đơn mới và Tạo phiếu xuất với quản lý (thiếu orders.create và outbound.create)', async () => {
    const managerUser: AuthUser = {
      id: 'u-mgr',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['orders.read', 'outbound.read', 'outbound.confirm'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => managerUser } as Response;
      }
      if (url.includes('/agencies')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/orders')) {
        return { ok: true, status: 200, json: async () => SAMPLE_LIST } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('DH2611230001')).toBeInTheDocument();
    });

    expect(screen.getByText('Đại lý Minh Tâm Hải Châu')).toBeInTheDocument();
    expect(screen.getByText('1 đơn chờ xuất')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tạo đơn mới' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tạo phiếu xuất' })).not.toBeInTheDocument();
  });

  it('hiển thị nút Tạo đơn mới và Tạo phiếu xuất cho nhân viên có đủ outbound.create và outbound.confirm', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: [
        'orders.read',
        'orders.create',
        'outbound.read',
        'outbound.create',
        'outbound.confirm',
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.includes('/agencies')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/orders')) {
        return { ok: true, status: 200, json: async () => SAMPLE_LIST } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('DH2611230001')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Tạo đơn mới' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo phiếu xuất' })).toBeInTheDocument();
  });
});
