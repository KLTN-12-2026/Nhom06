import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type DashboardResponse } from '../types';
import { DashboardPage } from './DashboardPage';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 640, height: 240 }}>{children}</div>
    ),
  };
});

const MANAGER_USER: AuthUser = {
  id: 'u-quanly',
  username: 'quanly',
  fullName: 'Nguyễn Văn Dương',
  role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  permissions: [
    'reports.read',
    'inventory.read',
    'analysis.read',
    'proposals.read',
    'orders.read',
  ],
};

const ADMIN_USER: AuthUser = {
  id: 'u-admin',
  username: 'admin',
  fullName: 'Phan Thanh Đức',
  role: { code: 'ADMIN', name: 'Quản trị viên' },
  permissions: [
    'reports.read',
    'inventory.read',
    'analysis.read',
    'proposals.read',
    'orders.read',
  ],
};

const NO_ANALYSIS_USER: AuthUser = {
  id: 'u-basic',
  username: 'nv_basic',
  fullName: 'Nhân viên cơ bản',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['inventory.read', 'orders.read'],
};

const STAFF_USER: AuthUser = {
  id: 'u-nhanvien',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['inventory.read', 'analysis.read', 'proposals.read', 'orders.read'],
};

const FULL_DASHBOARD: DashboardResponse = {
  asOf: '2026-11-22',
  totalOnHand: '9855',
  lotsInStock: 40,
  nearExpiry: { lots: 3, qty: '640' },
  expired: { lots: 4, qty: '837' },
  valueAtRisk: { amount: '103000000', surplusQty: '1675', lotsWithoutCost: 1 },
  monthlyInOut: [
    { month: '2025-12', inbound: '5800', outbound: '5100' },
    { month: '2026-11', inbound: '5824', outbound: '2752' },
  ],
  riskSummary: [
    { level: 'critical', lots: 4, surplusQty: '837' },
    { level: 'high', lots: 1, surplusQty: '251' },
    { level: 'medium', lots: 4, surplusQty: '587' },
    { level: 'low', lots: 31, surplusQty: '0' },
  ],
  topLots: [
    {
      lotId: 'lot-1',
      lotCode: 'L26091802',
      product: { id: 'p-2', code: 'SP002', name: 'Sữa chua uống TH true YOGURT 180ml', unit: 'Lốc' },
      onHandQty: '313',
      expiryDate: '2026-10-31',
      daysRemaining: -22,
      warningDays: 30,
      expirySeverity: 'expired',
      riskLevel: 'critical',
      estimatedSurplusQty: '313',
    },
  ],
  pendingProposals: 8,
  pendingOrders: [
    {
      id: 'ord-1',
      orderNo: 'DH2611229001',
      orderDate: '2026-11-22',
      status: 'confirmed',
      agency: { id: 'ag-1', code: 'DL001', name: 'Đại lý Minh Hương' },
      itemCount: 3,
    },
  ],
};

function renderDashboard(authUser: AuthUser, payload: DashboardResponse = FULL_DASHBOARD) {
  localStorage.setItem('kho_ai_access_token', 'test-token');

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => authUser } as Response;
    }
    if (url.includes('/reports/dashboard')) {
      return { ok: true, status: 200, json: async () => payload } as Response;
    }
    if (url.endsWith('/health')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', db: 'up', ml: 'up' }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('DashboardPage (T-016 AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đủ 4 KPI, biểu đồ 12 tháng, mức rủi ro, lô ưu tiên, đơn chờ xuất và ẩn thẻ dịch vụ với quản lý', async () => {
    renderDashboard(MANAGER_USER);

    await waitFor(() => {
      expect(screen.getByText('9.855')).toBeInTheDocument();
    });

    expect(screen.getByText('Số liệu tính đến ngày 22/11/2026')).toBeInTheDocument();
    expect(screen.getByText('40 lô đang còn hàng')).toBeInTheDocument();
    expect(screen.getByText('theo ngưỡng riêng của từng mặt hàng')).toBeInTheDocument();
    expect(screen.getByText('837 đơn vị cần xử lý')).toBeInTheDocument();
    expect(screen.getByText('103')).toBeInTheDocument();
    expect(screen.getByText('triệu đ')).toBeInTheDocument();
    expect(screen.getByText('Từ 1.675 đơn vị tồn dư ước tính')).toBeInTheDocument();
    expect(screen.getByText('1 lô chưa có đơn giá')).toBeInTheDocument();

    expect(screen.getByTestId('monthly-inout-chart')).toBeInTheDocument();
    expect(screen.getByText('Mức rủi ro tồn dư')).toBeInTheDocument();
    expect(screen.getByText('8 đề xuất chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText('L26091802')).toBeInTheDocument();
    expect(screen.getByText('DH2611229001')).toBeInTheDocument();
    expect(screen.getByText('3 mặt hàng')).toBeInTheDocument();

    // Thẻ trạng thái dịch vụ chỉ hiển thị với ADMIN
    expect(screen.queryByTestId('system-health-compact-card')).not.toBeInTheDocument();
  });

  it('hiển thị trạng thái rỗng rõ ràng (không bịa số 0) khi chưa có lượt phân tích', async () => {
    renderDashboard(MANAGER_USER, {
      ...FULL_DASHBOARD,
      valueAtRisk: null,
      riskSummary: null,
    });

    await waitFor(() => {
      expect(screen.getByText('Chưa có dữ liệu phân tích')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Chưa có dữ liệu phân tích tồn dư/),
    ).toBeInTheDocument();
  });

  it('ẩn ô Giá trị có nguy cơ mất và khối Mức rủi ro tồn dư khi thiếu quyền analysis.read', async () => {
    renderDashboard(NO_ANALYSIS_USER, {
      ...FULL_DASHBOARD,
      valueAtRisk: null,
      riskSummary: null,
      pendingProposals: null,
    });

    await waitFor(() => {
      expect(screen.getByText('9.855')).toBeInTheDocument();
    });

    expect(screen.queryByText('Giá trị có nguy cơ mất')).not.toBeInTheDocument();
    expect(screen.queryByText('Mức rủi ro tồn dư')).not.toBeInTheDocument();
  });

  it('ẩn ô Giá trị có nguy cơ mất khi thiếu quyền reports.read (nhanvien có analysis.read) nhưng vẫn hiện Mức rủi ro tồn dư (T-024 AC4)', async () => {
    renderDashboard(STAFF_USER, {
      ...FULL_DASHBOARD,
      valueAtRisk: null,
    });

    await waitFor(() => {
      expect(screen.getByText('9.855')).toBeInTheDocument();
    });

    expect(screen.queryByText('Giá trị có nguy cơ mất')).not.toBeInTheDocument();
    expect(screen.queryByText('triệu đ')).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có dữ liệu phân tích')).not.toBeInTheDocument();
    // Khối không chứa tiền vẫn hiển thị bình thường cho nhân viên có analysis.read
    expect(screen.getByText('Mức rủi ro tồn dư')).toBeInTheDocument();
    expect(screen.getByText('8 đề xuất chờ duyệt')).toBeInTheDocument();
  });

  it('hiển thị thẻ trạng thái dịch vụ thu gọn ở cuối trang cho tài khoản ADMIN', async () => {
    renderDashboard(ADMIN_USER);

    await waitFor(() => {
      expect(screen.getByTestId('system-health-compact-card')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText('Hoạt động (up)')).toHaveLength(2);
    });
  });
});
