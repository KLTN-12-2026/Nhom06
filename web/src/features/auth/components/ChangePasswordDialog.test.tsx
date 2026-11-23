import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '../AuthContext';
import { type AuthUser } from '../types';
import { ChangePasswordDialog } from './ChangePasswordDialog';

const STAFF_USER: AuthUser = {
  id: 'u-staff',
  username: 'nhanvien',
  fullName: 'Trương Thành Lê',
  role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
  permissions: ['inventory.read'],
};

function renderDialog(onOpenChange = vi.fn()) {
  localStorage.setItem('kho_ai_access_token', 'staff-token');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/login" element={<div>Màn hình đăng nhập</div>} />
              <Route
                path="/"
                element={<ChangePasswordDialog open onOpenChange={onOpenChange} />}
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ChangePasswordDialog (T-020 AC6)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('validate mật khẩu mới < 8 ký tự, không khớp và trùng mật khẩu hiện tại trước khi gọi API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'MatKhauCu1');
    await user.type(screen.getByLabelText('Mật khẩu mới'), '1234567');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'khacnhau');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Mật khẩu mới phải có ít nhất 8 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();

    // Trùng mật khẩu hiện tại
    await user.clear(screen.getByLabelText('Mật khẩu mới'));
    await user.clear(screen.getByLabelText('Nhập lại mật khẩu mới'));
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'MatKhauCu1');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'MatKhauCu1');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(
      await screen.findByText('Mật khẩu mới không được trùng mật khẩu hiện tại'),
    ).toBeInTheDocument();

    const changeCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/change-password'),
    );
    expect(changeCalls).toHaveLength(0);
  });

  it('gán lỗi API 400 đúng ô mật khẩu hiện tại và không xóa token phiên đang mở', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.endsWith('/auth/change-password')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            statusCode: 400,
            message: 'Mật khẩu hiện tại không đúng',
            errors: [{ field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng' }],
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'sai123');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'MatKhauMoi2026');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'MatKhauMoi2026');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument();
    expect(localStorage.getItem('kho_ai_access_token')).toBe('staff-token');
  });

  it('đổi mật khẩu thành công hiện toast, xóa token cục bộ và chuyển sang /login', async () => {
    const onOpenChange = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return { ok: true, status: 200, json: async () => STAFF_USER } as Response;
      }
      if (url.endsWith('/auth/change-password')) {
        return {
          ok: true,
          status: 204,
          headers: new Headers({ 'content-length': '0' }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderDialog(onOpenChange);

    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), '123456');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'MatKhauMoi2026');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'MatKhauMoi2026');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() => {
      expect(screen.getByText('Màn hình đăng nhập')).toBeInTheDocument();
    });
    expect(screen.getByText('Đã đổi mật khẩu. Vui lòng đăng nhập lại.')).toBeInTheDocument();
    expect(localStorage.getItem('kho_ai_access_token')).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Không gọi thừa /auth/logout vì server đã tăng token_version
    const logoutCalls = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCalls).toHaveLength(0);
  });
});
