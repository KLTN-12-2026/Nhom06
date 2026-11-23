import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { type AuthUser } from '@/features/auth/types';
import { type ProposalDetailResponse } from '../types';
import { ProposalDetailPage } from './ProposalDetailPage';

function makeDetail(overrides: Partial<ProposalDetailResponse> = {}): ProposalDetailResponse {
  return {
    id: 'prop-1',
    status: 'pending',
    actionType: 'CONTACT_AGENCY',
    actionLabel: 'Liên hệ đại lý đẩy hàng',
    allowedActions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
    proposedQty: '251.000',
    ruleCode: 'RULE_HIGH_RISK_CONTACT_AGENCY',
    ruleSummaryText:
      'Tồn 392, nhu cầu dự báo phân bổ được 141 trước hạn 30/11/2026 (còn 8 ngày). Tồn dư ước tính 251, mức rủi ro nguy cấp.',
    sourceRunId: 'run-1',
    createdAt: '2026-11-22T00:00:00.000Z',
    analyzedAt: '2026-11-22T00:00:00.000Z',
    product: {
      id: 'prod-2',
      code: 'SP002',
      name: 'Sữa chua uống TH true YOGURT 180ml',
      unit: 'Lốc',
    },
    lot: {
      id: 'lot-1',
      lotCode: 'L26101802',
      status: 'active',
      expiryDate: '2026-11-30',
      daysRemaining: 8,
      currentOnHandQty: '392.000',
    },
    risk: {
      assessmentId: 'risk-1',
      evaluationDate: '2026-11-22',
      expiryDate: '2026-11-30',
      daysRemaining: 8,
      isExpired: false,
      onHandSnapshot: '392.000',
      allocatedDemand: '141.000',
      estimatedConsumption: '141.000',
      estimatedSurplus: '251.000',
      riskLevel: 'high',
    },
    llmInput: {
      ma_lo: 'L26101802',
      san_pham: 'SP002',
      han_su_dung: '2026-11-30',
      so_ngay_con_lai: 8,
      ton_luc_phan_tich: 392,
      nhu_cau_phan_bo_duoc: 141,
      tieu_thu_uoc_tinh: 141,
      ton_du_uoc_tinh: 251,
      muc_rui_ro: 'high',
      phuong_an: 'CONTACT_AGENCY',
      luong_de_xuat: 251,
      allowed_actions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
    },
    explanation: {
      id: 'exp-1',
      status: 'valid',
      text: 'Lô L26101802 của sản phẩm SP002 còn 8 ngày trước hạn 30/11/2026 và đang tồn 392 đơn vị. Tồn dư ước tính 251 đơn vị ở mức nguy cấp.',
      modelName: 'kho-ai-mock-v1 [Mô phỏng]',
      provider: 'mock',
      promptVersion: 'v1',
      errorMessage: null,
      createdAt: '2026-11-22T00:01:00.000Z',
    },
    displayMode: 'llm',
    fallbackReason: null,
    llmDemoToggleEnabled: true,
    decision: null,
    execution: null,
    ...overrides,
  };
}

