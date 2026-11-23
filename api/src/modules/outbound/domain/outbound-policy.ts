import { Prisma } from '@prisma/client';
import { FieldValidationError } from '../../../common/filters/http-exception.filter';
import { isValidIsoDate, parseDecimalString } from '../../inbound/domain/inbound-policy';

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface RawOrderItemInput {
  productId: string;
  requestedQty: string | number;
}

export interface NormalizedOrderItem {
  rowIndex: number;
  productId: string;
  requestedQty: Prisma.Decimal;
}

export interface RawOutboundItemInput {
  orderItemId: string;
  lotId: string;
  quantity: string | number;
}

export interface NormalizedOutboundItem {
  rowIndex: number;
  orderItemId: string;
  lotId: string;
  quantity: Prisma.Decimal;
}

export interface GroupedOutboundLot {
  lotId: string;
  totalQuantity: Prisma.Decimal;
  items: NormalizedOutboundItem[];
}

function buildDateDocPrefix(prefixCode: 'DH' | 'PX', isoDate: string): string {
  const match = ISO_DATE_REGEX.exec(isoDate);
  if (!match) {
    throw new Error(`Ngày chứng từ không hợp lệ: ${isoDate}`);
  }
  return `${prefixCode}${match[1].slice(2)}${match[2]}${match[3]}`;
}

function buildNextDocNo(
  prefixCode: 'DH' | 'PX',
  isoDate: string,
  latestNo: string | null,
): string {
  const prefix = buildDateDocPrefix(prefixCode, isoDate);
  if (!latestNo || !latestNo.startsWith(prefix)) {
    return `${prefix}0001`;
  }
  const suffix = latestNo.slice(prefix.length);
  const currentSeq = /^\d+$/.test(suffix) ? Number.parseInt(suffix, 10) : 0;
  return `${prefix}${String(currentSeq + 1).padStart(4, '0')}`;
}

/** Sinh tiền tố số đơn đại lý: DH + YYMMDD (D-023). */
export function buildOrderNoPrefix(orderDate: string): string {
  return buildDateDocPrefix('DH', orderDate);
}

/** Sinh số đơn đại lý kế tiếp trong ngày (vd: DH2611230001). */
export function buildNextOrderNo(orderDate: string, latestOrderNo: string | null): string {
  return buildNextDocNo('DH', orderDate, latestOrderNo);
}

/** Sinh tiền tố số phiếu xuất: PX + YYMMDD (D-023). */
export function buildOutboundNoPrefix(outboundDate: string): string {
  return buildDateDocPrefix('PX', outboundDate);
}

/** Sinh số phiếu xuất kế tiếp trong ngày (vd: PX2611230001). */
export function buildNextOutboundNo(outboundDate: string, latestOutboundNo: string | null): string {
  return buildNextDocNo('PX', outboundDate, latestOutboundNo);
}

/**
 * Validate danh sách dòng đặt hàng: ngày hợp lệ, >= 1 dòng, số lượng > 0 (numeric(14,3)),
 * không trùng sản phẩm trong cùng đơn.
 */
