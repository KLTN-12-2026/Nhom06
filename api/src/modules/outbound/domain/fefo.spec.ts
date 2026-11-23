import { Prisma } from '@prisma/client';
import {
  checkLotDeliveryEligibility,
  detectFefoBypassWarnings,
  FefoLotInput,
  planFefo,
} from './fefo';

const TODAY = '2026-11-23';
const MIN_DELIVERY_DAYS = 7;

function makeLot(overrides: Partial<FefoLotInput> & { id: string; lotCode: string }): FefoLotInput {
  return {
    expiryDate: '2027-01-01',
    receivedAt: '2026-11-01',
    status: 'active',
    onHandQty: new Prisma.Decimal('100'),
    ...overrides,
  };
}

describe('FEFO domain — checkLotDeliveryEligibility & planFefo (AC1)', () => {
  it('lọc lô hết hạn, blocked, tồn 0 và dưới min_delivery_days TRƯỚC khi sắp xếp và trả đúng lý do', () => {
    const lots: FefoLotInput[] = [
      // Hết hạn (daysRemaining = -1) — HSD sớm nhất nhưng phải bị loại trước
      makeLot({
        id: 'lot-expired',
        lotCode: 'L-EXP',
        expiryDate: '2026-11-22',
        onHandQty: '50',
      }),
      // Dưới min_delivery_days (daysRemaining = 6 < 7)
      makeLot({
        id: 'lot-short',
        lotCode: 'L-SHORT',
        expiryDate: '2026-11-29',
        onHandQty: '40',
      }),
      // Đúng ngày hôm nay nhưng min_delivery_days = 7 (daysRemaining = 0 < 7)
      makeLot({
        id: 'lot-today',
        lotCode: 'L-TODAY',
        expiryDate: '2026-11-23',
        onHandQty: '25',
      }),
      // Bị khóa (blocked) dù HSD còn rất dài
      makeLot({
        id: 'lot-blocked',
        lotCode: 'L-BLK',
        expiryDate: '2027-02-01',
        status: 'blocked',
        onHandQty: '80',
      }),
      // Tồn bằng 0 dù trạng thái active và HSD dài
      makeLot({
        id: 'lot-zero',
        lotCode: 'L-ZERO',
        expiryDate: '2027-03-01',
        onHandQty: '0',
      }),
      // Hợp lệ đúng biên min_delivery_days (daysRemaining = 7 === 7)
      makeLot({
        id: 'lot-border-ok',
        lotCode: 'L-OK-1',
        expiryDate: '2026-11-30',
        onHandQty: '30',
      }),
      // Hợp lệ HSD xa hơn
      makeLot({
        id: 'lot-later-ok',
        lotCode: 'L-OK-2',
        expiryDate: '2026-12-15',
        onHandQty: '50',
      }),
    ];

    const plan = planFefo(lots, new Prisma.Decimal('45'), TODAY, MIN_DELIVERY_DAYS);

    expect(plan.eligible).toHaveLength(2);
    expect(plan.eligible.map((item) => item.lot.lotCode)).toEqual(['L-OK-1', 'L-OK-2']);
    expect(plan.eligible.map((item) => item.rank)).toEqual([1, 2]);
    expect(plan.eligible.map((item) => item.allocateQty.toString())).toEqual(['30', '15']);
    expect(plan.allocatedQty.toString()).toBe('45');
    expect(plan.shortageQty.toString()).toBe('0');

    expect(plan.excluded).toHaveLength(5);
    const reasonByCode = new Map(plan.excluded.map((e) => [e.lot.lotCode, e.reason]));
    expect(reasonByCode.get('L-EXP')).toBe('Đã hết hạn');
    expect(reasonByCode.get('L-BLK')).toBe('Lô bị khóa');
    expect(reasonByCode.get('L-ZERO')).toBe('Hết tồn');
    expect(reasonByCode.get('L-SHORT')).toBe(
      'Không đủ hạn dùng tối thiểu khi giao (còn 6 ngày < 7)',
    );
    expect(reasonByCode.get('L-TODAY')).toBe(
      'Không đủ hạn dùng tối thiểu khi giao (còn 0 ngày < 7)',
    );
  });

  it('biên minDeliveryDays = 0: cho phép lô còn 0 ngày (HSD = hôm nay) nhưng vẫn loại lô đã hết hạn (HSD < hôm nay)', () => {
    const todayLot = makeLot({ id: 'l1', lotCode: 'L1', expiryDate: TODAY, onHandQty: '10' });
    const yesterdayLot = makeLot({
      id: 'l2',
      lotCode: 'L2',
      expiryDate: '2026-11-22',
      onHandQty: '10',
    });

    const todayCheck = checkLotDeliveryEligibility(todayLot, TODAY, 0);
    expect(todayCheck.eligible).toBe(true);
    expect(todayCheck.daysRemaining).toBe(0);

    const yesterdayCheck = checkLotDeliveryEligibility(yesterdayLot, TODAY, 0);
    expect(yesterdayCheck.eligible).toBe(false);
    if (!yesterdayCheck.eligible) {
      expect(yesterdayCheck.reason).toBe('Đã hết hạn');
    }
  });

  it('sắp xếp HSD tăng dần; cùng HSD thì receivedAt tăng dần; cùng cả hai thì lotCode tăng dần', () => {
    const lots: FefoLotInput[] = [
      makeLot({
        id: 'l-later',
        lotCode: 'L-DEC',
        expiryDate: '2026-12-20',
        receivedAt: '2026-10-01',
        onHandQty: '100',
      }),
      makeLot({
        id: 'l-tie-b',
        lotCode: 'L-B',
        expiryDate: '2026-12-10',
        receivedAt: '2026-11-05',
        onHandQty: '10',
      }),
      makeLot({
        id: 'l-tie-a',
        lotCode: 'L-A',
        expiryDate: '2026-12-10',
        receivedAt: '2026-11-05',
        onHandQty: '10',
      }),
      makeLot({
        id: 'l-tie-earlier-recv',
        lotCode: 'L-Z',
        expiryDate: '2026-12-10',
        receivedAt: '2026-11-01',
        onHandQty: '15',
      }),
    ];

    const plan = planFefo(lots, '30', TODAY, MIN_DELIVERY_DAYS);

    expect(plan.eligible.map((item) => item.lot.lotCode)).toEqual([
      'L-Z',
      'L-A',
      'L-B',
      'L-DEC',
    ]);
    expect(plan.eligible.map((item) => item.rank)).toEqual([1, 2, 3, 4]);
    expect(plan.eligible.map((item) => item.allocateQty.toString())).toEqual(['15', '10', '5', '0']);
    expect(plan.allocatedQty.toString()).toBe('30');
    expect(plan.shortageQty.toString()).toBe('0');
  });

  it('rót lần lượt nhiều lô với số thập phân chính xác bằng Decimal và tính shortageQty khi thiếu hàng', () => {
    const lots: FefoLotInput[] = [
      makeLot({ id: 'l1', lotCode: 'L1', expiryDate: '2026-12-05', onHandQty: '12.5' }),
      makeLot({ id: 'l2', lotCode: 'L2', expiryDate: '2026-12-10', onHandQty: '17.25' }),
      makeLot({ id: 'l3', lotCode: 'L3', expiryDate: '2026-12-20', onHandQty: '20.25' }),
    ];

    const plan = planFefo(lots, new Prisma.Decimal('80'), TODAY, MIN_DELIVERY_DAYS);

    expect(plan.eligible.map((e) => e.allocateQty.toString())).toEqual(['12.5', '17.25', '20.25']);
    expect(plan.allocatedQty.toString()).toBe('50');
    expect(plan.shortageQty.toString()).toBe('30');
  });

  it('không có lô hợp lệ → allocatedQty = 0, shortageQty = requestedQty, không phân bổ lô sai', () => {
    const lots: FefoLotInput[] = [
      makeLot({ id: 'l1', lotCode: 'L1', expiryDate: '2026-11-20', onHandQty: '200' }),
      makeLot({ id: 'l2', lotCode: 'L2', expiryDate: '2026-11-28', onHandQty: '150' }),
      makeLot({
        id: 'l3',
        lotCode: 'L3',
        expiryDate: '2027-01-01',
        status: 'blocked',
        onHandQty: '300',
      }),
    ];

    const plan = planFefo(lots, '50', TODAY, MIN_DELIVERY_DAYS);

    expect(plan.eligible).toHaveLength(0);
    expect(plan.excluded).toHaveLength(3);
    expect(plan.allocatedQty.toString()).toBe('0');
    expect(plan.shortageQty.toString()).toBe('50');
  });

  it('detectFefoBypassWarnings: cảnh báo khi chọn lô hạn xa hơn trong khi lô hạn sớm hơn còn tồn, rỗng khi tuân thủ FEFO', () => {
    const sortedLots = [
      makeLot({ id: 'l1', lotCode: 'L-EARLY', expiryDate: '2026-12-05', onHandQty: '40' }),
      makeLot({ id: 'l2', lotCode: 'L-LATE', expiryDate: '2026-12-25', onHandQty: '60' }),
    ];

    // Tuân thủ FEFO: rút hết L-EARLY (40) rồi mới rút L-LATE (10)
    const okWarnings = detectFefoBypassWarnings(
      sortedLots,
      new Map([
        ['l1', new Prisma.Decimal('40')],
        ['l2', new Prisma.Decimal('10')],
      ]),
      { orderItemId: 'oi-1', productId: 'p-1', productCode: 'SP001' },
    );
    expect(okWarnings).toHaveLength(0);

    // Bỏ qua FEFO: chỉ lấy 10 từ L-EARLY (còn 30) nhưng lại lấy 20 từ L-LATE
    const bypassWarnings = detectFefoBypassWarnings(
      sortedLots,
      new Map([
        ['l1', new Prisma.Decimal('10')],
        ['l2', new Prisma.Decimal('20')],
      ]),
      { orderItemId: 'oi-1', productId: 'p-1', productCode: 'SP001' },
    );
    expect(bypassWarnings).toHaveLength(1);
    expect(bypassWarnings[0]).toMatchObject({
      code: 'FEFO_ORDER_BYPASSED',
      lotId: 'l2',
      lotCode: 'L-LATE',
      earlierLotId: 'l1',
      earlierLotCode: 'L-EARLY',
    });
  });
});
