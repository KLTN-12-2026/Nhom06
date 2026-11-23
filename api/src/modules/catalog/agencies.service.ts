import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCodeImmutable } from './domain/catalog-policy';
import { ListCatalogQueryDto } from './dto/catalog-common.dto';
import { CreateAgencyDto, UpdateAgencyDto } from './dto/agency.dto';

export interface AgencyResponse {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
}

const AGENCY_SELECT = {
  id: true,
  code: true,
  name: true,
  contactName: true,
  phone: true,
  email: true,
  address: true,
  status: true,
} satisfies Prisma.AgencySelect;

@Injectable()
export class AgenciesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ListCatalogQueryDto): Promise<AgencyResponse[]> {
    const where: Prisma.AgencyWhereInput = {};
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

    return this.prisma.agency.findMany({
      where,
      select: AGENCY_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string): Promise<AgencyResponse> {
    const agency = await this.prisma.agency.findUnique({
      where: { id },
      select: AGENCY_SELECT,
    });
    if (!agency) {
      throw new NotFoundException('Không tìm thấy đại lý');
    }
    return agency;
  }

  async create(dto: CreateAgencyDto, actorUserId: string): Promise<AgencyResponse> {
    const duplicate = await this.prisma.agency.findFirst({
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
      const created = await tx.agency.create({
        data: {
          code: dto.code,
          name: dto.name,
          contactName: dto.contactName ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          status: 'active',
        },
        select: AGENCY_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'AGENCY_CREATED',
        entityType: 'agency',
        entityId: created.id,
        newData: {
          code: created.code,
          name: created.name,
          contactName: created.contactName,
          phone: created.phone,
          email: created.email,
          address: created.address,
          status: created.status,
        },
      });

      return created;
    });
  }

  async update(id: string, dto: UpdateAgencyDto, actorUserId: string): Promise<AgencyResponse> {
    const existing = await this.prisma.agency.findUnique({
      where: { id },
      select: AGENCY_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy đại lý');
    }

    assertCodeImmutable(existing.code, dto.code);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.agency.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
        },
        select: AGENCY_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'AGENCY_UPDATED',
        entityType: 'agency',
        entityId: id,
        oldData: {
          name: existing.name,
          contactName: existing.contactName,
          phone: existing.phone,
          email: existing.email,
          address: existing.address,
        },
        newData: {
          name: updated.name,
          contactName: updated.contactName,
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
  ): Promise<AgencyResponse> {
    const existing = await this.prisma.agency.findUnique({
      where: { id },
      select: AGENCY_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy đại lý');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.agency.update({
        where: { id },
        data: { status },
        select: AGENCY_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'AGENCY_STATUS_CHANGED',
        entityType: 'agency',
        entityId: id,
        oldData: { status: existing.status },
        newData: { status: updated.status },
      });

      return updated;
    });
  }
}
