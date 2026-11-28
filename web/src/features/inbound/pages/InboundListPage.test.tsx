import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { InboundListPage } from './InboundListPage';

const MOCK_LIST = {
  items: [
    {
      id: 'rec-1',
      receiptNo: 'PN2611220001',
      receiptDate: '2026-11-22',
      status: 'draft' as const,
      notes: null,
      supplier: { id: 'sup-1', code: 'NCC001', name: 'Công ty TNHH Mondelez Kinh Đô' },
      creator: { id: 'u-1', fullName: 'Trương Thành Lê' },
      confirmer: null,
      confirmedAt: null,
      createdAt: '2026-11-22T08:00:00.000Z',
      updatedAt: '2026-11-22T08:00:00.000Z',
      lineCount: 2,
      totalQuantity: '459',
      totalAmount: '193740000',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

const MOCK_LIST_NO_MONEY = {
  items: [
    {
      id: 'rec-1',
      receiptNo: 'PN2611220001',
      receiptDate: '2026-11-22',
      status: 'draft' as const,
      notes: null,
      supplier: { id: 'sup-1', code: 'NCC001', name: 'Công ty TNHH Mondelez Kinh Đô' },
      creator: { id: 'u-1', fullName: 'Trương Thành Lê' },
      confirmer: null,
      confirmedAt: null,
      createdAt: '2026-11-22T08:00:00.000Z',
      updatedAt: '2026-11-22T08:00:00.000Z',
      lineCount: 2,
      totalQuantity: '459',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

function renderListPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter>
            <InboundListPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('InboundListPage (AC10)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng cột bảng và ẩn nút Lập phiếu nhập với quản lý (thiếu inbound.create)', async () => {
    const managerUser: AuthUser = {
      id: 'u-mgr',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['inbound.read', 'inbound.confirm', 'catalog.read', 'reports.read'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => managerUser } as Response;
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/inbound-receipts')) {
        return { ok: true, status: 200, json: async () => MOCK_LIST } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderListPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'PN2611220001' })).toBeInTheDocument();
    });

    expect(screen.getByText('22/11/2026')).toBeInTheDocument();
    expect(screen.getByText('459')).toBeInTheDocument();
    expect(screen.getByText('193.740.000')).toBeInTheDocument();
    expect(screen.getByText('Trương Thành Lê')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lập phiếu nhập' })).not.toBeInTheDocument();
  });

  it('ẩn cột Giá trị (không hiện 0 hay —) với nhân viên thiếu quyền reports.read (T-024 AC4)', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['inbound.read', 'inbound.create', 'inbound.confirm', 'catalog.read'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => staffUser } as Response;
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/inbound-receipts')) {
        return { ok: true, status: 200, json: async () => MOCK_LIST_NO_MONEY } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderListPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'PN2611220001' })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Lập phiếu nhập' })).toBeInTheDocument();
    expect(screen.getByText('459')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Giá trị' })).not.toBeInTheDocument();
    expect(screen.queryByText('193.740.000')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('ẩn cột Giá trị nếu API không trả totalAmount để tránh hiểu nhầm bằng 0 (T-024 AC4)', async () => {
    const managerUser: AuthUser = {
      id: 'u-mgr',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['inbound.read', 'inbound.confirm', 'catalog.read', 'reports.read'],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => managerUser } as Response;
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/inbound-receipts')) {
        return { ok: true, status: 200, json: async () => MOCK_LIST_NO_MONEY } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderListPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'PN2611220001' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('columnheader', { name: 'Giá trị' })).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('chuyển sang trang 2 và quay về trang 1 khi đổi bộ lọc', async () => {
    const managerUser: AuthUser = {
      id: 'u-mgr',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['inbound.read', 'inbound.confirm', 'catalog.read', 'reports.read'],
    };
    const requestedUrls: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => managerUser } as Response;
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/inbound-receipts')) {
        requestedUrls.push(url);
        const requestedPage = new URL(url, 'http://localhost').searchParams.get('page');
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...MOCK_LIST, total: 90, page: Number(requestedPage) }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('Trang 1 / 2 (90 dòng)')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => {
      expect(
        requestedUrls.some((url) => url.includes('page=2&pageSize=50')),
      ).toBe(true);
    });

    await user.selectOptions(screen.getByLabelText('Lọc theo trạng thái'), 'draft');
    await waitFor(() => {
      expect(
        requestedUrls.some(
          (url) => url.includes('status=draft') && url.includes('page=1&pageSize=50'),
        ),
      ).toBe(true);
    });
    expect(screen.getByText('Trang 1 / 2 (90 dòng)')).toBeInTheDocument();
  });
});
