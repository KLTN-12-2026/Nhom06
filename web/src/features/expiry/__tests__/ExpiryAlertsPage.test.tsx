import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { ExpiryAlertsPage } from '../pages/ExpiryAlertsPage';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['catalog.read', 'expiry.read', 'proposals.read'],
};

const SUMMARY_FIXTURE = {
  evaluationDate: '2026-11-22',
  expired: { lots: 4, qty: '837' },
  nearExpiry: { lots: 3, qty: '1029' },
  totalAlertLots: 7,
  global: { warningDays: 30, criticalDays: 7, minDeliveryDays: 7 },
  overridesSummary: 'Nhóm Sữa 45 ngày \u00b7 riêng SP002 10 ngày',
};

const ALERTS_FIXTURE = {
  evaluationDate: '2026-11-22',
  total: 3,
  page: 1,
  pageSize: 50,
  items: [
    {
      lot: { id: 'lot-1', lotCode: 'L26081802', status: 'active' },
      product: {
        id: 'p-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'lốc',
        group: { id: 'g-1', code: 'SUA', name: 'Sữa' },
      },
      expiryDate: '2026-09-30',
      daysRemaining: -53,
      onHandQty: '44',
      severity: 'expired',
      thresholdApplied: { id: 't-2', scope: 'PRODUCT', warningDays: 10, criticalDays: 7 },
    },
    {
      lot: { id: 'lot-2', lotCode: 'L26101802', status: 'active' },
      product: {
        id: 'p-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'lốc',
        group: { id: 'g-1', code: 'SUA', name: 'Sữa' },
      },
      expiryDate: '2026-11-29',
      daysRemaining: 7,
      onHandQty: '392',
      severity: 'critical',
      thresholdApplied: { id: 't-2', scope: 'PRODUCT', warningDays: 10, criticalDays: 7 },
    },
    {
      lot: { id: 'lot-3', lotCode: 'L26101804', status: 'active' },
      product: {
        id: 'p-4',
        code: 'SP004',
        name: 'Nước ép Tropicana Twister 1L',
        unit: 'thùng',
        group: { id: 'g-2', code: 'NGK', name: 'Nước giải khát' },
      },
      expiryDate: '2026-12-12',
      daysRemaining: 20,
      onHandQty: '249',
      severity: 'warning',
      thresholdApplied: { id: 't-1', scope: 'GLOBAL', warningDays: 30, criticalDays: 7 },
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
          <MemoryRouter initialEntries={['/expiry-alerts']}>
            <ExpiryAlertsPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ExpiryAlertsPage (AC8)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng KPI cards, ngày cập nhật, bảng cảnh báo với badge, "quá N ngày" và link Xem đề xuất', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/products')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [], total: 0, page: 1, pageSize: 200 }),
        } as Response;
      }
      if (url.includes('/expiry-alerts/summary')) {
        return { ok: true, status: 200, json: async () => SUMMARY_FIXTURE } as Response;
      }
      if (url.includes('/expiry-alerts')) {
        return { ok: true, status: 200, json: async () => ALERTS_FIXTURE } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('L26081802')).toBeInTheDocument();
    });

    expect(screen.getByText('Cập nhật ngày 22/11/2026')).toBeInTheDocument();

    // KPI cards
    expect(screen.getByText('837 đơn vị')).toBeInTheDocument();
    expect(screen.getByText('1.029 đơn vị')).toBeInTheDocument();
    expect(screen.getByText('Nhóm Sữa 45 ngày, riêng SP002 10 ngày')).toBeInTheDocument();

    // ExpiryBar & badges
    expect(screen.getByText('quá 53 ngày')).toBeInTheDocument();
    expect(screen.getByText('còn 7 ngày')).toBeInTheDocument();
    expect(screen.getByText('còn 20 ngày')).toBeInTheDocument();

    const expiredDateCell = screen.getByText('30/09/2026');
    expect(expiredDateCell.className).toContain('line-through');

    expect(screen.getAllByText('Hết hạn').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nguy cấp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Trung bình').length).toBeGreaterThanOrEqual(1);

    // Link Xem đề xuất
    const proposalLinks = screen.getAllByRole('link', { name: 'Xem đề xuất' });
    expect(proposalLinks[0]).toHaveAttribute('href', '/proposals?lotId=lot-1');

    // Lọc tình trạng gọi lại API với query severity=expired
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Lọc theo tình trạng'), 'expired');
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([callUrl]) => String(callUrl).includes('severity=expired')),
      ).toBe(true);
    });
  });
});
