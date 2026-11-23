import { Prisma } from '@prisma/client';
import { diffCalendarDays } from '../../expiry/domain/vn-date';

export interface FefoLotInput {
  id: string;
  lotCode: string;
  expiryDate: string; // YYYY-MM-DD
  receivedAt: string; // YYYY-MM-DD
  status: string;
  onHandQty: Prisma.Decimal | string;
}

export type LotEligibilityResult =
  | {
      eligible: true;
      daysRemaining: number;
      onHandQty: Prisma.Decimal;
    }
  | {
      eligible: false;
      daysRemaining: number;
      onHandQty: Prisma.Decimal;
      reason: string;
    };

export interface FefoEligibleAllocation<T extends FefoLotInput = FefoLotInput> {
  lot: T;
  daysRemaining: number;
  onHandQty: Prisma.Decimal;
  allocateQty: Prisma.Decimal;
  rank: number;
}

export interface FefoExcludedLot<T extends FefoLotInput = FefoLotInput> {
  lot: T;
  daysRemaining: number;
  onHandQty: Prisma.Decimal;
  reason: string;
}

export interface FefoPlanResult<T extends FefoLotInput = FefoLotInput> {
  eligible: FefoEligibleAllocation<T>[];
  excluded: FefoExcludedLot<T>[];
  allocatedQty: Prisma.Decimal;
  shortageQty: Prisma.Decimal;
}

export interface FefoBypassWarning {
  code: 'FEFO_ORDER_BYPASSED';
  orderItemId: string;
  productId: string;
  productCode: string;
  lotId: string;
  lotCode: string;
  expiryDate: string;
  earlierLotId: string;
  earlierLotCode: string;
  earlierExpiryDate: string;
  message: string;
}

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Kiểm tra điều kiện giao của một lô theo D-023 và bất biến 5 (lọc trước khi sắp FEFO).
 * Thứ tự ưu tiên lý do: Hết tồn → Đã hết hạn → Lô bị khóa/không hoạt động → Dưới hạn dùng tối thiểu khi giao.
 */
export function checkLotDeliveryEligibility(
  lot: FefoLotInput,
  today: string,
  minDeliveryDays: number,
): LotEligibilityResult {
  const onHandQty = toDecimal(lot.onHandQty);
  const daysRemaining = diffCalendarDays(lot.expiryDate, today);

  if (onHandQty.lte(0)) {
    return {
      eligible: false,
      daysRemaining,
      onHandQty,
      reason: 'Hết tồn',
    };
  }

  if (daysRemaining < 0) {
    return {
      eligible: false,
      daysRemaining,
      onHandQty,
      reason: 'Đã hết hạn',
    };
  }

  if (lot.status === 'blocked') {
    return {
      eligible: false,
      daysRemaining,
      onHandQty,
      reason: 'Lô bị khóa',
    };
  }

  if (lot.status !== 'active') {
    return {
      eligible: false,
      daysRemaining,
      onHandQty,
      reason: 'Lô không hoạt động',
    };
  }

  if (daysRemaining < minDeliveryDays) {
    return {
      eligible: false,
      daysRemaining,
      onHandQty,
      reason: `Không đủ hạn dùng tối thiểu khi giao (còn ${daysRemaining} ngày < ${minDeliveryDays})`,
    };
  }

  return {
    eligible: true,
    daysRemaining,
    onHandQty,
  };
}

/**
 * Sắp xếp lô hợp lệ theo FEFO chuẩn (D-023):
 * expiry_date ASC → received_at ASC → lot_code ASC → id ASC.
 */
