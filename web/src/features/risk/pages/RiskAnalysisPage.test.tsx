import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import {
  type AnalysisRunHistoryResponse,
  type LatestRiskResponse,
  type LotRiskDetailResponse,
} from '../types';
import { RiskAnalysisPage } from './RiskAnalysisPage';

const MOCK_LATEST_RISK: LatestRiskResponse = {
  run: {
    id: 'run-full-1',
    trigger: 'MANUAL',
    requestedBy: { id: 'u-quanly', username: 'quanly', fullName: 'Nguyễn Văn Dương' },
    finishedAt: '2026-11-23T09:53:00.000Z',
    lotCount: 4,
    modelVersion: 'rf-v1',
    evaluationDate: '2026-11-23',
    warnings: [],
  },
  items: [
    {
      assessmentId: 'a-exp',
      lot: {
        id: 'lot-exp',
        lotCode: 'L26091802',
        expiryDate: '2026-11-01',
        daysRemaining: -22,
        status: 'active',
      },
      product: { id: 'p-2', code: 'SP002', name: 'Nước ngọt có gas 330ml' },
      onHandSnapshot: '313.000',
      allocatedDemand: '0.000',
      estimatedConsumption: '0.000',
      estimatedSurplus: '313.000',
      riskLevel: 'critical',
      isExpired: true,
    },
    {
      assessmentId: 'a-high',
      lot: {
        id: 'lot-high',
        lotCode: 'L26101802',
        expiryDate: '2026-12-01',
        daysRemaining: 8,
        status: 'active',
      },
      product: { id: 'p-2', code: 'SP002', name: 'Nước ngọt có gas 330ml' },
      onHandSnapshot: '392.000',
      allocatedDemand: '141.000',
      estimatedConsumption: '141.000',
      estimatedSurplus: '251.000',
      riskLevel: 'high',
      isExpired: false,
    },
    {
      assessmentId: 'a-med',
      lot: {
        id: 'lot-med',
        lotCode: 'L26110302',
        expiryDate: '2026-12-17',
        daysRemaining: 24,
        status: 'active',
      },
      product: { id: 'p-2', code: 'SP002', name: 'Nước ngọt có gas 330ml' },
      onHandSnapshot: '451.000',
      allocatedDemand: '283.000',
      estimatedConsumption: '283.000',
      estimatedSurplus: '168.000',
      riskLevel: 'medium',
      isExpired: false,
    },
    {
      assessmentId: 'a-low',
      lot: {
        id: 'lot-low',
        lotCode: 'L26101801',
        expiryDate: '2027-04-15',
        daysRemaining: 143,
        status: 'active',
      },
      product: { id: 'p-1', code: 'SP001', name: 'Sữa tươi tiệt trùng 1L' },
      onHandSnapshot: '249.000',
      allocatedDemand: '3151.000',
      estimatedConsumption: '249.000',
      estimatedSurplus: '0.000',
      riskLevel: 'low',
      isExpired: false,
    },
  ],
};

const MOCK_LOT_DETAIL: LotRiskDetailResponse = {
  run: MOCK_LATEST_RISK.run!,
  assessment: {
    ...MOCK_LATEST_RISK.items[1],
    calculatedAt: '2026-11-23T09:53:00.000Z',
    lot: {
      ...MOCK_LATEST_RISK.items[1].lot,
      receivedAt: '2026-10-18',
    },
    product: {
      ...MOCK_LATEST_RISK.items[1].product,
      unit: 'Lốc',
    },
    basis: {
      evaluationDate: '2026-11-23',
      expiryDate: '2026-12-01',
      daysRemaining: 8,
      isExpired: false,
      lotStatus: 'active',
      minDeliveryDays: 7,
      windowStart: '2026-11-23',
      windowEnd: '2026-11-24',
      windowDays: 2,
      forecastHorizonStart: '2026-11-23',
      forecastHorizonEnd: '2027-01-21',
      inHorizonDays: 2,
      extrapolatedDays: 0,
      extrapolatedDailyRate: '28.500',
      demandWindow: '141.000',
      consumedByEarlierLots: '0.000',
      allocatedDemand: '141.000',
      estimatedConsumption: '141.000',
      estimatedSurplus: '251.000',
      fefoOrder: 1,
      ineligibleReason: null,
      highRiskDaysThreshold: 14,
      forecastRunId: 'run-full-1',
      modelVersion: 'rf-v1',
    },
  },
};

