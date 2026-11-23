import { Prisma } from '@prisma/client';
import {
  buildNextReceiptNo,
  buildReceiptNoPrefix,
  checkExistingLotConflicts,
  formatUtcDate,
  groupItemsByLot,
  isValidIsoDate,
  normalizeLotCode,
  summarizeReceiptItems,
  toUtcDate,
  validateReceiptItems,
} from './inbound-policy';

describe('inbound-policy (hàm thuần domain)', () => {
  describe('normalizeLotCode', () => {
    it('chuyển in hoa và bỏ toàn bộ khoảng trắng trong mã lô', () => {
      expect(normalizeLotCode('  l2611 2207  ')).toBe('L26112207');
      expect(normalizeLotCode('lot-01_a')).toBe('LOT-01_A');
      expect(normalizeLotCode('   \t  ')).toBe('');
    });
  });

  describe('isValidIsoDate & chuyển đổi UTC Date', () => {
    it('chấp nhận ngày lịch hợp lệ và từ chối ngày không tồn tại', () => {
      expect(isValidIsoDate('2026-11-22')).toBe(true);
      expect(isValidIsoDate('2024-02-29')).toBe(true);
      expect(isValidIsoDate('2026-02-29')).toBe(false);
      expect(isValidIsoDate('2026-02-30')).toBe(false);
      expect(isValidIsoDate('22/11/2026')).toBe(false);
      expect(formatUtcDate(toUtcDate('2026-11-22'))).toBe('2026-11-22');
    });
  });

  describe('buildReceiptNoPrefix & buildNextReceiptNo', () => {
    it('sinh đúng tiền tố PNYYMMDD và số thứ tự 4 chữ số kế tiếp', () => {
      expect(buildReceiptNoPrefix('2026-11-22')).toBe('PN261122');
      expect(buildNextReceiptNo('2026-11-22', null)).toBe('PN2611220001');
      expect(buildNextReceiptNo('2026-11-22', 'PN2611220009')).toBe('PN2611220010');
      expect(buildNextReceiptNo('2026-11-22', 'PN2611229999')).toBe('PN26112210000');
    });
  });

  describe('validateReceiptItems', () => {
    const productA = '11111111-1111-4111-8111-111111111111';
    const productB = '22222222-2222-4222-8222-222222222222';

    it('từ chối phiếu không có dòng hàng nào', () => {
      const result = validateReceiptItems('2026-11-22', []);
      expect(result.validItems).toHaveLength(0);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'items' })]),
      );
    });

    it('kiểm tra số lượng, đơn giá, mã lô, HSD > ngày chứng từ và HSD > NSX', () => {
      const result = validateReceiptItems('2026-11-22', [
        {
          productId: productA,
          lotCode: '   ',
          expiryDate: '2026-11-22',
          manufacturedDate: '2026-11-22',
          quantity: '0',
          unitCost: '-100',
        },
        {
          productId: productB,
          lotCode: 'L02',
          expiryDate: '2026-12-01',
          manufacturedDate: '2026-12-05',
          quantity: '1.2345',
          unitCost: '100.123',
        },
      ]);

      const fields = result.errors.map((e) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'items.0.lotCode',
          'items.0.quantity',
          'items.0.unitCost',
          'items.0.expiryDate',
          'items.1.quantity',
          'items.1.unitCost',
          'items.1.expiryDate',
        ]),
      );
    });

    it('chặn 2 dòng cùng (productId, lotCode) khác HSD trong cùng phiếu nhưng cho phép khi cùng HSD', () => {
      const conflict = validateReceiptItems('2026-11-22', [
        {
          productId: productA,
          lotCode: 'l01',
          expiryDate: '2027-06-01',
          quantity: '10',
        },
        {
          productId: productA,
          lotCode: ' L01 ',
          expiryDate: '2027-07-01',
          quantity: '5',
        },
      ]);
      expect(conflict.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'items.1.expiryDate' })]),
      );

      const ok = validateReceiptItems('2026-11-22', [
        {
          productId: productA,
          lotCode: 'l01',
          expiryDate: '2027-06-01',
          quantity: '10.25',
          unitCost: '320000',
        },
        {
          productId: productA,
          lotCode: ' L01 ',
          expiryDate: '2027-06-01',
          quantity: '5.75',
          unitCost: '0',
        },
      ]);
      expect(ok.errors).toEqual([]);
      expect(ok.validItems).toHaveLength(2);
      expect(ok.validItems[0].lotCode).toBe('L01');
    });
  });

  describe('checkExistingLotConflicts', () => {
    const productA = '11111111-1111-4111-8111-111111111111';

    it('trả lỗi đúng thông báo khi lô đã tồn tại với HSD khác', () => {
      const { validItems } = validateReceiptItems('2026-11-22', [
        {
          productId: productA,
          lotCode: 'L01',
          expiryDate: '2027-08-01',
          quantity: '12',
        },
      ]);

      const errors = checkExistingLotConflicts(validItems, [
        {
          id: 'lot-1',
          productId: productA,
          lotCode: 'L01',
          expiryDate: '2027-06-01',
          manufacturedDate: null,
        },
      ]);

      expect(errors).toEqual([
        {
          field: 'items.0.lotCode',
          message: 'Mã lô đã tồn tại với hạn sử dụng khác',
        },
      ]);
    });

    it('cho phép tái sử dụng lô khi HSD trùng khớp', () => {
      const { validItems } = validateReceiptItems('2026-11-22', [
        {
          productId: productA,
          lotCode: 'L01',
          expiryDate: '2027-06-01',
          quantity: '12',
        },
      ]);

      const errors = checkExistingLotConflicts(validItems, [
        {
          id: 'lot-1',
          productId: productA,
          lotCode: 'L01',
          expiryDate: '2027-06-01',
          manufacturedDate: '2026-11-01',
        },
      ]);
      expect(errors).toEqual([]);
    });
  });

  describe('groupItemsByLot & summarizeReceiptItems', () => {
    it('gom dòng cùng (productId, lotCode) bằng Decimal và sắp xếp theo (productId, lotCode) để tránh deadlock', () => {
      const productA = '11111111-1111-4111-8111-111111111111';
      const productB = '22222222-2222-4222-8222-222222222222';

      const { validItems } = validateReceiptItems('2026-11-22', [
        {
          itemId: 'item-1',
          productId: productB,
          lotCode: 'L02',
          expiryDate: '2027-06-01',
          quantity: '5',
          unitCost: '100000',
        },
        {
          itemId: 'item-2',
          productId: productA,
          lotCode: 'L01',
          expiryDate: '2027-05-01',
          quantity: '10.125',
          unitCost: '200000',
        },
        {
          itemId: 'item-3',
          productId: productA,
          lotCode: 'l01',
          expiryDate: '2027-05-01',
          quantity: '4.875',
          unitCost: null,
        },
      ]);

      const groups = groupItemsByLot(validItems);
      expect(groups).toHaveLength(2);
      expect(groups[0].productId).toBe(productA);
      expect(groups[0].lotCode).toBe('L01');
      expect(groups[0].totalQuantity.toString()).toBe('15');
      expect(groups[0].itemIds).toEqual(['item-2', 'item-3']);

      expect(groups[1].productId).toBe(productB);
      expect(groups[1].totalQuantity.toString()).toBe('5');

      const summary = summarizeReceiptItems(
        validItems.map((i) => ({
          quantity: new Prisma.Decimal(i.quantity),
          unitCost: i.unitCost,
        })),
      );
      expect(summary.lineCount).toBe(3);
      expect(summary.totalQuantity).toBe('20');
      expect(summary.totalAmount).toBe('2525000');
      expect(summary.lineTotals).toEqual(['500000', '2025000', null]);
    });
  });
});
