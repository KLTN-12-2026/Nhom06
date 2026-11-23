import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthenticatedRole, AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
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
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const primaryRole = user.userRoles[0]?.role ?? null;
    const permissionSet = new Set<string>();
    for (const ur of user.userRoles) {
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
