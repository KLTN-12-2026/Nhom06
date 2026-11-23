import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
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
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderAppWithAuth('/');

    await waitFor(() => {
      expect(screen.getByText('Nội dung bảng điều khiển')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Trương Thành Lê').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nhân viên kho').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: 'Tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Báo cáo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Khác')).not.toBeInTheDocument();

    const logoutButtons = screen.getAllByRole('button', { name: 'Đăng xuất' });
    await user.click(logoutButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Màn hình đăng nhập')).toBeInTheDocument();
    });
    expect(localStorage.getItem('kho_ai_access_token')).toBeNull();
  });

  it('hiển thị mục Tài khoản và Báo cáo với quản trị viên', async () => {
    const adminUser: AuthUser = {
      id: 'u-admin',
      username: 'admin',
      fullName: 'Phan Thanh Đức',
      role: { code: 'ADMIN', name: 'Quản trị viên' },
      permissions: ['users.read', 'reports.read', 'catalog.read'],
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
    expect(screen.getAllByRole('link', { name: 'Báo cáo' }).length).toBeGreaterThanOrEqual(1);
  });
});
