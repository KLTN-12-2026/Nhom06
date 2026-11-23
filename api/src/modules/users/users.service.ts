import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertPasswordConfirmationMatch,
  BCRYPT_COST,
} from '../auth/domain/password-policy';
import {
  assertNotSelfLock,
  assertNotSelfPasswordReset,
  assertNotSelfRoleChange,
} from './domain/user-policy';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: { code: string; name: string } | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: {
    select: {
      role: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type UserRecordWithRole = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

function toUserResponse(record: UserRecordWithRole): UserResponse {
  const role = record.userRoles[0]?.role ?? null;
  return {
    id: record.id,
    username: record.username,
    email: record.email,
    fullName: record.fullName,
    phone: record.phone,
    role: role ? { code: role.code, name: role.name } : null,
    status: record.status,
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListUsersQueryDto): Promise<UserResponse[]> {
    const where: Prisma.UserWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return users.map(toUserResponse);
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    return toUserResponse(user);
  }

  async create(dto: CreateUserDto, actorUserId: string): Promise<UserResponse> {
    const duplicate = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: dto.username, mode: 'insensitive' } },
          { email: { equals: dto.email, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, email: true },
    });

    if (duplicate) {
      if (duplicate.username.toLowerCase() === dto.username.toLowerCase()) {
        throw new ConflictException('Tên đăng nhập đã tồn tại trong hệ thống');
      }
      throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: dto.roleCode },
      select: { id: true, code: true, name: true, status: true },
    });

    if (!role || role.status !== 'active') {
      throw new BadRequestException('Vai trò được chọn không tồn tại hoặc đã ngừng hoạt động');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          passwordHash,
          status: 'active',
        },
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          assignedBy: actorUserId,
        },
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'USER_CREATED',
        entityType: 'user',
        entityId: user.id,
        newData: {
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          status: user.status,
          roleCode: role.code,
          roleName: role.name,
        },
      });

      return {
        ...user,
        role: { code: role.code, name: role.name },
      };
    });

    return created;
  }

  async updateProfile(id: string, dto: UpdateUserDto, actorUserId: string): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email.toLowerCase()) {
      const emailTaken = await this.prisma.user.findFirst({
        where: {
          email: { equals: dto.email, mode: 'insensitive' },
          id: { not: id },
        },
        select: { id: true },
      });

      if (emailTaken) {
        throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
        select: USER_PUBLIC_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'USER_UPDATED',
        entityType: 'user',
        entityId: id,
        oldData: {
          email: existing.email,
          fullName: existing.fullName,
          phone: existing.phone,
        },
        newData: {
          email: nextUser.email,
          fullName: nextUser.fullName,
          phone: nextUser.phone,
        },
      });

      return nextUser;
    });

    return toUserResponse(updated);
  }

  async updateStatus(
    id: string,
    status: 'active' | 'locked',
    actorUserId: string,
  ): Promise<UserResponse> {
    assertNotSelfLock(actorUserId, id, status);

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id },
        data: {
          status,
          ...(status === 'locked' ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: USER_PUBLIC_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: status === 'locked' ? 'USER_LOCKED' : 'USER_UNLOCKED',
        entityType: 'user',
        entityId: id,
        oldData: { status: existing.status },
        newData: { status: nextUser.status },
      });

      return nextUser;
    });

    return toUserResponse(updated);
  }

  async updateRole(id: string, roleCode: string, actorUserId: string): Promise<UserResponse> {
    assertNotSelfRoleChange(actorUserId, id);

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    const newRole = await this.prisma.role.findUnique({
      where: { code: roleCode },
      select: { id: true, code: true, name: true, status: true },
    });

    if (!newRole || newRole.status !== 'active') {
      throw new BadRequestException('Vai trò được chọn không tồn tại hoặc đã ngừng hoạt động');
    }

    const oldRole = existing.userRoles[0]?.role ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      await tx.userRole.create({
        data: {
          userId: id,
          roleId: newRole.id,
          assignedBy: actorUserId,
        },
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'USER_ROLE_CHANGED',
        entityType: 'user',
        entityId: id,
        oldData: {
          roleCode: oldRole?.code ?? null,
          roleName: oldRole?.name ?? null,
        },
        newData: {
          roleCode: newRole.code,
          roleName: newRole.name,
        },
      });
    });

    return {
      ...toUserResponse(existing),
      role: { code: newRole.code, name: newRole.name },
    };
  }

  async resetPassword(
    targetUserId: string,
    dto: ResetPasswordDto,
    actorUserId: string,
  ): Promise<void> {
    assertNotSelfPasswordReset(actorUserId, targetUserId);
    assertPasswordConfirmationMatch(dto.newPassword, dto.confirmPassword);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        username: true,
        status: true,
      },
    });

    if (!target) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }

    // Băm ngoài transaction; không so mật khẩu cũ của user đích (tránh oracle lộ thông tin) và không đổi status
    const nextPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: {
          passwordHash: nextPasswordHash,
          tokenVersion: { increment: 1 },
        },
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'USER_PASSWORD_RESET',
        entityType: 'user',
        entityId: target.id,
        newData: {
          username: target.username,
          sessionsInvalidated: true,
        },
      });
    });
  }
}
