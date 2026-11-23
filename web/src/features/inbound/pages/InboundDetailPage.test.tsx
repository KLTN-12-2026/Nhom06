import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type InboundReceiptDetail } from '../types';
import { InboundDetailPage } from './InboundDetailPage';

const DRAFT_RECEIPT: InboundReceiptDetail = {
  id: 'rec-1',
  receiptNo: 'PN2611220001',
  receiptDate: '2026-11-22',
  status: 'draft',
  notes: 'Hàng về chiều nay, chờ kiểm đếm',
  supplier: { id: 'sup-1', code: 'NCC001', name: 'Công ty TNHH Mondelez Kinh Đô' },
  creator: { id: 'u-staff', fullName: 'Trương Thành Lê' },
  confirmer: null,
  confirmedAt: null,
  createdAt: '2026-11-22T08:00:00.000Z',
  updatedAt: '2026-11-22T08:00:00.000Z',
  lineCount: 1,
  totalQuantity: '246',
  totalAmount: '78720000',
  items: [
    {
      id: 'item-1',
      productId: 'prod-1',
      product: { id: 'prod-1', code: 'SP007', name: 'Bánh quy Oreo 137g', unit: 'thùng' },
      lotId: null,
      lotCode: 'L26112207',
      expiryDate: '2027-09-16',
      manufacturedDate: null,
      quantity: '246',
      unitCost: '320000',
      lineTotal: '78720000',
    },
  ],
};

const CONFIRMED_RECEIPT: InboundReceiptDetail = {
  ...DRAFT_RECEIPT,
  status: 'confirmed',
  confirmer: { id: 'u-mgr', fullName: 'Nguyễn Văn Dương' },
  confirmedAt: new Date().toISOString(),
  items: [{ ...DRAFT_RECEIPT.items[0], lotId: 'lot-1' }],
};

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/inbound/rec-1']}>
            <Routes>
              <Route path="/inbound/:id" element={<InboundDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('InboundDetailPage (AC10)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('ẩn nút Sửa/Hủy với quản lý (không có inbound.create) nhưng vẫn mở hộp thoại và xác nhận được', async () => {
    const managerUser: AuthUser = {
      id: 'u-mgr',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['inbound.read', 'inbound.confirm'],
    };

    let currentReceipt = DRAFT_RECEIPT;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => managerUser } as Response;
      }
      if (url.endsWith('/inbound-receipts/rec-1/confirm') && init?.method === 'POST') {
        currentReceipt = CONFIRMED_RECEIPT;
        return { ok: true, status: 200, json: async () => CONFIRMED_RECEIPT } as Response;
      }
      if (url.endsWith('/inbound-receipts/rec-1')) {
        return { ok: true, status: 200, json: async () => currentReceipt } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Phiếu nhập PN2611220001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: 'Sửa phiếu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận nhập kho' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xác nhận nhập kho' }));
    expect(screen.getByText('Xác nhận nhập kho phiếu PN2611220001?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Xác nhận nhập kho' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
      expect(screen.getByText('Đã xác nhận phiếu PN2611220001. Tồn kho đã cập nhật.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập kho' })).not.toBeInTheDocument();
  });

  it('ẩn toàn bộ nút sửa/hủy/xác nhận khi phiếu đã ở trạng thái confirmed kể cả với nhân viên đủ quyền', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['inbound.read', 'inbound.create', 'inbound.confirm'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.endsWith('/inbound-receipts/rec-1')) {
        return { ok: true, status: 200, json: async () => CONFIRMED_RECEIPT } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Sửa phiếu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập kho' })).not.toBeInTheDocument();
  });

  it('khi xác nhận gặp lỗi 409 thì báo lỗi và tải lại phiếu', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['inbound.read', 'inbound.create', 'inbound.confirm'],
    };

    let fetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.endsWith('/inbound-receipts/rec-1/confirm') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            statusCode: 409,
            message: 'Phiếu đã được xác nhận hoặc không ở trạng thái nháp',
          }),
        } as Response;
      }
      if (url.endsWith('/inbound-receipts/rec-1')) {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (fetchCount === 1 ? DRAFT_RECEIPT : CONFIRMED_RECEIPT),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Xác nhận nhập kho' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Xác nhận nhập kho' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Xác nhận nhập kho' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText('Phiếu đã được xác nhận hoặc không ở trạng thái nháp'),
      ).toBeInTheDocument();
      expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
    });
    expect(fetchCount).toBeGreaterThanOrEqual(2);
  });
});
