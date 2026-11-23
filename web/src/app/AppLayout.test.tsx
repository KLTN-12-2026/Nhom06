import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { type AuthUser } from '@/features/auth/types';
import { AppLayout } from './AppLayout';

function renderAppWithAuth(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/login" element={<div>Màn hình đăng nhập</div>} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<div>Nội dung bảng điều khiển</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AppLayout & ProtectedRoute (AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('chuyển hướng sang /login khi truy cập / mà chưa đăng nhập', async () => {
    renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getByText('Màn hình đăng nhập')).toBeInTheDocument();
    });
  });

  it('ẩn mục Tài khoản và Báo cáo với nhân viên kho và cho phép đăng xuất', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: [
        'catalog.read',
        'inbound.read',
        'inventory.read',
        'orders.read',
        'outbound.read',
        'expiry.read',
        'forecast.read',
        'analysis.read',
        'proposals.read',
        'executions.read',
      ],
    };

    localStorage.setItem('kho_ai_access_token', 'staff-token');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => staffUser,
        } as Response;
      }
      if (url.endsWith('/auth/logout')) {
        return {
          ok: true,
          status: 204,
          headers: new Headers({ 'content-length': '0' }),
        } as Response;
      }
      if (url.includes('/expiry-alerts/summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            evaluationDate: '2026-11-23',
            expired: { lots: 4, qty: '837' },
            nearExpiry: { lots: 3, qty: '1029' },
            totalAlertLots: 7,
            global: { warningDays: 30, criticalDays: 7, minDeliveryDays: 7 },
            overridesSummary: 'Chưa có ngưỡng riêng',
          }),
        } as Response;
      }
      if (url.includes('/proposals/summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ pending: 8 }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getByText('Nội dung bảng điều khiển')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('7 lô cảnh báo cận hạn')).toBeInTheDocument();
      expect(screen.getByLabelText('8 đề xuất chờ quyết định')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Trương Thành Lê').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nhân viên kho').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: 'Tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nhật ký hệ thống' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Báo cáo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Khác')).not.toBeInTheDocument();

    const logoutButtons = screen.getAllByRole('button', { name: 'Đăng xuất' });
    await user.click(logoutButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Màn hình đăng nhập')).toBeInTheDocument();
    });
    expect(localStorage.getItem('kho_ai_access_token')).toBeNull();
  });

  it('hiển thị mục Tài khoản, Nhật ký hệ thống và Báo cáo với quản trị viên', async () => {
    const adminUser: AuthUser = {
      id: 'u-admin',
      username: 'admin',
      fullName: 'Phan Thanh Đức',
      role: { code: 'ADMIN', name: 'Quản trị viên' },
      permissions: ['users.read', 'audit.read', 'reports.read', 'catalog.read'],
    };

    localStorage.setItem('kho_ai_access_token', 'admin-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => adminUser,
    } as Response);

    renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Tài khoản' }).length).toBeGreaterThanOrEqual(1);
    });
    expect(
      screen.getAllByRole('link', { name: 'Nhật ký hệ thống' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'Báo cáo' }).length).toBeGreaterThanOrEqual(1);
  });

  it('ẩn mục Nhật ký hệ thống với quản lý kho không có quyền audit.read (T-021 AC5)', async () => {
    const managerUser: AuthUser = {
      id: 'u-manager',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['catalog.read', 'inventory.read', 'reports.read'],
    };

    localStorage.setItem('kho_ai_access_token', 'manager-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => managerUser,
    } as Response);

    renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Báo cáo' }).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole('link', { name: 'Nhật ký hệ thống' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tài khoản' })).not.toBeInTheDocument();
  });

  it('dựng bố cục màn hình hẹp 3 băng theo mockup 30 với menu cuộn ngang và không tràn trang (T-018 AC2)', async () => {
    const managerUser: AuthUser = {
      id: 'u-manager',
      username: 'quanly',
      fullName: 'Nguyễn Văn Dương',
      role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
      permissions: ['catalog.read', 'inventory.read', 'reports.read'],
    };

    localStorage.setItem('kho_ai_access_token', 'manager-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => managerUser,
    } as Response);

    const { container } = renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getByText('Nội dung bảng điều khiển')).toBeInTheDocument();
    });

    const outerWrapper = container.firstElementChild as HTMLElement;
    expect(outerWrapper.className).toContain('overflow-x-clip');

    const mobileTopbar = screen.getByTestId('mobile-topbar');
    expect(mobileTopbar.className).toContain('lg:hidden');
    expect(mobileTopbar.className).toContain('bg-[var(--brand)]');
    expect(mobileTopbar).toHaveTextContent('Quản lý kho');
    expect(mobileTopbar).toHaveTextContent('Kho trung tâm Đà Nẵng');
    expect(mobileTopbar).toHaveTextContent('Nguyễn Văn Dương');
    expect(mobileTopbar).toHaveTextContent('Đổi mật khẩu');
    expect(mobileTopbar).toHaveTextContent('Đăng xuất');

    const mobileNav = screen.getByRole('navigation', { name: 'Điều hướng di động' });
    expect(mobileNav.className).toContain('overflow-x-auto');
  });

  it('hiển thị nút Đổi mật khẩu cạnh Đăng xuất và mở dialog đổi mật khẩu (T-020 AC6)', async () => {
    const staffUser: AuthUser = {
      id: 'u-staff',
      username: 'nhanvien',
      fullName: 'Trương Thành Lê',
      role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
      permissions: ['inventory.read'],
    };

    localStorage.setItem('kho_ai_access_token', 'staff-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => staffUser,
    } as Response);

    const user = userEvent.setup();
    renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getByText('Nội dung bảng điều khiển')).toBeInTheDocument();
    });

    const changePassButtons = screen.getAllByRole('button', { name: 'Đổi mật khẩu' });
    expect(changePassButtons).toHaveLength(2); // desktop sidebar + mobile topbar

    await user.click(changePassButtons[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument();
    expect(screen.getByLabelText('Nhập lại mật khẩu mới')).toBeInTheDocument();
  });

  it('DialogContent dùng kích thước co giãn và cuộn dọc phù hợp màn 390px (T-018 AC2)', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Xác nhận thao tác</DialogTitle>
          <DialogDescription>Mô tả hậu quả</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('w-[calc(100vw-2rem)]');
    expect(dialog.className).toContain('overflow-y-auto');
  });
});
