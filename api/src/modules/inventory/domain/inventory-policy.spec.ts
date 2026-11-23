import { Prisma } from '@prisma/client';
import {
  buildMovementSourceUrl,
  buildVnDayRangeUtc,
  InventoryLotForSummary,
  matchesExpiryStatusFilter,
  sortInventoryLots,
  summarizeInventoryLots,
} from './inventory-policy';

describe('inventory-policy (hàm thuần tồn theo lô & lịch sử biến động)', () => {
  describe('matchesExpiryStatusFilter', () => {
    it('không truyền bộ lọc thì khớp mọi tình trạng', () => {
      expect(matchesExpiryStatusFilter('expired')).toBe(true);
      expect(matchesExpiryStatusFilter('critical')).toBe(true);
      expect(matchesExpiryStatusFilter('warning')).toBe(true);
      expect(matchesExpiryStatusFilter('normal')).toBe(true);
    });

    it('bộ lọc near_expiry gộp đúng critical và warning, loại expired và normal', () => {
      expect(matchesExpiryStatusFilter('critical', 'near_expiry')).toBe(true);
      expect(matchesExpiryStatusFilter('warning', 'near_expiry')).toBe(true);
      expect(matchesExpiryStatusFilter('expired', 'near_expiry')).toBe(false);
      expect(matchesExpiryStatusFilter('normal', 'near_expiry')).toBe(false);
    });

    it('bộ lọc chi tiết chỉ khớp đúng mức tương ứng', () => {
      expect(matchesExpiryStatusFilter('expired', 'expired')).toBe(true);
      expect(matchesExpiryStatusFilter('critical', 'expired')).toBe(false);
      expect(matchesExpiryStatusFilter('critical', 'critical')).toBe(true);
      expect(matchesExpiryStatusFilter('warning', 'warning')).toBe(true);
      expect(matchesExpiryStatusFilter('normal', 'normal')).toBe(true);
    });
  });

  describe('sortInventoryLots', () => {
    it('sắp xếp theo mã sản phẩm tăng dần, rồi HSD tăng dần, hòa HSD thì theo ngày nhập rồi mã lô', () => {
      const sorted = sortInventoryLots([
        {
          lotCode: 'L2',
          expiryDate: '2027-01-10',
          receivedAt: '2026-11-05',
          product: { code: 'SP002' },
        },
        {
          lotCode: 'L3',
          expiryDate: '2027-01-10',
          receivedAt: '2026-11-02',
          product: { code: 'SP001' },
        },
        {
          lotCode: 'L1',
          expiryDate: '2027-01-10',
          receivedAt: '2026-11-01',
          product: { code: 'SP001' },
        },
        {
          lotCode: 'L0',
          expiryDate: '2026-12-01',
          receivedAt: '2026-11-10',
          product: { code: 'SP001' },
        },
      ]);

      expect(sorted.map((item) => `${item.product.code}:${item.lotCode}`)).toEqual([
        'SP001:L0',
        'SP001:L1',
        'SP001:L3',
        'SP002:L2',
      ]);
    });
  });

  describe('summarizeInventoryLots (PB15 AC2)', () => {
    it('tính tổng sản phẩm bằng tổng các lô bằng Decimal không sai số float', () => {
      const group = { id: 'g1', code: 'SUA', name: 'Sữa' };
      const lots: InventoryLotForSummary[] = [
        {
          lotId: 'l1',
          lotCode: 'L001',
          expiryDate: '2027-01-01',
          receivedAt: '2026-11-01',
          onHandQty: new Prisma.Decimal('0.100'),
          product: { id: 'p2', code: 'SP002', name: 'Sữa chua', unit: 'Lốc', group },
        },
        {
          lotId: 'l2',
          lotCode: 'L002',
          expiryDate: '2027-02-01',
          receivedAt: '2026-11-02',
          onHandQty: new Prisma.Decimal('0.200'),
          product: { id: 'p2', code: 'SP002', name: 'Sữa chua', unit: 'Lốc', group },
        },
        {
          lotId: 'l3',
          lotCode: 'L003',
          expiryDate: '2027-03-01',
          receivedAt: '2026-11-03',
          onHandQty: new Prisma.Decimal('12.345'),
          product: { id: 'p1', code: 'SP001', name: 'Sữa tươi', unit: 'Thùng', group },
        },
      ];

      const summary = summarizeInventoryLots(lots);
      expect(summary.lotCount).toBe(3);
      expect(summary.totalQty).toBe('12.645');
      expect(summary.byProduct).toHaveLength(2);
      expect(summary.byProduct[0]).toMatchObject({
        productCode: 'SP001',
        lotCount: 1,
        totalQty: '12.345',
      });
      expect(summary.byProduct[1]).toMatchObject({
        productCode: 'SP002',
        lotCount: 2,
        totalQty: '0.3',
      });
    });
  });

  describe('buildMovementSourceUrl', () => {
    it('ánh xạ đúng đường dẫn web cho phiếu nhập, phiếu xuất và phiếu kiểm kê', () => {
      expect(buildMovementSourceUrl('INBOUND_RECEIPT', 'id-1')).toBe('/inbound/id-1');
      expect(buildMovementSourceUrl('OUTBOUND_RECEIPT', 'id-2')).toBe('/outbound/id-2');
      expect(buildMovementSourceUrl('STOCK_COUNT', 'id-3')).toBe('/stock-counts/id-3');
    });
  });

  describe('buildVnDayRangeUtc', () => {
    it('tạo khoảng nửa mở UTC đúng ranh giới 00:00 múi giờ Asia/Ho_Chi_Minh (UTC+7)', () => {
      const range = buildVnDayRangeUtc('2026-11-23', '2026-11-23');
      expect(range.gte?.toISOString()).toBe('2026-11-22T17:00:00.000Z');
      expect(range.lt?.toISOString()).toBe('2026-11-23T17:00:00.000Z');

      // 23:30 VN ngày 23/11 (= 16:30 UTC ngày 23/11) nằm trong ngày 23/11
      const lateVnSameDay = new Date('2026-11-23T23:30:00+07:00');
      expect(lateVnSameDay >= range.gte! && lateVnSameDay < range.lt!).toBe(true);

      // 00:30 VN ngày 24/11 (= 17:30 UTC ngày 23/11) không nằm trong ngày 23/11
      const earlyVnNextDay = new Date('2026-11-24T00:30:00+07:00');
      expect(earlyVnNextDay >= range.gte! && earlyVnNextDay < range.lt!).toBe(false);
    });

    it('xử lý chính xác ngày cuối tháng chuyển sang tháng mới', () => {
      const range = buildVnDayRangeUtc('2026-11-30', '2026-11-30');
      expect(range.gte?.toISOString()).toBe('2026-11-29T17:00:00.000Z');
      expect(range.lt?.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    });
  });
});
