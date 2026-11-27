import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let txMock: {
    user: { update: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let prismaMock: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtServiceMock: { signAsync: jest.Mock };

  beforeEach(() => {
    txMock = {
      user: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
    };
    jwtServiceMock = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt-token'),
    };
    service = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtServiceMock as unknown as JwtService,
    );
  });

  it('đăng nhập thành công với thông tin hợp lệ, cập nhật last_login_at và không trả passwordHash', async () => {
    const passwordHash = await bcrypt.hash('123456', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      username: 'quanly',
      email: 'quanly@kho-ai.local',
      fullName: 'Nguyễn Văn Dương',
      passwordHash,
      status: 'active',
      tokenVersion: 2,
      userRoles: [
        {
          role: {
            code: 'WAREHOUSE_MANAGER',
            name: 'Quản lý kho',
            status: 'active',
            rolePermissions: [
              { permission: { code: 'proposals.approve' } },
              { permission: { code: 'reports.read' } },
            ],
          },
        },
      ],
    });
    txMock.user.update.mockResolvedValue({});
    txMock.auditLog.create.mockResolvedValue({});

    const result = await service.login({ username: ' quanly ', password: '123456' });

    expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
      sub: 'u-1',
      username: 'quanly',
      tv: 2,
    });
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { lastLoginAt: expect.any(Date) },
      }),
    );
    // Cập nhật last_login_at và ghi nhật ký đăng nhập trong cùng transaction
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'u-1',
        eventType: 'AUTH_LOGIN_SUCCESS',
        entityType: 'user',
        entityId: 'u-1',
      }),
    });
    expect(JSON.stringify(txMock.auditLog.create.mock.calls[0][0])).not.toContain('123456');
    expect(result).toEqual({
      accessToken: 'signed-jwt-token',
      user: {
        id: 'u-1',
        username: 'quanly',
        fullName: 'Nguyễn Văn Dương',
        role: { code: 'WAREHOUSE_MANAGER', name: 'Quản lý kho' },
        permissions: ['proposals.approve', 'reports.read'],
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('từ chối 401 chung khi tài khoản không tồn tại hoặc mật khẩu sai, ghi nhật ký AUTH_LOGIN_FAILED không lộ mật khẩu', async () => {
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ username: 'unknown', password: '123456' })).rejects.toThrow(
      new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng'),
    );
    expect(prismaMock.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        actorUserId: null,
        eventType: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: null,
        newData: { username: 'unknown', reason: 'unknown_username' },
      }),
    });

    const passwordHash = await bcrypt.hash('123456', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      username: 'quanly',
      passwordHash,
      status: 'active',
      tokenVersion: 0,
      userRoles: [],
    });

    await expect(service.login({ username: 'quanly', password: 'sai-mk-9x' })).rejects.toThrow(
      new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng'),
    );
    expect(prismaMock.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        actorUserId: 'u-1',
        eventType: 'AUTH_LOGIN_FAILED',
        entityId: 'u-1',
        newData: { username: 'quanly', reason: 'wrong_password' },
      }),
    });

    const auditPayload = JSON.stringify(prismaMock.auditLog.create.mock.calls);
    expect(auditPayload).not.toContain('sai-mk-9x');
    expect(auditPayload).not.toContain('123456');
    expect(auditPayload).not.toContain(passwordHash);
    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it('đăng nhập chỉ trả quyền của vai trò đang hoạt động, giống khi kiểm token', async () => {
    const passwordHash = await bcrypt.hash('123456', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-2',
      username: 'nhanvien',
      fullName: 'Nhân viên',
      passwordHash,
      status: 'active',
      tokenVersion: 0,
      userRoles: [
        {
          role: {
            code: 'OLD_ROLE',
            name: 'Vai trò cũ',
            status: 'inactive',
            rolePermissions: [{ permission: { code: 'reports.read' } }],
          },
        },
        {
          role: {
            code: 'WAREHOUSE_STAFF',
            name: 'Nhân viên kho',
            status: 'active',
            rolePermissions: [{ permission: { code: 'inventory.read' } }],
          },
        },
      ],
    });

    const result = await service.login({ username: 'nhanvien', password: '123456' });

    expect(result.user.role).toEqual({ code: 'WAREHOUSE_STAFF', name: 'Nhân viên kho' });
    expect(result.user.permissions).toEqual(['inventory.read']);
  });

  it('từ chối 403 và ghi audit_logs (không lộ mật khẩu) khi tài khoản bị khóa đăng nhập đúng mật khẩu', async () => {
    const passwordHash = await bcrypt.hash('123456', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-staff',
      username: 'nhanvien',
      passwordHash,
      status: 'locked',
      tokenVersion: 1,
      userRoles: [],
    });
    prismaMock.auditLog.create.mockResolvedValue({});

    await expect(service.login({ username: 'nhanvien', password: '123456' })).rejects.toThrow(
      new ForbiddenException('Tài khoản đã bị khóa'),
    );

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'u-staff',
        eventType: 'AUTH_LOGIN_LOCKED',
        entityType: 'user',
        entityId: 'u-staff',
      }),
    });
    const auditPayload = JSON.stringify(prismaMock.auditLog.create.mock.calls[0][0]);
    expect(auditPayload).not.toContain('123456');
    expect(auditPayload).not.toContain(passwordHash);
  });

  it('logout tăng token_version của người dùng để vô hiệu token cũ', async () => {
    prismaMock.user.update.mockResolvedValue({});

    await service.logout('u-1');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { tokenVersion: { increment: 1 } },
    });
  });

  describe('changePassword', () => {
    it('đổi mật khẩu hợp lệ: băm bcrypt cost 10, tăng token_version và ghi audit USER_PASSWORD_CHANGED trong cùng transaction (không lộ mật khẩu)', async () => {
      const oldHash = await bcrypt.hash('123456', 4);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-staff',
        username: 'nhanvien',
        passwordHash: oldHash,
        status: 'active',
      });
      txMock.user.update.mockResolvedValue({});
      txMock.auditLog.create.mockResolvedValue({});

      await service.changePassword('u-staff', {
        currentPassword: '123456',
        newPassword: 'NewPassword2026',
        confirmPassword: 'NewPassword2026',
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      const updateArg = txMock.user.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'u-staff' });
      expect(updateArg.data.tokenVersion).toEqual({ increment: 1 });
      expect(updateArg.data.passwordHash).toMatch(/^\$2[ab]\$10\$/);
      await expect(bcrypt.compare('NewPassword2026', updateArg.data.passwordHash)).resolves.toBe(
        true,
      );

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: 'u-staff',
          eventType: 'USER_PASSWORD_CHANGED',
          entityType: 'user',
          entityId: 'u-staff',
        }),
      });
      const auditSerialized = JSON.stringify(txMock.auditLog.create.mock.calls[0][0]);
      expect(auditSerialized).not.toContain('123456');
      expect(auditSerialized).not.toContain('NewPassword2026');
      expect(auditSerialized).not.toContain('$2');
    });

    it('sai mật khẩu hiện tại trả 400 (không 401), không đổi mật khẩu và không tăng token_version', async () => {
      const oldHash = await bcrypt.hash('123456', 4);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-staff',
        username: 'nhanvien',
        passwordHash: oldHash,
        status: 'active',
      });

      await expect(
        service.changePassword('u-staff', {
          currentPassword: 'wrong-password',
          newPassword: 'NewPassword2026',
          confirmPassword: 'NewPassword2026',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.user.update).not.toHaveBeenCalled();
    });

    it('mật khẩu mới trùng mật khẩu hiện tại trả 400 có errors[field=newPassword]', async () => {
      const oldHash = await bcrypt.hash('SamePass2026', 4);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-staff',
        username: 'nhanvien',
        passwordHash: oldHash,
        status: 'active',
      });

      try {
        await service.changePassword('u-staff', {
          currentPassword: 'SamePass2026',
          newPassword: 'SamePass2026',
          confirmPassword: 'SamePass2026',
        });
        fail('Phải ném BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
          errors: Array<{ field: string; message: string }>;
        };
        expect(body.errors[0].field).toBe('newPassword');
      }
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('confirmPassword không khớp trả 400 có errors[field=confirmPassword]', async () => {
      try {
        await service.changePassword('u-staff', {
          currentPassword: '123456',
          newPassword: 'NewPassword2026',
          confirmPassword: 'DifferentPassword2026',
        });
        fail('Phải ném BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
          errors: Array<{ field: string; message: string }>;
        };
        expect(body.errors[0].field).toBe('confirmPassword');
      }
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
