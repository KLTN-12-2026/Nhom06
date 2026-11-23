import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { InventoryLotsPage } from './InventoryLotsPage';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['catalog.read', 'inventory.read', 'stock_count.create'],
};

const MANAGER_USER: AuthUser = {
  id: 'u-mgr',
  username: 'quanly',
  fullName: 'Nguyễn Văn Dương',
  role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  permissions: ['catalog.read', 'inventory.read', 'stock_count.create', 'stock_count.approve'],
};

const PRODUCT_GROUPS_FIXTURE = [
  { id: 'g-sua', code: 'SUA', name: 'Sữa', description: null, status: 'active' },
  { id: 'g-ngk', code: 'NGK', name: 'Nước giải khát', description: null, status: 'active' },
];

const LOTS_FIXTURE = {
  evaluationDate: '2026-11-23',
  total: 3,
  page: 1,
  pageSize: 50,
  items: [
    {
      lotId: 'lot-1',
      lotCode: 'L26101801',
      product: {
        id: 'p-1',
        code: 'SP001',
        name: 'Sữa tươi tiệt trùng Vinamilk 180ml',
        unit: 'Thùng',
        group: { id: 'g-sua', code: 'SUA', name: 'Sữa' },
      },
      expiryDate: '2027-04-14',
      receivedAt: '2026-10-18',
      daysRemaining: 143,
      onHandQty: '249',
      lotStatus: 'active',
      expiryStatus: 'normal',
      warningDays: 30,
    },
    {
      lotId: 'lot-2',
      lotCode: 'L26081802',
      product: {
        id: 'p-2',
        code: 'SP002',
        name: 'Sữa chua uống TH true YOGURT 180ml',
        unit: 'Lốc',
        group: { id: 'g-sua', code: 'SUA', name: 'Sữa' },
      },
      expiryDate: '2026-09-30',
      receivedAt: '2026-08-18',
      daysRemaining: -53,
      onHandQty: '44',
      lotStatus: 'blocked',
      expiryStatus: 'expired',
      warningDays: 30,
    },
    {
      lotId: 'lot-3',
      lotCode: 'L26101804',
      product: {
        id: 'p-4',
        code: 'SP004',
        name: 'Nước ép Tropicana Twister 1L',
        unit: 'Thùng',
        group: { id: 'g-ngk', code: 'NGK', name: 'Nước giải khát' },
      },
      expiryDate: '2026-12-12',
      receivedAt: '2026-10-18',
      daysRemaining: 20,
      onHandQty: '249',
      lotStatus: 'active',
      expiryStatus: 'warning',
      warningDays: 30,
    },
  ],
};

const SUMMARY_FIXTURE = {
  evaluationDate: '2026-11-23',
  lotCount: 3,
  totalQty: '542',
  byProduct: [],
};