const MOCK_RUNS: AnalysisRunHistoryResponse = {
  items: [
    {
      id: 'run-full-1',
      runType: 'FULL',
      trigger: 'MANUAL',
      status: 'succeeded',
      requestedBy: { id: 'u-quanly', username: 'quanly', fullName: 'Nguyễn Văn Dương' },
      lotCount: 4,
      modelVersion: 'rf-v1',
      evaluationDate: '2026-11-23',
      startedAt: '2026-11-23T09:52:00.000Z',
      finishedAt: '2026-11-23T09:53:00.000Z',
      createdAt: '2026-11-23T09:52:00.000Z',
      errorMessage: null,
      warningsCount: 0,
    },
    {
      id: 'run-full-0',
      runType: 'FULL',
      trigger: 'SCHEDULED',
      status: 'failed',
      requestedBy: null,
      lotCount: 0,
      modelVersion: null,
      evaluationDate: null,
      startedAt: '2026-11-20T04:53:00.000Z',
      finishedAt: '2026-11-20T04:53:30.000Z',
      createdAt: '2026-11-20T04:53:00.000Z',
      errorMessage: 'Dịch vụ dự báo không phản hồi sau 30 giây',
      warningsCount: 0,
    },
  ],
};

const MANAGER_USER: AuthUser = {
  id: 'u-quanly',
  username: 'quanly',
  fullName: 'Nguyễn Văn Dương',
  role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  permissions: ['analysis.read', 'analysis.run', 'proposals.read'],
};

const STAFF_USER: AuthUser = {
  id: 'u-nhanvien',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['analysis.read', 'proposals.read'],
};

