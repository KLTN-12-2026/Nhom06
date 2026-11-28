import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { StockMovementsPage } from './StockMovementsPage';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['inventory.read'],
};

const MOVEMENTS_FIXTURE = {
  total: 2,
  page: 1,
  pageSize: 50,
  items: [
    {
      id: '2',
      occurredAt: '2026-11-23T04:15:00.000Z',
      movementType: 'ADJUSTMENT',
      product: { id: 'p-1', code: 'SP001', name: 'Sữa tươi tiệt trùng 1L', unit: 'thùng' },
      lotId: 'lot-1',
      lotCode: 'L26112301',
      quantityDelta: '-2',
      balanceAfter: '18',
      source: {
        type: 'STOCK_COUNT',
        id: 'sc-1',
        documentNo: 'KK2611230001',
        url: '/stock-counts/sc-1',
      },
      actor: { id: 'u-mgr', fullName: 'Nguyễn Văn Dương' },
    },
    {
      id: '1',
      occurredAt: '2026-11-23T02:00:00.000Z',
      movementType: 'INBOUND',
      product: { id: 'p-1', code: 'SP001', name: 'Sữa tươi tiệt trùng 1L', unit: 'thùng' },
      lotId: 'lot-1',
      lotCode: 'L26112301',
      quantityDelta: '20',
      balanceAfter: '20',
      source: {
        type: 'INBOUND_RECEIPT',
        id: 'inb-1',
        documentNo: 'PN2611230001',
        url: '/inbound/inb-1',
      },
      actor: { id: 'u-staff', fullName: 'Trương Thành Lê' },
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/stock-movements']}>
            <StockMovementsPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('StockMovementsPage (AC8)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng dòng nhập/điều chỉnh, dấu +/-, link chứng từ và lọc theo loại nghiệp vụ', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/stock-movements')) {
        return { ok: true, status: 200, json: async () => MOVEMENTS_FIXTURE } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('KK2611230001')).toBeInTheDocument();
    });

    expect(screen.getByText('Lịch sử biến động tồn kho')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();

    const scLink = screen.getByRole('link', { name: 'Phiếu kiểm kê: KK2611230001' });
    expect(scLink).toHaveAttribute('href', '/stock-counts/sc-1');

    const inbLink = screen.getByRole('link', { name: 'Phiếu nhập: PN2611230001' });
    expect(inbLink).toHaveAttribute('href', '/inbound/inb-1');

    // Lọc theo nghiệp vụ ADJUSTMENT gửi đúng query
    await user.selectOptions(screen.getByLabelText('Lọc theo nghiệp vụ'), 'ADJUSTMENT');
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([callUrl]) =>
          String(callUrl).includes('movementType=ADJUSTMENT'),
        ),
      ).toBe(true);
    });
  });
});
