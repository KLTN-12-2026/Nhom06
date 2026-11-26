import { Prisma } from '@prisma/client';
import { diffCalendarDays, formatDateOnly, parseIsoDateStrict } from '../../../expiry/domain/vn-date';

export const HIGH_RISK_DAYS_THRESHOLD = 14;
export const EXTRAPOLATION_TAIL_DAYS = 7;
export const QUANTITY_DECIMAL_PLACES = 3;

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  critical: 'Hết hạn',
  high: 'Nguy cấp',
  medium: 'Trung bình',
  low: 'Thấp',
};

export interface RiskLotInput {
  id: string;
  productId: string;
  lotCode: string;
  expiryDate: string; // YYYY-MM-DD
  receivedAt: string; // YYYY-MM-DD
  status: string;
  onHandQty: Prisma.Decimal | string | number;
}

export interface DailyForecastPoint {
  date: string; // YYYY-MM-DD
  qty: Prisma.Decimal | string | number;
}

export interface LotRiskContext {
  forecastRunId?: string;
  modelVersion?: string | null;
}

export interface LotRiskBasis {
  evaluationDate: string;
  expiryDate: string;
  daysRemaining: number;
  isExpired: boolean;
  lotStatus: string;
  minDeliveryDays: number;
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: number;
  forecastHorizonStart: string;
  forecastHorizonEnd: string;
  inHorizonDays: number;
  extrapolatedDays: number;
  extrapolatedDailyRate: string;
  demandWindow: string;
  consumedByEarlierLots: string;
  allocatedDemand: string;
  estimatedConsumption: string;
  estimatedSurplus: string;
  fefoOrder: number | null;
  ineligibleReason: string | null;
  highRiskDaysThreshold: number;
  forecastRunId: string | null;
  modelVersion: string | null;
}

export interface ComputedLotRisk {
  lotId: string;
  productId: string;
  lotCode: string;
  expiryDate: string;
  daysRemaining: number;
  isExpired: boolean;
  lotStatus: string;
  onHandSnapshot: Prisma.Decimal;
  allocatedDemand: Prisma.Decimal;
  estimatedConsumption: Prisma.Decimal;
  estimatedSurplus: Prisma.Decimal;
  riskLevel: RiskLevel;
  basis: LotRiskBasis;
}

export interface RiskSortComparable {
  riskLevel: string;
  isExpired?: boolean;
  estimatedSurplus: Prisma.Decimal | string;
  productCode: string;
  expiryDate: string;
  lotCode: string;
}

const ZERO = new Prisma.Decimal(0);

