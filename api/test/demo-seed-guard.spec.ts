import { PRODUCTS } from '../prisma/seed/catalog';
import { assertDemoSeedAllowed, parseDemoSeedCliArgs } from '../prisma/seed/demo-guard';
import { buildDemoPlan, computeMedian } from '../prisma/seed/demo-plan';
import { diffCalendarDays } from '../src/modules/expiry/domain/vn-date';

const SHELF_LIFE_BY_CODE = new Map(PRODUCTS.map((p) => [p.code, p.shelfLifeDays]));

describe('Demo seed guard & kế hoạch neo ngày hiện tại (T-017 + T-025)', () => {
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

  describe('buildDemoPlan — rải ngày nhận theo shelf_life_days, xuất FEFO và cân bằng 12 tháng (T-025)', () => {
    const anchorDates = [
      '2026-11-26',
      '2026-12-01',
      '2026-12-10',
      '2026-12-20',
      '2026-12-31',
      '2027-01-15',
    ];

    for (const anchorDate of anchorDates) {
      it(`D=${anchorDate}: giữ bức tranh 40 lô, đúng shelf_life_days, 0 vi phạm FEFO và phân bố 12 tháng trong ±40%`, () => {
        const plan = buildDemoPlan(anchorDate);

        expect(plan.anchorDate).toBe(anchorDate);
        expect(plan.monthKeys).toHaveLength(12);
        expect(plan.monthKeys[11]).toBe(anchorDate.slice(0, 7));

        // 1. Kiểm 40 lô còn hàng, bảo toàn mã lô trọng yếu (T-027 đang dùng) và khớp shelf_life_days
        expect(plan.activeLots).toHaveLength(40);
        const activeCodeSet = new Set(plan.activeLots.map((l) => l.lotCode));
        for (const requiredCode of [
          'DEMO-SP002-EXP1',
          'DEMO-SP002-EXP2',
          'DEMO-SP002-EXP3',
          'DEMO-SP002-EXP4',
          'DEMO-SP002-NEAR',
          'DEMO-SP004-NEAR',
          'DEMO-SP007-NEAR',
        ]) {
          expect(activeCodeSet.has(requiredCode)).toBe(true);
        }

        const lotKeys = new Set<string>();
        for (const lot of plan.activeLots) {
          const shelfLife = SHELF_LIFE_BY_CODE.get(lot.productCode);
          expect(shelfLife).toBeDefined();
          expect(lot.receiptDate >= plan.firstHistoryDate).toBe(true);
          expect(lot.receiptDate <= anchorDate).toBe(true);
          expect(lot.manufacturedDate < lot.receiptDate).toBe(true);
          expect(lot.expiryDate > lot.receiptDate).toBe(true);
          expect(diffCalendarDays(lot.expiryDate, lot.manufacturedDate)).toBe(shelfLife);
          const transitLag = diffCalendarDays(lot.receiptDate, lot.manufacturedDate);
          expect(transitLag).toBeGreaterThanOrEqual(2);
          expect(transitLag).toBeLessThanOrEqual(15);
          expect(lot.unitCost).toBeGreaterThan(0);
          expect(lot.initialQuantity).toBeGreaterThan(0);
          expect(lot.quantity).toBeGreaterThan(0);
          const key = `${lot.productCode}::${lot.lotCode}`;
          expect(lotKeys.has(key)).toBe(false);
          lotKeys.add(key);
        }

        // Các lô còn hàng phải được rải qua ít nhất 6 tháng khác nhau (không dồn cục vào tháng cuối)
        const distinctReceiptMonths = new Set(plan.activeLots.map((l) => l.receiptDate.slice(0, 7)));
        expect(distinctReceiptMonths.size).toBeGreaterThanOrEqual(6);

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
        expect(sp007Near[0].quantity).toBeGreaterThanOrEqual(500);

        // 33 lô hạn dài (> 45 ngày nhóm Sữa, > 30 ngày nhóm khác)
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

        // 2. Mô phỏng dòng thời gian theo đúng thứ tự occurredAt tăng dần & xác minh 0 vi phạm FEFO
        expect(plan.timeline.length).toBeGreaterThan(0);
        const stock = new Map<
          string,
          { productCode: string; lotCode: string; qty: number; expiryDate: string; receiptDate: string }
        >();
        const monthlyInbound = new Map<string, number>(plan.monthKeys.map((mk) => [mk, 0]));
        const monthlyOutbound = new Map<string, number>(plan.monthKeys.map((mk) => [mk, 0]));
        const consumedActiveLots = new Set<string>();

        let prevOccurredAtMs = -Infinity;
        for (const event of plan.timeline) {
          const currentMs = new Date(event.occurredAtIso).getTime();
          expect(currentMs).toBeGreaterThanOrEqual(prevOccurredAtMs);
          prevOccurredAtMs = currentMs;
          expect(event.date <= anchorDate).toBe(true);

          const monthKey = event.date.slice(0, 7);

          if (event.kind === 'INBOUND') {
            for (const item of event.items) {
              const shelfLife = SHELF_LIFE_BY_CODE.get(item.productCode)!;
              expect(diffCalendarDays(item.expiryDate, item.manufacturedDate)).toBe(shelfLife);
              expect(item.manufacturedDate < event.date).toBe(true);
              expect(item.expiryDate > event.date).toBe(true);

              const key = `${item.productCode}::${item.lotCode}`;
              expect(stock.has(key)).toBe(false);
              stock.set(key, {
                productCode: item.productCode,
                lotCode: item.lotCode,
                qty: item.quantity,
                expiryDate: item.expiryDate,
                receiptDate: event.date,
              });
              if (monthlyInbound.has(monthKey)) {
                monthlyInbound.set(monthKey, monthlyInbound.get(monthKey)! + item.quantity);
              }
            }
          } else if (event.kind === 'OUTBOUND' || event.kind === 'PARTIAL_ORDER') {
            const shipList = event.kind === 'OUTBOUND' ? event.items : event.shippedItems;
            for (const ship of shipList) {
              const eligible = Array.from(stock.values())
                .filter(
                  (lot) =>
                    lot.productCode === ship.productCode &&
                    lot.qty > 0 &&
                    diffCalendarDays(lot.expiryDate, event.date) >= 7,
                )
                .sort(
                  (a, b) =>
                    a.expiryDate.localeCompare(b.expiryDate) ||
                    a.receiptDate.localeCompare(b.receiptDate) ||
                    a.lotCode.localeCompare(b.lotCode),
                );
              expect(eligible.length).toBeGreaterThan(0);
              // Bắt buộc chọn đúng lô đứng đầu FEFO (0 vi phạm FEFO)
              expect(eligible[0].lotCode).toBe(ship.lotCode);

              const target = stock.get(`${ship.productCode}::${ship.lotCode}`)!;
              expect(target.qty).toBeGreaterThanOrEqual(ship.quantity);
              target.qty -= ship.quantity;
              if (activeCodeSet.has(ship.lotCode) && event.kind === 'OUTBOUND') {
                consumedActiveLots.add(ship.lotCode);
              }
              if (monthlyOutbound.has(monthKey)) {
                monthlyOutbound.set(monthKey, monthlyOutbound.get(monthKey)! + ship.quantity);
              }
            }
          } else if (event.kind === 'STOCK_COUNT') {
            for (const item of event.items) {
              const target = stock.get(`${item.productCode}::${item.lotCode}`);
              expect(target).toBeDefined();
              if (item.lotCode === 'DEMO-SP001-L1') {
                expect(item.countedQty).toBe(target!.qty - 5);
              } else {
                expect(item.countedQty).toBe(target!.qty);
              }
              target!.qty = item.countedQty;
            }
          }
        }

        // Lịch sử xuất phải thực sự tiêu từ các lô còn tồn theo FEFO
        expect(consumedActiveLots.size).toBeGreaterThanOrEqual(15);

        // Kết thúc dòng thời gian: mọi lô HIST đều về tồn 0, đúng 40 lô DEMO còn tồn dương và khớp target
        const remainingLots = Array.from(stock.values()).filter((l) => l.qty > 0);
        expect(remainingLots).toHaveLength(40);
        for (const expectedLot of plan.activeLots) {
          const actual = stock.get(`${expectedLot.productCode}::${expectedLot.lotCode}`);
          expect(actual?.qty).toBe(expectedLot.quantity);
        }

        // 3. Kiểm phân bố nhập & xuất 12 tháng:
        //    - 11 tháng đã kết thúc (0..10): nằm trong ±40% trung vị 12 tháng (mục tiêu biên an toàn)
        //    - Tháng hiện tại (11): > 0 và <= +40% trung vị (ngoại lệ cận dưới khi chưa hết tháng)
        const inboundValues = plan.monthKeys.map((mk) => monthlyInbound.get(mk)!);
        const outboundValues = plan.monthKeys.map((mk) => monthlyOutbound.get(mk)!);
        const medianIn = computeMedian(inboundValues);
        const medianOut = computeMedian(outboundValues);

        expect(medianIn).toBeGreaterThan(0);
        expect(medianOut).toBeGreaterThan(0);

        for (let idx = 0; idx < 11; idx += 1) {
          expect(inboundValues[idx]).toBeGreaterThanOrEqual(medianIn * 0.6);
          expect(inboundValues[idx]).toBeLessThanOrEqual(medianIn * 1.4);
          expect(outboundValues[idx]).toBeGreaterThanOrEqual(medianOut * 0.6);
          expect(outboundValues[idx]).toBeLessThanOrEqual(medianOut * 1.4);
        }

        expect(inboundValues[11]).toBeGreaterThan(0);
        expect(inboundValues[11]).toBeLessThanOrEqual(medianIn * 1.4);
        expect(outboundValues[11]).toBeGreaterThan(0);
        expect(outboundValues[11]).toBeLessThanOrEqual(medianOut * 1.4);

        // Với mốc cuối tháng (như 2026-11-26, 2026-12-31) hoặc tuần bảo vệ (2026-12-20), cả tháng hiện tại cũng nằm trong ±40%
        if (anchorDate === '2026-11-26' || anchorDate === '2026-12-20' || anchorDate === '2026-12-31') {
          expect(inboundValues[11]).toBeGreaterThanOrEqual(medianIn * 0.6);
          expect(outboundValues[11]).toBeGreaterThanOrEqual(medianOut * 0.6);
        }

        // 3 đơn chờ xuất (confirmed) + 1 đơn xuất một phần (partial)
        expect(plan.pendingOrders).toHaveLength(3);
        expect(plan.partialOrder.shippedItems.length).toBeGreaterThan(0);
      });
    }
  });
});
