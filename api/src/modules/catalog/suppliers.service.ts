import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCodeImmutable } from './domain/catalog-policy';
import { ListCatalogQueryDto } from './dto/catalog-common.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

export interface SupplierResponse {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
}

const SUPPLIER_SELECT = {
  id: true,
  code: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  status: true,
} satisfies Prisma.SupplierSelect;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ListCatalogQueryDto): Promise<SupplierResponse[]> {
    const where: Prisma.SupplierWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      const search = query.search.trim();
      if (search.length > 0) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    return this.prisma.supplier.findMany({
      where,
      select: SUPPLIER_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string): Promise<SupplierResponse> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      select: SUPPLIER_SELECT,
    });
    if (!supplier) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto, actorUserId: string): Promise<SupplierResponse> {
    const duplicate = await this.prisma.supplier.findFirst({
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
      const created = await tx.supplier.create({
        data: {
          code: dto.code,
          name: dto.name,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          status: 'active',
        },
        select: SUPPLIER_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'SUPPLIER_CREATED',
        entityType: 'supplier',
        entityId: created.id,
        newData: {
          code: created.code,
          name: created.name,
          phone: created.phone,
          email: created.email,
          address: created.address,
          status: created.status,
        },
      });

      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    actorUserId: string,
  ): Promise<SupplierResponse> {
    const existing = await this.prisma.supplier.findUnique({
      where: { id },
      select: SUPPLIER_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }

    assertCodeImmutable(existing.code, dto.code);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
        },
        select: SUPPLIER_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'SUPPLIER_UPDATED',
        entityType: 'supplier',
        entityId: id,
        oldData: {
          name: existing.name,
          phone: existing.phone,
          email: existing.email,
          address: existing.address,
        },
        newData: {
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          address: updated.address,
        },
      });

      return updated;
    });
  }

  async updateStatus(
    id: string,
    status: 'active' | 'inactive',
    actorUserId: string,
  ): Promise<SupplierResponse> {
    const existing = await this.prisma.supplier.findUnique({
      where: { id },
      select: SUPPLIER_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({
        where: { id },
        data: { status },
        select: SUPPLIER_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'SUPPLIER_STATUS_CHANGED',
        entityType: 'supplier',
        entityId: id,
        oldData: { status: existing.status },
        newData: { status: updated.status },
      });

      return updated;
    });
  }
}
