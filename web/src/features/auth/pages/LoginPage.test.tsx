import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../AuthContext';
import { LoginPage } from './LoginPage';

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Trang bảng điều khiển</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị lỗi tại từng trường và không gửi API khi để trống tên đăng nhập hoặc mật khẩu', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderLoginPage();

    expect(screen.getByText(/Tài khoản dùng thử:/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Vui lòng nhập tên đăng nhập')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hiển thị thông báo lỗi từ API dưới form khi sai mật khẩu hoặc tài khoản bị khóa', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        statusCode: 401,
        message: 'Tên đăng nhập hoặc mật khẩu không đúng',
      }),
    } as Response);

    renderLoginPage();

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'quanly');
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Tên đăng nhập hoặc mật khẩu không đúng'),
    ).toBeInTheDocument();
  });

  it('đăng nhập thành công sẽ lưu token và chuyển vào bảng điều khiển', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'jwt-demo-token',
        user: {
          id: 'u-1',
          username: 'quanly',
          fullName: 'Nguyễn Văn Dương',
          role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
          permissions: ['reports.read'],
        },
      }),
    } as Response);

    renderLoginPage();

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'quanly');
    await user.type(screen.getByLabelText('Mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(screen.getByText('Trang bảng điều khiển')).toBeInTheDocument();
    });
    expect(localStorage.getItem('kho_ai_access_token')).toBe('jwt-demo-token');
  });
});
