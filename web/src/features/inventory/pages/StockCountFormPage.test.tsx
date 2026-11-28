import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { StockCountFormPage } from './StockCountFormPage';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['inventory.read', 'stock_count.create'],
};

const LOTS_FIXTURE = {
  evaluationDate: '2026-11-23',
  total: 2,
  page: 1,
  pageSize: 100,
  items: [
    {
      lotId: 'lot-a',
      lotCode: 'L261123A',
      product: {
        id: 'p-1',
        code: 'SP001',
        name: 'Sữa tươi tiệt trùng 1L',
        unit: 'thùng',
        group: { id: 'g-1', code: 'SUA', name: 'Sữa' },
      },
      expiryDate: '2027-06-01',
      receivedAt: '2026-11-01',
      daysRemaining: 190,
      onHandQty: '10',
      lotStatus: 'active',
      expiryStatus: 'normal',
      warningDays: 30,
    },
    {
      lotId: 'lot-b',
      lotCode: 'L261123B',
      product: {
        id: 'p-2',
        code: 'SP002',
        name: 'Sữa tươi ít đường',
        unit: 'thùng',
        group: { id: 'g-1', code: 'SUA', name: 'Sữa' },
      },
      expiryDate: '2027-07-01',
      receivedAt: '2026-11-01',
      daysRemaining: 220,
      onHandQty: '5',
      lotStatus: 'active',
      expiryStatus: 'normal',
      warningDays: 30,
    },
  ],
};

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/stock-counts/new']}>
            <Routes>
              <Route path="/stock-counts/new" element={<StockCountFormPage mode="create" />} />
              <Route path="/stock-counts/:id" element={<div>Chi tiết phiếu kiểm kê mới</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('StockCountFormPage (AC8)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'staff-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('tự tính chênh lệch khi nhập số đếm, bắt buộc lý do khi lệch và chặn số đếm âm', async () => {
    const postSpy = vi.fn();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/inventory/lots')) {
        return { ok: true, status: 200, json: async () => LOTS_FIXTURE } as Response;
      }
      if (url.endsWith('/stock-counts') && init?.method === 'POST') {
        postSpy(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'sc-new', countNo: 'KK2611230001' }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /SP001 - L261123A/ })).toBeInTheDocument();
    });

    // Chọn lô A (tồn hệ thống = 10) và nhập số đếm âm -> báo lỗi
    await user.selectOptions(screen.getByLabelText('Lô hàng dòng 1'), 'lot-a');
    const countedInput = screen.getByLabelText('Số đếm dòng 1');
    await user.type(countedInput, '-2');
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu nháp' }));

    await waitFor(() => {
      expect(
        screen.getByText('Số lượng đếm phải lớn hơn hoặc bằng 0 (tối đa 3 số thập phân)'),
      ).toBeInTheDocument();
    });
    expect(postSpy).not.toHaveBeenCalled();

    // Đổi số đếm thành 8 -> chênh lệch tự tính -2, chưa nhập lý do -> báo lỗi bắt buộc lý do
    await user.clear(countedInput);
    await user.type(countedInput, '8');
    expect(screen.getByTestId('variance-row-0')).toHaveTextContent('-2');

    await user.click(screen.getByRole('button', { name: 'Lưu phiếu nháp' }));
    await waitFor(() => {
      expect(
        screen.getByText('Bắt buộc nhập lý do khi số đếm chênh lệch với tồn hệ thống'),
      ).toBeInTheDocument();
    });
    expect(postSpy).not.toHaveBeenCalled();

    // Nhập lý do -> lưu thành công
    await user.type(screen.getByLabelText('Lý do dòng 1'), 'Hư hỏng 2 thùng');
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu nháp' }));

    await waitFor(() => {
      expect(screen.getByText('Chi tiết phiếu kiểm kê mới')).toBeInTheDocument();
    });
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ lotId: 'lot-a', countedQty: '8', reason: 'Hư hỏng 2 thùng' }],
      }),
    );
  });
});