function renderPage(initialPath = '/inventory') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <InventoryLotsPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('InventoryLotsPage (AC8)', () => {
  beforeEach(() => {
    localStorage.setItem('kho_ai_access_token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị đúng badge tình trạng HSD, badge Đã khóa, không có ô sửa số tồn và ẩn nút Khóa lô với nhân viên', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/product-groups')) {
        return { ok: true, status: 200, json: async () => PRODUCT_GROUPS_FIXTURE } as Response;
      }
      if (url.includes('/inventory/summary')) {
        return { ok: true, status: 200, json: async () => SUMMARY_FIXTURE } as Response;
      }
      if (url.includes('/inventory/lots')) {
        return { ok: true, status: 200, json: async () => LOTS_FIXTURE } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('L26101801')).toBeInTheDocument();
    });

    expect(screen.getByText('Tồn kho theo lô')).toBeInTheDocument();
    expect(screen.getByText('3 lô · 542 đơn vị')).toBeInTheDocument();

    // Badge tình trạng HSD & badge Đã khóa
    expect(screen.getAllByText('Bình thường').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Hết hạn').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cận hạn').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Đã khóa').length).toBeGreaterThanOrEqual(1);

    // Ngày hết hạn có gạch ngang
    const expiredDateCell = screen.getByText('30/09/2026');
    expect(expiredDateCell.className).toContain('line-through');

    // Không có ô input nào trong bảng để sửa số tồn trực tiếp (PB15 AC5/AC7)
    const tableEl = container.querySelector('table');
    expect(tableEl).not.toBeNull();
    expect(tableEl!.querySelectorAll('input, textarea, select')).toHaveLength(0);

    // Ẩn nút khóa/mở khóa với nhân viên kho
    expect(screen.queryByRole('button', { name: 'Khóa lô' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở khóa' })).not.toBeInTheDocument();
  });

  it('cho phép quản lý mở hộp thoại khóa lô, bắt buộc nhập lý do và gọi PATCH /lots/:id/status', async () => {
    const patchSpy = vi.fn();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => MANAGER_USER } as Response;
      }
      if (url.includes('/product-groups')) {
        return { ok: true, status: 200, json: async () => PRODUCT_GROUPS_FIXTURE } as Response;
      }
      if (url.includes('/inventory/summary')) {
        return { ok: true, status: 200, json: async () => SUMMARY_FIXTURE } as Response;
      }
      if (url.includes('/inventory/lots')) {
        return { ok: true, status: 200, json: async () => LOTS_FIXTURE } as Response;
      }
      if (url.endsWith('/lots/lot-1/status') && init?.method === 'PATCH') {
        patchSpy(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'lot-1', status: 'blocked', onHandQty: '249' }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Khóa lô' }).length).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getAllByRole('button', { name: 'Khóa lô' })[0]);
    expect(screen.getByText('Khóa lô L26101801?')).toBeInTheDocument();

    // Bấm xác nhận khi chưa nhập lý do -> báo lỗi tiếng Việt
    await user.click(screen.getByRole('button', { name: 'Xác nhận khóa lô' }));
    await waitFor(() => {
      expect(screen.getByText('Vui lòng nhập lý do khóa hoặc mở khóa lô')).toBeInTheDocument();
    });
    expect(patchSpy).not.toHaveBeenCalled();

    // Nhập lý do và xác nhận -> gọi PATCH
    await user.type(screen.getByLabelText(/Lý do/), 'Tạm giữ chờ kiểm tra chất lượng');
    await user.click(screen.getByRole('button', { name: 'Xác nhận khóa lô' }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith({
        status: 'blocked',
        reason: 'Tạm giữ chờ kiểm tra chất lượng',
      });
    });
  });

  it('T-019 AC3: đọc ?lotId= và ?includeEmpty=true từ URL, lọc đúng lô và cho phép xóa lọc lô', async () => {
    const requestedUrls: string[] = [];
    const singleLotFixture = {
      ...LOTS_FIXTURE,
      total: 1,
      items: [LOTS_FIXTURE.items[1]],
    };
    const singleSummaryFixture = {
      ...SUMMARY_FIXTURE,
      lotCount: 1,
      totalQty: '44',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/product-groups')) {
        return { ok: true, status: 200, json: async () => PRODUCT_GROUPS_FIXTURE } as Response;
      }
      if (url.includes('/inventory/summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => (url.includes('lotId=lot-2') ? singleSummaryFixture : SUMMARY_FIXTURE),
        } as Response;
      }
      if (url.includes('/inventory/lots')) {
        return {
          ok: true,
          status: 200,
          json: async () => (url.includes('lotId=lot-2') ? singleLotFixture : LOTS_FIXTURE),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderPage('/inventory?lotId=lot-2&includeEmpty=true');

    await waitFor(() => {
      expect(screen.getByText('L26081802')).toBeInTheDocument();
    });

    expect(
      requestedUrls.some(
        (url) =>
          url.includes('/inventory/lots') &&
          url.includes('lotId=lot-2') &&
          url.includes('includeEmpty=true'),
      ),
    ).toBe(true);
    expect(
      requestedUrls.some(
        (url) => url.includes('/inventory/summary') && url.includes('lotId=lot-2'),
      ),
    ).toBe(true);
    expect(screen.getByText(/Đang lọc lô L26081802/i)).toBeInTheDocument();
    expect(screen.queryByText('L26101801')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xem tất cả lô' }));

    await waitFor(() => {
      expect(screen.getByText('L26101801')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Đang lọc lô/i)).not.toBeInTheDocument();
  });

  it('T-019 AC3: đọc ?search= từ URL để điền sẵn ô tìm kiếm', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.includes('/product-groups')) {
        return { ok: true, status: 200, json: async () => PRODUCT_GROUPS_FIXTURE } as Response;
      }
      if (url.includes('/inventory/summary')) {
        return { ok: true, status: 200, json: async () => SUMMARY_FIXTURE } as Response;
      }
      if (url.includes('/inventory/lots')) {
        return { ok: true, status: 200, json: async () => LOTS_FIXTURE } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderPage('/inventory?search=L26101801');

    await waitFor(() => {
      expect(screen.getByDisplayValue('L26101801')).toBeInTheDocument();
    });
    expect(
      requestedUrls.some((url) => url.includes('/inventory/lots') && url.includes('search=L26101801')),
    ).toBe(true);
  });
});
