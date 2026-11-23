import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { type RiskReportResponse, type StockLedgerResponse } from '../types';
import { ReportsPage } from './ReportsPage';

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
  permissions: ['reports.read', 'catalog.read'],
};

const MOCK_LEDGER: StockLedgerResponse = {
  from: '2026-11-01',
  to: '2026-11-22',
  items: [
    {
      product: {
        id: 'prod-1',
        code: 'SP001',
        name: 'Sữa tươi tiệt trùng Vinamilk 180ml',
        unit: 'Thùng',
      },
      opening: '673',
      inbound: '688',
      outbound: '424',
      adjustment: '0',
      closing: '937',
    },
    {
      product: {
        id: 'prod-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'Lốc',
      },
      opening: '1378',
      inbound: '902',
      outbound: '149',
      adjustment: '-5',
      closing: '2126',
    },
  ],
  totals: {
    opening: '2051',
    inbound: '1590',
    outbound: '573',
    adjustment: '-5',
    closing: '3063',
  },
};

const MOCK_RISK_REPORT: RiskReportResponse = {
  latestRun: {
    id: 'run-latest-1',
    runType: 'FULL',
    modelVersion: 'rf-v1',
    finishedAt: '2026-11-22T06:00:00.000Z',
  },
  expiry: {
    evaluationDate: '2026-11-22',
    nearExpiry: { lots: 3, qty: '640' },
    expired: { lots: 4, qty: '837' },
  },
  byRiskLevel: [
    { level: 'critical', lots: 1, surplusQty: '313' },
    { level: 'high', lots: 1, surplusQty: '251' },
    { level: 'medium', lots: 0, surplusQty: '0' },
    { level: 'low', lots: 0, surplusQty: '0' },
  ],
  proposalsByStatus: { pending: 1, approved: 1 },
  executionsByStatus: { planned: 1 },
  hasSufficientActualData: false,
  lots: [
    {
      lot: {
        id: 'lot-1',
        lotCode: 'L26101802',
        expiryDate: '2026-11-30',
        status: 'active',
        onHandQty: '392',
      },
      product: {
        id: 'prod-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'Lốc',
      },
      forecastDemand: '141',
      estimatedSurplus: '251',
      actualHandledQty: null,
      riskLevel: 'high',
      actionType: 'CONTACT_AGENCY',
      proposalStatus: 'pending',
      executionStatus: null,
      runId: 'run-latest-1',
      proposalId: 'prop-1',
    },
  ],
};

function renderReportsPage(initialPath = '/reports') {
  localStorage.setItem('kho_ai_access_token', 'secret-jwt-token');

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => MANAGER_USER } as Response;
    }
    if (url.includes('/product-groups')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 'grp-1', code: 'SUA', name: 'Sữa & chế phẩm' }],
      } as Response;
    }
    if (url.includes('/products?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 'prod-2', code: 'SP002', name: 'Sữa chua uống' }] }),
      } as Response;
    }
    if (url.includes('/reports/stock-ledger.xlsx')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'attachment; filename="Bao-cao-NXT_2026-11-01_2026-11-22.xlsx"',
        }),
        blob: async () => new Blob(['xlsx-binary']),
      } as unknown as Response;
    }
    if (url.includes('/reports/stock-ledger/monthly')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { month: '2026-10', inbound: '5800', outbound: '3400' },
          { month: '2026-11', inbound: '5824', outbound: '2752' },
        ],
      } as Response;
    }
    if (url.includes('/reports/stock-ledger')) {
      return { ok: true, status: 200, json: async () => MOCK_LEDGER } as Response;
    }
    if (url.includes('/reports/risk')) {
      return { ok: true, status: 200, json: async () => MOCK_RISK_REPORT } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <ReportsPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { fetchSpy };
}

describe('ReportsPage (T-016 AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị bảng NXT có dấu "—" khi điều chỉnh = 0, dòng Tổng, link sang lịch sử biến động và gọi đúng URL xuất Excel', async () => {
    const user = userEvent.setup();
    const createObjectUrlSpy = vi.fn(() => 'blob:mock-xlsx');
    const revokeObjectUrlSpy = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectUrlSpy,
    });

    const { fetchSpy } = renderReportsPage();

    await waitFor(() => {
      expect(screen.getByText('SP001')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Tồn cuối kỳ = tồn đầu kỳ + nhập − xuất ± điều chỉnh'),
    ).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Tổng')).toBeInTheDocument();
    expect(screen.getByText('3.063')).toBeInTheDocument();

    // Link sản phẩm trỏ sang /stock-movements có productId, from, to
    const prodLink = screen.getByRole('link', { name: /SP001/ });
    expect(prodLink.getAttribute('href')).toBe(
      '/stock-movements?productId=prod-1&from=2026-11-01&to=2026-11-22',
    );

    // Bấm Xuất Excel → gọi /reports/stock-ledger.xlsx kèm Authorization header
    await user.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => {
      const xlsxCall = fetchSpy.mock.calls.find(([url]) =>
        String(url).includes('/reports/stock-ledger.xlsx'),
      );
      expect(xlsxCall).toBeDefined();
      const headers = xlsxCall?.[1]?.headers as Headers | undefined;
      expect(headers?.get('Authorization')).toBe('Bearer secret-jwt-token');
    });

    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalled();
  });

  it('chuyển sang tab Rủi ro cận hạn hiển thị tách số liệu dự báo/tồn dư/thực tế và thông báo thiếu dữ liệu thực tế', async () => {
    const user = userEvent.setup();
    renderReportsPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Rủi ro cận hạn' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Rủi ro cận hạn' }));

    await waitFor(() => {
      expect(screen.getByText('L26101802')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Chưa đủ dữ liệu thực tế để đánh giá hiệu quả xử lý/),
    ).toBeInTheDocument();
    expect(screen.getByText('141 Lốc')).toBeInTheDocument();
    expect(screen.getByText('251 Lốc')).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu thực tế')).toBeInTheDocument();

    const proposalLink = screen.getByRole('link', { name: 'Chờ duyệt' });
    expect(proposalLink.getAttribute('href')).toBe('/proposals/prop-1');
  });
});