const RISK_PRIORITY: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function roundQty(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(QUANTITY_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const date = parseIsoDateStrict(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function compareLotsFefo(a: RiskLotInput, b: RiskLotInput): number {
  return (
    a.expiryDate.localeCompare(b.expiryDate) ||
    a.receivedAt.localeCompare(b.receivedAt) ||
    a.lotCode.localeCompare(b.lotCode) ||
    a.id.localeCompare(b.id)
  );
}

export function classifyRiskLevel(daysRemaining: number, estimatedSurplus: Prisma.Decimal): RiskLevel {
  if (daysRemaining < 0) {
    return 'critical';
  }
  if (estimatedSurplus.lte(ZERO)) {
    return 'low';
  }
  if (daysRemaining <= HIGH_RISK_DAYS_THRESHOLD) {
    return 'high';
  }
  return 'medium';
}

/**
 * Tính tồn dư ước tính và mức rủi ro theo từng lô của MỘT sản phẩm (hàm thuần theo D-025).
 *
 * Quy tắc:
 * - Chỉ đánh giá lô có tồn > 0. Nếu `dailyForecast` rỗng hoặc có giá trị âm → trả mảng rỗng (không tạo kết quả giả).
 * - Sắp các lô theo FEFO: expiryDate ASC → receivedAt ASC → lotCode ASC → id ASC.
 * - Cửa sổ bán = [evaluationDate, expiryDate - minDeliveryDays] (tính cả 2 đầu, nhất quán FEFO D-023).
 * - Lô đã hết hạn, `blocked`/không active, hoặc cửa sổ <= 0 ngày → không hấp thụ nhu cầu (consumed = 0, surplus = onHand).
 * - Nhu cầu trong cửa sổ = tổng forecast_qty trong cửa sổ + ngoại suy bằng trung bình 7 ngày dự báo cuối cho phần sau forecastHorizonEnd.
 * - Phân bổ FEFO: allocated = max(0, demandWindow - sumConsumedEarlier), consumed = min(onHand, allocated), surplus = onHand - consumed.
 */
export function computeLotRisks(
  lots: readonly RiskLotInput[],
  dailyForecast: readonly DailyForecastPoint[],
  evaluationDate: string,
  minDeliveryDays: number,
  context?: LotRiskContext,
): ComputedLotRisk[] {
  parseIsoDateStrict(evaluationDate);
  const safeMinDeliveryDays = Math.max(0, Math.trunc(minDeliveryDays));

  if (dailyForecast.length === 0) {
    return [];
  }

  // Chuẩn hóa và kiểm tra chuỗi dự báo theo ngày tăng dần
  const normalizedForecast = dailyForecast
    .map((point) => {
      const parsedDate = formatDateOnly(parseIsoDateStrict(point.date));
      const qty = toDecimal(point.qty);
      return { date: parsedDate, qty };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (normalizedForecast.some((point) => !point.qty.isFinite() || point.qty.lt(ZERO))) {
    return [];
  }

  const forecastHorizonStart = normalizedForecast[0].date;
  const forecastHorizonEnd = normalizedForecast[normalizedForecast.length - 1].date;

  const tailSlice = normalizedForecast.slice(-Math.min(EXTRAPOLATION_TAIL_DAYS, normalizedForecast.length));
  const tailSum = tailSlice.reduce((acc, point) => acc.add(point.qty), ZERO);
  const extrapolatedDailyRate = tailSum.div(tailSlice.length);

  // Lọc lô có tồn > 0 và sắp theo FEFO
  const activeStockLots = lots
    .map((lot) => ({ lot, onHand: roundQty(toDecimal(lot.onHandQty)) }))
    .filter((entry) => entry.onHand.gt(ZERO))
    .sort((a, b) => compareLotsFefo(a.lot, b.lot));

  const results: ComputedLotRisk[] = [];
  let consumedByEarlierLots = ZERO;
  let fefoRank = 0;

  for (const { lot, onHand } of activeStockLots) {
    const daysRemaining = diffCalendarDays(lot.expiryDate, evaluationDate);
    const isExpired = daysRemaining < 0;
    const windowEnd = addCalendarDays(lot.expiryDate, -safeMinDeliveryDays);
    const rawWindowDays = daysRemaining - safeMinDeliveryDays + 1;
    const windowDays = rawWindowDays > 0 ? rawWindowDays : 0;

    let ineligibleReason: string | null = null;
    if (isExpired) {
      ineligibleReason = 'Đã hết hạn';
    } else if (lot.status === 'blocked') {
      ineligibleReason = 'Lô bị khóa';
    } else if (lot.status !== 'active') {
      ineligibleReason = 'Lô không hoạt động';
    } else if (windowDays <= 0) {
      ineligibleReason = `Không đủ hạn dùng tối thiểu khi giao (còn ${daysRemaining} ngày < ${safeMinDeliveryDays})`;
    }

    if (ineligibleReason !== null) {
      const riskLevel = classifyRiskLevel(daysRemaining, onHand);
      const basis: LotRiskBasis = {
        evaluationDate,
        expiryDate: lot.expiryDate,
        daysRemaining,
        isExpired,
        lotStatus: lot.status,
        minDeliveryDays: safeMinDeliveryDays,
        windowStart: null,
        windowEnd: null,
        windowDays: 0,
        forecastHorizonStart,
        forecastHorizonEnd,
        inHorizonDays: 0,
        extrapolatedDays: 0,
        extrapolatedDailyRate: roundQty(extrapolatedDailyRate).toFixed(QUANTITY_DECIMAL_PLACES),
        demandWindow: ZERO.toFixed(QUANTITY_DECIMAL_PLACES),
        consumedByEarlierLots: roundQty(consumedByEarlierLots).toFixed(QUANTITY_DECIMAL_PLACES),
        allocatedDemand: ZERO.toFixed(QUANTITY_DECIMAL_PLACES),
        estimatedConsumption: ZERO.toFixed(QUANTITY_DECIMAL_PLACES),
        estimatedSurplus: onHand.toFixed(QUANTITY_DECIMAL_PLACES),
        fefoOrder: null,
        ineligibleReason,
        highRiskDaysThreshold: HIGH_RISK_DAYS_THRESHOLD,
        forecastRunId: context?.forecastRunId ?? null,
        modelVersion: context?.modelVersion ?? null,
      };

      results.push({
        lotId: lot.id,
        productId: lot.productId,
        lotCode: lot.lotCode,
        expiryDate: lot.expiryDate,
        daysRemaining,
        isExpired,
        lotStatus: lot.status,
        onHandSnapshot: onHand,
        allocatedDemand: ZERO,
        estimatedConsumption: ZERO,
        estimatedSurplus: onHand,
        riskLevel,
        basis,
      });
      continue;
    }

    fefoRank += 1;
    const windowStart = evaluationDate;

    let inHorizonDemand = ZERO;
    let inHorizonDays = 0;
    for (const point of normalizedForecast) {
      if (point.date >= windowStart && point.date <= windowEnd) {
        inHorizonDemand = inHorizonDemand.add(point.qty);
        inHorizonDays += 1;
      }
    }

    let extrapolatedDays = 0;
    if (windowEnd > forecastHorizonEnd) {
      extrapolatedDays =
        windowStart > forecastHorizonEnd
          ? windowDays
          : diffCalendarDays(windowEnd, forecastHorizonEnd);
    }

    const extrapolatedDemand =
      extrapolatedDays > 0 ? extrapolatedDailyRate.mul(extrapolatedDays) : ZERO;
    const demandWindow = roundQty(inHorizonDemand.add(extrapolatedDemand));

    const earlierSnapshot = consumedByEarlierLots;
    const rawAllocated = demandWindow.sub(earlierSnapshot);
    const allocatedDemand = rawAllocated.gt(ZERO) ? roundQty(rawAllocated) : ZERO;
    const estimatedConsumption = onHand.lt(allocatedDemand) ? onHand : allocatedDemand;
    const estimatedSurplus = onHand.sub(estimatedConsumption);
    const riskLevel = classifyRiskLevel(daysRemaining, estimatedSurplus);

    consumedByEarlierLots = roundQty(consumedByEarlierLots.add(estimatedConsumption));

    const basis: LotRiskBasis = {
      evaluationDate,
      expiryDate: lot.expiryDate,
      daysRemaining,
      isExpired,
      lotStatus: lot.status,
      minDeliveryDays: safeMinDeliveryDays,
      windowStart,
      windowEnd,
      windowDays,
      forecastHorizonStart,
      forecastHorizonEnd,
      inHorizonDays,
      extrapolatedDays,
      extrapolatedDailyRate: roundQty(extrapolatedDailyRate).toFixed(QUANTITY_DECIMAL_PLACES),
      demandWindow: demandWindow.toFixed(QUANTITY_DECIMAL_PLACES),
      consumedByEarlierLots: roundQty(earlierSnapshot).toFixed(QUANTITY_DECIMAL_PLACES),
      allocatedDemand: allocatedDemand.toFixed(QUANTITY_DECIMAL_PLACES),
      estimatedConsumption: estimatedConsumption.toFixed(QUANTITY_DECIMAL_PLACES),
      estimatedSurplus: estimatedSurplus.toFixed(QUANTITY_DECIMAL_PLACES),
      fefoOrder: fefoRank,
      ineligibleReason: null,
      highRiskDaysThreshold: HIGH_RISK_DAYS_THRESHOLD,
      forecastRunId: context?.forecastRunId ?? null,
      modelVersion: context?.modelVersion ?? null,
    };

    results.push({
      lotId: lot.id,
      productId: lot.productId,
      lotCode: lot.lotCode,
      expiryDate: lot.expiryDate,
      daysRemaining,
      isExpired,
      lotStatus: lot.status,
      onHandSnapshot: onHand,
      allocatedDemand,
      estimatedConsumption,
      estimatedSurplus,
      riskLevel,
      basis,
    });
  }

  return results;
}

/**
 * Sắp xếp danh sách kết quả rủi ro theo mockup 20:
 * Hết hạn (critical) → Nguy cấp (high) → Trung bình (medium) → Thấp (low),
 * trong cùng mức tồn dư ước tính giảm dần, hòa theo mã SP → HSD → mã lô.
 */
export function compareRiskAssessmentItems(a: RiskSortComparable, b: RiskSortComparable): number {
  const rankA = a.isExpired ? 0 : (RISK_PRIORITY[a.riskLevel] ?? 99);
  const rankB = b.isExpired ? 0 : (RISK_PRIORITY[b.riskLevel] ?? 99);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  const surplusA = toDecimal(a.estimatedSurplus);
  const surplusB = toDecimal(b.estimatedSurplus);
  const surplusCmp = surplusB.comparedTo(surplusA);
  if (surplusCmp !== 0) {
    return surplusCmp;
  }

  return (
    a.productCode.localeCompare(b.productCode) ||
    a.expiryDate.localeCompare(b.expiryDate) ||
    a.lotCode.localeCompare(b.lotCode)
  );
}
