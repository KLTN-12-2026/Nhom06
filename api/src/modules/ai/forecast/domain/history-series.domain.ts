import { Prisma } from '@prisma/client';

export type DemandHistorySource = 'SIMULATED' | 'ACTUAL';

export interface RawDemandHistoryPoint {
  date: Date | string;
  qty: Prisma.Decimal | string | number;
  source: string;
}

export interface ProductDemandHistoryPoint extends RawDemandHistoryPoint {
  productId: string;
}

export interface DailyDemandPoint {
  date: string;
  qty: number;
}

export interface DailyAggregatedHistoryPoint {
  date: string;
  totalQty: string;
}

export function formatIsoDateUtc(input: Date | string): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    return new Date(trimmed).toISOString().slice(0, 10);
  }
  return input.toISOString().slice(0, 10);
}

function addUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Dựng chuỗi lịch sử nhu cầu liên tục từng ngày cho 1 sản phẩm từ ngày đầu đến ngày cuối.
 * - Khi cùng một ngày có cả ACTUAL và SIMULATED: ưu tiên ACTUAL (D-017).
 * - Ngày không có dữ liệu giữa ngày đầu và ngày cuối được điền 0 (yêu cầu của ML service).
 */
export function buildCompleteDailyHistory(
  records: readonly RawDemandHistoryPoint[],
): DailyDemandPoint[] {
  if (records.length === 0) {
    return [];
  }

  const byDate = new Map<string, { qty: Prisma.Decimal; source: string }>();

  for (const record of records) {
    const isoDate = formatIsoDateUtc(record.date);
    const existing = byDate.get(isoDate);

    if (!existing) {
      byDate.set(isoDate, { qty: toDecimal(record.qty), source: record.source });
      continue;
    }

    // Ưu tiên ACTUAL thay cho SIMULATED khi trùng ngày
    if (record.source === 'ACTUAL' && existing.source !== 'ACTUAL') {
      byDate.set(isoDate, { qty: toDecimal(record.qty), source: record.source });
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const minDate = sortedDates[0];
  const maxDate = sortedDates[sortedDates.length - 1];

  const result: DailyDemandPoint[] = [];
  let current = minDate;
  while (current <= maxDate) {
    const entry = byDate.get(current);
    result.push({
      date: current,
      qty: entry ? entry.qty.toNumber() : 0,
    });
    current = addUtcDays(current, 1);
  }

  return result;
}

/**
 * Gom tổng nhu cầu theo ngày của mọi sản phẩm (ưu tiên ACTUAL trên SIMULATED theo từng cặp sản phẩm + ngày),
 * trả về `days` ngày gần nhất có dữ liệu theo thứ tự ngày tăng dần.
 */
export function aggregateDailyHistory(
  records: readonly ProductDemandHistoryPoint[],
  days: number,
): DailyAggregatedHistoryPoint[] {
  if (records.length === 0 || days <= 0) {
    return [];
  }

  const perProductDate = new Map<string, { date: string; qty: Prisma.Decimal; source: string }>();

  for (const record of records) {
    const date = formatIsoDateUtc(record.date);
    const key = `${record.productId}::${date}`;
    const existing = perProductDate.get(key);

    if (!existing) {
      perProductDate.set(key, { date, qty: toDecimal(record.qty), source: record.source });
      continue;
    }

    if (record.source === 'ACTUAL' && existing.source !== 'ACTUAL') {
      perProductDate.set(key, { date, qty: toDecimal(record.qty), source: record.source });
    }
  }

  const dailyTotals = new Map<string, Prisma.Decimal>();
  for (const entry of perProductDate.values()) {
    const current = dailyTotals.get(entry.date) ?? new Prisma.Decimal(0);
    dailyTotals.set(entry.date, current.add(entry.qty));
  }

  const sortedDates = Array.from(dailyTotals.keys()).sort();
  const recentDates = sortedDates.slice(-days);

  return recentDates.map((date) => ({
    date,
    totalQty: (dailyTotals.get(date) ?? new Prisma.Decimal(0)).toFixed(3),
  }));
}
