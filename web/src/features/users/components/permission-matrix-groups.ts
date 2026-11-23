import { type PermissionMatrixResponse } from '../types';

type PermissionMatrixItem = PermissionMatrixResponse['permissions'][number];

export interface PermissionMatrixGroupDefinition {
  key: string;
  label: string;
  codes: readonly string[];
}

export interface GroupedPermissionRow {
  key: string;
  label: string;
  codes: readonly string[];
}

/**
 * Ánh xạ 29 mã quyền nguyên tử trong DB thành 23 dòng hiển thị theo bảng D-016 và mockup 29.
 * Chỉ gộp ở tầng trình bày; trạng thái dấu ✓ vẫn đọc thẳng từ role_permissions của API.
 */
export const D016_PERMISSION_GROUPS: readonly PermissionMatrixGroupDefinition[] = [
  { key: 'catalog.read', label: 'Xem danh mục', codes: ['catalog.read'] },
  { key: 'catalog.manage', label: 'Quản lý danh mục', codes: ['catalog.manage'] },
  { key: 'inbound.read', label: 'Xem phiếu nhập', codes: ['inbound.read'] },
  { key: 'inbound.create', label: 'Lập phiếu nhập', codes: ['inbound.create'] },
  { key: 'inbound.confirm', label: 'Xác nhận nhập kho', codes: ['inbound.confirm'] },
  { key: 'orders.read', label: 'Xem đơn đại lý', codes: ['orders.read'] },
  {
    key: 'orders.manage',
    label: 'Tạo và sửa đơn đại lý',
    codes: ['orders.create', 'orders.cancel'],
  },
  { key: 'outbound.read', label: 'Xem phiếu xuất', codes: ['outbound.read'] },
  { key: 'outbound.create', label: 'Lập phiếu xuất', codes: ['outbound.create'] },
  { key: 'outbound.confirm', label: 'Xác nhận xuất kho', codes: ['outbound.confirm'] },
  { key: 'inventory.read', label: 'Xem tồn kho và lịch sử', codes: ['inventory.read'] },
  { key: 'stock_count.create', label: 'Lập phiếu kiểm kê', codes: ['stock_count.create'] },
  {
    key: 'stock_count.approve',
    label: 'Xác nhận điều chỉnh tồn',
    codes: ['stock_count.approve'],
  },
  { key: 'expiry.read', label: 'Xem cảnh báo cận hạn', codes: ['expiry.read'] },
  { key: 'expiry.manage', label: 'Cấu hình ngưỡng cảnh báo', codes: ['expiry.manage'] },
  {
    key: 'analysis.view',
    label: 'Xem kết quả phân tích',
    codes: ['analysis.read', 'forecast.read'],
  },
  { key: 'analysis.run', label: 'Chạy lại phân tích', codes: ['analysis.run'] },
  { key: 'proposals.read', label: 'Xem đề xuất xử lý', codes: ['proposals.read'] },
  { key: 'proposals.approve', label: 'Phê duyệt đề xuất', codes: ['proposals.approve'] },
  {
    key: 'executions.manage',
    label: 'Ghi kết quả thực hiện',
    codes: ['executions.read', 'executions.update'],
  },
  { key: 'reports.read', label: 'Xem báo cáo', codes: ['reports.read'] },
  {
    key: 'users.admin',
    label: 'Quản lý tài khoản',
    codes: ['users.read', 'users.manage', 'audit.read'],
  },
  { key: 'roles.admin', label: 'Phân quyền', codes: ['roles.read', 'roles.manage'] },
];

export function groupPermissionsForMatrix(
  permissions: readonly PermissionMatrixItem[],
): GroupedPermissionRow[] {
  const availableByCode = new Map(permissions.map((perm) => [perm.code, perm]));
  const consumed = new Set<string>();
  const rows: GroupedPermissionRow[] = [];

  for (const group of D016_PERMISSION_GROUPS) {
    const presentCodes = group.codes.filter((code) => availableByCode.has(code));
    if (presentCodes.length === 0) {
      continue;
    }
    for (const code of presentCodes) {
      consumed.add(code);
    }
    rows.push({
      key: group.key,
      label: group.label,
      codes: presentCodes,
    });
  }

  for (const perm of permissions) {
    if (consumed.has(perm.code)) {
      continue;
    }
    rows.push({
      key: perm.code,
      label: perm.description || perm.code,
      codes: [perm.code],
    });
  }

  return rows;
}