export function validateOrderItems(
  orderDate: string,
  items: readonly RawOrderItemInput[],
): { validItems: NormalizedOrderItem[]; errors: FieldValidationError[] } {
  const errors: FieldValidationError[] = [];
  const validItems: NormalizedOrderItem[] = [];

  if (!isValidIsoDate(orderDate)) {
    errors.push({
      field: 'orderDate',
      message: 'Ngày đặt hàng không hợp lệ (định dạng YYYY-MM-DD)',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push({
      field: 'items',
      message: 'Đơn hàng phải có ít nhất 1 mặt hàng',
    });
    return { validItems, errors };
  }

  const seenProducts = new Set<string>();

  items.forEach((raw, index) => {
    let rowValid = true;

    if (!raw.productId || typeof raw.productId !== 'string') {
      errors.push({
        field: `items.${index}.productId`,
        message: 'Vui lòng chọn sản phẩm',
      });
      rowValid = false;
    } else if (seenProducts.has(raw.productId)) {
      errors.push({
        field: `items.${index}.productId`,
        message: 'Sản phẩm bị trùng trong cùng đơn hàng',
      });
      rowValid = false;
    } else {
      seenProducts.add(raw.productId);
    }

    const qty = parseDecimalString(raw.requestedQty, {
      allowZero: false,
      maxScale: 3,
      maxIntegerDigits: 11,
    });
    if (!qty) {
      errors.push({
        field: `items.${index}.requestedQty`,
        message: 'Số lượng đặt phải lớn hơn 0 và tối đa 3 chữ số thập phân',
      });
      rowValid = false;
    }

    if (rowValid && qty) {
      validItems.push({
        rowIndex: index,
        productId: raw.productId,
        requestedQty: qty,
      });
    }
  });

  return { validItems: errors.length === 0 ? validItems : [], errors };
}

/**
 * Validate danh sách dòng xuất kho theo đơn: >= 1 dòng, quantity > 0 (numeric(14,3)),
 * không trùng cặp (orderItemId, lotId) trong cùng yêu cầu.
 */
export function validateOutboundItems(
  items: readonly RawOutboundItemInput[],
): { validItems: NormalizedOutboundItem[]; errors: FieldValidationError[] } {
  const errors: FieldValidationError[] = [];
  const validItems: NormalizedOutboundItem[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    errors.push({
      field: 'items',
      message: 'Phiếu xuất phải có ít nhất 1 dòng lô cần xuất',
    });
    return { validItems, errors };
  }

  const seenPairs = new Set<string>();

  items.forEach((raw, index) => {
    let rowValid = true;
    const pairKey = `${raw.orderItemId}::${raw.lotId}`;
    if (seenPairs.has(pairKey)) {
      errors.push({
        field: `items.${index}.lotId`,
        message: 'Trùng dòng đơn hàng và mã lô trong cùng yêu cầu xuất',
      });
      rowValid = false;
    } else {
      seenPairs.add(pairKey);
    }

    const qty = parseDecimalString(raw.quantity, {
      allowZero: false,
      maxScale: 3,
      maxIntegerDigits: 11,
    });
    if (!qty) {
      errors.push({
        field: `items.${index}.quantity`,
        message: 'Số lượng xuất phải lớn hơn 0 và tối đa 3 chữ số thập phân',
      });
      rowValid = false;
    }

    if (rowValid && qty) {
      validItems.push({
        rowIndex: index,
        orderItemId: raw.orderItemId,
        lotId: raw.lotId,
        quantity: qty,
      });
    }
  });

  return { validItems: errors.length === 0 ? validItems : [], errors };
}

/**
 * Gom dòng xuất theo lotId và sắp xếp tăng dần theo lotId (chống deadlock khi khóa FOR UPDATE).
 */
export function groupOutboundItemsByLot(
  items: readonly NormalizedOutboundItem[],
): GroupedOutboundLot[] {
  const byLot = new Map<string, GroupedOutboundLot>();

  for (const item of items) {
    const existing = byLot.get(item.lotId);
    if (!existing) {
      byLot.set(item.lotId, {
        lotId: item.lotId,
        totalQuantity: item.quantity,
        items: [item],
      });
    } else {
      existing.totalQuantity = existing.totalQuantity.add(item.quantity);
      existing.items.push(item);
    }
  }

  return Array.from(byLot.values()).sort((a, b) => a.lotId.localeCompare(b.lotId));
}

export function computeOrderItemStatus(
  requestedQty: Prisma.Decimal,
  fulfilledQty: Prisma.Decimal,
): 'pending' | 'partial' | 'fulfilled' {
  if (fulfilledQty.lte(0)) {
    return 'pending';
  }
  if (fulfilledQty.gte(requestedQty)) {
    return 'fulfilled';
  }
  return 'partial';
}

export function computeOrderStatus(
  items: ReadonlyArray<{ status: string }>,
): 'partial' | 'fulfilled' {
  if (items.length > 0 && items.every((item) => item.status === 'fulfilled')) {
    return 'fulfilled';
  }
  return 'partial';
}

export function appendCancelReasonToNotes(existingNotes: string | null, reason: string): string {
  const cleanReason = reason.trim();
  const tagged = `[Lý do hủy] ${cleanReason}`;
  if (!existingNotes || existingNotes.trim() === '') {
    return tagged;
  }
  return `${existingNotes.trim()}\n${tagged}`;
}

/**
 * Nhận diện lỗi xung đột đồng thời PostgreSQL (deadlock 40P01, serialization failure 40001, Prisma P2034)
 * để chuyển sang 409 Conflict thay vì 500 Internal Server Error.
 */
export function isPgConcurrencyConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') {
      return true;
    }
    const metaCode = typeof error.meta?.code === 'string' ? error.meta.code : '';
    const metaMessage = typeof error.meta?.message === 'string' ? error.meta.message : '';
    if (metaCode === '40P01' || metaCode === '40001') {
      return true;
    }
    if (
      metaMessage.toLowerCase().includes('deadlock detected') ||
      metaMessage.toLowerCase().includes('could not serialize access')
    ) {
      return true;
    }
  }

  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === '40P01' || candidate.code === '40001' || candidate.code === 'P2034') {
    return true;
  }
  if (typeof candidate.message === 'string') {
    const lower = candidate.message.toLowerCase();
    if (
      lower.includes('40p01') ||
      lower.includes('40001') ||
      lower.includes('deadlock detected') ||
      lower.includes('could not serialize access')
    ) {
      return true;
    }
  }

  return false;
}
