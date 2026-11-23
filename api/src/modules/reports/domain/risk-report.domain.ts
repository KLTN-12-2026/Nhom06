import { Prisma } from '@prisma/client';

export const RISK_LEVEL_VALUES = ['critical', 'high', 'medium', 'low'] as const;
export type RiskLevel = (typeof RISK_LEVEL_VALUES)[number];

export const RISK_LEVEL_PRIORITY: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface InboundCostEntry {
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

export interface LotValueAtRiskInput {
  lotId: string;
  estimatedSurplusQty: Prisma.Decimal;
  inboundCosts: readonly InboundCostEntry[];
}

export interface ValueAtRiskResult {
  amount: string;
  surplusQty: string;
  lotsWithoutCost: number;
}

export interface RiskLevelSummaryItem {
  level: RiskLevel;
  lots: number;
  surplusQty: string;
}

export interface DeduplicableLotAssessment {
  id: string;
  lotId: string;
  runFinishedAt: Date | null;
  calculatedAt: Date;
}

export interface ProposalLinkCandidate {
  id: string;
  riskAssessmentId: string;
  status: string;
  createdAt: Date;
}

const ACTIVE_PROPOSAL_STATUSES = new Set(['new', 'pending', 'approved', 'in_progress']);

function formatDecimal(value: Prisma.Decimal): string {
  return value.isZero() ? '0' : value.toString();
}

/**
 * Tính giá trị có nguy cơ mất theo D-027:
 * `Σ (tồn dư ước tính của lô × đơn giá nhập bình quân gia quyền của lô)`.
 * Lô có tồn dư > 0 nhưng thiếu đơn giá sẽ bỏ qua khỏi `amount` và cộng vào `lotsWithoutCost`.
 */
export function computeValueAtRisk(lots: readonly LotValueAtRiskInput[]): ValueAtRiskResult {
  let totalAmount = new Prisma.Decimal(0);
  let totalSurplus = new Prisma.Decimal(0);
  let lotsWithoutCost = 0;

  for (const lot of lots) {
    if (lot.estimatedSurplusQty.lte(0)) {
      continue;
    }

    totalSurplus = totalSurplus.plus(lot.estimatedSurplusQty);

    let totalCostQty = new Prisma.Decimal(0);
    let weightedSum = new Prisma.Decimal(0);

    for (const entry of lot.inboundCosts) {
      if (entry.quantity.lte(0)) {
        continue;
      }
      totalCostQty = totalCostQty.plus(entry.quantity);
      weightedSum = weightedSum.plus(entry.quantity.mul(entry.unitCost));
    }

    if (totalCostQty.lte(0)) {
      lotsWithoutCost += 1;
      continue;
    }

    const avgUnitCost = weightedSum.div(totalCostQty);
    totalAmount = totalAmount.plus(lot.estimatedSurplusQty.mul(avgUnitCost));
  }

  const roundedAmount = totalAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    amount: formatDecimal(roundedAmount),
    surplusQty: formatDecimal(totalSurplus),
    lotsWithoutCost,
  };
}

/**
 * Gom số lô và tổng tồn dư theo đúng 4 mức rủi ro cố định `critical → high → medium → low`.
 */
export function summarizeRiskLevels(
  assessments: readonly { riskLevel: string; estimatedSurplusQty: Prisma.Decimal }[],
): RiskLevelSummaryItem[] {
  const buckets = new Map<RiskLevel, { lots: number; surplus: Prisma.Decimal }>();
  for (const level of RISK_LEVEL_VALUES) {
    buckets.set(level, { lots: 0, surplus: new Prisma.Decimal(0) });
  }

  for (const item of assessments) {
    const bucket = buckets.get(item.riskLevel as RiskLevel);
    if (!bucket) {
      continue;
    }
    bucket.lots += 1;
    if (item.estimatedSurplusQty.gt(0)) {
      bucket.surplus = bucket.surplus.plus(item.estimatedSurplusQty);
    }
  }

  return RISK_LEVEL_VALUES.map((level) => {
    const bucket = buckets.get(level)!;
    return {
      level,
      lots: bucket.lots,
      surplusQty: formatDecimal(bucket.surplus),
    };
  });
}

function getAssessmentTimestamp(record: DeduplicableLotAssessment): number {
  return (record.runFinishedAt ?? record.calculatedAt).getTime();
}

/**
 * Chống đếm trùng lô giữa nhiều lượt phân tích (PB30 AC5):
 * mỗi `lotId` chỉ giữ bản ghi thuộc lượt phân tích mới nhất.
 */
export function deduplicateLatestLotAssessments<T extends DeduplicableLotAssessment>(
  records: readonly T[],
): T[] {
  const byLot = new Map<string, T>();

  for (const record of records) {
    const existing = byLot.get(record.lotId);
    if (!existing) {
      byLot.set(record.lotId, record);
      continue;
    }

    const curTs = getAssessmentTimestamp(record);
    const oldTs = getAssessmentTimestamp(existing);
    if (
      curTs > oldTs ||
      (curTs === oldTs && record.calculatedAt.getTime() > existing.calculatedAt.getTime()) ||
      (curTs === oldTs &&
        record.calculatedAt.getTime() === existing.calculatedAt.getTime() &&
        record.id > existing.id)
    ) {
      byLot.set(record.lotId, record);
    }
  }

  return Array.from(byLot.values());
}

/**
 * Chọn đề xuất đại diện cho một lô theo D-026:
 * 1) Ưu tiên đề xuất gắn trực tiếp `riskAssessmentId`;
 * 2) Nếu lượt mới bỏ qua tạo đề xuất vì lô đã có đề xuất hoạt động từ lượt trước → chọn đề xuất hoạt động mới nhất;
 * 3) Nếu không có đề xuất hoạt động → chọn đề xuất mới nhất của lô.
 */
export function selectLinkedProposalForLot<T extends ProposalLinkCandidate>(
  proposals: readonly T[],
  riskAssessmentId: string,
): T | null {
  if (proposals.length === 0) {
    return null;
  }

  const sortedDesc = [...proposals].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );

  const direct = sortedDesc.find((p) => p.riskAssessmentId === riskAssessmentId);
  if (direct) {
    return direct;
  }

  const active = sortedDesc.find((p) => ACTIVE_PROPOSAL_STATUSES.has(p.status));
  if (active) {
    return active;
  }

  return sortedDesc[0] ?? null;
}

export function countByStatus(
  values: readonly (string | null | undefined)[],
  orderedKeys: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of orderedKeys) {
    counts[key] = 0;
  }
  for (const value of values) {
    if (!value) {
      continue;
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
