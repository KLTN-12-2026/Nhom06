import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatDateOnly,
  getVnTodayDateString,
  parseIsoDateStrict,
} from '../expiry/domain/vn-date';
import {
  buildVnDayRangeUtc,
  type MovementType,
} from '../inventory/domain/inventory-policy';
import {
  buildMonthKeys,
  computeMonthlyInOut,
  computeStockLedger,
  type MonthlyInOutPoint,
  type StockLedgerMovementInput,
  type StockLedgerResult,
} from './domain/stock-ledger.domain';
import { MonthlyInOutQueryDto } from './dto/monthly-in-out-query.dto';
import { StockLedgerQueryDto } from './dto/stock-ledger-query.dto';
import { buildStockLedgerWorkbookBuffer } from './stock-ledger-excel.builder';

function parseStrictDateOrThrow(raw: string, field: string): string {
  try {
    return formatDateOnly(parseIsoDateStrict(raw));
  } catch {
    throw new BadRequestException({
      message: 'Ngày lọc không hợp lệ',
      errors: [{ field, message: 'Ngày lọc phải đúng định dạng YYYY-MM-DD và tồn tại trên lịch' }],
    });
  }
}

@Injectable()
export class StockLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private resolvePeriod(fromRaw?: string, toRaw?: string): { from: string; to: string } {
    const todayVn = getVnTodayDateString();
    const to = toRaw ? parseStrictDateOrThrow(toRaw, 'to') : todayVn;
    const defaultFrom = `${to.slice(0, 7)}-01`;
    const from = fromRaw ? parseStrictDateOrThrow(fromRaw, 'from') : defaultFrom;

    if (from > to) {
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

    return { from, to };
  }

  async getStockLedger(query: StockLedgerQueryDto): Promise<StockLedgerResult> {
    const { from, to } = this.resolvePeriod(query.from, query.to);
    const { lt: toExclusiveUtc } = buildVnDayRangeUtc(undefined, to);

    const where: Prisma.StockMovementWhereInput = {
      occurredAt: { lt: toExclusiveUtc },
    };

    if (query.lotId) {
      where.lotId = query.lotId;
    }

    if (query.productId || query.groupId) {
      where.lot = {
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.groupId ? { product: { groupId: query.groupId } } : {}),
      };
    }

    const rows = await this.prisma.stockMovement.findMany({
      where,
      select: {
        occurredAt: true,
        movementType: true,
        quantityDelta: true,
        lot: {
          select: {
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
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    const inputs: StockLedgerMovementInput[] = rows.map((row) => ({
      occurredAt: row.occurredAt,
      movementType: row.movementType as MovementType,
      quantityDelta: row.quantityDelta,
      product: row.lot.product,
    }));

    return computeStockLedger(inputs, from, to);
  }

  async exportStockLedgerXlsx(
    query: StockLedgerQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; ledger: StockLedgerResult }> {
    const ledger = await this.getStockLedger(query);
    const buffer = await buildStockLedgerWorkbookBuffer(ledger);
    const filename = `Bao-cao-NXT_${ledger.from}_${ledger.to}.xlsx`;
    return { buffer, filename, ledger };
  }

  async getMonthlyInOut(query: MonthlyInOutQueryDto): Promise<MonthlyInOutPoint[]> {
    const months = query.months ?? 12;
    const todayVn = getVnTodayDateString();
    const monthKeys = buildMonthKeys(todayVn, months);
    const firstMonthStartIso = `${monthKeys[0]}-01`;
    const { gte: startUtc, lt: endExclusiveUtc } = buildVnDayRangeUtc(firstMonthStartIso, todayVn);

    const where: Prisma.StockMovementWhereInput = {
      occurredAt: {
        gte: startUtc,
        lt: endExclusiveUtc,
      },
      movementType: {
        in: ['INBOUND', 'OUTBOUND', 'RETURN', 'DISPOSAL'],
      },
    };

    if (query.groupId) {
      where.lot = {
        product: {
          groupId: query.groupId,
        },
      };
    }

    const rows = await this.prisma.stockMovement.findMany({
      where,
      select: {
        occurredAt: true,
        movementType: true,
        quantityDelta: true,
      },
    });

    return computeMonthlyInOut(
      rows.map((r) => ({
        occurredAt: r.occurredAt,
        movementType: r.movementType as MovementType,
        quantityDelta: r.quantityDelta,
      })),
      todayVn,
      months,
    );
  }
}
