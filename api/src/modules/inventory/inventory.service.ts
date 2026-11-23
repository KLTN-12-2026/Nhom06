import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyExpirySeverity,
  ExpirySeverity,
  MissingGlobalThresholdError,
  selectApplicableThreshold,
  ThresholdRecord,
  ThresholdScope,
} from '../expiry/domain/expiry-policy';
import { diffCalendarDays, formatDateOnly, parseIsoDateStrict } from '../expiry/domain/vn-date';
import { ExpiryThresholdsService } from '../expiry/expiry-thresholds.service';
import {
  InventoryLotForSummary,
  LotStatus,
  matchesExpiryStatusFilter,
  ProductInventorySummaryItem,
  sortInventoryLots,
  summarizeInventoryLots,
} from './domain/inventory-policy';
import {
  InventorySummaryQueryDto,
  ListInventoryLotsQueryDto,
} from './dto/inventory-lots-query.dto';

export interface InventoryLotItemResponse {
  lotId: string;
  lotCode: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
    group: {
      id: string;
      code: string;
      name: string;
    };
  };
  expiryDate: string;
  receivedAt: string;
  daysRemaining: number;
  onHandQty: string;
  lotStatus: LotStatus;
  expiryStatus: ExpirySeverity;
  warningDays: number;
}

export interface InventoryLotsListResponse {
  evaluationDate: string;
  items: InventoryLotItemResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InventorySummaryResponse {
  evaluationDate: string;
  lotCount: number;
  totalQty: string;
  byProduct: ProductInventorySummaryItem[];
}

interface ComputedInventoryLot {
  item: InventoryLotItemResponse;
  summaryInput: InventoryLotForSummary;
}

const INVENTORY_LOT_SELECT = {
  id: true,
  lotCode: true,
  expiryDate: true,
  receivedAt: true,
  status: true,
  product: {
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      groupId: true,
      group: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  balance: {
    select: {
      onHandQty: true,
    },
  },
} satisfies Prisma.LotSelect;

function parseOptionalDateFilter(raw: string | undefined, field: string): Date | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return parseIsoDateStrict(raw);
  } catch {
    throw new BadRequestException({
      message: 'Ngày lọc hạn sử dụng không hợp lệ',
      errors: [{ field, message: 'Ngày lọc phải đúng định dạng YYYY-MM-DD' }],
    });
  }
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thresholdsService: ExpiryThresholdsService,
  ) {}

  private async queryFilteredLots(
    filter: InventorySummaryQueryDto,
  ): Promise<{ evaluationDate: string; rows: ComputedInventoryLot[] }> {
    const expiryFromDate = parseOptionalDateFilter(filter.expiryFrom, 'expiryFrom');
    const expiryToDate = parseOptionalDateFilter(filter.expiryTo, 'expiryTo');

    if (expiryFromDate && expiryToDate && expiryFromDate > expiryToDate) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu HSD phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [
          {
            field: 'expiryFrom',
            message: 'Ngày bắt đầu HSD phải nhỏ hơn hoặc bằng ngày kết thúc',
          },
        ],
      });
    }

    const { dateStr: evaluationDate, dateObj: evaluationDateObj } =
      this.thresholdsService.resolveEvaluationDate();

    const includeEmpty = filter.includeEmpty === true;
    const where: Prisma.LotWhereInput = {};

    if (filter.productId) {
      where.productId = filter.productId;
    }
    if (filter.groupId) {
      where.product = { groupId: filter.groupId };
    }
    if (filter.lotStatus) {
      where.status = filter.lotStatus;
    }
    if (expiryFromDate || expiryToDate) {
      where.expiryDate = {
        ...(expiryFromDate ? { gte: expiryFromDate } : {}),
        ...(expiryToDate ? { lte: expiryToDate } : {}),
      };
    }
    if (!includeEmpty) {
      where.balance = {
        is: {
          onHandQty: { gt: new Prisma.Decimal(0) },
        },
      };
    }
    if (filter.search) {
      where.OR = [
        { lotCode: { contains: filter.search, mode: 'insensitive' } },
        { product: { code: { contains: filter.search, mode: 'insensitive' } } },
        { product: { name: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }

    const [thresholdRows, lotRows] = await Promise.all([
      this.thresholdsService.loadEffectiveRowsAtDate(evaluationDateObj),
      this.prisma.lot.findMany({
        where,
        select: INVENTORY_LOT_SELECT,
      }),
    ]);

    const domainThresholds: ThresholdRecord[] = thresholdRows.map((row) => ({
      id: row.id,
      scope: row.scope as ThresholdScope,
      productGroupId: row.productGroupId,
      productId: row.productId,
      warningDays: row.warningDays,
      criticalDays: row.criticalDays,
      minDeliveryDays: row.minDeliveryDays,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
    }));

    const computed: ComputedInventoryLot[] = [];

    for (const lot of lotRows) {
      const expiryDateStr = formatDateOnly(lot.expiryDate);
      const receivedAtStr = formatDateOnly(lot.receivedAt);
      const daysRemaining = diffCalendarDays(expiryDateStr, evaluationDate);

      let resolved;
      try {
        resolved = selectApplicableThreshold(
          domainThresholds,
          lot.product.id,
          lot.product.groupId,
          evaluationDate,
        );
      } catch (error) {
        if (error instanceof MissingGlobalThresholdError) {
          throw new InternalServerErrorException(error.message);
        }
        throw error;
      }

      const expiryStatus = classifyExpirySeverity(
        daysRemaining,
        resolved.warningDays,
        resolved.criticalDays,
      );

      if (!matchesExpiryStatusFilter(expiryStatus, filter.expiryStatus)) {
        continue;
      }

      const onHandDecimal = lot.balance ? lot.balance.onHandQty : new Prisma.Decimal(0);
      const productDto = {
        id: lot.product.id,
        code: lot.product.code,
        name: lot.product.name,
        unit: lot.product.unit,
        group: lot.product.group,
      };

      computed.push({
        item: {
          lotId: lot.id,
          lotCode: lot.lotCode,
          product: productDto,
          expiryDate: expiryDateStr,
          receivedAt: receivedAtStr,
          daysRemaining,
          onHandQty: onHandDecimal.toString(),
          lotStatus: lot.status as LotStatus,
          expiryStatus,
          warningDays: resolved.warningDays,
        },
        summaryInput: {
          lotId: lot.id,
          lotCode: lot.lotCode,
          expiryDate: expiryDateStr,
          receivedAt: receivedAtStr,
          onHandQty: onHandDecimal,
          product: productDto,
        },
      });
    }

    const sorted = sortInventoryLots(
      computed.map((entry) => ({
        lotCode: entry.item.lotCode,
        expiryDate: entry.item.expiryDate,
        receivedAt: entry.item.receivedAt,
        product: entry.item.product,
        entry,
      })),
    ).map((wrapped) => wrapped.entry);

    return { evaluationDate, rows: sorted };
  }

  async listLots(query: ListInventoryLotsQueryDto): Promise<InventoryLotsListResponse> {
    const { evaluationDate, rows } = await this.queryFilteredLots(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const start = (page - 1) * pageSize;

    return {
      evaluationDate,
      items: rows.slice(start, start + pageSize).map((row) => row.item),
      total: rows.length,
      page,
      pageSize,
    };
  }

  async getSummary(query: InventorySummaryQueryDto): Promise<InventorySummaryResponse> {
    const { evaluationDate, rows } = await this.queryFilteredLots(query);
    const summary = summarizeInventoryLots(rows.map((row) => row.summaryInput));

    return {
      evaluationDate,
      ...summary,
    };
  }
}
