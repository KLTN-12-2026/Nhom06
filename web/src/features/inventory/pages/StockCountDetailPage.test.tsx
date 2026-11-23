import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type StockCountDetail } from '../types';
import { StockCountDetailPage } from './StockCountDetailPage';

const SUBMITTED_COUNT: StockCountDetail = {
  id: 'sc-1',
  countNo: 'KK2611230001',
  status: 'submitted',
  countedAt: '2026-11-23T03:00:00.000Z',
  note: 'Kiểm kê định kỳ',
  creator: { id: 'u-staff', fullName: 'Trương Thành Lê' },
  approver: null,
  approvedAt: null,
  createdAt: '2026-11-23T03:00:00.000Z',
  updatedAt: '2026-11-23T03:05:00.000Z',
  lineCount: 2,
  discrepancyCount: 1,
  totalVarianceQty: '-2',
  items: [
    {
      id: 'item-1',
      lotId: 'lot-a',
      lotCode: 'L261123A',
      lotStatus: 'active',
      expiryDate: '2027-06-01',
      product: { id: 'p-1', code: 'SP001', name: 'Sữa tươi 1L', unit: 'thùng' },
      systemQty: '10',
      countedQty: '8',
      varianceQty: '-2',
      currentOnHandQty: '10',
      hasBalanceDrift: false,
      reason: 'Hư hỏng 2 thùng',
    },
    {
      id: 'item-2',
      lotId: 'lot-b',
      lotCode: 'L261123B',
      lotStatus: 'active',
      expiryDate: '2027-07-01',
      product: { id: 'p-2', code: 'SP002', name: 'Sữa ít đường', unit: 'thùng' },
      systemQty: '5',
      countedQty: '5',
      varianceQty: '0',
      currentOnHandQty: '5',
      hasBalanceDrift: false,
      reason: null,
    },
  ],
};

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/stock-counts/sc-1']}>
            <Routes>
              <Route path="/stock-counts/:id" element={<StockCountDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('StockCountDetailPage (AC8)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị hộp ghi chú bất biến và ẩn nút Duyệt điều chỉnh với nhân viên kho', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['inventory.read', 'stock_count.create'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.endsWith('/stock-counts/sc-1')) {
        return { ok: true, status: 200, json: async () => SUBMITTED_COUNT } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Phiếu kiểm kê KK2611230001')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Phiếu kiểm kê chưa duyệt không làm thay đổi tồn kho. Khi duyệt, tồn từng lô được đặt bằng số đếm và ghi lịch sử điều chỉnh trong cùng một giao dịch.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt điều chỉnh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
  });

  it('cho phép quản lý duyệt điều chỉnh qua hộp thoại xác nhận và hiển thị chi tiết lỗi 409 nếu tồn đã đổi', async () => {
    const managerUser: AuthUser = {
      id: 'u-mgr',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['inventory.read', 'stock_count.create', 'stock_count.approve'],
    };

    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => managerUser } as Response;
      }
      if (url.endsWith('/stock-counts/sc-1/approve') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            statusCode: 409,
            message: 'Tồn đã thay đổi sau khi kiểm đếm, cần đối chiếu lại',
            errors: [
              {
                field: 'lot:L261123A',
                message: 'Lô L261123A (SP001): tồn lúc kiểm kê 10, tồn hiện tại 15',
              },
            ],
          }),
        } as Response;
      }
      if (url.endsWith('/stock-counts/sc-1')) {
        fetchCount += 1;
        return { ok: true, status: 200, json: async () => SUBMITTED_COUNT } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Duyệt điều chỉnh' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Duyệt điều chỉnh' }));
    expect(screen.getByText('Duyệt điều chỉnh phiếu KK2611230001?')).toBeInTheDocument();

    const approveButtons = screen.getAllByRole('button', { name: 'Duyệt điều chỉnh' });
    await user.click(approveButtons[approveButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getAllByText('Tồn đã thay đổi sau khi kiểm đếm, cần đối chiếu lại').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText('Lô L261123A (SP001): tồn lúc kiểm kê 10, tồn hiện tại 15'),
      ).toBeInTheDocument();
    });
    expect(fetchCount).toBeGreaterThanOrEqual(2);
  });
});
