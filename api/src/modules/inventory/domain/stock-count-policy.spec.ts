import { Prisma } from '@prisma/client';
import {
  appendCancelReasonToNote,
  buildNextStockCountNo,
  buildStockCountNoPrefix,
  LotSnapshotForCount,
  parseCountedQty,
  sortStockCountItemsForLocking,
  summarizeStockCountItems,
  validateStockCountItems,
} from './stock-count-policy';

describe('stock-count-policy (hàm thuần kiểm kê theo D-024)', () => {
  describe('parseCountedQty', () => {
    it('chấp nhận 0 và số dương có tối đa 3 chữ số thập phân', () => {
      expect(parseCountedQty('0')?.toString()).toBe('0');
      expect(parseCountedQty('15.250')?.toString()).toBe('15.25');
      expect(parseCountedQty(8)?.toString()).toBe('8');
    });

    it('từ chối số âm, quá 3 chữ số thập phân hoặc chuỗi không hợp lệ', () => {
      expect(parseCountedQty('-1')).toBeNull();
      expect(parseCountedQty('-0.001')).toBeNull();
      expect(parseCountedQty('1.1234')).toBeNull();
      expect(parseCountedQty('abc')).toBeNull();
    });
  });

  describe('buildNextStockCountNo', () => {
    it('sinh số phiếu kiểm kê KK+YYMMDD+4 chữ số tăng dần', () => {
      expect(buildStockCountNoPrefix('2026-11-23')).toBe('KK261123');
      expect(buildNextStockCountNo('2026-11-23', null)).toBe('KK2611230001');
      expect(buildNextStockCountNo('2026-11-23', 'KK2611230009')).toBe('KK2611230010');
      expect(buildNextStockCountNo('2026-11-23', 'KK2611220099')).toBe('KK2611230001');
    });
  });

  describe('validateStockCountItems (AC3)', () => {
    const snapshots = new Map<string, LotSnapshotForCount>([
      [
        'lot-a',
        { lotId: 'lot-a', status: 'active', systemQty: new Prisma.Decimal('10') },
      ],
      [
        'lot-b',
        { lotId: 'lot-b', status: 'blocked', systemQty: new Prisma.Decimal('5.5') },
      ],
      [
        'lot-closed',
        { lotId: 'lot-closed', status: 'closed', systemQty: new Prisma.Decimal('0') },
      ],
    ]);

    it('chấp nhận lô không lệch không cần lý do và lô lệch có lý do (kể cả lô blocked)', () => {
      const result = validateStockCountItems(
        [
          { lotId: 'lot-a', countedQty: '8', reason: 'Hư hỏng 2 thùng khi kiểm đếm' },
          { lotId: 'lot-b', countedQty: '5.5' },
        ],
        snapshots,
      );

      expect(result.errors).toEqual([]);
      expect(result.validItems).toHaveLength(2);
      expect(result.validItems[0].varianceQty.toString()).toBe('-2');
      expect(result.validItems[1].varianceQty.toString()).toBe('0');
      expect(result.validItems[1].reason).toBeNull();
    });

    it('từ chối khi phiếu không có dòng nào', () => {
      const result = validateStockCountItems([], snapshots);
      expect(result.validItems).toEqual([]);
      expect(result.errors).toEqual([
        { field: 'items', message: 'Phiếu kiểm kê phải có ít nhất 1 dòng lô hàng' },
      ]);
    });

    it('từ chối khi chênh lệch khác 0 nhưng thiếu lý do', () => {
      const result = validateStockCountItems(
        [{ lotId: 'lot-a', countedQty: '8', reason: '   ' }],
        snapshots,
      );
      expect(result.validItems).toEqual([]);
      expect(result.errors).toContainEqual({
        field: 'items.0.reason',
        message: 'Bắt buộc nhập lý do khi số đếm chênh lệch với tồn hệ thống',
      });
    });

    it('từ chối countedQty âm, trùng lô, lô không tồn tại hoặc lô đã đóng', () => {
      const result = validateStockCountItems(
        [
          { lotId: 'lot-a', countedQty: '-2', reason: 'test' },
          { lotId: 'lot-a', countedQty: '10' },
          { lotId: 'lot-missing', countedQty: '1', reason: 'test' },
          { lotId: 'lot-closed', countedQty: '0' },
        ],
        snapshots,
      );
      expect(result.validItems).toEqual([]);
      expect(result.errors.map((e) => e.field)).toEqual(
        expect.arrayContaining([
          'items.0.countedQty',
          'items.1.lotId',
          'items.2.lotId',
          'items.3.lotId',
        ]),
      );
    });
  });

  describe('sortStockCountItemsForLocking & summarizeStockCountItems', () => {
    it('sắp xếp ổn định theo lotId tăng dần và tính tổng chênh lệch bằng Decimal', () => {
      const sorted = sortStockCountItemsForLocking([
        { lotId: 'lot-c', varianceQty: new Prisma.Decimal('3.25') },
        { lotId: 'lot-a', varianceQty: new Prisma.Decimal('-2') },
        { lotId: 'lot-b', varianceQty: new Prisma.Decimal('0') },
      ]);

      expect(sorted.map((item) => item.lotId)).toEqual(['lot-a', 'lot-b', 'lot-c']);
      expect(summarizeStockCountItems(sorted)).toEqual({
        lineCount: 3,
        discrepancyCount: 2,
        totalVarianceQty: '1.25',
      });
    });
  });

  describe('appendCancelReasonToNote', () => {
    it('nối lý do hủy vào ghi chú hiện có mà không làm mất ghi chú gốc', () => {
      expect(appendCancelReasonToNote(null, 'Đếm nhầm kho')).toBe('[Lý do hủy] Đếm nhầm kho');
      expect(appendCancelReasonToNote('Kiểm kê định kỳ', 'Hủy để lập lại')).toBe(
        'Kiểm kê định kỳ\n[Lý do hủy] Hủy để lập lại',
      );
    });
  });
});
