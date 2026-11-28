import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type AgencyOrderDetail } from '../types';
import { OrderDetailPage } from './OrderDetailPage';

const CONFIRMED_ORDER: AgencyOrderDetail = {
  id: 'ord-1',
  orderNo: 'DH2611230001',
  orderDate: '2026-11-23',
  status: 'confirmed',
  notes: 'Giao trong sáng',
  agency: { id: 'ag-1', code: 'DL001', name: 'Đại lý Minh Tâm Hải Châu' },
  creator: { id: 'u-staff', fullName: 'Trương Thành Lê' },
  canceller: null,
  cancelledAt: null,
  createdAt: '2026-11-23T08:00:00.000Z',
  updatedAt: '2026-11-23T08:00:00.000Z',
  lineCount: 2,
  totalRequestedQty: '187',
  totalFulfilledQty: '0',
  totalRemainingQty: '187',
  evaluationDate: '2026-11-23',
  minDeliveryDays: 7,
  items: [
    {
      id: 'oi-1',
      productId: 'p-1',
      product: { id: 'p-1', code: 'SP001', name: 'Sữa tươi tiệt trùng 1L', unit: 'thùng' },
      requestedQty: '124',
      fulfilledQty: '0',
      remainingQty: '124',
      availableQty: '937',
      status: 'pending',
    },
    {
      id: 'oi-2',
      productId: 'p-2',
      product: { id: 'p-2', code: 'SP002', name: 'Sữa tươi ít đường 180ml', unit: 'thùng' },
      requestedQty: '63',
      fulfilledQty: '0',
      remainingQty: '63',
      availableQty: '20',
      status: 'pending',
    },
  ],
  outboundReceipts: [],
};

function renderOrderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/orders/ord-1']}>
            <Routes>
              <Route path="/orders/:id" element={<OrderDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('OrderDetailPage (AC10)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị hộp ghi chú bất biến 1, bảng mặt hàng đặt, tồn khả dụng và dialog hủy bắt buộc lý do với nhân viên', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: [
        'orders.read',
        'orders.create',
        'orders.cancel',
        'outbound.read',
        'outbound.create',
        'outbound.confirm',
      ],
    };

    let currentOrder = CONFIRMED_ORDER;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.endsWith('/orders/ord-1/cancel') && init?.method === 'POST') {
        currentOrder = {
          ...CONFIRMED_ORDER,
          status: 'cancelled',
          canceller: { id: 'u-staff', fullName: 'Trương Thành Lê' },
          cancelledAt: new Date().toISOString(),
        };
        return { ok: true, status: 200, json: async () => currentOrder } as Response;
      }
      if (url.endsWith('/orders/ord-1')) {
        return { ok: true, status: 200, json: async () => currentOrder } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderOrderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Đơn DH2611230001')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /Tồn kho chỉ trừ khi xác nhận phiếu xuất\. Số lượng đã xuất được theo dõi riêng với số lượng đặt\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('SP001')).toBeInTheDocument();
    expect(screen.getByText('937')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo phiếu xuất' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sửa đơn' })).toBeInTheDocument();

    // Mở dialog hủy, bấm xác nhận khi chưa nhập lý do → báo lỗi
    await user.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy đơn' }));
    expect(await screen.findByText('Vui lòng nhập lý do hủy đơn hàng')).toBeInTheDocument();

    // Nhập lý do và xác nhận hủy thành công
    await user.type(screen.getByLabelText('Lý do hủy đơn'), 'Đại lý đổi lịch giao');
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy đơn' }));

    await waitFor(() => {
      expect(screen.getAllByText('Đã hủy').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole('link', { name: 'Tạo phiếu xuất' })).not.toBeInTheDocument();
  });

  it('ẩn nút Sửa đơn, Hủy đơn và Tạo phiếu xuất với quản lý (không có orders.create/orders.cancel/outbound.create)', async () => {
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
      if (url.endsWith('/orders/ord-1')) {
        return { ok: true, status: 200, json: async () => CONFIRMED_ORDER } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderOrderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Đơn DH2611230001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: 'Sửa đơn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tạo phiếu xuất' })).not.toBeInTheDocument();
  });
});
