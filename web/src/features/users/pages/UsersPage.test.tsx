import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/common/ToastProvider';
import { AuthProvider } from '@/features/auth/AuthContext';
import { type AuthUser } from '@/features/auth/types';
import { UsersPage } from './UsersPage';

const MOCK_USERS = [
  {
    id: 'u-admin',
    username: 'admin',
    email: 'admin@kho-ai.local',
    fullName: 'Phan Thanh Đức',
    phone: null,
    role: { code: 'ADMIN', name: 'Quản trị viên' },
    status: 'active',
    lastLoginAt: null,
    createdAt: '2026-11-23T00:00:00.000Z',
  },
  {
    id: 'u-quanly',
    username: 'quanly',
    email: 'quanly@kho-ai.local',
    fullName: 'Nguyễn Văn Dương',
    phone: null,
    role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
    status: 'active',
    lastLoginAt: null,
    createdAt: '2026-11-23T00:00:01.000Z',
  },
  {
    id: 'u-nhanvien',
    username: 'nhanvien',
    email: 'nhanvien@kho-ai.local',
    fullName: 'Trương Thành Lê',
    phone: null,
    role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' },
    status: 'active',
    lastLoginAt: null,
    createdAt: '2026-11-23T00:00:02.000Z',
  },
];

const MOCK_MATRIX = {
  permissions: [
    {
      code: 'proposals.approve',
      module: 'proposals',
      action: 'approve',
      description: 'Phê duyệt hoặc từ chối đề xuất xử lý',
    },
    {
      code: 'users.manage',
      module: 'users',
      action: 'manage',
      description: 'Tạo, sửa, khóa tài khoản',
    },
  ],
  roles: [
    { code: 'ADMIN', name: 'Quản trị viên', permissionCodes: ['users.manage'] },
    { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho', permissionCodes: ['proposals.approve'] },
    { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho', permissionCodes: [] },
  ],
};

function renderUsersPage(authUser: AuthUser) {
  localStorage.setItem('kho_ai_access_token', 'test-token');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return { ok: true, status: 200, json: async () => authUser } as Response;
    }
    if (url.includes('/permissions/matrix')) {
      return { ok: true, status: 200, json: async () => MOCK_MATRIX } as Response;
    }
    if (url.includes('/users')) {
      return { ok: true, status: 200, json: async () => MOCK_USERS } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter>
            <UsersPage />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('UsersPage (AC8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('hiển thị danh sách 3 tài khoản, ma trận quyền 3 cột vai trò và ghi chú phân quyền cho admin', async () => {
    renderUsersPage({
      id: 'u-admin',
      username: 'admin',
      fullName: 'Phan Thanh Đức',
      role: { code: 'ADMIN', name: 'Quản trị viên' },
      permissions: ['users.read', 'users.manage', 'roles.read', 'roles.manage'],
    });

    await waitFor(() => {
      expect(screen.getByText('Phan Thanh Đức')).toBeInTheDocument();
    });

    expect(screen.getByText('Nguyễn Văn Dương')).toBeInTheDocument();
    expect(screen.getByText('Trương Thành Lê')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm tài khoản' })).toBeInTheDocument();
    expect(await screen.findByText('2 quyền thao tác')).toBeInTheDocument();
    expect(screen.getByText('Ma trận quyền')).toBeInTheDocument();
    expect(screen.getByText('Quản trị')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú phân quyền')).toBeInTheDocument();
  });

  it('ẩn nút Thêm tài khoản và nút Khoá khi người dùng chỉ có quyền users.read', async () => {
    renderUsersPage({
      id: 'u-viewer',
      username: 'viewer',
      fullName: 'Người Xem',
      role: { code: 'ADMIN', name: 'Quản trị viên' },
      permissions: ['users.read', 'roles.read'],
    });

    await waitFor(() => {
      expect(screen.getByText('Phan Thanh Đức')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Thêm tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khoá' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đặt lại mật khẩu' })).not.toBeInTheDocument();
  });

  it('chỉ hiện nút Đặt lại mật khẩu ở các dòng không phải chính mình khi có users.manage và mở được dialog (T-020 AC6)', async () => {
    const user = userEvent.setup();
    renderUsersPage({
      id: 'u-admin',
      username: 'admin',
      fullName: 'Phan Thanh Đức',
      role: { code: 'ADMIN', name: 'Quản trị viên' },
      permissions: ['users.read', 'users.manage', 'roles.read', 'roles.manage'],
    });

    await waitFor(() => {
      expect(screen.getByText('Phan Thanh Đức')).toBeInTheDocument();
    });

    const adminRow = screen.getByText('Phan Thanh Đức').closest('tr');
    const managerRow = screen.getByText('Nguyễn Văn Dương').closest('tr');
    const staffRow = screen.getByText('Trương Thành Lê').closest('tr');

    expect(adminRow).not.toBeNull();
    expect(managerRow).not.toBeNull();
    expect(staffRow).not.toBeNull();

    // Ẩn ở dòng của chính mình (admin), hiện ở 2 dòng còn lại (quanly, nhanvien)
    expect(
      within(adminRow as HTMLElement).queryByRole('button', { name: 'Đặt lại mật khẩu' }),
    ).not.toBeInTheDocument();
    const managerResetBtn = within(managerRow as HTMLElement).getByRole('button', {
      name: 'Đặt lại mật khẩu',
    });
    expect(
      within(staffRow as HTMLElement).getByRole('button', { name: 'Đặt lại mật khẩu' }),
    ).toBeInTheDocument();

    await user.click(managerResetBtn);
    expect(await screen.findByText('Đặt lại mật khẩu cho quanly')).toBeInTheDocument();
    expect(
      screen.getByText('Tài khoản này sẽ bị đăng xuất khỏi mọi phiên đang mở.'),
    ).toBeInTheDocument();
  });
});
