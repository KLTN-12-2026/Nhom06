import { Prisma } from '@prisma/client';
import { FieldValidationError } from '../../../common/filters/http-exception.filter';

export const LOT_CODE_MAX_LENGTH = 80;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export interface RawReceiptItemInput {
  itemId?: string;
  productId: string;
  lotCode: string;
  expiryDate: string;
  manufacturedDate?: string | null;
  quantity: string | number;
  unitCost?: string | number | null;
}

export interface NormalizedReceiptItem {
  rowIndex: number;
  itemId?: string;
  productId: string;
  lotCode: string;
  expiryDate: string;
  manufacturedDate: string | null;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
}

export interface ExistingLotSnapshot {
  id: string;
  productId: string;
  lotCode: string;
  expiryDate: string;
  manufacturedDate: string | null;
}

export interface GroupedLotInput {
  productId: string;
  lotCode: string;
  expiryDate: string;
  manufacturedDate: string | null;
  totalQuantity: Prisma.Decimal;
  itemIds: string[];
  rowIndices: number[];
}

export interface ReceiptSummary {
  lineCount: number;
  totalQuantity: string;
  totalAmount: string;
  lineTotals: Array<string | null>;
}

/**
 * Chuẩn hóa mã lô theo đặc tả: bỏ toàn bộ khoảng trắng và chuyển in hoa.
 */
