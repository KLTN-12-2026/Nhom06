import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthenticatedRole, AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertNewPasswordDifferent,
  assertPasswordConfirmationMatch,
  BCRYPT_COST,
} from './domain/password-policy';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthUserResponse {
  id: string;
  username: string;
  fullName: string;
  role: AuthenticatedRole | null;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUserResponse;
}

const INVALID_CREDENTIALS_MESSAGE = 'Tên đăng nhập hoặc mật khẩu không đúng';
const LOCKED_ACCOUNT_MESSAGE = 'Tài khoản đã bị khóa';
const MAX_LOGGED_USERNAME_LENGTH = 50;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const username = dto.username.trim();
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      // Tên đăng nhập không tồn tại: ghi nhật ký không gắn người thực hiện, vẫn trả lỗi chung
      await writeAuditLog(this.prisma, {
        eventType: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        newData: {
          username: username.slice(0, MAX_LOGGED_USERNAME_LENGTH),
          reason: 'unknown_username',
        },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await writeAuditLog(this.prisma, {
        actorUserId: user.id,
        eventType: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        newData: {
          username: user.username,
          reason: 'wrong_password',
        },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== 'active') {
      await writeAuditLog(this.prisma, {
        actorUserId: user.id,
        eventType: 'AUTH_LOGIN_LOCKED',
        entityType: 'user',
        entityId: user.id,
        newData: {
          username: user.username,
          status: user.status,
        },
      });
      throw new ForbiddenException(LOCKED_ACCOUNT_MESSAGE);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      await writeAuditLog(tx, {
        actorUserId: user.id,
        eventType: 'AUTH_LOGIN_SUCCESS',
        entityType: 'user',
        entityId: user.id,
        newData: { username: user.username },
      });
    });

    // Chỉ tính vai trò đang hoạt động, giống JwtStrategy.validate, để quyền trả về khớp quyền thực tế
    const activeUserRoles = user.userRoles.filter((ur) => ur.role.status === 'active');
    const primaryRole = activeUserRoles[0]?.role ?? null;
    const permissionSet = new Set<string>();
    for (const ur of activeUserRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissionSet.add(rp.permission.code);
      }
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      tv: user.tokenVersion,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: primaryRole ? { code: primaryRole.code, name: primaryRole.name } : null,
        permissions: Array.from(permissionSet),
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    assertPasswordConfirmationMatch(dto.newPassword, dto.confirmPassword);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    // Kiểm tra mật khẩu hiện tại trước để tránh lộ thông tin hash khi kẻ tấn công dò mật khẩu mới
    const currentMatches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentMatches) {
      throw new BadRequestException({
        message: 'Mật khẩu hiện tại không đúng',
        errors: [
          {
            field: 'currentPassword',
            message: 'Mật khẩu hiện tại không đúng',
          },
        ],
      });
    }

    assertNewPasswordDifferent(dto.currentPassword, dto.newPassword);
    const sameAsCurrentHash = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (sameAsCurrentHash) {
      throw new BadRequestException({
        message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
        errors: [
          {
            field: 'newPassword',
            message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
          },
        ],
      });
    }

    // Băm mật khẩu ngoài transaction để không giữ kết nối DB trong lúc CPU xử lý bcrypt
    const nextPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextPasswordHash,
          tokenVersion: { increment: 1 },
        },
      });

      await writeAuditLog(tx, {
        actorUserId: user.id,
        eventType: 'USER_PASSWORD_CHANGED',
        entityType: 'user',
        entityId: user.id,
        newData: {
          username: user.username,
          sessionsInvalidated: true,
        },
      });
    });
  }

  getProfile(user: AuthenticatedUser): AuthUserResponse {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      permissions: user.permissions,
    };
  }
}
