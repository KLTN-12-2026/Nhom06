import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatPermissionMatrix,
  PermissionMatrixResult,
  sortRolesForDisplay,
} from './domain/user-policy';

export interface RoleWithPermissionsResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  permissionCodes: string[];
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllRoles(): Promise<RoleWithPermissionsResponse[]> {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
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
    });

    return sortRolesForDisplay(
      roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        status: role.status,
        permissionCodes: role.rolePermissions.map((rp) => rp.permission.code).sort(),
      })),
    );
  }

  async getPermissionMatrix(): Promise<PermissionMatrixResult> {
    const [permissions, roles] = await Promise.all([
      this.prisma.permission.findMany({
        select: {
          code: true,
          module: true,
          action: true,
          description: true,
        },
        orderBy: [{ createdAt: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.role.findMany({
        where: { status: 'active' },
        select: {
          code: true,
          name: true,
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
      }),
    ]);

    return formatPermissionMatrix(
      permissions,
      roles.map((role) => ({
        code: role.code,
        name: role.name,
        permissionCodes: role.rolePermissions.map((rp) => rp.permission.code).sort(),
      })),
    );
  }
}
