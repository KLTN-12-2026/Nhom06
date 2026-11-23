import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertCodeImmutable,
  normalizeCatalogCode,
  sumOnHandByProduct,
} from './catalog-policy';

describe('catalog-policy (domain thuần)', () => {
  it('chuẩn hóa mã danh mục: bỏ khoảng trắng và chuyển chữ in hoa', () => {
    expect(normalizeCatalogCode('  sp001 ')).toBe('SP001');
    expect(normalizeCatalogCode('ncc_01-dn')).toBe('NCC_01-DN');
  });

  it('cộng dồn tồn kho theo từng sản phẩm bằng Prisma.Decimal và trả dạng string', () => {
    const map = sumOnHandByProduct([
      { productId: 'p1', onHandQty: new Prisma.Decimal('10.500') },
      { productId: 'p1', onHandQty: new Prisma.Decimal('4.000') },
      { productId: 'p2', onHandQty: new Prisma.Decimal('0.1') },
      { productId: 'p2', onHandQty: new Prisma.Decimal('0.2') },
    ]);

    expect(map.get('p1')).toBe('14.5');
    expect(map.get('p2')).toBe('0.3');
    expect(map.get('p-empty')).toBeUndefined();
  });

  it('cho phép PATCH không gửi code hoặc gửi cùng code (không phân biệt hoa thường), nhưng ném 400 nếu gửi code khác', () => {
    expect(() => assertCodeImmutable('SP001', undefined)).not.toThrow();
    expect(() => assertCodeImmutable('SP001', 'sp001')).not.toThrow();
    expect(() => assertCodeImmutable('SP001', '  SP001 ')).not.toThrow();

    try {
      assertCodeImmutable('SP001', 'SP999');
      fail('Phải ném BadRequestException khi gửi mã khác');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string;
        errors?: Array<{ field: string; message: string }>;
      };
      expect(response.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'code' })]),
      );
    }
  });
});
