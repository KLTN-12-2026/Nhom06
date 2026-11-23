import { Prisma } from '@prisma/client';
import { HIGH_RISK_DAYS_THRESHOLD, RiskLevel } from '../../risk/domain/lot-risk.domain';

export const PROPOSAL_ACTION_TYPES = [
  'PRIORITIZE_FEFO',
  'CONTACT_AGENCY',
  'RETURN_TO_SUPPLIER',
  'DISPOSE',
  'CONSIDER_PROMOTION',
] as const;

export type ProposalActionType = (typeof PROPOSAL_ACTION_TYPES)[number];

export const PROPOSAL_STATUSES = [
  'new',
  'pending',
  'approved',
  'rejected',
  'in_progress',
  'completed',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const ACTIVE_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'new',
  'pending',
  'approved',
  'in_progress',
] as const;

export const ACTION_LABELS: Record<ProposalActionType, string> = {
  DISPOSE: 'Loại bỏ và lập biên bản huỷ',
  CONTACT_AGENCY: 'Liên hệ đại lý đẩy hàng',
  PRIORITIZE_FEFO: 'Ưu tiên xuất theo FEFO',
  RETURN_TO_SUPPLIER: 'Trả nhà cung cấp',
  CONSIDER_PROMOTION: 'Cân nhắc khuyến mãi',
};

export type ProposalRuleCode =
  | 'RULE_EXPIRED_DISPOSE'
  | 'RULE_HIGH_RISK_CONTACT_AGENCY'
  | 'RULE_MEDIUM_RISK_PRIORITIZE_FEFO';

export interface ProposalRuleInput {
  riskLevel: RiskLevel;
  isExpired: boolean;
  daysRemaining: number;
  expiryDate: string; // YYYY-MM-DD
  onHandSnapshot: Prisma.Decimal | string | number;
  allocatedDemand: Prisma.Decimal | string | number;
  estimatedSurplus: Prisma.Decimal | string | number;
}

export interface ProposalDecisionRule {
  actionType: ProposalActionType;
  allowedActions: ProposalActionType[];
  ruleCode: ProposalRuleCode;
  ruleSummaryText: string;
}

export interface ProposalSortComparable {
  riskLevel: string;
  isExpired?: boolean;
  proposedQty: Prisma.Decimal | string | number;
  expiryDate: string;
  lotCode: string;
  createdAt?: string | Date;
}

const ZERO = new Prisma.Decimal(0);

const VI_NUMBER_FORMATTER = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 3,
});

const RISK_PRIORITY: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function formatNumberVi(value: Prisma.Decimal | string | number): string {
  const dec = toDecimal(value);
  return VI_NUMBER_FORMATTER.format(Number(dec.toString()));
}

export function formatIsoDateVi(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Bộ quy tắc đề xuất xử lý theo D-026 (hàm thuần không phụ thuộc DB):
 * - Tồn dư <= 0 → null (không tạo đề xuất).
 * - Hết hạn còn tồn (critical / isExpired / daysRemaining < 0) → DISPOSE, allowed=[DISPOSE, RETURN_TO_SUPPLIER].
 * - Còn <= 14 ngày, tồn dư > 0 (high) → CONTACT_AGENCY, allowed=[CONTACT_AGENCY, CONSIDER_PROMOTION, RETURN_TO_SUPPLIER].
 * - Còn > 14 ngày, tồn dư > 0 (medium) → PRIORITIZE_FEFO, allowed=[PRIORITIZE_FEFO, CONTACT_AGENCY, CONSIDER_PROMOTION].
 */
export function decideProposal(risk: ProposalRuleInput): ProposalDecisionRule | null {
  const surplus = toDecimal(risk.estimatedSurplus);
  if (!surplus.isFinite() || surplus.lte(ZERO)) {
    return null;
  }

  const onHandText = formatNumberVi(risk.onHandSnapshot);
  const allocatedText = formatNumberVi(risk.allocatedDemand);
  const surplusText = formatNumberVi(surplus);
  const expiryText = formatIsoDateVi(risk.expiryDate);

  const expired = risk.isExpired || risk.daysRemaining < 0 || risk.riskLevel === 'critical';
  if (expired) {
    const overdueDays = Math.abs(risk.daysRemaining);
    const ruleSummaryText =
      risk.daysRemaining < 0
        ? `Tồn ${onHandText}, lô đã hết hạn ngày ${expiryText} (quá ${overdueDays} ngày), nhu cầu dự báo phân bổ được ${allocatedText}. Tồn dư ước tính ${surplusText}, mức rủi ro hết hạn.`
        : `Tồn ${onHandText}, nhu cầu dự báo phân bổ được ${allocatedText} trước hạn ${expiryText} (còn ${risk.daysRemaining} ngày). Tồn dư ước tính ${surplusText}, mức rủi ro hết hạn.`;

    return {
      actionType: 'DISPOSE',
      allowedActions: ['DISPOSE', 'RETURN_TO_SUPPLIER'],
      ruleCode: 'RULE_EXPIRED_DISPOSE',
      ruleSummaryText,
    };
  }

  if (risk.daysRemaining <= HIGH_RISK_DAYS_THRESHOLD) {
    return {
      actionType: 'CONTACT_AGENCY',
      allowedActions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
      ruleCode: 'RULE_HIGH_RISK_CONTACT_AGENCY',
      ruleSummaryText: `Tồn ${onHandText}, nhu cầu dự báo phân bổ được ${allocatedText} trước hạn ${expiryText} (còn ${risk.daysRemaining} ngày). Tồn dư ước tính ${surplusText}, mức rủi ro nguy cấp.`,
    };
  }

  return {
    actionType: 'PRIORITIZE_FEFO',
    allowedActions: ['PRIORITIZE_FEFO', 'CONTACT_AGENCY', 'CONSIDER_PROMOTION'],
    ruleCode: 'RULE_MEDIUM_RISK_PRIORITIZE_FEFO',
    ruleSummaryText: `Tồn ${onHandText}, nhu cầu dự báo phân bổ được ${allocatedText} trước hạn ${expiryText} (còn ${risk.daysRemaining} ngày). Tồn dư ước tính ${surplusText}, mức rủi ro trung bình.`,
  };
}

/**
 * Sắp xếp danh sách đề xuất theo mockup 21:
 * Hết hạn (critical) → Nguy cấp (high) → Trung bình (medium), cùng mức theo tồn dư giảm dần.
 */
export function compareProposalItems(a: ProposalSortComparable, b: ProposalSortComparable): number {
  const rankA = a.isExpired ? 0 : (RISK_PRIORITY[a.riskLevel] ?? 99);
  const rankB = b.isExpired ? 0 : (RISK_PRIORITY[b.riskLevel] ?? 99);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  const qtyA = toDecimal(a.proposedQty);
  const qtyB = toDecimal(b.proposedQty);
  const qtyCmp = qtyB.comparedTo(qtyA);
  if (qtyCmp !== 0) {
    return qtyCmp;
  }

  const expiryCmp = a.expiryDate.localeCompare(b.expiryDate);
  if (expiryCmp !== 0) {
    return expiryCmp;
  }

  const lotCmp = a.lotCode.localeCompare(b.lotCode);
  if (lotCmp !== 0) {
    return lotCmp;
  }

  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return timeB - timeA;
}
