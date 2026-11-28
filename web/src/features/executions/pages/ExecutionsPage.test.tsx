import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { type AuthUser } from '@/features/auth/types';
import { type ExecutionItem, type ExecutionsListResponse } from '../types';
import { ExecutionsPage } from './ExecutionsPage';

function makeExecution(overrides: Partial<ExecutionItem> = {}): ExecutionItem {
  return {
    id: 'exec-1',
    proposalId: 'prop-1',
    status: 'planned',
    plannedQty: '251.000',
    actualQty: null,
    remainingQty: '251.000',
    note: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-11-22T02:00:00.000Z',
    proposal: {
      id: 'prop-1',
      actionType: 'CONTACT_AGENCY',
      actionLabel: 'Liên hệ đại lý đẩy hàng',
      status: 'approved',
      proposedQty: '251.000',
    },
    lot: {
      id: 'lot-1',
      lotCode: 'L26101802',
      expiryDate: '2026-11-30',
      status: 'active',
      currentOnHandQty: '392.000',
    },
    product: {
      id: 'prod-2',
      code: 'SP002',
      name: 'Sữa chua uống TH true YOGURT 180ml',
      unit: 'Lốc',
    },
    decision: {
      decidedAt: '2026-11-22T02:00:00.000Z',
      reason: null,
      decider: { id: 'u-mgr', fullName: 'Nguyễn Văn Dương' },
    },
    responsibleUser: { id: 'u-mgr', fullName: 'Nguyễn Văn Dương' },
    linkedOutbound: null,
    linkedOutbounds: [],
    updates: [],
    ...overrides,
  };
}

function makeListResponse(items: ExecutionItem[]): ExecutionsListResponse {
  return {
    kpi: {
      approvedCount: items.length,
      inProgressCount: items.filter((i) => i.status === 'in_progress').length,
      plannedQtyTotal: '437.000',
      actualQtyTotal: '120.000',
    },
    items,
  };
}

