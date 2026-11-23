import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const CATALOG_CODE_REGEX = /^[A-Z0-9_-]{2,50}$/;
export const CATALOG_PHONE_REGEX = /^[0-9+\s]{8,15}$/;

export function normalizeCatalogCode(code: string): string {
  return code.trim().toUpperCase();
}

export function assertCodeImmutable(existingCode: string, incomingCode?: string): void {
  if (incomingCode === undefined) {
    return;
  }
  if (normalizeCatalogCode(incomingCode) !== existingCode) {
    throw new BadRequestException({
      message: 'Không thể thay đổi mã sau khi tạo',
      errors: [{ field: 'code', message: 'Không thể thay đổi mã sau khi tạo' }],
    });
  }
}

export interface ProductLotBalanceEntry {
  productId: string;
  onHandQty: Prisma.Decimal | string | number;
}

/**
 * Cộng dồn tồn kho hiện tại theo từng sản phẩm bằng Prisma.Decimal (không dùng float).
 * Định dạng trả ra là chuỗi số thập phân tối giản của Decimal.toString() (vd: "14.5", "0").
 */
export function sumOnHandByProduct(
  balances: readonly ProductLotBalanceEntry[],
): Map<string, string> {
  const totals = new Map<string, Prisma.Decimal>();

  for (const row of balances) {
    const current = totals.get(row.productId) ?? new Prisma.Decimal(0);
    totals.set(row.productId, current.add(new Prisma.Decimal(row.onHandQty)));
  }

  const formatted = new Map<string, string>();
  for (const [productId, total] of totals.entries()) {
    formatted.set(productId, total.toString());
  }
  return formatted;
}
