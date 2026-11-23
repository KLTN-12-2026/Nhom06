import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { InboundFormPage } from './InboundFormPage';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['inbound.read', 'inbound.create', 'inbound.confirm', 'catalog.read'],
};

const MOCK_SUPPLIERS = [
  {
    id: 'sup-1',
    code: 'NCC001',
    name: 'Công ty CP Sữa Việt Nam — CN Đà Nẵng',
    phone: '02363811001',
    email: 'ncc1@local',
    address: 'Đà Nẵng',
    status: 'active' as const,
  },
];

const MOCK_PRODUCTS = {
  items: [
    {
      id: 'prod-1',
      code: 'SP001',
      name: 'Sữa tươi tiệt trùng 1L',
      group: { id: 'g-1', code: 'SUA', name: 'Sữa' },
      unit: 'thùng',
      shelfLifeDays: 180,
      onHandQty: '0',
      status: 'active' as const,
    },
    {
      id: 'prod-2',
      code: 'SP006',
      name: 'Sữa chua trắng có đường lốc 4',
      group: { id: 'g-2', code: 'SUA_CHUA', name: 'Sữa chua' },
      unit: 'thùng',
      shelfLifeDays: 45,
      onHandQty: '0',
      status: 'active' as const,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
};

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/inbound/new']}>
            <Routes>
              <Route path="/inbound/new" element={<InboundFormPage mode="create" />} />
              <Route path="/inbound/:id" element={<div>Trang chi tiết phiếu</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('InboundFormPage (AC10)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kho_ai_access_token', 'staff-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('cho phép thêm/xóa dòng, gợi ý HSD theo shelfLifeDays của sản phẩm và validate dữ liệu tiếng Việt', async () => {
    const postSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/suppliers')) {
        return { ok: true, status: 200, json: async () => MOCK_SUPPLIERS } as Response;
      }
      if (url.includes('/products')) {
        return { ok: true, status: 200, json: async () => MOCK_PRODUCTS } as Response;
      }
      if (url.includes('/inbound-receipts') && init?.method === 'POST') {
        postSpy(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'rec-new',
            receiptNo: 'PN2611220001',
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'SP001 — Sữa tươi tiệt trùng 1L' })).toBeInTheDocument();
    });

    // Đặt ngày chứng từ cố định để kiểm gợi ý HSD chính xác
    const receiptDateInput = screen.getByLabelText('Ngày chứng từ');
    await user.clear(receiptDateInput);
    await user.type(receiptDateInput, '2026-11-22');

    // Chọn SP001 (shelfLifeDays = 180) → tự gợi ý 2026-11-22 + 180 ngày = 2027-05-21
    await user.selectOptions(screen.getByLabelText('Sản phẩm dòng 1'), 'prod-1');
    const expiryRow1 = screen.getByLabelText('Hạn sử dụng dòng 1') as HTMLInputElement;
    expect(expiryRow1.value).toBe('2027-05-21');

    // Thêm dòng thứ 2 rồi xóa dòng thứ 2
    await user.click(screen.getByRole('button', { name: 'Thêm dòng' }));
    expect(screen.getByLabelText('Sản phẩm dòng 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xoá dòng 2' }));
    expect(screen.queryByLabelText('Sản phẩm dòng 2')).not.toBeInTheDocument();

    // Bấm lưu khi chưa chọn NCC, chưa nhập mã lô, chưa nhập số lượng → báo lỗi tiếng Việt
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu nháp' }));
    await waitFor(() => {
      expect(screen.getByText('Vui lòng chọn nhà cung cấp')).toBeInTheDocument();
      expect(screen.getByText('Mã lô phải từ 1 đến 80 ký tự')).toBeInTheDocument();
      expect(screen.getByText('Số lượng phải lớn hơn 0 (tối đa 3 số thập phân)')).toBeInTheDocument();
    });
    expect(postSpy).not.toHaveBeenCalled();

    // Điền đầy đủ và sửa tay HSD vẫn hợp lệ → gửi POST thành công
    await user.selectOptions(screen.getByLabelText('Nhà cung cấp'), 'sup-1');
    await user.type(screen.getByLabelText('Mã lô dòng 1'), ' l26112201 ');
    await user.clear(expiryRow1);
    await user.type(expiryRow1, '2027-06-30');
    await user.type(screen.getByLabelText('Số lượng dòng 1'), '120');
    await user.type(screen.getByLabelText('Đơn giá dòng 1'), '320000');

    await user.click(screen.getByRole('button', { name: 'Lưu phiếu nháp' }));

    await waitFor(() => {
      expect(screen.getByText('Trang chi tiết phiếu')).toBeInTheDocument();
    });
    expect(postSpy).toHaveBeenCalledWith({
      supplierId: 'sup-1',
      receiptDate: '2026-11-22',
      notes: null,
      items: [
        {
          productId: 'prod-1',
          lotCode: 'L26112201',
          expiryDate: '2027-06-30',
          quantity: '120',
          unitCost: '320000',
        },
      ],
    });
  });
});
