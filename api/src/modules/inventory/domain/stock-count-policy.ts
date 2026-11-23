import { Prisma } from '@prisma/client';
import { FieldValidationError } from '../../../common/filters/http-exception.filter';
import { parseDecimalString } from '../../inbound/domain/inbound-policy';

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_REASON_LENGTH = 500;

export const STOCK_COUNT_STATUS_VALUES = ['draft', 'submitted', 'approved', 'cancelled'] as const;
export type StockCountStatus = (typeof STOCK_COUNT_STATUS_VALUES)[number];

export interface RawStockCountItemInput {
  lotId: string;
  countedQty: string | number;
  reason?: string | null;
}

export interface LotSnapshotForCount {
  lotId: string;
  status: string;
  systemQty: Prisma.Decimal;
}

export interface NormalizedStockCountItem {
  rowIndex: number;
  lotId: string;
  systemQty: Prisma.Decimal;
  countedQty: Prisma.Decimal;
  varianceQty: Prisma.Decimal;
  reason: string | null;
}

export interface StockCountSummary {
  lineCount: number;
  discrepancyCount: number;
  totalVarianceQty: string;
}

/**
 * Parse số lượng kiểm đếm thực tế: >= 0, tối đa 3 chữ số thập phân, tối đa 11 chữ số phần nguyên.
 */
export function parseCountedQty(raw: string | number): Prisma.Decimal | null {
  return parseDecimalString(raw, {
    allowZero: true,
    maxScale: 3,
    maxIntegerDigits: 11,
  });
}

/**
 * Sinh tiền tố số phiếu kiểm kê theo D-024: KK + YYMMDD (theo ngày VN).
 */
export function buildStockCountNoPrefix(vnDateStr: string): string {
  const match = ISO_DATE_REGEX.exec(vnDateStr);
  if (!match) {
    throw new Error(`Ngày kiểm kê không hợp lệ: ${vnDateStr}`);
  }
  return `KK${match[1].slice(2)}${match[2]}${match[3]}`;
}

/**
 * Sinh số phiếu kiểm kê kế tiếp trong ngày (vd: KK2611230001).
 */
export function buildNextStockCountNo(
  vnDateStr: string,
  latestCountNo: string | null,
): string {
  const prefix = buildStockCountNoPrefix(vnDateStr);
  if (!latestCountNo || !latestCountNo.startsWith(prefix)) {
    return `${prefix}0001`;
  }
  const suffix = latestCountNo.slice(prefix.length);
  const currentSeq = /^\d+$/.test(suffix) ? Number.parseInt(suffix, 10) : 0;
  const nextSeq = currentSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Kiểm tra toàn bộ dòng kiểm kê theo D-024 và PB17:
 * - >= 1 dòng
 * - không trùng lotId trong cùng phiếu
 * - lô tồn tại và không ở trạng thái closed (lô active và blocked đều kiểm kê được)
 * - countedQty >= 0, tối đa 3 số thập phân
 * - varianceQty = countedQty - systemQty; bắt buộc lý do khi varianceQty !== 0
 */
export function validateStockCountItems(
  items: readonly RawStockCountItemInput[],
  lotSnapshots: ReadonlyMap<string, LotSnapshotForCount>,
): { validItems: NormalizedStockCountItem[]; errors: FieldValidationError[] } {
  const errors: FieldValidationError[] = [];
  const validItems: NormalizedStockCountItem[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    errors.push({
      field: 'items',
      message: 'Phiếu kiểm kê phải có ít nhất 1 dòng lô hàng',
    });
    return { validItems, errors };
  }

  const seenLotIds = new Set<string>();

  items.forEach((raw, index) => {
    const fieldPrefix = `items.${index}`;
    let rowValid = true;

    const lotId = typeof raw.lotId === 'string' ? raw.lotId.trim() : '';
    if (!lotId) {
      errors.push({
        field: `${fieldPrefix}.lotId`,
        message: 'Vui lòng chọn lô hàng',
      });
      rowValid = false;
    } else if (seenLotIds.has(lotId)) {
      errors.push({
        field: `${fieldPrefix}.lotId`,
        message: 'Lô hàng bị trùng trong phiếu kiểm kê',
      });
      rowValid = false;
    } else {
      seenLotIds.add(lotId);
    }

    const snapshot = lotId ? lotSnapshots.get(lotId) : undefined;
    if (lotId && !snapshot) {
      errors.push({
        field: `${fieldPrefix}.lotId`,
        message: 'Lô hàng không tồn tại',
      });
      rowValid = false;
    } else if (snapshot && snapshot.status === 'closed') {
      errors.push({
        field: `${fieldPrefix}.lotId`,
        message: 'Lô hàng đã đóng, không thể đưa vào phiếu kiểm kê',
      });
      rowValid = false;
    }

    const countedQty = parseCountedQty(raw.countedQty);
    if (!countedQty) {
      errors.push({
        field: `${fieldPrefix}.countedQty`,
        message: 'Số lượng đếm phải lớn hơn hoặc bằng 0 và tối đa 3 chữ số thập phân',
      });
      rowValid = false;
    }

    const trimmedReason =
      typeof raw.reason === 'string' && raw.reason.trim().length > 0 ? raw.reason.trim() : null;
    if (trimmedReason && trimmedReason.length > MAX_REASON_LENGTH) {
      errors.push({
        field: `${fieldPrefix}.reason`,
        message: `Lý do chênh lệch tối đa ${MAX_REASON_LENGTH} ký tự`,
      });
      rowValid = false;
    }

    if (snapshot && countedQty) {
      const varianceQty = countedQty.minus(snapshot.systemQty);
      if (!varianceQty.eq(0) && !trimmedReason) {
        errors.push({
          field: `${fieldPrefix}.reason`,
          message: 'Bắt buộc nhập lý do khi số đếm chênh lệch với tồn hệ thống',
        });
        rowValid = false;
      }

      if (rowValid) {
        validItems.push({
          rowIndex: index,
          lotId,
          systemQty: snapshot.systemQty,
          countedQty,
          varianceQty,
          reason: trimmedReason,
        });
      }
    }
  });

  return {
    validItems: errors.length === 0 ? validItems : [],
    errors,
  };
}

/**
 * Sắp xếp cố định các dòng kiểm kê theo `lotId ASC` trước khi khóa `FOR UPDATE` để chống deadlock.
 */
export function sortStockCountItemsForLocking<T extends { lotId: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.lotId.localeCompare(b.lotId));
}

/**
 * Tổng hợp số dòng, số dòng lệch và tổng chênh lệch bằng Prisma.Decimal.
 */
export function summarizeStockCountItems(
  items: ReadonlyArray<{ varianceQty: Prisma.Decimal }>,
): StockCountSummary {
  let discrepancyCount = 0;
  let totalVariance = new Prisma.Decimal(0);

  for (const item of items) {
    if (!item.varianceQty.eq(0)) {
      discrepancyCount += 1;
      totalVariance = totalVariance.plus(item.varianceQty);
    }
  }

  return {
    lineCount: items.length,
    discrepancyCount,
    totalVarianceQty: totalVariance.toString(),
  };
}

/**
 * Nối lý do hủy vào cột ghi chú hiện có mà không ghi đè ghi chú gốc.
 */
export function appendCancelReasonToNote(existingNote: string | null, reason: string): string {
  const cleanReason = reason.trim();
  const cleanNote = existingNote?.trim();
  if (!cleanNote) {
    return `[Lý do hủy] ${cleanReason}`;
  }
  return `${cleanNote}\n[Lý do hủy] ${cleanReason}`;
}
