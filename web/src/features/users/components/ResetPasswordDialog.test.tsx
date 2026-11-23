import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UserItem } from '../types';
import { ResetPasswordDialog } from './ResetPasswordDialog';

const TARGET_USER: UserItem = {
  id: 'u-quanly',
  username: 'quanly',
  email: 'quanly@kho-ai.local',
  fullName: 'Nguyễn Văn Dương',
  phone: null,
  role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
  status: 'active',
  lastLoginAt: null,
  createdAt: '2026-11-23T00:00:01.000Z',
};

function renderDialog(onOpenChange = vi.fn(), onSuccess = vi.fn()) {
  localStorage.setItem('kho_ai_access_token', 'admin-token');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ResetPasswordDialog
        user={TARGET_USER}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );
}

describe('ResetPasswordDialog (T-020 AC6)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị hộp ghi chú đăng xuất mọi phiên và validate độ dài/khớp trước khi gửi API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.getByText('Tài khoản này sẽ bị đăng xuất khỏi mọi phiên đang mở.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Mật khẩu mới'), '1234567');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'khacnhau');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));

    expect(await screen.findByText('Mật khẩu mới phải có ít nhất 8 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('gọi POST /users/:id/reset-password thành công, đóng dialog và báo thông báo thành công', async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-length': '0' }),
    } as Response);

    const user = userEvent.setup();
    renderDialog(onOpenChange, onSuccess);

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'QuanLyMoi2026');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'QuanLyMoi2026');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(onSuccess).toHaveBeenCalledWith('Đã đặt lại mật khẩu cho tài khoản quanly.');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/users/u-quanly/reset-password'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
