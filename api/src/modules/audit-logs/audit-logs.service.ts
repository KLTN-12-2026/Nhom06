import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseIsoDateStrict } from '../expiry/domain/vn-date';
import { buildVnDayRangeUtc } from '../inventory/domain/inventory-policy';
import { sanitizeAuditDataForRead } from './domain/sanitize-audit-data';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export interface AuditLogActorResponse {
  id: string;
  username: string;
  fullName: string;
}

export interface AuditLogItemResponse {
  id: string;
  createdAt: string;
  actor: AuditLogActorResponse | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
}

export interface AuditLogsListResponse {
  items: AuditLogItemResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogFacetsResponse {
  eventTypes: string[];
  entityTypes: string[];
  actors: AuditLogActorResponse[];
}

const AUDIT_LOG_SELECT = {
  id: true,
  createdAt: true,
  eventType: true,
  entityType: true,
  entityId: true,
  oldData: true,
  newData: true,
  actor: {
    select: {
      id: true,
      username: true,
      fullName: true,
    },
  },
} satisfies Prisma.AuditLogSelect;

function validateDateParam(raw: string | undefined, field: string): void {
  if (!raw) {
    return;
  }
  try {
    parseIsoDateStrict(raw);
  } catch {
    throw new BadRequestException({
      message: 'Ngày lọc không hợp lệ',
      errors: [{ field, message: 'Ngày lọc phải đúng định dạng YYYY-MM-DD' }],
    });
  }
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAuditLogsQueryDto): Promise<AuditLogsListResponse> {
    validateDateParam(query.from, 'from');
    validateDateParam(query.to, 'to');
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [
          {
            field: 'from',
            message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
          },
        ],
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.actorUserId) {
      where.actorUserId = query.actorUserId;
    }
    if (query.from || query.to) {
      where.createdAt = buildVnDayRangeUtc(query.from, query.to);
    }

    if (query.search) {
      const searchText = query.search;
      const [
        matchedUsers,
        matchedInbounds,
        matchedOutbounds,
        matchedOrders,
        matchedStockCounts,
        matchedProducts,
        matchedSuppliers,
        matchedAgencies,
        matchedLots,
      ] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            OR: [
              { username: { contains: searchText, mode: 'insensitive' } },
              { fullName: { contains: searchText, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        this.prisma.inboundReceipt.findMany({
          where: { receiptNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
        this.prisma.outboundReceipt.findMany({
          where: { outboundNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
        this.prisma.agencyOrder.findMany({
          where: { orderNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
        this.prisma.stockCount.findMany({
          where: { countNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
        this.prisma.product.findMany({
          where: {
            OR: [
              { code: { contains: searchText, mode: 'insensitive' } },
              { name: { contains: searchText, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        this.prisma.supplier.findMany({
          where: {
            OR: [
              { code: { contains: searchText, mode: 'insensitive' } },
              { name: { contains: searchText, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        this.prisma.agency.findMany({
          where: {
            OR: [
              { code: { contains: searchText, mode: 'insensitive' } },
              { name: { contains: searchText, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        this.prisma.lot.findMany({
          where: { lotCode: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
      ]);

      const searchOr: Prisma.AuditLogWhereInput[] = [
        { entityId: { contains: searchText, mode: 'insensitive' } },
        { eventType: { contains: searchText, mode: 'insensitive' } },
        { entityType: { contains: searchText, mode: 'insensitive' } },
        {
          actor: {
            OR: [
              { username: { contains: searchText, mode: 'insensitive' } },
              { fullName: { contains: searchText, mode: 'insensitive' } },
            ],
          },
        },
      ];

      const entityMatches: Array<{ entityType: string; ids: string[] }> = [
        { entityType: 'user', ids: matchedUsers.map((r) => r.id) },
        { entityType: 'inbound_receipt', ids: matchedInbounds.map((r) => r.id) },
        { entityType: 'outbound_receipt', ids: matchedOutbounds.map((r) => r.id) },
        { entityType: 'agency_order', ids: matchedOrders.map((r) => r.id) },
        { entityType: 'stock_count', ids: matchedStockCounts.map((r) => r.id) },
        { entityType: 'product', ids: matchedProducts.map((r) => r.id) },
        { entityType: 'supplier', ids: matchedSuppliers.map((r) => r.id) },
        { entityType: 'agency', ids: matchedAgencies.map((r) => r.id) },
        { entityType: 'lot', ids: matchedLots.map((r) => r.id) },
      ];

      for (const match of entityMatches) {
        if (match.ids.length > 0) {
          searchOr.push({
            entityType: match.entityType,
            entityId: { in: match.ids },
          });
        }
      }

      where.OR = searchOr;
    }

    const [total, records] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        select: AUDIT_LOG_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items: AuditLogItemResponse[] = records.map((row) => ({
      id: row.id.toString(),
      createdAt: row.createdAt.toISOString(),
      actor: row.actor,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      oldData: sanitizeAuditDataForRead(row.oldData),
      newData: sanitizeAuditDataForRead(row.newData),
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async getFacets(): Promise<AuditLogFacetsResponse> {
    const [eventRows, entityRows, actors] = await Promise.all([
      this.prisma.auditLog.findMany({
        distinct: ['eventType'],
        select: { eventType: true },
        orderBy: { eventType: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { auditLogs: { some: {} } },
        select: { id: true, username: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    return {
      eventTypes: eventRows.map((row) => row.eventType),
      entityTypes: entityRows.map((row) => row.entityType),
      actors,
    };
  }
}
