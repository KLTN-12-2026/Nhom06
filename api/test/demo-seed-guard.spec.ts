import { assertDemoSeedAllowed, parseDemoSeedCliArgs } from '../prisma/seed/demo-guard';
import { buildDemoPlan } from '../prisma/seed/demo-plan';
import { diffCalendarDays } from '../src/modules/expiry/domain/vn-date';

describe('Demo seed guard & kế hoạch neo ngày hiện tại (T-017 AC1, AC3, AC4)', () => {
  describe('assertDemoSeedAllowed (AC4)', () => {
    it('từ chối chạy khi NODE_ENV=production kể cả khi ALLOW_DEMO_SEED=true', () => {
      expect(() =>
        assertDemoSeedAllowed({
          NODE_ENV: 'production',
          ALLOW_DEMO_SEED: 'true',
        }),
      ).toThrow(/production/i);

      expect(() =>
        assertDemoSeedAllowed({
          NODE_ENV: 'PRODUCTION',
          ALLOW_DEMO_SEED: 'true',
        }),
      ).toThrow(/production/i);
    });

    it('từ chối chạy khi ALLOW_DEMO_SEED không được bật đúng chuỗi "true"', () => {
      expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development' })).toThrow(/ALLOW_DEMO_SEED/);
      expect(() =>
        assertDemoSeedAllowed({ NODE_ENV: 'development', ALLOW_DEMO_SEED: 'false' }),
      ).toThrow(/ALLOW_DEMO_SEED/);
      expect(() =>
        assertDemoSeedAllowed({ NODE_ENV: 'development', ALLOW_DEMO_SEED: '1' }),
      ).toThrow(/ALLOW_DEMO_SEED/);
      expect(() =>
        assertDemoSeedAllowed({ NODE_ENV: 'development', ALLOW_DEMO_SEED: 'TRUE' }),
      ).toThrow(/ALLOW_DEMO_SEED/);
    });

    it('cho phép chạy trên môi trường dev/test khi ALLOW_DEMO_SEED=true', () => {
      expect(() =>
        assertDemoSeedAllowed({ NODE_ENV: 'development', ALLOW_DEMO_SEED: 'true' }),
      ).not.toThrow();
      expect(() =>
        assertDemoSeedAllowed({ NODE_ENV: 'test', ALLOW_DEMO_SEED: 'true' }),
      ).not.toThrow();
      expect(() => assertDemoSeedAllowed({ ALLOW_DEMO_SEED: 'true' })).not.toThrow();
    });
  });

  describe('parseDemoSeedCliArgs', () => {
    it('nhận diện đúng cờ --reset', () => {
      expect(parseDemoSeedCliArgs([])).toEqual({ reset: false });
      expect(parseDemoSeedCliArgs(['--reset'])).toEqual({ reset: true });
      expect(parseDemoSeedCliArgs(['--', '--reset'])).toEqual({ reset: true });
    });
  });

  describe('buildDemoPlan — neo ngày hiện tại cho cả hôm nay, tuần bảo vệ và đầu tháng', () => {
    const anchorDates = ['2026-11-23', '2026-12-20', '2026-12-01'];

    for (const anchorDate of anchorDates) {
      it(`sinh đúng bức tranh 40 lô, 12 tháng lịch sử và đơn chờ cho ngày gốc D=${anchorDate}`, () => {
        const plan = buildDemoPlan(anchorDate);

        expect(plan.anchorDate).toBe(anchorDate);
        expect(plan.monthKeys).toHaveLength(12);
        expect(plan.monthKeys[11]).toBe(anchorDate.slice(0, 7));

        // 12 tháng lịch sử × 2 đợt/tháng = 24 lượt nhập–xuất
        expect(plan.historicalCycles).toHaveLength(24);
        for (const cycle of plan.historicalCycles) {
          expect(cycle.inboundDate <= anchorDate).toBe(true);
          expect(cycle.outboundDate <= anchorDate).toBe(true);
          expect(cycle.outboundDate >= cycle.inboundDate).toBe(true);
          expect(cycle.inboundDate.slice(0, 7)).toBe(cycle.monthKey);
          expect(cycle.outboundDate.slice(0, 7)).toBe(cycle.monthKey);
          for (const item of cycle.items) {
            expect(item.expiryDate > cycle.outboundDate).toBe(true);
            expect(diffCalendarDays(item.expiryDate, cycle.outboundDate)).toBeGreaterThanOrEqual(7);
          }
        }

        // Đúng 40 lô còn hàng, tất cả có unitCost > 0 và expiryDate > receiptDate
        expect(plan.activeLots).toHaveLength(40);
        const lotKeys = new Set<string>();
        for (const lot of plan.activeLots) {
          expect(lot.receiptDate <= anchorDate).toBe(true);
          expect(lot.expiryDate > lot.receiptDate).toBe(true);
          expect(lot.unitCost).toBeGreaterThan(0);
          expect(lot.quantity).toBeGreaterThan(0);
          const key = `${lot.productCode}::${lot.lotCode}`;
          expect(lotKeys.has(key)).toBe(false);
          lotKeys.add(key);
        }

        // SP002: 4 lô hết hạn (quá 7–53 ngày) + 1 lô còn 8 ngày
        const sp002Expired = plan.activeLots.filter(
          (l) => l.productCode === 'SP002' && diffCalendarDays(l.expiryDate, anchorDate) < 0,
        );
        expect(sp002Expired).toHaveLength(4);
        for (const lot of sp002Expired) {
          const overdue = -diffCalendarDays(lot.expiryDate, anchorDate);
          expect(overdue).toBeGreaterThanOrEqual(7);
          expect(overdue).toBeLessThanOrEqual(53);
        }

        const sp002Near = plan.activeLots.filter(
          (l) => l.productCode === 'SP002' && diffCalendarDays(l.expiryDate, anchorDate) === 8,
        );
        expect(sp002Near).toHaveLength(1);

        // SP004 & SP007: mỗi sản phẩm 1 lô còn đúng 20 ngày
        const sp004Near = plan.activeLots.filter(
          (l) => l.productCode === 'SP004' && diffCalendarDays(l.expiryDate, anchorDate) === 20,
        );
        expect(sp004Near).toHaveLength(1);
        expect(sp004Near[0].quantity).toBeGreaterThanOrEqual(500);

        const sp007Near = plan.activeLots.filter(
          (l) => l.productCode === 'SP007' && diffCalendarDays(l.expiryDate, anchorDate) === 20,
        );
        expect(sp007Near).toHaveLength(1);

        // Các lô còn lại (33 lô) đều hạn dài (> 30 ngày cho nhóm chung, > 45 ngày cho nhóm SUA)
        const otherLots = plan.activeLots.filter(
          (l) =>
            !sp002Expired.includes(l) &&
            !sp002Near.includes(l) &&
            !sp004Near.includes(l) &&
            !sp007Near.includes(l),
        );
        expect(otherLots).toHaveLength(33);
        for (const lot of otherLots) {
          const daysRemaining = diffCalendarDays(lot.expiryDate, anchorDate);
          const isMilkGroup = ['SP001', 'SP002', 'SP003', 'SP004', 'SP005'].includes(
            lot.productCode,
          );
          expect(daysRemaining).toBeGreaterThan(isMilkGroup ? 45 : 30);
        }

        // 3 đơn chờ xuất (confirmed) + 1 đơn xuất một phần (partial)
        expect(plan.pendingOrders).toHaveLength(3);
        expect(plan.partialOrder.shippedItems.length).toBeGreaterThan(0);
      });
    }
  });
});
