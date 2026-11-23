import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  username: string;
  tv: number;
}

const INVALID_SESSION_MESSAGE = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || typeof payload.tv !== 'number') {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        status: true,
        tokenVersion: true,
        userRoles: {
          include: {
            role: {
              select: {
                code: true,
                name: true,
                status: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'active' || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const activeUserRole = user.userRoles.find((ur) => ur.role.status === 'active');
    const role = activeUserRole
      ? { code: activeUserRole.role.code, name: activeUserRole.role.name }
      : null;

    const permissionSet = new Set<string>();
    for (const ur of user.userRoles) {
      if (ur.role.status !== 'active') {
        continue;
      }
      for (const rp of ur.role.rolePermissions) {
        permissionSet.add(rp.permission.code);
      }
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role,
      permissions: Array.from(permissionSet),
      tokenVersion: user.tokenVersion,
    };
  }
}
