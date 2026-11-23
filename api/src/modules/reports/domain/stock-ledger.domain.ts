import { Prisma } from '@prisma/client';
import { getVnTodayDateString } from '../../expiry/domain/vn-date';
import {
  buildVnDayRangeUtc,
  type MovementType,
} from '../../inventory/domain/inventory-policy';

export interface StockLedgerProductRef {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface StockLedgerMovementInput {
  occurredAt: Date;
  movementType: MovementType;
  quantityDelta: Prisma.Decimal;
  product: StockLedgerProductRef;
}

export interface StockLedgerProductItem {
  product: StockLedgerProductRef;
  opening: string;
  inbound: string;
  outbound: string;
  adjustment: string;
  closing: string;
}

export interface StockLedgerTotals {
  opening: string;
  inbound: string;
  outbound: string;
  adjustment: string;
  closing: string;
}

export interface StockLedgerResult {
  from: string;
  to: string;
  items: StockLedgerProductItem[];
  totals: StockLedgerTotals;
}

export interface MonthlyInOutPoint {
  month: string;
  inbound: string;
  outbound: string;
}

function formatDecimalString(value: Prisma.Decimal): string {
  return value.isZero() ? '0' : value.toString();
}

/**
 * Hàm thuần tính báo cáo Nhập — Xuất — Tồn theo sản phẩm cho kỳ `[from, to]` (ngày VN).
 * Bất biến D-027: `closing = opening + inbound - outbound + adjustment`.
 */
export function computeStockLedger(
  movements: readonly StockLedgerMovementInput[],
  from: string,
  to: string,
): StockLedgerResult {
  const { gte: fromUtc, lt: toExclusiveUtc } = buildVnDayRangeUtc(from, to);
  if (!fromUtc || !toExclusiveUtc) {
    throw new Error('Khoảng ngày báo cáo không hợp lệ');
  }

  const buckets = new Map<
    string,
    {
      product: StockLedgerProductRef;
      opening: Prisma.Decimal;
      inbound: Prisma.Decimal;
      outbound: Prisma.Decimal;
      adjustment: Prisma.Decimal;
    }
  >();

  for (const mv of movements) {
    if (mv.occurredAt >= toExclusiveUtc) {
      continue;
    }

    let bucket = buckets.get(mv.product.id);
    if (!bucket) {
      bucket = {
        product: mv.product,
        opening: new Prisma.Decimal(0),
        inbound: new Prisma.Decimal(0),
        outbound: new Prisma.Decimal(0),
        adjustment: new Prisma.Decimal(0),
      };
      buckets.set(mv.product.id, bucket);
    }

    if (mv.occurredAt < fromUtc) {
      bucket.opening = bucket.opening.plus(mv.quantityDelta);
      continue;
    }

    switch (mv.movementType) {
      case 'INBOUND':
        bucket.inbound = bucket.inbound.plus(mv.quantityDelta);
        break;
      case 'OUTBOUND':
      case 'RETURN':
      case 'DISPOSAL':
        bucket.outbound = bucket.outbound.plus(mv.quantityDelta.abs());
        break;
      case 'ADJUSTMENT':
        bucket.adjustment = bucket.adjustment.plus(mv.quantityDelta);
        break;
    }
  }

  let totalOpening = new Prisma.Decimal(0);
  let totalInbound = new Prisma.Decimal(0);
  let totalOutbound = new Prisma.Decimal(0);
  let totalAdjustment = new Prisma.Decimal(0);
  let totalClosing = new Prisma.Decimal(0);

  const items: StockLedgerProductItem[] = [];

  const sortedBuckets = Array.from(buckets.values()).sort((a, b) =>
    a.product.code.localeCompare(b.product.code),
  );

  for (const bucket of sortedBuckets) {
    const closing = bucket.opening
      .plus(bucket.inbound)
      .minus(bucket.outbound)
      .plus(bucket.adjustment);

    if (
      bucket.opening.isZero() &&
      bucket.inbound.isZero() &&
      bucket.outbound.isZero() &&
      bucket.adjustment.isZero() &&
      closing.isZero()
    ) {
      continue;
    }

    totalOpening = totalOpening.plus(bucket.opening);
    totalInbound = totalInbound.plus(bucket.inbound);
    totalOutbound = totalOutbound.plus(bucket.outbound);
    totalAdjustment = totalAdjustment.plus(bucket.adjustment);
    totalClosing = totalClosing.plus(closing);

    items.push({
      product: bucket.product,
      opening: formatDecimalString(bucket.opening),
      inbound: formatDecimalString(bucket.inbound),
      outbound: formatDecimalString(bucket.outbound),
      adjustment: formatDecimalString(bucket.adjustment),
      closing: formatDecimalString(closing),
    });
  }

  return {
    from,
    to,
    items,
    totals: {
      opening: formatDecimalString(totalOpening),
      inbound: formatDecimalString(totalInbound),
      outbound: formatDecimalString(totalOutbound),
      adjustment: formatDecimalString(totalAdjustment),
      closing: formatDecimalString(totalClosing),
    },
  };
}

/**
 * Tạo danh sách `months` mốc tháng liên tục `YYYY-MM` kết thúc tại tháng của `anchorDateVn`.
 */
export function buildMonthKeys(anchorDateVn: string, months: number): string[] {
  const match = /^(\d{4})-(\d{2})/.exec(anchorDateVn.trim());
  if (!match) {
    throw new Error(`Ngày neo không hợp lệ: ${anchorDateVn}`);
  }
  const anchorYear = Number(match[1]);
  const anchorMonthIndex = Number(match[2]) - 1; // 0..11

  const keys: string[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(anchorYear, anchorMonthIndex - offset, 1));
    const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    keys.push(`${yyyy}-${mm}`);
  }
  return keys;
}

/**
 * Hàm thuần gom tổng nhập và xuất theo từng tháng (múi giờ VN) cho biểu đồ biến động.
 */
export function computeMonthlyInOut(
  movements: readonly Pick<StockLedgerMovementInput, 'occurredAt' | 'movementType' | 'quantityDelta'>[],
  anchorDateVn: string,
  months = 12,
): MonthlyInOutPoint[] {
  const keys = buildMonthKeys(anchorDateVn, months);
  const buckets = new Map<string, { inbound: Prisma.Decimal; outbound: Prisma.Decimal }>();
  for (const key of keys) {
    buckets.set(key, {
      inbound: new Prisma.Decimal(0),
      outbound: new Prisma.Decimal(0),
    });
  }

  for (const mv of movements) {
    const vnMonthKey = getVnTodayDateString(mv.occurredAt).slice(0, 7);
    const bucket = buckets.get(vnMonthKey);
    if (!bucket) {
      continue;
    }
    if (mv.movementType === 'INBOUND') {
      bucket.inbound = bucket.inbound.plus(mv.quantityDelta);
    } else if (
      mv.movementType === 'OUTBOUND' ||
      mv.movementType === 'RETURN' ||
      mv.movementType === 'DISPOSAL'
    ) {
      bucket.outbound = bucket.outbound.plus(mv.quantityDelta.abs());
    }
  }

  return keys.map((month) => {
    const bucket = buckets.get(month)!;
    return {
      month,
      inbound: formatDecimalString(bucket.inbound),
      outbound: formatDecimalString(bucket.outbound),
    };
  });
}
