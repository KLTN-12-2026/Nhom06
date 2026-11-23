import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type PermissionMatrixResponse } from '../types';
import { PermissionMatrixCard } from './PermissionMatrixCard';

const FULL_29_PERMISSIONS: PermissionMatrixResponse['permissions'] = [
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'audit.read',
  'catalog.read',
  'catalog.manage',
  'inbound.read',
  'inbound.create',
  'inbound.confirm',
  'inventory.read',
  'stock_count.create',
  'stock_count.approve',
  'orders.read',
  'orders.create',
  'orders.cancel',
  'outbound.read',
  'outbound.create',
  'outbound.confirm',
  'expiry.read',
  'expiry.manage',
  'forecast.read',
  'analysis.read',
  'analysis.run',
  'proposals.read',
  'proposals.approve',
  'executions.read',
  'executions.update',
  'reports.read',
].map((code) => ({
  code,
  module: code.split('.')[0],
  action: code.split('.')[1] ?? 'read',
  description: `Mô tả ${code}`,
}));

const FULL_D016_MATRIX: PermissionMatrixResponse = {
  permissions: FULL_29_PERMISSIONS,
  roles: [
    {
      code: 'ADMIN',
      name: 'Quản trị viên',
      permissionCodes: FULL_29_PERMISSIONS.map((p) => p.code).filter(
        (code) => code !== 'proposals.approve',
      ),
    },
    {
      code: 'WAREHOUSE_MANAGER',
      name: 'Quản lý kho',
      permissionCodes: [
        'catalog.read',
        'catalog.manage',
        'inbound.read',
        'inbound.confirm',
        'inventory.read',
        'stock_count.create',
        'stock_count.approve',
        'orders.read',
        'outbound.read',
        'outbound.confirm',
        'expiry.read',
        'expiry.manage',
        'forecast.read',
        'analysis.read',
        'analysis.run',
        'proposals.read',
        'proposals.approve',
        'executions.read',
        'executions.update',
        'reports.read',
      ],
    },
    {
      code: 'WAREHOUSE_STAFF',
      name: 'Nhân viên kho',
      permissionCodes: [
        'catalog.read',
        'catalog.manage',
        'inbound.read',
        'inbound.create',
        'inbound.confirm',
        'inventory.read',
        'stock_count.create',
        'orders.read',
        'orders.create',
        'orders.cancel',
        'outbound.read',
        'outbound.create',
        'outbound.confirm',
        'expiry.read',
        'forecast.read',
        'analysis.read',
        'proposals.read',
        'executions.read',
        'executions.update',
      ],
    },
  ],
};

describe('PermissionMatrixCard (T-018 AC5)', () => {
  it('nhóm 29 mã quyền từ DB thành 23 dòng đúng mockup 29 và giữ đúng cột/tick D-016', () => {
    render(
      <PermissionMatrixCard
        data={FULL_D016_MATRIX}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('23 quyền thao tác')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quản trị' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quản lý kho' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nhân viên' })).toBeInTheDocument();

    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(23);

    // Kiểm tra 5 dòng gộp theo D-016
    expect(screen.getByText('Tạo và sửa đơn đại lý')).toBeInTheDocument();
    expect(screen.getByText('Xem kết quả phân tích')).toBeInTheDocument();
    expect(screen.getByText('Ghi kết quả thực hiện')).toBeInTheDocument();
    expect(screen.getByText('Quản lý tài khoản')).toBeInTheDocument();
    expect(screen.getByText('Phân quyền')).toBeInTheDocument();

    // Bất biến 8 & D-016: chỉ Quản lý kho có quyền Phê duyệt đề xuất
    const approveRow = screen.getByText('Phê duyệt đề xuất').closest('tr');
    expect(approveRow).not.toBeNull();
    const rowUtils = within(approveRow as HTMLElement);
    expect(
      rowUtils.getByLabelText('Quản trị không có quyền Phê duyệt đề xuất'),
    ).toBeInTheDocument();
    expect(
      rowUtils.getByLabelText('Quản lý kho có quyền Phê duyệt đề xuất'),
    ).toBeInTheDocument();
    expect(
      rowUtils.getByLabelText('Nhân viên không có quyền Phê duyệt đề xuất'),
    ).toBeInTheDocument();

    // Dòng gộp "Xem kết quả phân tích" (analysis.read + forecast.read): cả 3 vai trò đều có
    const analysisViewRow = screen.getByText('Xem kết quả phân tích').closest('tr');
    expect(analysisViewRow).not.toBeNull();
    const analysisUtils = within(analysisViewRow as HTMLElement);
    expect(
      analysisUtils.getByLabelText('Nhân viên có quyền Xem kết quả phân tích'),
    ).toBeInTheDocument();
  });

  it('tự nối thêm dòng fallback nếu DB có mã quyền mới chưa có trong bảng nhóm', () => {
    const customMatrix: PermissionMatrixResponse = {
      permissions: [
        ...FULL_29_PERMISSIONS,
        {
          code: 'custom.export',
          module: 'custom',
          action: 'export',
          description: 'Xuất dữ liệu tuỳ chỉnh',
        },
      ],
      roles: FULL_D016_MATRIX.roles.map((role) =>
        role.code === 'ADMIN'
          ? { ...role, permissionCodes: [...role.permissionCodes, 'custom.export'] }
          : role,
      ),
    };

    render(
      <PermissionMatrixCard
        data={customMatrix}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('24 quyền thao tác')).toBeInTheDocument();
    expect(screen.getByText('Xuất dữ liệu tuỳ chỉnh')).toBeInTheDocument();
  });
});