export function normalizeLotCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Kiểm tra chuỗi ngày chuẩn YYYY-MM-DD có phải ngày lịch hợp lệ hay không.
 */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function toUtcDate(isoDate: string): Date {
  const match = ISO_DATE_REGEX.exec(isoDate);
  if (!match) {
    throw new Error(`Ngày không đúng định dạng YYYY-MM-DD: ${isoDate}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatUtcDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDecimalString(
  raw: string | number,
  options: { allowZero: boolean; maxScale: number; maxIntegerDigits: number },
): Prisma.Decimal | null {
  let str: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return null;
    }
    str = String(raw);
  } else if (typeof raw === 'string') {
    str = raw.trim();
  } else {
    return null;
  }

  if (!DECIMAL_REGEX.test(str)) {
    return null;
  }

  const unsigned = str.startsWith('-') ? str.slice(1) : str;
  const [intPart, fracPart = ''] = unsigned.split('.');
  const normalizedInt = intPart.replace(/^0+/, '') || '0';

  if (fracPart.length > options.maxScale || normalizedInt.length > options.maxIntegerDigits) {
    return null;
  }

  const decimal = new Prisma.Decimal(str);
  if (options.allowZero ? decimal.lt(0) : decimal.lte(0)) {
    return null;
  }
  return decimal;
}

/**
 * Sinh tiền tố số phiếu nhập theo D-018: PN + YYMMDD.
 */
export function buildReceiptNoPrefix(receiptDate: string): string {
  const match = ISO_DATE_REGEX.exec(receiptDate);
  if (!match) {
    throw new Error(`Ngày chứng từ không hợp lệ: ${receiptDate}`);
  }
  return `PN${match[1].slice(2)}${match[2]}${match[3]}`;
}

/**
 * Sinh số phiếu nhập kế tiếp trong ngày theo D-018 (vd: PN2611220001).
 */
export function buildNextReceiptNo(receiptDate: string, latestReceiptNo: string | null): string {
  const prefix = buildReceiptNoPrefix(receiptDate);
  if (!latestReceiptNo || !latestReceiptNo.startsWith(prefix)) {
    return `${prefix}0001`;
  }
  const suffix = latestReceiptNo.slice(prefix.length);
  const currentSeq = /^\d+$/.test(suffix) ? Number.parseInt(suffix, 10) : 0;
  const nextSeq = currentSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Kiểm tra toàn bộ dòng hàng của phiếu nhập: số lượng, đơn giá, mã lô, ngày HSD/NSX
 * và tính nhất quán giữa các dòng trùng (productId, lotCode) trong cùng phiếu.
 */
export function validateReceiptItems(
  receiptDate: string,
  items: readonly RawReceiptItemInput[],
): { validItems: NormalizedReceiptItem[]; errors: FieldValidationError[] } {
  const errors: FieldValidationError[] = [];
  const validItems: NormalizedReceiptItem[] = [];

  if (!isValidIsoDate(receiptDate)) {
    errors.push({
      field: 'receiptDate',
      message: 'Ngày chứng từ không hợp lệ (định dạng YYYY-MM-DD)',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push({
      field: 'items',
      message: 'Phiếu nhập phải có ít nhất 1 dòng hàng',
    });
    return { validItems, errors };
  }

  const seenLotMap = new Map<
    string,
    { expiryDate: string; manufacturedDate: string | null }
  >();

  items.forEach((raw, index) => {
    const fieldPrefix = `items.${index}`;
    let rowValid = true;

    const normalizedLotCode =
      typeof raw.lotCode === 'string' ? normalizeLotCode(raw.lotCode) : '';
    if (normalizedLotCode.length < 1 || normalizedLotCode.length > LOT_CODE_MAX_LENGTH) {
      errors.push({
        field: `${fieldPrefix}.lotCode`,
        message: `Mã lô phải từ 1 đến ${LOT_CODE_MAX_LENGTH} ký tự`,
      });
      rowValid = false;
    }

    const quantity = parseDecimalString(raw.quantity, {
      allowZero: false,
      maxScale: 3,
      maxIntegerDigits: 11,
    });
    if (!quantity) {
      errors.push({
        field: `${fieldPrefix}.quantity`,
        message: 'Số lượng phải lớn hơn 0 và tối đa 3 chữ số thập phân',
      });
      rowValid = false;
    }

    let unitCost: Prisma.Decimal | null = null;
    if (raw.unitCost !== undefined && raw.unitCost !== null && raw.unitCost !== '') {
      const parsedCost = parseDecimalString(raw.unitCost, {
        allowZero: true,
        maxScale: 2,
        maxIntegerDigits: 12,
      });
      if (!parsedCost) {
        errors.push({
          field: `${fieldPrefix}.unitCost`,
          message: 'Đơn giá phải lớn hơn hoặc bằng 0 và tối đa 2 chữ số thập phân',
        });
        rowValid = false;
      } else {
        unitCost = parsedCost;
      }
    }

    const expiryDate = typeof raw.expiryDate === 'string' ? raw.expiryDate.trim() : '';
    const expiryValid = isValidIsoDate(expiryDate);
    if (!expiryValid) {
      errors.push({
        field: `${fieldPrefix}.expiryDate`,
        message: 'Hạn sử dụng không hợp lệ (định dạng YYYY-MM-DD)',
      });
      rowValid = false;
    } else if (isValidIsoDate(receiptDate) && expiryDate <= receiptDate) {
      errors.push({
        field: `${fieldPrefix}.expiryDate`,
        message: 'Hạn sử dụng phải lớn hơn ngày chứng từ',
      });
      rowValid = false;
    }

    let manufacturedDate: string | null = null;
    if (
      raw.manufacturedDate !== undefined &&
      raw.manufacturedDate !== null &&
      raw.manufacturedDate.trim() !== ''
    ) {
      const trimmedMfg = raw.manufacturedDate.trim();
      if (!isValidIsoDate(trimmedMfg)) {
        errors.push({
          field: `${fieldPrefix}.manufacturedDate`,
          message: 'Ngày sản xuất không hợp lệ (định dạng YYYY-MM-DD)',
        });
        rowValid = false;
      } else {
        manufacturedDate = trimmedMfg;
        if (expiryValid && expiryDate <= trimmedMfg) {
          errors.push({
            field: `${fieldPrefix}.expiryDate`,
            message: 'Hạn sử dụng phải lớn hơn ngày sản xuất',
          });
          rowValid = false;
        }
      }
    }

    if (raw.productId && normalizedLotCode.length > 0 && expiryValid) {
      const lotKey = `${raw.productId}::${normalizedLotCode}`;
      const prev = seenLotMap.get(lotKey);
      if (!prev) {
        seenLotMap.set(lotKey, { expiryDate, manufacturedDate });
      } else {
        if (prev.expiryDate !== expiryDate) {
          errors.push({
            field: `${fieldPrefix}.expiryDate`,
            message: 'Hai dòng cùng mã lô phải có cùng hạn sử dụng',
          });
          rowValid = false;
        }
        if (
          prev.manufacturedDate !== null &&
          manufacturedDate !== null &&
          prev.manufacturedDate !== manufacturedDate
        ) {
          errors.push({
            field: `${fieldPrefix}.manufacturedDate`,
            message: 'Hai dòng cùng mã lô phải có cùng ngày sản xuất',
          });
          rowValid = false;
        } else if (prev.manufacturedDate === null && manufacturedDate !== null) {
          prev.manufacturedDate = manufacturedDate;
        }
      }
    }

    if (rowValid && quantity) {
      validItems.push({
        rowIndex: index,
        itemId: raw.itemId,
        productId: raw.productId,
        lotCode: normalizedLotCode,
        expiryDate,
        manufacturedDate,
        quantity,
        unitCost,
      });
    }
  });

  return { validItems: errors.length === 0 ? validItems : [], errors };
}

/**
 * Đối chiếu các dòng phiếu với lô đã tồn tại trong DB theo (productId, lotCode).
 */
export function checkExistingLotConflicts(
  items: readonly NormalizedReceiptItem[],
  existingLots: readonly ExistingLotSnapshot[],
): FieldValidationError[] {
  const lotMap = new Map<string, ExistingLotSnapshot>();
  for (const lot of existingLots) {
    lotMap.set(`${lot.productId}::${lot.lotCode}`, lot);
  }

  const errors: FieldValidationError[] = [];
  for (const item of items) {
    const existing = lotMap.get(`${item.productId}::${item.lotCode}`);
    if (!existing) {
      continue;
    }
    if (existing.expiryDate !== item.expiryDate) {
      errors.push({
        field: `items.${item.rowIndex}.lotCode`,
        message: 'Mã lô đã tồn tại với hạn sử dụng khác',
      });
      continue;
    }
    if (
      item.manufacturedDate !== null &&
      existing.manufacturedDate !== null &&
      existing.manufacturedDate !== item.manufacturedDate
    ) {
      errors.push({
        field: `items.${item.rowIndex}.manufacturedDate`,
        message: 'Mã lô đã tồn tại với ngày sản xuất khác',
      });
    }
  }
  return errors;
}

/**
 * Gom dòng hàng theo (productId, lotCode) và sắp xếp cố định theo (productId ASC, lotCode ASC)
 * nhằm tránh deadlock khi nhiều giao dịch xác nhận song song.
 */
export function groupItemsByLot(items: readonly NormalizedReceiptItem[]): GroupedLotInput[] {
  const grouped = new Map<string, GroupedLotInput>();

  for (const item of items) {
    const key = `${item.productId}::${item.lotCode}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        productId: item.productId,
        lotCode: item.lotCode,
        expiryDate: item.expiryDate,
        manufacturedDate: item.manufacturedDate,
        totalQuantity: item.quantity,
        itemIds: item.itemId ? [item.itemId] : [],
        rowIndices: [item.rowIndex],
      });
    } else {
      existing.totalQuantity = existing.totalQuantity.add(item.quantity);
      if (existing.manufacturedDate === null && item.manufacturedDate !== null) {
        existing.manufacturedDate = item.manufacturedDate;
      }
      if (item.itemId) {
        existing.itemIds.push(item.itemId);
      }
      existing.rowIndices.push(item.rowIndex);
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => a.productId.localeCompare(b.productId) || a.lotCode.localeCompare(b.lotCode),
  );
}

/**
 * Tính tổng số dòng, tổng số lượng, tổng thành tiền bằng Prisma.Decimal.
 */
export function summarizeReceiptItems(
  items: ReadonlyArray<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null }>,
): ReceiptSummary {
  let totalQty = new Prisma.Decimal(0);
  let totalAmount = new Prisma.Decimal(0);
  const lineTotals: Array<string | null> = [];

  for (const item of items) {
    totalQty = totalQty.add(item.quantity);
    if (item.unitCost !== null) {
      const lineTotal = item.quantity.mul(item.unitCost);
      totalAmount = totalAmount.add(lineTotal);
      lineTotals.push(lineTotal.toString());
    } else {
      lineTotals.push(null);
    }
  }

  return {
    lineCount: items.length,
    totalQuantity: totalQty.toString(),
    totalAmount: totalAmount.toString(),
    lineTotals,
  };
}
