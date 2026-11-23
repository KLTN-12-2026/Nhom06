import { ForbiddenException } from '@nestjs/common';
import {
  assertNotSelfLock,
  assertNotSelfRoleChange,
  formatPermissionMatrix,
} from './user-policy';

describe('user-policy (domain)', () => {
  describe('assertNotSelfLock', () => {
    it('chặn người dùng tự khóa tài khoản của chính mình (403)', () => {
      expect(() => assertNotSelfLock('user-1', 'user-1', 'locked')).toThrow(ForbiddenException);
      expect(() => assertNotSelfLock('user-1', 'user-1', 'locked')).toThrow(
        'Không thể tự khóa tài khoản của chính mình',
      );
    });

    it('cho phép khóa tài khoản người dùng khác', () => {
      expect(() => assertNotSelfLock('admin-1', 'staff-2', 'locked')).not.toThrow();
    });

    it('cho phép đặt trạng thái active', () => {
      expect(() => assertNotSelfLock('user-1', 'user-1', 'active')).not.toThrow();
    });
  });

  describe('assertNotSelfRoleChange', () => {
    it('chặn người dùng tự đổi vai trò của chính mình (403)', () => {
      expect(() => assertNotSelfRoleChange('admin-1', 'admin-1')).toThrow(ForbiddenException);
      expect(() => assertNotSelfRoleChange('admin-1', 'admin-1')).toThrow(
        'Không thể tự thay đổi vai trò của chính mình',
      );
    });

    it('cho phép đổi vai trò của người dùng khác', () => {
      expect(() => assertNotSelfRoleChange('admin-1', 'staff-2')).not.toThrow();
    });
  });

  describe('formatPermissionMatrix', () => {
    it('sắp xếp đúng thứ tự 3 vai trò ADMIN, WAREHOUSE_MANAGER, WAREHOUSE_STAFF và giữ nguyên danh sách quyền', () => {
      const result = formatPermissionMatrix(
        [
          { code: 'users.read', module: 'users', action: 'read', description: 'Xem tài khoản' },
          {
            code: 'proposals.approve',
            module: 'proposals',
            action: 'approve',
            description: 'Phê duyệt đề xuất',
          },
        ],
        [
          { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho', permissionCodes: [] },
          {
            code: 'WAREHOUSE_MANAGER',
            name: 'Quản lý kho',
            permissionCodes: ['proposals.approve'],
          },
          { code: 'ADMIN', name: 'Quản trị viên', permissionCodes: ['users.read'] },
        ],
      );

      expect(result.roles.map((r) => r.code)).toEqual([
        'ADMIN',
        'WAREHOUSE_MANAGER',
        'WAREHOUSE_STAFF',
      ]);
      expect(result.permissions).toHaveLength(2);
      expect(result.roles[1].permissionCodes).toEqual(['proposals.approve']);
    });
  });
});
