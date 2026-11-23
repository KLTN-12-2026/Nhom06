import { Prisma } from '@prisma/client';
import {
  addCalendarDays,
  compareRiskAssessmentItems,
  computeLotRisks,
  DailyForecastPoint,
  HIGH_RISK_DAYS_THRESHOLD,
  RiskLotInput,
} from './lot-risk.domain';

const EVAL_DATE = '2026-11-23';

function buildConstantForecast(
  startDate: string,
  days: number,
  dailyQty: number,
): DailyForecastPoint[] {
  return Array.from({ length: days }, (_, idx) => ({
    date: addCalendarDays(startDate, idx),
    qty: dailyQty,
  }));
}

describe('computeLotRisks — hàm thuần tính tồn dư và rủi ro theo lô (T-013 AC1, D-025)', () => {
  it('ví dụ tay 3 lô cùng sản phẩm (HSD 10, 30, 90 ngày; tồn 50, 100, 100; nhu cầu 5/ngày; min_delivery 7)', () => {
    const lots: RiskLotInput[] = [
      // Cố tình đảo thứ tự đầu vào để kiểm tra hàm tự sắp FEFO theo expiryDate tăng dần
      {
        id: 'lot-90',
        productId: 'prod-1',
        lotCode: 'L90',
        expiryDate: addCalendarDays(EVAL_DATE, 90),
        receivedAt: '2026-11-01',
        status: 'active',
        onHandQty: '100',
      },
      {
        id: 'lot-10',
        productId: 'prod-1',
        lotCode: 'L10',
        expiryDate: addCalendarDays(EVAL_DATE, 10),
        receivedAt: '2026-10-15',
        status: 'active',
        onHandQty: '50',
      },
      {
        id: 'lot-30',
        productId: 'prod-1',
        lotCode: 'L30',
        expiryDate: addCalendarDays(EVAL_DATE, 30),
        receivedAt: '2026-10-20',
        status: 'active',
        onHandQty: '100',
      },
    ];

    const forecast = buildConstantForecast(EVAL_DATE, 60, 5);
    const results = computeLotRisks(lots, forecast, EVAL_DATE, 7, {
      forecastRunId: 'run-123',
      modelVersion: 'rf-v1',
    });

    expect(results).toHaveLength(3);

    // Lô 1 (HSD +10 ngày): cửa sổ [eval, eval+3] = 4 ngày → demandWindow = 20, allocated = 20, consumed = 20, surplus = 30
    const r1 = results[0];
    expect(r1.lotCode).toBe('L10');
    expect(r1.allocatedDemand.toFixed(3)).toBe('20.000');
    expect(r1.estimatedConsumption.toFixed(3)).toBe('20.000');
    expect(r1.estimatedSurplus.toFixed(3)).toBe('30.000');
    expect(r1.riskLevel).toBe('high');
    expect(r1.isExpired).toBe(false);
    expect(r1.basis.fefoOrder).toBe(1);
    expect(r1.basis.windowDays).toBe(4);
    expect(r1.basis.extrapolatedDays).toBe(0);
    expect(r1.basis.consumedByEarlierLots).toBe('0.000');
    expect(r1.basis.forecastRunId).toBe('run-123');
    expect(r1.basis.modelVersion).toBe('rf-v1');
    expect(r1.basis.highRiskDaysThreshold).toBe(HIGH_RISK_DAYS_THRESHOLD);

    // Lô 2 (HSD +30 ngày): cửa sổ [eval, eval+23] = 24 ngày → demandWindow = 120, trừ 20 đã tiêu thụ lô 1 = 100
    const r2 = results[1];
    expect(r2.lotCode).toBe('L30');
    expect(r2.allocatedDemand.toFixed(3)).toBe('100.000');
    expect(r2.estimatedConsumption.toFixed(3)).toBe('100.000');
    expect(r2.estimatedSurplus.toFixed(3)).toBe('0.000');
    expect(r2.riskLevel).toBe('low');
    expect(r2.basis.fefoOrder).toBe(2);
    expect(r2.basis.consumedByEarlierLots).toBe('20.000');
    expect(r2.basis.extrapolatedDays).toBe(0);

    // Lô 3 (HSD +90 ngày): cửa sổ [eval, eval+83] = 84 ngày (60 trong kỳ + 24 ngoại suy) → demandWindow = 420, trừ 120 = 300
    const r3 = results[2];
    expect(r3.lotCode).toBe('L90');
    expect(r3.allocatedDemand.toFixed(3)).toBe('300.000');
    expect(r3.estimatedConsumption.toFixed(3)).toBe('100.000');
    expect(r3.estimatedSurplus.toFixed(3)).toBe('0.000');
    expect(r3.riskLevel).toBe('low');
    expect(r3.basis.fefoOrder).toBe(3);
    expect(r3.basis.inHorizonDays).toBe(60);
    expect(r3.basis.extrapolatedDays).toBe(24);
    expect(r3.basis.consumedByEarlierLots).toBe('120.000');

    // Bất biến số học: consumed + surplus === onHand cho mọi lô
    for (const r of results) {
      expect(r.estimatedConsumption.add(r.estimatedSurplus).equals(r.onHandSnapshot)).toBe(true);
    }
  });

  it('lô hết hạn → consumed 0, surplus = tồn, riskLevel = critical, không ăn nhu cầu của lô sau', () => {
    const lots: RiskLotInput[] = [
      {
        id: 'lot-exp',
        productId: 'prod-1',
        lotCode: 'LEXP',
        expiryDate: addCalendarDays(EVAL_DATE, -5),
        receivedAt: '2026-09-01',
        status: 'active',
        onHandQty: '40',
      },
      {
        id: 'lot-ok',
        productId: 'prod-1',
        lotCode: 'LOK',
        expiryDate: addCalendarDays(EVAL_DATE, 20),
        receivedAt: '2026-10-01',
        status: 'active',
        onHandQty: '50',
      },
    ];

    const forecast = buildConstantForecast(EVAL_DATE, 30, 5);
    const results = computeLotRisks(lots, forecast, EVAL_DATE, 7);

    const expired = results.find((r) => r.lotCode === 'LEXP')!;
    expect(expired.isExpired).toBe(true);
    expect(expired.riskLevel).toBe('critical');
    expect(expired.allocatedDemand.toFixed(3)).toBe('0.000');
    expect(expired.estimatedConsumption.toFixed(3)).toBe('0.000');
    expect(expired.estimatedSurplus.toFixed(3)).toBe('40.000');
    expect(expired.basis.fefoOrder).toBeNull();
    expect(expired.basis.ineligibleReason).toBe('Đã hết hạn');

    // Lô sau nhận trọn nhu cầu 14 ngày × 5 = 70 (không bị lô hết hạn trừ)
    const ok = results.find((r) => r.lotCode === 'LOK')!;
    expect(ok.allocatedDemand.toFixed(3)).toBe('70.000');
    expect(ok.estimatedConsumption.toFixed(3)).toBe('50.000');
    expect(ok.estimatedSurplus.toFixed(3)).toBe('0.000');
    expect(ok.riskLevel).toBe('low');
    expect(ok.basis.fefoOrder).toBe(1);
    expect(ok.basis.consumedByEarlierLots).toBe('0.000');
  });

  it('lô blocked không hấp thụ nhu cầu và nhường toàn bộ nhu cầu cho lô active kế tiếp', () => {
    const lots: RiskLotInput[] = [
      {
        id: 'lot-blk',
        productId: 'prod-1',
        lotCode: 'LBLK',
        expiryDate: addCalendarDays(EVAL_DATE, 20),
        receivedAt: '2026-10-01',
        status: 'blocked',
        onHandQty: '60',
      },
      {
        id: 'lot-act',
        productId: 'prod-1',
        lotCode: 'LACT',
        expiryDate: addCalendarDays(EVAL_DATE, 25),
        receivedAt: '2026-10-10',
        status: 'active',
        onHandQty: '80',
      },
    ];

    const forecast = buildConstantForecast(EVAL_DATE, 30, 5);
    const results = computeLotRisks(lots, forecast, EVAL_DATE, 7);

    const blocked = results.find((r) => r.lotCode === 'LBLK')!;
    expect(blocked.allocatedDemand.toFixed(3)).toBe('0.000');
    expect(blocked.estimatedConsumption.toFixed(3)).toBe('0.000');
    expect(blocked.estimatedSurplus.toFixed(3)).toBe('60.000');
    expect(blocked.riskLevel).toBe('medium'); // chưa hết hạn, còn 20 > 14 ngày, surplus > 0
    expect(blocked.basis.ineligibleReason).toBe('Lô bị khóa');
    expect(blocked.basis.fefoOrder).toBeNull();

    // Lô active sau hưởng trọn cửa sổ 19 ngày × 5 = 95
    const active = results.find((r) => r.lotCode === 'LACT')!;
    expect(active.allocatedDemand.toFixed(3)).toBe('95.000');
    expect(active.estimatedConsumption.toFixed(3)).toBe('80.000');
    expect(active.estimatedSurplus.toFixed(3)).toBe('0.000');
    expect(active.riskLevel).toBe('low');
    expect(active.basis.fefoOrder).toBe(1);
  });

  it('ngoại suy bằng trung bình 7 ngày dự báo cuối khi cửa sổ vượt kỳ dự báo', () => {
    // 10 ngày dự báo: 3 ngày đầu = 2/ngày, 7 ngày cuối = 10/ngày → trung bình 7 ngày cuối = 10
    const forecast: DailyForecastPoint[] = Array.from({ length: 10 }, (_, idx) => ({
      date: addCalendarDays(EVAL_DATE, idx),
      qty: idx < 3 ? 2 : 10,
    }));

    const lots: RiskLotInput[] = [
      {
        id: 'lot-ext',
        productId: 'prod-1',
        lotCode: 'LEXT',
        expiryDate: addCalendarDays(EVAL_DATE, 21), // windowEnd = +14 → windowDays = 15 (10 trong kỳ + 5 ngoại suy)
        receivedAt: '2026-11-01',
        status: 'active',
        onHandQty: '200',
      },
    ];

    const [res] = computeLotRisks(lots, forecast, EVAL_DATE, 7);
    // inHorizon = 3*2 + 7*10 = 76; extrapolated = 5*10 = 50; tổng = 126
    expect(res.basis.inHorizonDays).toBe(10);
    expect(res.basis.extrapolatedDays).toBe(5);
    expect(res.basis.extrapolatedDailyRate).toBe('10.000');
    expect(res.allocatedDemand.toFixed(3)).toBe('126.000');
    expect(res.estimatedConsumption.toFixed(3)).toBe('126.000');
    expect(res.estimatedSurplus.toFixed(3)).toBe('74.000');
    expect(res.riskLevel).toBe('medium');
  });

  it('phân loại đúng biên mức rủi ro (hết hạn, <= 14 ngày, 15 ngày, cửa sổ 0 ngày, surplus = 0)', () => {
    const forecast = buildConstantForecast(EVAL_DATE, 30, 1);

    // 1. Còn 14 ngày, surplus > 0 → high
    const [r14] = computeLotRisks(
      [
        {
          id: 'l-14',
          productId: 'p',
          lotCode: 'L14',
          expiryDate: addCalendarDays(EVAL_DATE, 14),
          receivedAt: '2026-10-01',
          status: 'active',
          onHandQty: '50',
        },
      ],
      forecast,
      EVAL_DATE,
      7,
    );
    expect(r14.riskLevel).toBe('high');
    expect(r14.estimatedSurplus.gt(0)).toBe(true);

    // 2. Còn 15 ngày, surplus > 0 → medium
    const [r15] = computeLotRisks(
      [
        {
          id: 'l-15',
          productId: 'p',
          lotCode: 'L15',
          expiryDate: addCalendarDays(EVAL_DATE, 15),
          receivedAt: '2026-10-01',
          status: 'active',
          onHandQty: '50',
        },
      ],
      forecast,
      EVAL_DATE,
      7,
    );
    expect(r15.riskLevel).toBe('medium');

    // 3. Còn 10 ngày nhưng surplus = 0 → low
    const [r10Low] = computeLotRisks(
      [
        {
          id: 'l-10-low',
          productId: 'p',
          lotCode: 'L10L',
          expiryDate: addCalendarDays(EVAL_DATE, 10),
          receivedAt: '2026-10-01',
          status: 'active',
          onHandQty: '4', // windowDays = 4, demand = 4 → surplus = 0
        },
      ],
      forecast,
      EVAL_DATE,
      7,
    );
    expect(r10Low.estimatedSurplus.toFixed(3)).toBe('0.000');
    expect(r10Low.riskLevel).toBe('low');

    // 4. Còn 6 ngày < minDeliveryDays (7) → cửa sổ 0 ngày, không hấp thụ → surplus = tồn, riskLevel = high
    const [r6] = computeLotRisks(
      [
        {
          id: 'l-6',
          productId: 'p',
          lotCode: 'L6',
          expiryDate: addCalendarDays(EVAL_DATE, 6),
          receivedAt: '2026-10-01',
          status: 'active',
          onHandQty: '10',
        },
      ],
      forecast,
      EVAL_DATE,
      7,
    );
    expect(r6.allocatedDemand.toFixed(3)).toBe('0.000');
    expect(r6.estimatedSurplus.toFixed(3)).toBe('10.000');
    expect(r6.riskLevel).toBe('high');
    expect(r6.basis.windowDays).toBe(0);

    // 5. Cùng HSD: lô nhập trước (receivedAt sớm hơn) hấp thụ nhu cầu trước
    const sameExpiry = computeLotRisks(
      [
        {
          id: 'l-late',
          productId: 'p',
          lotCode: 'LLATE',
          expiryDate: addCalendarDays(EVAL_DATE, 16), // window 10 ngày → demand 10
          receivedAt: '2026-10-15',
          status: 'active',
          onHandQty: '8',
        },
        {
          id: 'l-early',
          productId: 'p',
          lotCode: 'LEARLY',
          expiryDate: addCalendarDays(EVAL_DATE, 16),
          receivedAt: '2026-10-01',
          status: 'active',
          onHandQty: '8',
        },
      ],
      forecast,
      EVAL_DATE,
      7,
    );
    expect(sameExpiry[0].lotCode).toBe('LEARLY');
    expect(sameExpiry[0].estimatedConsumption.toFixed(3)).toBe('8.000');
    expect(sameExpiry[0].estimatedSurplus.toFixed(3)).toBe('0.000');
    expect(sameExpiry[1].lotCode).toBe('LLATE');
    expect(sameExpiry[1].allocatedDemand.toFixed(3)).toBe('2.000');
    expect(sameExpiry[1].estimatedSurplus.toFixed(3)).toBe('6.000');
  });

  it('trả mảng rỗng khi thiếu dự báo hoặc không tạo kết quả cho lô tồn = 0', () => {
    const lot: RiskLotInput = {
      id: 'l-1',
      productId: 'p',
      lotCode: 'L1',
      expiryDate: addCalendarDays(EVAL_DATE, 20),
      receivedAt: '2026-10-01',
      status: 'active',
      onHandQty: '10',
    };
    expect(computeLotRisks([lot], [], EVAL_DATE, 7)).toEqual([]);

    const zeroLot: RiskLotInput = { ...lot, onHandQty: '0' };
    expect(
      computeLotRisks([zeroLot], buildConstantForecast(EVAL_DATE, 10, 5), EVAL_DATE, 7),
    ).toEqual([]);
  });

  it('sắp xếp hiển thị: hết hạn → high → medium → low, trong cùng mức surplus giảm dần', () => {
    const items = [
      { riskLevel: 'low', estimatedSurplus: new Prisma.Decimal('0'), productCode: 'SP002', expiryDate: '2027-01-01', lotCode: 'L1' },
      { riskLevel: 'medium', estimatedSurplus: '70.000', productCode: 'SP004', expiryDate: '2026-12-20', lotCode: 'L2' },
      { riskLevel: 'critical', isExpired: true, estimatedSurplus: '189.000', productCode: 'SP002', expiryDate: '2026-10-01', lotCode: 'L3' },
      { riskLevel: 'high', estimatedSurplus: '251.000', productCode: 'SP002', expiryDate: '2026-11-30', lotCode: 'L4' },
      { riskLevel: 'medium', estimatedSurplus: '186.000', productCode: 'SP002', expiryDate: '2026-12-30', lotCode: 'L5' },
      { riskLevel: 'critical', isExpired: true, estimatedSurplus: '313.000', productCode: 'SP002', expiryDate: '2026-11-01', lotCode: 'L6' },
      { riskLevel: 'low', estimatedSurplus: '0.000', productCode: 'SP001', expiryDate: '2027-02-01', lotCode: 'L7' },
    ];

    const sorted = [...items].sort(compareRiskAssessmentItems);
    expect(sorted.map((x) => x.lotCode)).toEqual(['L6', 'L3', 'L4', 'L5', 'L2', 'L7', 'L1']);
  });
});
