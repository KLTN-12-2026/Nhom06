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
    ...overrides,
  };
}

function renderDetailPage(permissions = ['proposals.read', 'analysis.run']) {
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
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ProposalDetailPage — 3 trạng thái diễn giải valid / invalid / failed (T-014 AC8, mockup 22–24)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('trạng thái valid (mockup 22 & 23): hiện diễn giải LLM, mở được JSON số liệu thô, khối Quyết định disabled và bấm "Mô phỏng lỗi dịch vụ" chuyển sang fallback', async () => {
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

    // Khối Quyết định bị vô hiệu hóa chờ T-015
    expect(screen.getByRole('button', { name: 'Phê duyệt' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeDisabled();
    expect(screen.getByText(/Phê duyệt làm ở bước sau/i)).toBeInTheDocument();

    // Card tình trạng lô hiện tại
    expect(screen.getByText('392 Lốc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem trong tồn kho' })).toHaveAttribute(
      'href',
      '/inventory',
    );

    // Mở mục thu gọn "Số liệu thô đã gửi sang mô hình ngôn ngữ" (mockup 23)
    await user.click(screen.getByText('Số liệu thô đã gửi sang mô hình ngôn ngữ'));
    expect(screen.getByText(/"ton_du_uoc_tinh": 251/)).toBeInTheDocument();
    expect(screen.getByText(/"allowed_actions"/)).toBeInTheDocument();

    // Bấm "Mô phỏng lỗi dịch vụ" → chuyển sang giao diện fallback (mockup 24)
    await user.click(screen.getByRole('button', { name: 'Mô phỏng lỗi dịch vụ' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Dịch vụ diễn giải không phản hồi, nên phần dưới là câu tóm tắt do bộ quy tắc sinh ra\./,
        ),
      ).toBeInTheDocument();
    });
    expect(postPayloads).toEqual([{ simulateFailure: true }]);
    expect(screen.getByText(currentDetail.ruleSummaryText)).toBeInTheDocument();
    expect(screen.getByText('Nguồn: bộ quy tắc nghiệp vụ')).toBeInTheDocument();

    // Bấm "Khôi phục dịch vụ diễn giải" → quay lại trạng thái valid
    await user.click(screen.getByRole('button', { name: 'Khôi phục dịch vụ diễn giải' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Viết lại từ số liệu bên dưới bởi mô hình ngôn ngữ/),
      ).toBeInTheDocument();
    });
    expect(postPayloads).toEqual([{ simulateFailure: true }, { simulateFailure: false }]);
  });

  it('trạng thái invalid: hiển thị hộp cam kiểm tra số liệu không đạt + ruleSummaryText, không hiện văn bản LLM', async () => {
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
    expect(screen.getByText('Nguồn: bộ quy tắc nghiệp vụ')).toBeInTheDocument();
  });

  it('trạng thái failed + nhân viên kho (không có analysis.run): hiển thị fallback mockup 24 và ẩn link demo', async () => {
    const failedDetail = makeDetail({
      displayMode: 'fallback',
      fallbackReason: 'failed',
      llmDemoToggleEnabled: true,
      explanation: {
        id: 'exp-failed',
        status: 'failed',
        text: null,
        modelName: 'none',
        provider: 'none',
        promptVersion: 'v1',
        errorMessage: 'Dịch vụ diễn giải LLM chưa được bật (LLM_PROVIDER=none)',
        createdAt: '2026-11-22T00:02:00.000Z',
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => failedDetail,
    } as Response);

    renderDetailPage(['proposals.read']);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Dịch vụ diễn giải không phản hồi, nên phần dưới là câu tóm tắt do bộ quy tắc sinh ra\./,
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(failedDetail.ruleSummaryText)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Khôi phục dịch vụ diễn giải' }),
    ).not.toBeInTheDocument();
  });
});
