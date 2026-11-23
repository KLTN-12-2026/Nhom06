import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let txMock: {
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    userRole: { create: jest.Mock; deleteMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let prismaMock: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    txMock = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      userRole: { create: jest.fn(), deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    prismaMock = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
    };

    service = new UsersService(prismaMock as unknown as PrismaService);
  });

  it('tạo tài khoản mới băm mật khẩu bcrypt, gán 1 vai trò và ghi audit_logs không chứa mật khẩu', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.role.findUnique.mockResolvedValue({
      id: 'role-staff',
      code: 'WAREHOUSE_STAFF',
      name: 'Nhân viên kho',
      status: 'active',
    });
    txMock.user.create.mockResolvedValue({
      id: 'u-new',
      username: 'nv_moi',
      email: 'nv_moi@kho-ai.local',
      fullName: 'Nhân Viên Mới',
      phone: '0901234567',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-11-23T00:00:00Z'),
    });
    txMock.userRole.create.mockResolvedValue({});
    txMock.auditLog.create.mockResolvedValue({});

    const created = await service.create(
      {
        username: 'nv_moi',
        email: 'nv_moi@kho-ai.local',
        fullName: 'Nhân Viên Mới',
        phone: '0901234567',
        password: 'secret123',
        roleCode: 'WAREHOUSE_STAFF',
      },
      'admin-id',
    );

    const createCallArg = txMock.user.create.mock.calls[0][0];
    expect(createCallArg.data.passwordHash).toMatch(/^\$2[ab]\$10\$/);
    expect(txMock.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'u-new', roleId: 'role-staff', assignedBy: 'admin-id' },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'admin-id',
        eventType: 'USER_CREATED',
        entityType: 'user',
        entityId: 'u-new',
      }),
    });
    const auditSerialized = JSON.stringify(txMock.auditLog.create.mock.calls[0][0]);
    expect(auditSerialized).not.toContain('secret123');
    expect(auditSerialized).not.toContain('passwordHash');
    expect(created).not.toHaveProperty('passwordHash');
    expect(created.role).toEqual({ code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' });
  });

  it('ném 409 khi tạo tài khoản trùng username hoặc email', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'existing',
      username: 'admin',
      email: 'admin@kho-ai.local',
    });

    await expect(
      service.create(
        {
          username: 'admin',
          email: 'other@kho-ai.local',
          fullName: 'Trùng Tên',
          password: 'password123',
          roleCode: 'WAREHOUSE_STAFF',
        },
        'admin-id',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('chặn tự khóa chính mình (403) và tăng token_version + ghi audit khi khóa người khác', async () => {
    await expect(service.updateStatus('admin-id', 'locked', 'admin-id')).rejects.toThrow(
      ForbiddenException,
    );

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'staff-id',
      username: 'nhanvien',
      email: 'nhanvien@kho-ai.local',
      fullName: 'Trương Thành Lê',
      phone: null,
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
      userRoles: [{ role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' } }],
    });
    txMock.user.update.mockResolvedValue({
      id: 'staff-id',
      username: 'nhanvien',
      email: 'nhanvien@kho-ai.local',
      fullName: 'Trương Thành Lê',
      phone: null,
      status: 'locked',
      lastLoginAt: null,
      createdAt: new Date(),
      userRoles: [{ role: { code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' } }],
    });
    txMock.auditLog.create.mockResolvedValue({});

    const updated = await service.updateStatus('staff-id', 'locked', 'admin-id');

    expect(updated.status).toBe('locked');
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'staff-id' },
        data: { status: 'locked', tokenVersion: { increment: 1 } },
      }),
    );
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'admin-id',
        eventType: 'USER_LOCKED',
        entityId: 'staff-id',
      }),
    });
  });

  it('chặn tự đổi vai trò chính mình (403) và thay thế vai trò trong một transaction kèm audit', async () => {
    await expect(
      service.updateRole('admin-id', 'WAREHOUSE_MANAGER', 'admin-id'),
    ).rejects.toThrow(ForbiddenException);

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'staff-id',
      username: 'nhanvien',
      email: 'nhanvien@kho-ai.local',
      fullName: 'Trương Thành Lê',
      phone: null,
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
      userRoles: [{ role: { id: 'r-staff', code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' } }],
    });
    prismaMock.role.findUnique.mockResolvedValue({
      id: 'r-mgr',
      code: 'WAREHOUSE_MANAGER',
      name: 'Quản lý kho',
      status: 'active',
    });
    txMock.userRole.deleteMany.mockResolvedValue({ count: 1 });
    txMock.userRole.create.mockResolvedValue({});
    txMock.auditLog.create.mockResolvedValue({});

    const updated = await service.updateRole('staff-id', 'WAREHOUSE_MANAGER', 'admin-id');

    expect(txMock.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'staff-id' } });
    expect(txMock.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'staff-id', roleId: 'r-mgr', assignedBy: 'admin-id' },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'admin-id',
        eventType: 'USER_ROLE_CHANGED',
        entityId: 'staff-id',
        oldData: { roleCode: 'WAREHOUSE_STAFF', roleName: 'Nhân viên kho' },
        newData: { roleCode: 'WAREHOUSE_MANAGER', roleName: 'Quản lý kho' },
      }),
    });
    expect(updated.role).toEqual({ code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' });
  });

  describe('resetPassword', () => {
    it('chặn admin đặt lại mật khẩu cho chính mình (403)', async () => {
      await expect(
        service.resetPassword(
          'admin-id',
          { newPassword: 'ResetPassword2026', confirmPassword: 'ResetPassword2026' },
          'admin-id',
        ),
      ).rejects.toThrow(new ForbiddenException('Hãy dùng chức năng Đổi mật khẩu'));
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('ném 400 nếu confirmPassword không khớp', async () => {
      await expect(
        service.resetPassword(
          'manager-id',
          { newPassword: 'ResetPassword2026', confirmPassword: 'OtherPassword2026' },
          'admin-id',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('ném 404 khi tài khoản đích không tồn tại', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword(
          'missing-id',
          { newPassword: 'ResetPassword2026', confirmPassword: 'ResetPassword2026' },
          'admin-id',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('đặt lại mật khẩu thành công: băm bcrypt cost 10, tăng token_version, giữ nguyên status và ghi audit USER_PASSWORD_RESET không lộ mật khẩu', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'manager-id',
        username: 'quanly',
        status: 'locked',
      });
      txMock.user.update.mockResolvedValue({});
      txMock.auditLog.create.mockResolvedValue({});

      await service.resetPassword(
        'manager-id',
        { newPassword: 'ResetPassword2026', confirmPassword: 'ResetPassword2026' },
        'admin-id',
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      const updateArg = txMock.user.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'manager-id' });
      expect(updateArg.data.tokenVersion).toEqual({ increment: 1 });
      expect(updateArg.data).not.toHaveProperty('status');
      expect(updateArg.data.passwordHash).toMatch(/^\$2[ab]\$10\$/);
      await expect(bcrypt.compare('ResetPassword2026', updateArg.data.passwordHash)).resolves.toBe(
        true,
      );

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'admin-id',
          eventType: 'USER_PASSWORD_RESET',
          entityType: 'user',
          entityId: 'manager-id',
        }),
      });
      const auditSerialized = JSON.stringify(txMock.auditLog.create.mock.calls[0][0]);
      expect(auditSerialized).not.toContain('ResetPassword2026');
      expect(auditSerialized).not.toContain('$2');
    });
  });
});
