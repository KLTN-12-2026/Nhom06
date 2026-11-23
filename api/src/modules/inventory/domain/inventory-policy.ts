import { Prisma } from '@prisma/client';
import { ExpirySeverity } from '../../expiry/domain/expiry-policy';
import { formatDateOnly, parseIsoDateStrict } from '../../expiry/domain/vn-date';

export type ExpiryStatusFilter = 'expired' | 'near_expiry' | 'critical' | 'warning' | 'normal';

export const EXPIRY_STATUS_FILTER_VALUES: readonly ExpiryStatusFilter[] = [
  'expired',
  'near_expiry',
  'critical',
  'warning',
  'normal',
] as const;

export const LOT_STATUS_VALUES = ['active', 'blocked', 'closed'] as const;
export type LotStatus = (typeof LOT_STATUS_VALUES)[number];

export const MOVEMENT_TYPE_VALUES = [
  'INBOUND',
  'OUTBOUND',
  'ADJUSTMENT',
  'RETURN',
  'DISPOSAL',
] as const;
export type MovementType = (typeof MOVEMENT_TYPE_VALUES)[number];

export const MOVEMENT_SOURCE_TYPE_VALUES = [
  'INBOUND_RECEIPT',
  'OUTBOUND_RECEIPT',
  'STOCK_COUNT',
] as const;
export type MovementSourceType = (typeof MOVEMENT_SOURCE_TYPE_VALUES)[number];

export interface InventoryLotForSummary {
  lotId: string;
  lotCode: string;
  expiryDate: string;
  receivedAt: string;
  onHandQty: Prisma.Decimal;
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
}

export interface ProductInventorySummaryItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  group: {
    id: string;
    code: string;
    name: string;
  };
  lotCount: number;
  totalQty: string;
}

export interface InventorySummaryResult {
  lotCount: number;
  totalQty: string;
  byProduct: ProductInventorySummaryItem[];
}

/**
 * Kiểm tra tình trạng HSD của một lô có khớp bộ lọc người dùng chọn không.
 * Hỗ trợ cả `near_expiry` (gộp `critical` + `warning` cho dropdown mockup 11) lẫn từng mức chi tiết.
 */
export function matchesExpiryStatusFilter(
  severity: ExpirySeverity,
  filter?: ExpiryStatusFilter,
): boolean {
  if (!filter) {
    return true;
  }
  if (filter === 'near_expiry') {
    return severity === 'critical' || severity === 'warning';
  }
  return severity === filter;
}

/**
 * Sắp xếp danh sách tồn theo lô cố định: mã sản phẩm tăng dần, rồi HSD tăng dần,
 * cùng HSD thì ngày nhập trước đứng trước, sau cùng theo mã lô.
 */
export function sortInventoryLots<
  T extends {
    lotCode: string;
    expiryDate: string;
    receivedAt: string;
    product: { code: string };
  },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const prodCmp = a.product.code.localeCompare(b.product.code);
    if (prodCmp !== 0) {
      return prodCmp;
    }
    const expCmp = a.expiryDate.localeCompare(b.expiryDate);
    if (expCmp !== 0) {
      return expCmp;
    }
    const recCmp = a.receivedAt.localeCompare(b.receivedAt);
    if (recCmp !== 0) {
      return recCmp;
    }
    return a.lotCode.localeCompare(b.lotCode);
  });
}

/**
 * Tính tổng tồn kho toàn bộ và tổng tồn theo từng sản phẩm hoàn toàn bằng Prisma.Decimal (PB15 AC2).
 * Bất biến: với mọi sản phẩm, `totalQty` bằng tổng `onHandQty` của các lô tương ứng;
 * tổng toàn kho bằng tổng của `byProduct`.
 */
export function summarizeInventoryLots(
  items: readonly InventoryLotForSummary[],
): InventorySummaryResult {
  let grandTotal = new Prisma.Decimal(0);
  const byProductMap = new Map<
    string,
    {
      productId: string;
      productCode: string;
      productName: string;
      unit: string;
      group: { id: string; code: string; name: string };
      lotCount: number;
      totalQty: Prisma.Decimal;
    }
  >();

  for (const item of items) {
    grandTotal = grandTotal.plus(item.onHandQty);
    const existing = byProductMap.get(item.product.id);
    if (!existing) {
      byProductMap.set(item.product.id, {
        productId: item.product.id,
        productCode: item.product.code,
        productName: item.product.name,
        unit: item.product.unit,
        group: item.product.group,
        lotCount: 1,
        totalQty: item.onHandQty,
      });
    } else {
      existing.lotCount += 1;
      existing.totalQty = existing.totalQty.plus(item.onHandQty);
    }
  }

  const byProduct: ProductInventorySummaryItem[] = Array.from(byProductMap.values())
    .sort((a, b) => a.productCode.localeCompare(b.productCode))
    .map((entry) => ({
      productId: entry.productId,
      productCode: entry.productCode,
      productName: entry.productName,
      unit: entry.unit,
      group: entry.group,
      lotCount: entry.lotCount,
      totalQty: entry.totalQty.toString(),
    }));

  return {
    lotCount: items.length,
    totalQty: grandTotal.toString(),
    byProduct,
  };
}

/**
 * Ánh xạ loại chứng từ nguồn trong `stock_movements` sang đường dẫn màn hình chi tiết trên Web.
 */
export function buildMovementSourceUrl(sourceType: string, sourceId: string): string {
  switch (sourceType) {
    case 'INBOUND_RECEIPT':
      return `/inbound/${sourceId}`;
    case 'OUTBOUND_RECEIPT':
      return `/outbound/${sourceId}`;
    case 'STOCK_COUNT':
      return `/stock-counts/${sourceId}`;
    default:
      return '';
  }
}

/**
 * Chuyển khoảng ngày lọc nghiệp vụ `from`..`to` (YYYY-MM-DD, múi giờ Asia/Ho_Chi_Minh = UTC+7)
 * thành khoảng nửa mở UTC `[gte, lt)` chính xác tới microsecond cho cột `timestamptz`.
 */
export function buildVnDayRangeUtc(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};

  if (from) {
    const parsedFrom = parseIsoDateStrict(from);
    const fromIso = formatDateOnly(parsedFrom);
    range.gte = new Date(`${fromIso}T00:00:00.000+07:00`);
  }

  if (to) {
    const parsedTo = parseIsoDateStrict(to);
    const nextDayUtc = new Date(
      Date.UTC(
        parsedTo.getUTCFullYear(),
        parsedTo.getUTCMonth(),
        parsedTo.getUTCDate() + 1,
      ),
    );
    const nextDayIso = formatDateOnly(nextDayUtc);
    range.lt = new Date(`${nextDayIso}T00:00:00.000+07:00`);
  }

  return range;
}
