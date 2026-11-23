export type RoleCode = 'ADMIN' | 'WAREHOUSE_MANAGER' | 'WAREHOUSE_STAFF';

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
}

export interface PermissionDefinition {
  code: string;
  module: string;
  action: string;
  description: string;
}

export const ROLES: readonly RoleDefinition[] = [
  {
    code: 'ADMIN',
    name: 'Quản trị viên',
    description: 'Quản trị tài khoản, vai trò, danh mục, nhật ký hệ thống và xem báo cáo',
  },
  {
    code: 'WAREHOUSE_MANAGER',
    name: 'Quản lý kho',
    description:
      'Quản lý toàn bộ nghiệp vụ kho, xác nhận nhập/xuất, duyệt kiểm kê, ngưỡng HSD, chạy phân tích và phê duyệt đề xuất xử lý',
  },
  {
    code: 'WAREHOUSE_STAFF',
    name: 'Nhân viên kho',
    description:
      'Thực hiện nghiệp vụ kho hằng ngày: lập và xác nhận phiếu nhập/xuất, lập đơn và kiểm kê, cập nhật tiến độ thực hiện đề xuất',
  },
] as const;

export const PERMISSIONS: readonly PermissionDefinition[] = [
  { code: 'users.read', module: 'users', action: 'read', description: 'Xem danh sách tài khoản' },
  { code: 'users.manage', module: 'users', action: 'manage', description: 'Tạo, sửa, khóa tài khoản' },
  { code: 'roles.read', module: 'roles', action: 'read', description: 'Xem vai trò và quyền' },
  { code: 'roles.manage', module: 'roles', action: 'manage', description: 'Cấu hình vai trò và gán quyền' },
  { code: 'audit.read', module: 'audit', action: 'read', description: 'Xem nhật ký thay đổi hệ thống' },

  { code: 'catalog.read', module: 'catalog', action: 'read', description: 'Xem danh mục sản phẩm, NCC, đại lý' },
  { code: 'catalog.manage', module: 'catalog', action: 'manage', description: 'Quản lý danh mục sản phẩm, NCC, đại lý' },

  { code: 'inbound.read', module: 'inbound', action: 'read', description: 'Xem phiếu nhập kho' },
  { code: 'inbound.create', module: 'inbound', action: 'create', description: 'Tạo và sửa nháp phiếu nhập kho' },
  { code: 'inbound.confirm', module: 'inbound', action: 'confirm', description: 'Xác nhận phiếu nhập kho' },

  { code: 'inventory.read', module: 'inventory', action: 'read', description: 'Xem tồn kho theo lô và sổ biến động' },
  { code: 'stock_count.create', module: 'stock_count', action: 'create', description: 'Lập và gửi phiếu kiểm kê' },
  { code: 'stock_count.approve', module: 'stock_count', action: 'approve', description: 'Phê duyệt phiếu kiểm kê và điều chỉnh tồn' },

  { code: 'orders.read', module: 'orders', action: 'read', description: 'Xem đơn hàng đại lý' },
  { code: 'orders.create', module: 'orders', action: 'create', description: 'Tạo đơn hàng hộ đại lý' },
  { code: 'orders.cancel', module: 'orders', action: 'cancel', description: 'Hủy đơn hàng đại lý' },
  { code: 'outbound.read', module: 'outbound', action: 'read', description: 'Xem phiếu xuất kho' },
  { code: 'outbound.create', module: 'outbound', action: 'create', description: 'Tạo phiếu xuất kho theo FEFO hoặc xuất khác' },
  { code: 'outbound.confirm', module: 'outbound', action: 'confirm', description: 'Xác nhận phiếu xuất kho' },

  { code: 'expiry.read', module: 'expiry', action: 'read', description: 'Xem cảnh báo hạn sử dụng' },
  { code: 'expiry.manage', module: 'expiry', action: 'manage', description: 'Cấu hình ngưỡng cảnh báo hạn sử dụng' },

  { code: 'forecast.read', module: 'forecast', action: 'read', description: 'Xem dự báo nhu cầu' },
  { code: 'analysis.read', module: 'analysis', action: 'read', description: 'Xem kết quả phân tích rủi ro cận hạn' },
  { code: 'analysis.run', module: 'analysis', action: 'run', description: 'Kích hoạt lượt phân tích dự báo và rủi ro' },
  { code: 'proposals.read', module: 'proposals', action: 'read', description: 'Xem đề xuất xử lý hàng cận hạn' },
  { code: 'proposals.approve', module: 'proposals', action: 'approve', description: 'Phê duyệt hoặc từ chối đề xuất xử lý' },
  { code: 'executions.read', module: 'executions', action: 'read', description: 'Xem kế hoạch thực hiện đề xuất' },
  { code: 'executions.update', module: 'executions', action: 'update', description: 'Cập nhật tiến độ thực hiện đề xuất' },

  { code: 'reports.read', module: 'reports', action: 'read', description: 'Xem báo cáo tổng hợp kho và AI' },
] as const;

/**
 * Ma trận phân quyền mặc định theo quyết định Q-07 (docs/decisions.md).
 * Tập trung tại một hằng số duy nhất để nhóm dễ cập nhật khi chốt PB03.
 * Bất biến bắt buộc: `proposals.approve` và `stock_count.approve` CHỈ có ở WAREHOUSE_MANAGER.
 */
export const ROLE_PERMISSION_MATRIX: Record<RoleCode, readonly string[]> = {
  ADMIN: [
    'users.read',
    'users.manage',
    'roles.read',
    'roles.manage',
    'audit.read',
    'catalog.read',
    'catalog.manage',
    'inbound.read',
    'inventory.read',
    'orders.read',
    'outbound.read',
    'expiry.read',
    'forecast.read',
    'analysis.read',
    'proposals.read',
    'executions.read',
    'reports.read',
  ],
  WAREHOUSE_MANAGER: [
    'catalog.read',
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
  ],
  WAREHOUSE_STAFF: [
    'catalog.read',
    'inbound.read',
    'inbound.create',
    'inbound.confirm',
    'inventory.read',
    'stock_count.create',
    'orders.read',
    'orders.create',
    'outbound.read',
    'outbound.create',
    'outbound.confirm',
    'expiry.read',
    'forecast.read',
    'analysis.read',
    'proposals.read',
    'executions.read',
    'executions.update',
    'reports.read',
  ],
};
