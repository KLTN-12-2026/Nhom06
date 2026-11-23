import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type OrderFefoPlan } from '../types';
import { OrderFefoOutboundPage } from './OrderFefoOutboundPage';

const SAMPLE_FEFO_PLAN: OrderFefoPlan = {
  orderId: 'ord-1',
  orderNo: 'DH2611230001',
  orderStatus: 'confirmed',
  agency: { id: 'ag-1', code: 'DL001', name: 'Đại lý Minh Tâm Hải Châu' },
  evaluationDate: '2026-11-23',
  minDeliveryDays: 7,
  totalRequestedQty: '80',
  totalRemainingQty: '80',
  totalAllocatedQty: '50',
  totalShortageQty: '30',
  items: [
    {
      orderItemId: 'oi-1',
      product: { id: 'p-1', code: 'SP002', name: 'Sữa tươi ít đường 180ml', unit: 'Thùng' },
      requestedQty: '80',
      fulfilledQty: '0',
      remainingQty: '80',
      allocatedQty: '50',
      shortageQty: '30',
      lots: [
        {
          lotId: 'lot-ok-1',
          lotCode: 'L26101802',
          expiryDate: '2026-12-05',
          receivedAt: '2026-10-18',
          daysRemaining: 12,
          severity: 'warning',
          onHandQty: '30',
          allocateQty: '30',
          rank: 1,
        },
        {
          lotId: 'lot-ok-2',
          lotCode: 'L26110102',
          expiryDate: '2027-01-15',
          receivedAt: '2026-11-01',
          daysRemaining: 53,
          severity: 'normal',
          onHandQty: '20',
          allocateQty: '20',
          rank: 2,
        },
      ],
      excludedLots: [
        {
          lotId: 'lot-exp-1',
          lotCode: 'L26081802',
          expiryDate: '2026-09-30',
          receivedAt: '2026-08-18',
          daysRemaining: -54,
          severity: 'expired',
          onHandQty: '44',
          reason: 'Đã hết hạn',
        },
        {
          lotId: 'lot-blk-1',
          lotCode: 'L26111002',
          expiryDate: '2027-02-01',
          receivedAt: '2026-11-10',
          daysRemaining: 70,
          severity: 'normal',
          onHandQty: '15',
          reason: 'Lô bị khóa',
        },
      ],
    },
  ],
};

function renderFefoPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/orders/ord-1/outbound']}>
            <Routes>
              <Route path="/orders/:id/outbound" element={<OrderFefoOutboundPage />} />
              <Route path="/outbound/:id" element={<div>Chi tiết phiếu xuất mới</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('OrderFefoOutboundPage (AC10)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị bảng lô hợp lệ, khối Lô bị loại trước khi xếp FEFO kèm lý do, cảnh báo vượt tồn và dialog Xuất một phần', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['orders.read', 'outbound.read', 'outbound.confirm'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.endsWith('/orders/ord-1/fefo-plan')) {
        return { ok: true, status: 200, json: async () => SAMPLE_FEFO_PLAN } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderFefoPage();

    await waitFor(() => {
      expect(screen.getByText('Phiếu xuất cho đơn DH2611230001')).toBeInTheDocument();
    });

    // Hiển thị đúng khối lô bị loại kèm lý do
    expect(screen.getByText('Lô bị loại trước khi xếp FEFO (2)')).toBeInTheDocument();
    expect(screen.getByText('L26081802')).toBeInTheDocument();
    expect(screen.getByText('Đã hết hạn')).toBeInTheDocument();
    expect(screen.getByText('L26111002')).toBeInTheDocument();
    expect(screen.getByText('Lô bị khóa')).toBeInTheDocument();

    // Nhập vượt tồn khả dụng (35 > 30) → hiển thị cảnh báo và vô hiệu hóa nút xác nhận
    const lot1Input = screen.getByLabelText('Lượng xuất lô L26101802');
    await user.clear(lot1Input);
    await user.type(lot1Input, '35');

    expect(
      await screen.findByText(/Lượng xuất không được vượt tồn khả dụng của lô/),
    ).toBeInTheDocument();
    const confirmBtns = screen.getAllByRole('button', { name: 'Xác nhận xuất kho' });
    expect(confirmBtns[0]).toBeDisabled();

    // Hạ lô 1 xuống 10 (trong khi lô 2 đang là 20) → hiển thị cảnh báo bỏ qua thứ tự FEFO (không chặn)
    await user.clear(lot1Input);
    await user.type(lot1Input, '10');
    expect(await screen.findByText(/vẫn còn tồn khả dụng/i)).toBeInTheDocument();

    // Mở hộp thoại xác nhận → vì 30 < 80 nên nêu rõ đơn sẽ chuyển Xuất một phần
    await user.click(screen.getAllByRole('button', { name: 'Xác nhận xuất kho' })[0]);
    expect(await screen.findByText(/Xuất một phần/)).toBeInTheDocument();
  });

  it('khi backend trả 409 thì thông báo lỗi và tải lại kế hoạch FEFO', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['orders.read', 'outbound.read', 'outbound.confirm'],
    };

    let planFetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.endsWith('/orders/ord-1/fefo-plan')) {
        planFetchCount += 1;
        return { ok: true, status: 200, json: async () => SAMPLE_FEFO_PLAN } as Response;
      }
      if (url.endsWith('/orders/ord-1/outbound') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            statusCode: 409,
            message: 'Lô L26101802 không đủ tồn khả dụng (hiện còn 5)',
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderFefoPage();

    await waitFor(() => {
      expect(screen.getByText('Phiếu xuất cho đơn DH2611230001')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: 'Xác nhận xuất kho' })[0]);
    const dialogConfirmButtons = screen.getAllByRole('button', { name: 'Xác nhận xuất kho' });
    await user.click(dialogConfirmButtons[dialogConfirmButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getAllByText('Lô L26101802 không đủ tồn khả dụng (hiện còn 5)').length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(planFetchCount).toBeGreaterThanOrEqual(2);
  });
});
