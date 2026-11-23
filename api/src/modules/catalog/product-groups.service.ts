import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCodeImmutable } from './domain/catalog-policy';
import { ListProductGroupsQueryDto } from './dto/catalog-common.dto';
import { CreateProductGroupDto, UpdateProductGroupDto } from './dto/product-group.dto';

export interface ProductGroupResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
}

const GROUP_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
} satisfies Prisma.ProductGroupSelect;

@Injectable()
export class ProductGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ListProductGroupsQueryDto): Promise<ProductGroupResponse[]> {
    const where: Prisma.ProductGroupWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.productGroup.findMany({
      where,
      select: GROUP_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  async create(dto: CreateProductGroupDto, actorUserId: string): Promise<ProductGroupResponse> {
    const duplicate = await this.prisma.productGroup.findFirst({
      where: { code: { equals: dto.code, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message: 'Mã đã tồn tại',
        errors: [{ field: 'code', message: 'Mã đã tồn tại' }],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.productGroup.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          status: 'active',
        },
        select: GROUP_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'PRODUCT_GROUP_CREATED',
        entityType: 'product_group',
        entityId: created.id,
        newData: {
          code: created.code,
          name: created.name,
          description: created.description,
          status: created.status,
        },
      });

      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateProductGroupDto,
    actorUserId: string,
  ): Promise<ProductGroupResponse> {
    const existing = await this.prisma.productGroup.findUnique({
      where: { id },
      select: GROUP_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhóm hàng');
    }

    assertCodeImmutable(existing.code, dto.code);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productGroup.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        select: GROUP_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'PRODUCT_GROUP_UPDATED',
        entityType: 'product_group',
        entityId: id,
        oldData: {
          name: existing.name,
          description: existing.description,
          status: existing.status,
        },
        newData: {
          name: updated.name,
          description: updated.description,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async updateStatus(
    id: string,
    status: 'active' | 'inactive',
    actorUserId: string,
  ): Promise<ProductGroupResponse> {
    const existing = await this.prisma.productGroup.findUnique({
      where: { id },
      select: GROUP_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhóm hàng');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productGroup.update({
        where: { id },
        data: { status },
        select: GROUP_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'PRODUCT_GROUP_STATUS_CHANGED',
        entityType: 'product_group',
        entityId: id,
        oldData: { status: existing.status },
        newData: { status: updated.status },
      });

      return updated;
    });
  }
}
