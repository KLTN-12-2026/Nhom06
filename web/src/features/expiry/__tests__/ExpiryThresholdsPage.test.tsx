import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { ExpiryThresholdsPage } from '../pages/ExpiryThresholdsPage';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['catalog.read', 'expiry.read'],
};

const MANAGER_USER: AuthUser = {
  id: 'u-manager',
  username: 'quanly',
  fullName: 'Nguyễn Văn Dương',
  role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  permissions: ['catalog.read', 'expiry.read', 'expiry.manage'],
};

const THRESHOLDS_FIXTURE = {
  global: {
    id: 'thr-global',
    warningDays: 30,
    criticalDays: 7,
    minDeliveryDays: 7,
    effectiveFrom: '2026-01-01',
  },
  overrides: [
    {
      id: 'thr-sp002',
      scope: 'PRODUCT' as const,
      target: { id: 'p-2', code: 'SP002', name: 'Sữa chua uống TH true YOGURT' },
      warningDays: 10,
      effectiveFrom: '2026-11-20',
    },
    {
      id: 'thr-sua',
      scope: 'PRODUCT_GROUP' as const,
      target: { id: 'g-1', code: 'SUA', name: 'Sữa và chế phẩm từ sữa' },
      warningDays: 45,
      effectiveFrom: '2026-11-20',
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
          <MemoryRouter initialEntries={['/expiry-thresholds']}>
            <ExpiryThresholdsPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function mockApisForUser(user: AuthUser) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => user } as Response;
    }
    if (url.includes('/product-groups')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 'g-1', code: 'SUA', name: 'Sữa', description: null, status: 'active' }],
      } as Response;
    }
    if (url.includes('/products')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'p-2',
              code: 'SP002',
              name: 'Sữa chua uống TH true YOGURT',
              group: { id: 'g-1', code: 'SUA', name: 'Sữa' },
              unit: 'lốc',
              shelfLifeDays: 45,
              onHandQty: '0',
              status: 'active',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        }),
      } as Response;
    }
    if (url.endsWith('/expiry-thresholds') && method === 'GET') {
      return { ok: true, status: 200, json: async () => THRESHOLDS_FIXTURE } as Response;
    }
    if (url.endsWith('/expiry-thresholds/global') && method === 'PUT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...THRESHOLDS_FIXTURE.global,
          warningDays: 25,
          criticalDays: 5,
          minDeliveryDays: 7,
        }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
}

describe('ExpiryThresholdsPage (AC8)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('nhanvien chỉ xem được cấu hình, không thấy nút thêm/lưu/sửa/kết thúc', async () => {
    mockApisForUser(STAFF_USER);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('SP002 - Sữa chua uống TH true YOGURT')).toBeInTheDocument();
    });

    expect(screen.getByText('Sữa và chế phẩm từ sữa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm ngưỡng riêng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết thúc' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Số ngày cảnh báo cận hạn')).toBeDisabled();
  });

  it('quanly kiểm tra validate criticalDays <= warningDays trên form ngưỡng chung trước khi gửi', async () => {
    const fetchSpy = mockApisForUser(MANAGER_USER);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Thêm ngưỡng riêng' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(2);

    const warningInput = screen.getByLabelText('Số ngày cảnh báo cận hạn');
    const criticalInput = screen.getByLabelText('Số ngày nguy cấp');

    await user.clear(warningInput);
    await user.type(warningInput, '10');
    await user.clear(criticalInput);
    await user.type(criticalInput, '15');

    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      expect(
        screen.getByText('Số ngày nguy cấp không được lớn hơn số ngày cảnh báo cận hạn'),
      ).toBeInTheDocument();
    });

    // Không gửi PUT khi form không hợp lệ
    expect(
      fetchSpy.mock.calls.some(
        ([callUrl, init]) =>
          String(callUrl).endsWith('/expiry-thresholds/global') &&
          (init?.method ?? 'GET').toUpperCase() === 'PUT',
      ),
    ).toBe(false);

    // Sửa lại critical = 5 (<= 10) thì gửi PUT thành công
    await user.clear(criticalInput);
    await user.type(criticalInput, '5');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([callUrl, init]) =>
            String(callUrl).endsWith('/expiry-thresholds/global') &&
            (init?.method ?? 'GET').toUpperCase() === 'PUT',
        ),
      ).toBe(true);
    });
  });
});
