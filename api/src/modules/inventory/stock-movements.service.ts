import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseIsoDateStrict } from '../expiry/domain/vn-date';
import {
  buildMovementSourceUrl,
  buildVnDayRangeUtc,
  MovementSourceType,
  MovementType,
} from './domain/inventory-policy';
import { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto';

export interface StockMovementItemResponse {
  id: string;
  occurredAt: string;
  movementType: MovementType;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  lotId: string;
  lotCode: string;
  quantityDelta: string;
  balanceAfter: string;
  source: {
    type: MovementSourceType;
    id: string;
    documentNo: string | null;
    url: string;
  };
  actor: {
    id: string;
    fullName: string;
  };
}

export interface StockMovementsListResponse {
  items: StockMovementItemResponse[];
  total: number;
  page: number;
  pageSize: number;
}

const MOVEMENT_SELECT = {
  id: true,
  lotId: true,
  movementType: true,
  quantityDelta: true,
  balanceAfter: true,
  sourceType: true,
  sourceId: true,
  occurredAt: true,
  lot: {
    select: {
      lotCode: true,
      product: {
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
        },
      },
    },
  },
  actor: {
    select: {
      id: true,
      fullName: true,
    },
  },
} satisfies Prisma.StockMovementSelect;

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
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListStockMovementsQueryDto): Promise<StockMovementsListResponse> {
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

    const where: Prisma.StockMovementWhereInput = {};
    if (query.movementType) {
      where.movementType = query.movementType;
    }
    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }
    if (query.sourceId) {
      where.sourceId = query.sourceId;
    }
    if (query.lotId) {
      where.lotId = query.lotId;
    }
    if (query.productId) {
      where.lot = { productId: query.productId };
    }
    if (query.from || query.to) {
      where.occurredAt = buildVnDayRangeUtc(query.from, query.to);
    }

    if (query.search) {
      const searchText = query.search;
      const [matchedInbounds, matchedOutbounds, matchedCounts] = await Promise.all([
        this.prisma.inboundReceipt.findMany({
          where: { receiptNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
        this.prisma.outboundReceipt.findMany({
          where: { outboundNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
        this.prisma.stockCount.findMany({
          where: { countNo: { contains: searchText, mode: 'insensitive' } },
          select: { id: true },
        }),
      ]);

      const searchOr: Prisma.StockMovementWhereInput[] = [
        { lot: { lotCode: { contains: searchText, mode: 'insensitive' } } },
        { lot: { product: { code: { contains: searchText, mode: 'insensitive' } } } },
        { lot: { product: { name: { contains: searchText, mode: 'insensitive' } } } },
      ];

      if (matchedInbounds.length > 0) {
        searchOr.push({
          sourceType: 'INBOUND_RECEIPT',
          sourceId: { in: matchedInbounds.map((r) => r.id) },
        });
      }
      if (matchedOutbounds.length > 0) {
        searchOr.push({
          sourceType: 'OUTBOUND_RECEIPT',
          sourceId: { in: matchedOutbounds.map((r) => r.id) },
        });
      }
      if (matchedCounts.length > 0) {
        searchOr.push({
          sourceType: 'STOCK_COUNT',
          sourceId: { in: matchedCounts.map((r) => r.id) },
        });
      }

      where.OR = searchOr;
    }

    const [total, records] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        select: MOVEMENT_SELECT,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const inboundIds = new Set<string>();
    const outboundIds = new Set<string>();
    const stockCountIds = new Set<string>();

    for (const row of records) {
      if (row.sourceType === 'INBOUND_RECEIPT') {
        inboundIds.add(row.sourceId);
      } else if (row.sourceType === 'OUTBOUND_RECEIPT') {
        outboundIds.add(row.sourceId);
      } else if (row.sourceType === 'STOCK_COUNT') {
        stockCountIds.add(row.sourceId);
      }
    }

    const [inboundDocs, outboundDocs, stockCountDocs] = await Promise.all([
      inboundIds.size > 0
        ? this.prisma.inboundReceipt.findMany({
            where: { id: { in: Array.from(inboundIds) } },
            select: { id: true, receiptNo: true },
          })
        : Promise.resolve([]),
      outboundIds.size > 0
        ? this.prisma.outboundReceipt.findMany({
            where: { id: { in: Array.from(outboundIds) } },
            select: { id: true, outboundNo: true },
          })
        : Promise.resolve([]),
      stockCountIds.size > 0
        ? this.prisma.stockCount.findMany({
            where: { id: { in: Array.from(stockCountIds) } },
            select: { id: true, countNo: true },
          })
        : Promise.resolve([]),
    ]);

    const docNoMap = new Map<string, string>();
    for (const doc of inboundDocs) {
      docNoMap.set(`INBOUND_RECEIPT:${doc.id}`, doc.receiptNo);
    }
    for (const doc of outboundDocs) {
      docNoMap.set(`OUTBOUND_RECEIPT:${doc.id}`, doc.outboundNo);
    }
    for (const doc of stockCountDocs) {
      docNoMap.set(`STOCK_COUNT:${doc.id}`, doc.countNo);
    }

    const items: StockMovementItemResponse[] = records.map((row) => ({
      id: row.id.toString(),
      occurredAt: row.occurredAt.toISOString(),
      movementType: row.movementType as MovementType,
      product: row.lot.product,
      lotId: row.lotId,
      lotCode: row.lot.lotCode,
      quantityDelta: row.quantityDelta.toString(),
      balanceAfter: row.balanceAfter.toString(),
      source: {
        type: row.sourceType as MovementSourceType,
        id: row.sourceId,
        documentNo: docNoMap.get(`${row.sourceType}:${row.sourceId}`) ?? null,
        url: buildMovementSourceUrl(row.sourceType, row.sourceId),
      },
      actor: row.actor,
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }
}