function renderExecutionsPage(
  permissions = ['executions.read', 'executions.update', 'outbound.read', 'outbound.confirm'],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user: AuthUser = {
    id: 'u-staff',
    username: 'nhanvien',
    fullName: 'Trương Thành Lê',
    role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
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
          <MemoryRouter initialEntries={['/executions']}>
            <Routes>
              <Route path="/executions" element={<ExecutionsPage />} />
              <Route path="/outbound/:id" element={<div>Chi tiết phiếu xuất</div>} />
              <Route path="/proposals/:id" element={<div>Chi tiết đề xuất</div>} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ExecutionsPage — Theo dõi thực hiện & Dialog Ghi kết quả (T-015 AC9, mockup 27)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('render 3 KPI, hộp ghi chú, bảng kèm lịch sử cập nhật và ẩn nút Ghi kết quả khi thiếu quyền hoặc đã hoàn thành', async () => {
    const item1 = makeExecution();
    const item2 = makeExecution({
      id: 'exec-2',
      status: 'completed',
      plannedQty: '186.000',
      actualQty: '120.000',
      remainingQty: '66.000',
      proposal: {
        id: 'prop-2',
        actionType: 'PRIORITIZE_FEFO',
        actionLabel: 'Ưu tiên xuất theo FEFO',
        status: 'completed',
        proposedQty: '186.000',
      },
      lot: {
        id: 'lot-2',
        lotCode: 'L26111802',
        expiryDate: '2026-12-10',
        status: 'active',
        currentOnHandQty: '66.000',
      },
      linkedOutbound: {
        id: 'ob-1',
        outboundNo: 'PX2611220001',
        outboundType: 'ORDER',
        confirmedAt: '2026-11-22T03:58:00.000Z',
      },
      linkedOutbounds: [
        {
          id: 'ob-1',
          outboundNo: 'PX2611220001',
          outboundType: 'ORDER',
          confirmedAt: '2026-11-22T03:58:00.000Z',
        },
      ],
      updates: [
        {
          id: 'upd-1',
          status: 'in_progress',
          actualQtyDelta: '120.000',
          note: 'Đã liên hệ 3 đại lý, hai đại lý nhận thêm hàng trong tuần này.',
          occurredOn: '2026-11-22',
          updatedAt: '2026-11-22T03:58:00.000Z',
          updater: { id: 'u-staff', fullName: 'Trương Thành Lê' },
          linkedOutbound: null,
        },
      ],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeListResponse([item1, item2]),
    } as Response);

    renderExecutionsPage(['executions.read', 'executions.update']);

    await waitFor(() => {
      expect(screen.getByText('L26101802')).toBeInTheDocument();
    });

    expect(screen.getByText('Phương án đã duyệt')).toBeInTheDocument();
    expect(screen.getByText('437')).toBeInTheDocument();
    expect(
      screen.getByText(/Ghi kết quả không làm đổi tồn kho/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Đã liên hệ 3 đại lý, hai đại lý nhận thêm hàng trong tuần này\./),
    ).toBeInTheDocument();
    expect(screen.getByText('(120 đơn vị)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PX2611220001' })).toHaveAttribute(
      'href',
      '/outbound/ob-1',
    );

    // Chỉ item1 (planned) có nút "Ghi kết quả", item2 (completed) không có
    expect(screen.getAllByRole('button', { name: 'Ghi kết quả' })).toHaveLength(1);
  });

  it('ẩn hoàn toàn nút Ghi kết quả khi người dùng không có quyền executions.update', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeListResponse([makeExecution()]),
    } as Response);

    renderExecutionsPage(['executions.read']);

    await waitFor(() => {
      expect(screen.getByText('L26101802')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Ghi kết quả' })).not.toBeInTheDocument();
  });

  it('dialog Ghi kết quả: bắt buộc ghi chú khi chọn failed và cho phép chọn phiếu xuất ORDER để liên kết', async () => {
    const contactExec = makeExecution();
    const linkCalls: unknown[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/outbound-receipts?type=ORDER')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'ob-order-1',
                outboundNo: 'PX2611230005',
                outboundType: 'ORDER',
                status: 'confirmed',
                order: {
                  id: 'ord-1',
                  orderNo: 'DH2611230001',
                  agency: { id: 'ag-1', code: 'DL001', name: 'Đại lý An Khang' },
                },
                creator: { id: 'u-staff', fullName: 'Trương Thành Lê' },
                confirmer: { id: 'u-staff', fullName: 'Trương Thành Lê' },
                confirmedAt: '2026-11-23T02:00:00.000Z',
                notes: null,
                lotCount: 1,
                totalQuantity: '80',
                matchedLotQty: '80',
                createdAt: '2026-11-23T02:00:00.000Z',
              },
            ],
            total: 1,
            page: 1,
            pageSize: 50,
          }),
        } as Response;
      }
      if (url.endsWith('/executions/exec-1/link-outbound') && init?.method === 'POST') {
        linkCalls.push(JSON.parse(String(init.body ?? '{}')));
        return {
          ok: true,
          status: 201,
          json: async () => makeExecution({ status: 'in_progress', actualQty: '80.000' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => makeListResponse([contactExec]),
      } as Response;
    });

    const user = userEvent.setup();
    renderExecutionsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ghi kết quả' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Ghi kết quả' }));

    // Chọn "Không thực hiện được" (failed) nhưng không nhập ghi chú → báo lỗi validation
    await user.selectOptions(screen.getByLabelText('Tiến độ thực hiện'), 'failed');
    await user.click(screen.getByRole('button', { name: 'Lưu kết quả' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Vui lòng nhập ghi chú khi đánh dấu không thực hiện được hoặc hủy/i),
      ).toBeInTheDocument();
    });

    // Chọn phiếu xuất ORDER liên quan và bấm Liên kết phiếu xuất
    await waitFor(() => {
      expect(screen.getByText(/PX2611230005/)).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText(/Chọn phiếu xuất ORDER/i), 'ob-order-1');
    await user.click(screen.getByRole('button', { name: 'Liên kết phiếu xuất' }));

    await waitFor(() => {
      expect(linkCalls).toEqual([{ outboundReceiptId: 'ob-order-1' }]);
    });
  });

  it('dialog Ghi kết quả với phương án DISPOSE: hiện nút Lập phiếu hủy, mở hộp thoại xác nhận nêu rõ giảm tồn và gọi /disposal', async () => {
    const disposeExec = makeExecution({
      id: 'exec-disp',
      plannedQty: '44.000',
      remainingQty: '44.000',
      proposal: {
        id: 'prop-disp',
        actionType: 'DISPOSE',
        actionLabel: 'Loại bỏ và lập biên bản huỷ',
        status: 'approved',
        proposedQty: '44.000',
      },
      lot: {
        id: 'lot-exp',
        lotCode: 'L26100101',
        expiryDate: '2026-11-10',
        status: 'active',
        currentOnHandQty: '44.000',
      },
    });
    const disposalCalls: unknown[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/executions/exec-disp/disposal') && init?.method === 'POST') {
        disposalCalls.push(JSON.parse(String(init.body ?? '{}')));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            execution: { ...disposeExec, status: 'in_progress', actualQty: '44.000' },
            outboundReceipt: {
              id: 'ob-disp-1',
              outboundNo: 'PX2611230009',
              outboundType: 'DISPOSAL',
              status: 'confirmed',
              totalQuantity: '44',
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => makeListResponse([disposeExec]),
      } as Response;
    });

    const user = userEvent.setup();
    renderExecutionsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ghi kết quả' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Ghi kết quả' }));

    await user.click(screen.getByRole('button', { name: 'Lập phiếu hủy' }));

    expect(
      screen.getByText(/Tồn lô L26100101 sẽ giảm 44 Lốc bằng phiếu xuất Xuất hủy/i),
    ).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Lập phiếu hủy' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(disposalCalls).toEqual([{ quantity: '44', notes: null }]);
    });
  });

  it('T-019 AC2: số KPI dùng cỡ chữ text-4xl chuẩn DESIGN.md và ngày duyệt hiển thị đúng múi giờ Asia/Ho_Chi_Minh', async () => {
    // 2026-11-22T20:00:00.000Z = 23/11/2026 03:00 theo giờ Việt Nam (UTC+7)
    const lateUtcItem = makeExecution({
      decision: {
        decidedAt: '2026-11-22T20:00:00.000Z',
        reason: null,
        decider: { id: 'u-mgr', fullName: 'Nguyễn Văn Dương' },
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeListResponse([lateUtcItem]),
    } as Response);

    renderExecutionsPage(['executions.read']);

    await waitFor(() => {
      expect(screen.getByText('23/11/2026')).toBeInTheDocument();
    });

    const kpiValue = screen.getByText('437');
    expect(kpiValue.className).toContain('text-4xl');
  });
});
