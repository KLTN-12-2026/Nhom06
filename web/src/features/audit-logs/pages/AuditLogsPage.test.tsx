import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLogsPage } from './AuditLogsPage';

const MOCK_FACETS = {
  eventTypes: ['INBOUND_CONFIRMED', 'USER_LOCKED', 'CUSTOM_UNKNOWN_EVENT'],
  entityTypes: ['inbound_receipt', 'user'],
  actors: [
    { id: 'u-admin', username: 'admin', fullName: 'Phan Thanh Đức' },
    { id: 'u-staff', username: 'nhanvien', fullName: 'Trương Thành Lê' },
  ],
};

const MOCK_LIST_RESPONSE = {
  items: [
    {
      id: '101',
      createdAt: '2026-11-23T08:30:00.000Z',
      actor: { id: 'u-admin', username: 'admin', fullName: 'Phan Thanh Đức' },
      eventType: 'USER_LOCKED',
      entityType: 'user',
      entityId: '11111111-2222-4333-8444-555555555555',
      oldData: { status: 'active' },
      newData: { status: 'locked' },
    },
    {
      id: '102',
      createdAt: '2026-11-23T09:15:00.000Z',
      actor: { id: 'u-staff', username: 'nhanvien', fullName: 'Trương Thành Lê' },
      eventType: 'INBOUND_CONFIRMED',
      entityType: 'inbound_receipt',
      entityId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      oldData: null,
      newData: { receiptNo: 'PN2611230001' },
    },
    {
      id: '103',
      createdAt: '2026-11-23T10:00:00.000Z',
      actor: null,
      eventType: 'CUSTOM_UNKNOWN_EVENT',
      entityType: 'custom_entity',
      entityId: null,
      oldData: null,
      newData: null,
    },
  ],
  total: 3,
  page: 1,
  pageSize: 50,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuditLogsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuditLogsPage (T-021 AC5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hiển thị nhãn tiếng Việt cho mã sự kiện phổ biến, giữ nguyên mã lạ và mở chi tiết Trước / Sau', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/audit-logs/facets')) {
        return { ok: true, status: 200, json: async () => MOCK_FACETS } as Response;
      }
      if (url.includes('/audit-logs')) {
        return { ok: true, status: 200, json: async () => MOCK_LIST_RESPONSE } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('23/11/2026 15:30')).toBeInTheDocument();
    });

    // Nhãn sự kiện tiếng Việt cho mã phổ biến và mã lạ giữ nguyên
    expect(screen.getAllByText('Khóa tài khoản').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Xác nhận nhập').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CUSTOM_UNKNOWN_EVENT').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();

    // Bấm nút Chi tiết của dòng đầu tiên để xem JSON Trước / Sau
    const detailButtons = screen.getAllByRole('button', { name: 'Chi tiết' });
    await user.click(detailButtons[0]);

    expect(screen.getByText('Trước')).toBeInTheDocument();
    expect(screen.getByText('Sau')).toBeInTheDocument();
    expect(screen.getByText(/"status": "active"/)).toBeInTheDocument();
    expect(screen.getByText(/"status": "locked"/)).toBeInTheDocument();

    // Thu gọn lại
    await user.click(screen.getByRole('button', { name: 'Thu gọn' }));
    expect(screen.queryByText(/"status": "locked"/)).not.toBeInTheDocument();
  });

  it('gửi đúng tham số bộ lọc khi chọn sự kiện và nhập từ khóa tìm kiếm', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/audit-logs/facets')) {
        return { ok: true, status: 200, json: async () => MOCK_FACETS } as Response;
      }
      return { ok: true, status: 200, json: async () => MOCK_LIST_RESPONSE } as Response;
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Khóa tài khoản' })).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Phan Thanh Đức (admin)' }),
      ).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Lọc theo sự kiện'), 'USER_LOCKED');
    await user.selectOptions(screen.getByLabelText('Lọc theo người thực hiện'), 'u-admin');
    await user.type(screen.getByLabelText('Tìm kiếm nhật ký'), 'PN2611');

    await waitFor(() => {
      expect(
        requestedUrls.some(
          (url) =>
            url.includes('eventType=USER_LOCKED') &&
            url.includes('actorUserId=u-admin') &&
            url.includes('search=PN2611'),
        ),
      ).toBe(true);
    });
  });

  it('hiển thị trạng thái rỗng khi không có bản ghi phù hợp', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/audit-logs/facets')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ eventTypes: [], entityTypes: [], actors: [] }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], total: 0, page: 1, pageSize: 50 }),
      } as Response;
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Chưa có bản ghi nhật ký hệ thống nào.')).toBeInTheDocument();
    });
  });

  it('hiển thị trạng thái lỗi kèm nút Thử lại khi API lỗi', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/audit-logs/facets')) {
        return { ok: true, status: 200, json: async () => MOCK_FACETS } as Response;
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Lỗi máy chủ' }),
      } as Response;
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Không thể tải nhật ký hệ thống/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