export function compareFefoLots(a: FefoLotInput, b: FefoLotInput): number {
  return (
    a.expiryDate.localeCompare(b.expiryDate) ||
    a.receivedAt.localeCompare(b.receivedAt) ||
    a.lotCode.localeCompare(b.lotCode) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Lập kế hoạch phân bổ lô theo FEFO (hàm thuần — không truy cập DB):
 * 1. Lọc lô không hợp lệ TRƯỚC khi sắp xếp (bất biến 5).
 * 2. Sắp lô hợp lệ theo expiry_date ASC, cùng HSD thì received_at ASC, rồi lot_code ASC.
 * 3. Rót lần lượt bằng Prisma.Decimal cho tới khi đủ requestedQty hoặc hết tồn hợp lệ.
 */
export function planFefo<T extends FefoLotInput>(
  lots: readonly T[],
  requestedQty: Prisma.Decimal | string | number,
  today: string,
  minDeliveryDays: number,
): FefoPlanResult<T> {
  const targetQty = toDecimal(requestedQty);
  const effectiveTarget = targetQty.gt(0) ? targetQty : new Prisma.Decimal(0);

  const eligibleRaw: Array<{ lot: T; daysRemaining: number; onHandQty: Prisma.Decimal }> = [];
  const excluded: FefoExcludedLot<T>[] = [];

  for (const lot of lots) {
    const check = checkLotDeliveryEligibility(lot, today, minDeliveryDays);
    if (check.eligible) {
      eligibleRaw.push({
        lot,
        daysRemaining: check.daysRemaining,
        onHandQty: check.onHandQty,
      });
    } else {
      excluded.push({
        lot,
        daysRemaining: check.daysRemaining,
        onHandQty: check.onHandQty,
        reason: check.reason,
      });
    }
  }

  eligibleRaw.sort((a, b) => compareFefoLots(a.lot, b.lot));
  excluded.sort(
    (a, b) =>
      a.lot.expiryDate.localeCompare(b.lot.expiryDate) ||
      a.lot.lotCode.localeCompare(b.lot.lotCode) ||
      a.lot.id.localeCompare(b.lot.id),
  );

  let remaining = effectiveTarget;
  let allocatedQty = new Prisma.Decimal(0);

  const eligible: FefoEligibleAllocation<T>[] = eligibleRaw.map((entry, idx) => {
    const allocateQty = remaining.gt(0)
      ? entry.onHandQty.lt(remaining)
        ? entry.onHandQty
        : remaining
      : new Prisma.Decimal(0);
    remaining = remaining.sub(allocateQty);
    allocatedQty = allocatedQty.add(allocateQty);

    return {
      lot: entry.lot,
      daysRemaining: entry.daysRemaining,
      onHandQty: entry.onHandQty,
      allocateQty,
      rank: idx + 1,
    };
  });

  return {
    eligible,
    excluded,
    allocatedQty,
    shortageQty: remaining,
  };
}

/**
 * Phát hiện cảnh báo khi người dùng bỏ qua lô hợp lệ có HSD sớm hơn vẫn còn tồn khả dụng
 * để chọn xuất lô có HSD xa hơn (không chặn xác nhận xuất).
 */
export function detectFefoBypassWarnings<T extends FefoLotInput>(
  eligibleSortedLots: readonly T[],
  chosenQtyByLotId: ReadonlyMap<string, Prisma.Decimal>,
  context: { orderItemId: string; productId: string; productCode: string },
): FefoBypassWarning[] {
  const warnings: FefoBypassWarning[] = [];
  const zero = new Prisma.Decimal(0);

  for (let i = 0; i < eligibleSortedLots.length; i += 1) {
    const current = eligibleSortedLots[i];
    const currentChosen = chosenQtyByLotId.get(current.id) ?? zero;
    if (currentChosen.lte(0)) {
      continue;
    }

    for (let j = 0; j < i; j += 1) {
      const earlier = eligibleSortedLots[j];
      if (earlier.expiryDate >= current.expiryDate) {
        continue;
      }
      const earlierOnHand = toDecimal(earlier.onHandQty);
      const earlierChosen = chosenQtyByLotId.get(earlier.id) ?? zero;
      if (earlierChosen.lt(earlierOnHand)) {
        warnings.push({
          code: 'FEFO_ORDER_BYPASSED',
          orderItemId: context.orderItemId,
          productId: context.productId,
          productCode: context.productCode,
          lotId: current.id,
          lotCode: current.lotCode,
          expiryDate: current.expiryDate,
          earlierLotId: earlier.id,
          earlierLotCode: earlier.lotCode,
          earlierExpiryDate: earlier.expiryDate,
          message: `Sản phẩm ${context.productCode}: chọn xuất lô ${current.lotCode} (HSD ${current.expiryDate}) trong khi lô ${earlier.lotCode} (HSD sớm hơn ${earlier.expiryDate}) vẫn còn tồn khả dụng`,
        });
        break;
      }
    }
  }

  return warnings;
}
