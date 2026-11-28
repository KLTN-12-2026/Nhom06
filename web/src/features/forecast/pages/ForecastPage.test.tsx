import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type DailyHistoryResponse, type LatestForecastResponse } from '../types';
import { ForecastPage } from './ForecastPage';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 640, height: 260 }}>{children}</div>
    ),
  };
});

const MOCK_HISTORY: DailyHistoryResponse = {
  days: 90,
  dataSource: 'SIMULATED',
  items: [
    { date: '2026-11-20', totalQty: '410.000' },
    { date: '2026-11-21', totalQty: '520.000' },
    { date: '2026-11-22', totalQty: '485.000' },
  ],
};

const MOCK_LATEST: LatestForecastResponse = {
  run: {
    id: 'run-1',
    modelVersion: 'rf-v1',
    finishedAt: '2026-11-23T09:00:00.000Z',
    horizonDays: 60,
    forecastStart: '2026-11-23',
    dataSource: 'SIMULATED',
    metrics: {
      model: { mean_mae: 5.38, mean_rmse: 8.06 },
      baseline: { mean_mae: 6.65, mean_rmse: 9.17 },
      modelInfo: {
        trainStart: '2024-12-01',
        trainEnd: '2026-09-23',
        nRows: 12680,
        dataSource: 'mô phỏng',
      },
      horizonDays: 60,
      productCount: 20,
      dataSource: 'SIMULATED',
      skipped: [],
    },
  },
  items: Array.from({ length: 20 }, (_, i) => {
    const code = `SP${String(i + 1).padStart(3, '0')}`;
    return {
      productId: `prod-${i + 1}`,
      code,
      name: `Sản phẩm mẫu ${i + 1}`,
      forecastQty: i === 0 ? '1322.000' : i === 1 ? '1061.000' : '800.000',
      baselineQty: '1290.000',
      onHandQty: i === 0 ? '937.000' : i === 1 ? '2131.000' : '0.000',
      daysToSellOut: i === 0 ? 43 : i === 1 ? 121 : i === 2 ? null : 0,
      assessment: i === 1 ? 'OVERSTOCK' : 'BALANCED',
    };
  }),
};

const MANAGER_USER: AuthUser = {
  id: 'u-quanly',
  username: 'quanly',
  fullName: 'Nguyễn Văn Dương',
  role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  permissions: ['forecast.read', 'analysis.read', 'analysis.run'],
};

const STAFF_USER: AuthUser = {
  id: 'u-nhanvien',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['forecast.read', 'analysis.read'],
};

function renderForecastPage(
  authUser: AuthUser,
  options: {
    latest?: LatestForecastResponse;
    postRunStatus?: number;
    postRunBody?: unknown;
  } = {},
) {
  localStorage.setItem('kho_ai_access_token', 'test-token');
  const latestPayload = options.latest ?? MOCK_LATEST;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => authUser } as Response;
    }
    if (url.includes('/forecasts/latest')) {
      return { ok: true, status: 200, json: async () => latestPayload } as Response;
    }
    if (url.includes('/forecasts/history/daily')) {
      return { ok: true, status: 200, json: async () => MOCK_HISTORY } as Response;
    }
    if (url.includes('/forecasts/runs') && method === 'POST') {
      const status = options.postRunStatus ?? 201;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => options.postRunBody ?? { id: 'run-2', status: 'succeeded' },
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter>
            <ForecastPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ForecastPage (T-012 AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị nhãn dữ liệu mô phỏng, biểu đồ, thông tin lượt chạy và bảng 20 sản phẩm cho quản lý', async () => {
    renderForecastPage(MANAGER_USER);

    await waitFor(() => {
      expect(screen.getByText('SP001')).toBeInTheDocument();
    });

    expect(screen.getByText('Dữ liệu mô phỏng · 01/12/2024–23/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Nhu cầu thực tế 90 ngày gần nhất')).toBeInTheDocument();
    expect(screen.getByTestId('demand-history-chart')).toBeInTheDocument();
    expect(screen.getByText('Thông tin lượt chạy')).toBeInTheDocument();
    expect(screen.getByText('rf-v1')).toBeInTheDocument();
    expect(screen.getByText('5,38 (baseline 6,65)')).toBeInTheDocument();
    expect(screen.getByText(/RMSE: 8,06/)).toBeInTheDocument();

    expect(screen.getByText('SP020')).toBeInTheDocument();
    expect(screen.getByText('1.322')).toBeInTheDocument();
    expect(screen.getByText('43 ngày')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Tồn nhiều hơn nhu cầu')).toBeInTheDocument();
    expect(screen.getAllByText('Cân đối').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Chạy dự báo' })).toBeInTheDocument();
  });

  it('ẩn nút Chạy dự báo đối với nhân viên không có quyền analysis.run', async () => {
    renderForecastPage(STAFF_USER);

    await waitFor(() => {
      expect(screen.getByText('SP001')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Chạy dự báo' })).not.toBeInTheDocument();
  });

  it('hiển thị trạng thái rỗng khi chưa có lượt chạy nào kèm nút Chạy dự báo cho quản lý', async () => {
    renderForecastPage(MANAGER_USER, { latest: { run: null, items: [] } });

    await waitFor(() => {
      expect(screen.getByText(/Chưa có lượt dự báo nào\./)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: 'Chạy dự báo' }).length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('hiển thị thông báo toast khi bấm Chạy dự báo bị lỗi 502 từ dịch vụ ML', async () => {
    const user = userEvent.setup();
    renderForecastPage(MANAGER_USER, {
      postRunStatus: 502,
      postRunBody: { statusCode: 502, message: 'Dịch vụ dự báo không phản hồi' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Chạy dự báo' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Chạy dự báo' }));

    await waitFor(() => {
      expect(screen.getByText('Dịch vụ dự báo không phản hồi')).toBeInTheDocument();
    });
  });
});
