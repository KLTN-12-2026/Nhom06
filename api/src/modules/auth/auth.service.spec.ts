import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let jwtServiceMock: { signAsync: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
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
            rolePermissions: [
              { permission: { code: 'proposals.approve' } },
              { permission: { code: 'reports.read' } },
            ],
          },
        },
      ],
    });
    prismaMock.user.update.mockResolvedValue({});

    const result = await service.login({ username: ' quanly ', password: '123456' });

    expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
      sub: 'u-1',
      username: 'quanly',
      tv: 2,
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { lastLoginAt: expect.any(Date) },
      }),
    );
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

  it('từ chối 401 chung khi tài khoản không tồn tại hoặc mật khẩu sai', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.login({ username: 'unknown', password: '123456' })).rejects.toThrow(
      new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng'),
    );

    const passwordHash = await bcrypt.hash('123456', 4);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1',
      username: 'quanly',
      passwordHash,
      status: 'active',
      tokenVersion: 0,
      userRoles: [],
    });

    await expect(service.login({ username: 'quanly', password: 'wrong' })).rejects.toThrow(
      new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng'),
    );
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
});
