import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { type AuthUser } from '@/features/auth/types';
import { type ProposalsListResponse } from '../types';
import { ProposalsListPage } from './ProposalsListPage';

const sampleListResponse: ProposalsListResponse = {
  summary: { pending: 8, total: 2 },
  items: [
    {
      id: 'prop-1',
      status: 'pending',
      actionType: 'DISPOSE',
      actionLabel: 'Loại bỏ và lập biên bản huỷ',
      proposedQty: '313.000',
      riskLevel: 'critical',
      isExpired: true,
      lot: {
        id: 'lot-exp',
        lotCode: 'L26091802',
        expiryDate: '2026-11-01',
        daysRemaining: -22,
        status: 'active',
      },
      product: {
        id: 'prod-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'Lốc',
      },
      sourceRunId: 'run-1',
      createdAt: '2026-11-23T00:00:00.000Z',
    },
    {
      id: 'prop-2',
      status: 'approved',
      actionType: 'CONTACT_AGENCY',
      actionLabel: 'Liên hệ đại lý đẩy hàng',
      proposedQty: '251.000',
      riskLevel: 'high',
      isExpired: false,
      lot: {
        id: 'lot-high',
        lotCode: 'L26101802',
        expiryDate: '2026-11-30',
        daysRemaining: 8,
        status: 'active',
      },
      product: {
        id: 'prod-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'Lốc',
      },
      sourceRunId: 'run-1',
      createdAt: '2026-11-23T00:00:00.000Z',
    },
  ],
};

function renderListPage(initialPath = '/proposals', permissions = ['proposals.read']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user: AuthUser = {
    id: 'u-1',
    username: 'quanly',
    fullName: 'Nguyễn Văn Dương',
    role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
    permissions,
  };
  const authValue: AuthContextValue = {
    user,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: (code?: string) => !code || permissions.includes(code),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={authValue}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/proposals" element={<ProposalsListPage />} />
              <Route path="/proposals/:id" element={<div>Chi tiết đề xuất</div>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ProposalsListPage (T-014 AC8, mockup 21)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng tiêu đề, phụ đề số chờ duyệt, hộp ghi chú xanh và đầy đủ cột bảng mockup 21', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleListResponse,
    } as Response);

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('L26091802')).toBeInTheDocument();
    });

    expect(screen.getByText('Đề xuất xử lý hàng cận hạn')).toBeInTheDocument();
    expect(screen.getByText('8 đề xuất chờ quyết định')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Phương án do bộ quy tắc nghiệp vụ sinh ra từ kết quả phân tích\. Mô hình ngôn ngữ chỉ viết phần diễn giải\./,
      ),
    ).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Loại bỏ và lập biên bản huỷ')).toBeInTheDocument();
    expect(within(table).getByText('Liên hệ đại lý đẩy hàng')).toBeInTheDocument();
    expect(within(table).getByText('Chờ duyệt')).toBeInTheDocument();
    expect(within(table).getByText('Đã duyệt')).toBeInTheDocument();
    expect(within(table).getAllByRole('link', { name: 'Xem chi tiết' })[0]).toHaveAttribute(
      'href',
      '/proposals/prop-1',
    );
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('lọc theo trạng thái, mức rủi ro và đọc tham số ?lotId= từ URL', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requestedUrls.push(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => sampleListResponse,
      } as Response;
    });

    const user = userEvent.setup();
    renderListPage('/proposals?lotId=lot-high');

    await waitFor(() => {
      expect(requestedUrls.some((url) => url.includes('lotId=lot-high'))).toBe(true);
    });

    expect(screen.getByText(/Đang lọc theo một lô cụ thể/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Lọc theo trạng thái'), 'pending');
    await user.selectOptions(screen.getByLabelText('Lọc theo mức rủi ro'), 'high');

    await waitFor(() => {
      expect(
        requestedUrls.some((url) => url.includes('status=pending') && url.includes('riskLevel=high')),
      ).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: 'Xem tất cả lô' }));
    await waitFor(() => {
      expect(screen.queryByText(/Đang lọc theo một lô cụ thể/i)).not.toBeInTheDocument();
    });
  });

  it('hiển thị trạng thái rỗng và trạng thái lỗi có nút thử lại', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Lỗi máy chủ' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ summary: { pending: 0, total: 0 }, items: [] }),
      } as Response);

    const user = userEvent.setup();
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('Lỗi máy chủ')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => {
      expect(screen.getByText(/Chưa có đề xuất xử lý nào/i)).toBeInTheDocument();
    });
  });
});