function renderRiskPage(
  authUser: AuthUser,
  options: {
    latest?: LatestRiskResponse;
    runs?: AnalysisRunHistoryResponse;
    postStatus?: number;
    postBody?: unknown;
  } = {},
) {
  localStorage.setItem('kho_ai_access_token', 'test-token');
  const latestPayload = options.latest ?? MOCK_LATEST_RISK;
  const runsPayload = options.runs ?? MOCK_RUNS;

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => authUser } as Response;
    }
    if (url.includes('/analysis/risk/latest')) {
      const parsed = new URL(url, 'http://localhost');
      const filterLevel = parsed.searchParams.get('riskLevel');
      const filteredItems = filterLevel
        ? latestPayload.items.filter((item) => item.riskLevel === filterLevel)
        : latestPayload.items;
      return {
        ok: true,
        status: 200,
        json: async () => ({ run: latestPayload.run, items: filteredItems }),
      } as Response;
    }
    if (url.includes('/analysis/risk/lots/')) {
      return { ok: true, status: 200, json: async () => MOCK_LOT_DETAIL } as Response;
    }
    if (url.includes('/analysis/runs') && method === 'GET') {
      return { ok: true, status: 200, json: async () => runsPayload } as Response;
    }
    if (url.includes('/analysis/runs') && method === 'POST') {
      const status = options.postStatus ?? 201;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () =>
          options.postBody ?? {
            id: 'run-new',
            runType: 'FULL',
            trigger: 'MANUAL',
            status: 'succeeded',
            lotCount: 4,
            evaluationDate: '2026-11-23',
          },
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    fetchMock,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter>
              <RiskAnalysisPage />
            </MemoryRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('RiskAnalysisPage (T-013 AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng badge 4 mức rủi ro, cột tồn dư cam khi > 0, nút Đề xuất và lịch sử lượt chạy', async () => {
    renderRiskPage(MANAGER_USER);

    await waitFor(() => {
      expect(screen.getByText('L26101802')).toBeInTheDocument();
    });

    expect(screen.getByText('Phân tích nguy cơ tồn dư')).toBeInTheDocument();
    expect(screen.getByText(/Lượt chạy gần nhất: thủ công, 23\/11\/2026 · 4 lô/)).toBeInTheDocument();
    expect(screen.getByText(/Nhu cầu dự báo của một sản phẩm được phân bổ cho các lô theo FEFO/)).toBeInTheDocument();

    // 4 mức rủi ro
    expect(screen.getAllByText('Hết hạn').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nguy cấp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Trung bình').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Thấp').length).toBeGreaterThanOrEqual(1);

    // Tồn dư > 0 có class màu cam (--risk-medium-kpi) và link Đề xuất; tồn dư = 0 hiện "—"
    const surplus251 = screen.getByText('251');
    expect(surplus251).toHaveClass('text-[var(--risk-medium-kpi)]');

    const proposalLinks = screen.getAllByRole('link', { name: 'Đề xuất' });
    expect(proposalLinks).toHaveLength(3);
    expect(proposalLinks[1]).toHaveAttribute('href', '/proposals?lotId=lot-high');

    // Lịch sử lượt phân tích
    expect(screen.getByText('Lịch sử lượt phân tích')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn Dương')).toBeInTheDocument();
    expect(screen.getByText('Thành công')).toBeInTheDocument();
    expect(screen.getByText('Thất bại')).toBeInTheDocument();
    expect(screen.getByText('Dịch vụ dự báo không phản hồi sau 30 giây')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Phân tích lại' })).toBeInTheDocument();
  });

  it('bấm dòng lô mở dialog Căn cứ tính hiển thị basis đầy đủ và lọc theo mức rủi ro', async () => {
    const user = userEvent.setup();
    renderRiskPage(MANAGER_USER);

    await waitFor(() => {
      expect(screen.getByText('L26101802')).toBeInTheDocument();
    });

    await user.click(screen.getByText('L26101802'));

    await waitFor(() => {
      expect(screen.getByText('Căn cứ tính — Lô L26101802')).toBeInTheDocument();
    });
    expect(screen.getByText('Hạng #1')).toBeInTheDocument();
    expect(screen.getByText('7 ngày')).toBeInTheDocument();
    expect(screen.getByText('23/11/2026 – 24/11/2026 (2 ngày)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đóng' }));

    // Lọc theo mức Nguy cấp
    await user.selectOptions(screen.getByLabelText('Lọc theo mức rủi ro'), 'high');
    await waitFor(() => {
      expect(screen.queryByText('L26101801')).not.toBeInTheDocument();
    });
    expect(screen.getByText('L26101802')).toBeInTheDocument();
  });

  it('ẩn nút Phân tích lại đối với nhân viên không có quyền analysis.run', async () => {
    renderRiskPage(STAFF_USER);

    await waitFor(() => {
      expect(screen.getByText('L26101802')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Phân tích lại' })).not.toBeInTheDocument();
  });

  it('hiển thị trạng thái rỗng khi chưa có lượt nào và hiện toast lỗi 409 khi bấm Phân tích lại trùng lượt', async () => {
    const user = userEvent.setup();
    renderRiskPage(MANAGER_USER, {
      latest: { run: null, items: [] },
      runs: { items: [] },
      postStatus: 409,
      postBody: { statusCode: 409, message: 'Đang có lượt phân tích chạy' },
    });

    await waitFor(() => {
      expect(screen.getByText(/Chưa có lượt phân tích nguy cơ tồn dư nào\./)).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button', { name: 'Phân tích lại' });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText('Đang có lượt phân tích chạy')).toBeInTheDocument();
    });
  });
});