function renderDetailPage(
  permissions = ['proposals.read', 'proposals.approve', 'analysis.run', 'executions.read'],
) {
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
          <MemoryRouter initialEntries={['/proposals/prop-1']}>
            <Routes>
              <Route path="/proposals/:id" element={<ProposalDetailPage />} />
              <Route path="/inventory" element={<div>Tồn kho</div>} />
              <Route path="/executions" element={<div>Trang theo dõi thực hiện</div>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ProposalDetailPage — Diễn giải LLM & Khối Quyết định (T-014 + T-015 AC9, mockup 22–26)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('trạng thái valid (mockup 22 & 23): hiện diễn giải LLM, mở JSON số liệu thô, bấm mô phỏng lỗi chuyển sang fallback', async () => {
    let currentDetail = makeDetail();
    const postPayloads: unknown[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/proposals/prop-1/explain') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as { simulateFailure?: boolean };
        postPayloads.push(body);
        if (body.simulateFailure) {
          currentDetail = makeDetail({
            displayMode: 'fallback',
            fallbackReason: 'failed',
            explanation: {
              id: 'exp-2',
              status: 'failed',
              text: null,
              modelName: 'simulated-failure',
              provider: 'mock',
              promptVersion: 'v1',
              errorMessage: 'Mô phỏng dịch vụ diễn giải không phản hồi',
              createdAt: '2026-11-22T00:05:00.000Z',
            },
          });
        } else {
          currentDetail = makeDetail();
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({
            explanation: currentDetail.explanation,
            displayMode: currentDetail.displayMode,
            fallbackReason: currentDetail.fallbackReason,
            ruleSummaryText: currentDetail.ruleSummaryText,
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => currentDetail,
      } as Response;
    });

    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Lô L26101802')).toBeInTheDocument();
    });

    expect(screen.getByText('SP002 — Sữa chua uống TH true YOGURT 180ml')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Viết lại từ số liệu bên dưới bởi mô hình ngôn ngữ\. Mọi con số đều lấy nguyên từ kết quả phân tích\./,
      ),
    ).toBeInTheDocument();

    // Nút duyệt / từ chối đã bật cho quản lý kho
    expect(screen.getByRole('button', { name: 'Phê duyệt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeEnabled();

    await user.click(screen.getByText('Số liệu thô đã gửi sang mô hình ngôn ngữ'));
    expect(screen.getByText(/"ton_du_uoc_tinh": 251/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mô phỏng lỗi dịch vụ' }));
    await waitFor(() => {
      expect(
        screen.getByText(
          /Dịch vụ diễn giải không phản hồi, nên phần dưới là câu tóm tắt do bộ quy tắc sinh ra\./,
        ),
      ).toBeInTheDocument();
    });
    expect(postPayloads).toEqual([{ simulateFailure: true }]);

    await user.click(screen.getByRole('button', { name: 'Khôi phục dịch vụ diễn giải' }));
    await waitFor(() => {
      expect(
        screen.getByText(/Viết lại từ số liệu bên dưới bởi mô hình ngôn ngữ/),
      ).toBeInTheDocument();
    });
  });

  it('trạng thái invalid: hiển thị hộp cam kiểm tra số liệu không đạt + ruleSummaryText', async () => {
    const invalidDetail = makeDetail({
      displayMode: 'fallback',
      fallbackReason: 'invalid',
      explanation: {
        id: 'exp-invalid',
        status: 'invalid',
        text: null,
        modelName: 'gpt-4o-mini',
        provider: 'openai_compatible',
        promptVersion: 'v1',
        errorMessage: 'Có số liệu không có trong dữ liệu nguồn: 999',
        createdAt: '2026-11-22T00:02:00.000Z',
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => invalidDetail,
    } as Response);

    renderDetailPage();

    await waitFor(() => {
      expect(
        screen.getByText(
          /Phần diễn giải không vượt qua kiểm tra số liệu, nên phần dưới là câu tóm tắt do bộ quy tắc sinh ra\./,
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(invalidDetail.ruleSummaryText)).toBeInTheDocument();
  });

  it('ẩn nút Phê duyệt / Từ chối khi người dùng thiếu quyền proposals.approve (nhân viên kho / admin)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeDetail(),
    } as Response);

    renderDetailPage(['proposals.read']);

    await waitFor(() => {
      expect(screen.getByText('Lô L26101802')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Phê duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Đề xuất đang chờ quản lý kho xem xét và phê duyệt/i),
    ).toBeInTheDocument();
  });

  it('bắt buộc nhập lý do khi từ chối; phê duyệt mở hộp thoại mockup 25 → chuyển trạng thái đã phê duyệt (mockup 26) + toast', async () => {
    let currentDetail = makeDetail();
    const approveCalls: unknown[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/proposals/prop-1/approve') && init?.method === 'POST') {
        approveCalls.push(JSON.parse(String(init.body ?? '{}')));
        currentDetail = makeDetail({
          status: 'approved',
          decision: {
            id: 'dec-1',
            decision: 'approved',
            reason: 'Ưu tiên gọi đại lý trong tuần',
            decidedAt: '2026-11-22T03:00:00.000Z',
            decider: { id: 'u-1', fullName: 'Nguyễn Văn Dương' },
          },
          execution: {
            id: 'exec-1',
            status: 'planned',
            plannedQty: '251.000',
            actualQty: null,
            linkedOutboundId: null,
          },
        });
        return {
          ok: true,
          status: 201,
          json: async () => currentDetail,
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => currentDetail,
      } as Response;
    });

    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
    });

    // Bấm Từ chối khi ô ý kiến trống → báo lỗi, không mở dialog xác nhận
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(screen.getByText(/Vui lòng nhập lý do từ chối/i)).toBeInTheDocument();
    expect(screen.queryByText('Từ chối đề xuất này?')).not.toBeInTheDocument();

    // Nhập ghi chú và bấm Phê duyệt → mở hộp thoại mockup 25
    await user.type(
      screen.getByLabelText(/Ý kiến \(bắt buộc khi từ chối\)/i),
      'Ưu tiên gọi đại lý trong tuần',
    );
    await user.click(screen.getByRole('button', { name: 'Phê duyệt' }));

    expect(screen.getByText('Phê duyệt đề xuất này?')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Quyết định được ghi lại kèm người thực hiện và thời điểm\. Việc này không tạo chứng từ xuất và không trừ tồn kho\./,
      ),
    ).toBeInTheDocument();

    // Xác nhận trong hộp thoại
    const confirmButtons = screen.getAllByRole('button', { name: 'Phê duyệt' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Đã ghi nhận quyết định: phê duyệt.')).toBeInTheDocument();
    });

    expect(approveCalls).toEqual([{ note: 'Ưu tiên gọi đại lý trong tuần' }]);
    expect(screen.getByText('Nguyễn Văn Dương')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Theo dõi thực hiện' })).toHaveAttribute(
      'href',
      '/executions',
    );
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
  });

  it('khi API trả 409 (đề xuất đã có quyết định trước đó) → hiển thị thông báo lỗi và tải lại dữ liệu', async () => {
    let getCount = 0;
    const latestApproved = makeDetail({
      status: 'approved',
      decision: {
        id: 'dec-2',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-11-22T04:00:00.000Z',
        decider: { id: 'u-1', fullName: 'Nguyễn Văn Dương' },
      },
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/proposals/prop-1/approve') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ statusCode: 409, message: 'Đề xuất đã có quyết định' }),
        } as Response;
      }
      getCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => (getCount === 1 ? makeDetail() : latestApproved),
      } as Response;
    });

    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Phê duyệt' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Phê duyệt' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Phê duyệt' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Đề xuất đã có quyết định')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Theo dõi thực hiện' })).toBeInTheDocument();
    });
    expect(getCount).toBeGreaterThanOrEqual(2);
  });
});
