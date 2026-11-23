import { ForbiddenException } from '@nestjs/common';

const ROLE_DISPLAY_ORDER: readonly string[] = ['ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'];

export interface MatrixPermissionItem {
  code: string;
  module: string;
  action: string;
  description: string | null;
}

export interface MatrixRoleItem {
  code: string;
  name: string;
  permissionCodes: string[];
}

export interface PermissionMatrixResult {
  permissions: MatrixPermissionItem[];
  roles: MatrixRoleItem[];
}

export function assertNotSelfLock(
  actorUserId: string,
  targetUserId: string,
  nextStatus: 'active' | 'locked',
): void {
  if (actorUserId === targetUserId && nextStatus === 'locked') {
    throw new ForbiddenException('Không thể tự khóa tài khoản của chính mình');
  }
}

export function assertNotSelfRoleChange(actorUserId: string, targetUserId: string): void {
  if (actorUserId === targetUserId) {
    throw new ForbiddenException('Không thể tự thay đổi vai trò của chính mình');
  }
}

export function sortRolesForDisplay<T extends { code: string }>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => {
    const idxA = ROLE_DISPLAY_ORDER.indexOf(a.code);
    const idxB = ROLE_DISPLAY_ORDER.indexOf(b.code);
    const rankA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
    const rankB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.code.localeCompare(b.code);
  });
}

export function formatPermissionMatrix(
  permissions: readonly MatrixPermissionItem[],
  roles: readonly MatrixRoleItem[],
): PermissionMatrixResult {
  return {
    permissions: [...permissions],
    roles: sortRolesForDisplay(roles),
  };
}
