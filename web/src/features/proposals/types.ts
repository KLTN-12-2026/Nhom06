import { type RiskLevel } from '@/features/risk/types';

export type ProposalStatus =
  | 'new'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed';

export type ProposalActionType =
  | 'PRIORITIZE_FEFO'
  | 'CONTACT_AGENCY'
  | 'RETURN_TO_SUPPLIER'
  | 'DISPOSE'
  | 'CONSIDER_PROMOTION';

export type ProposalDisplayMode = 'llm' | 'fallback';
export type ProposalFallbackReason = 'invalid' | 'failed' | 'unavailable' | null;

export interface LlmExplanationInput {
  ma_lo: string;
  san_pham: string;
  ten_san_pham?: string;
  don_vi_tinh?: string;
  han_su_dung: string;
  so_ngay_con_lai: number;
  ton_luc_phan_tich: number;
  nhu_cau_phan_bo_duoc: number;
  tieu_thu_uoc_tinh: number;
  ton_du_uoc_tinh: number;
  muc_rui_ro: RiskLevel;
  phuong_an: ProposalActionType;
  luong_de_xuat: number;
  allowed_actions: ProposalActionType[];
}

export interface ProposalExplanation {
  id: string;
  status: 'pending' | 'valid' | 'invalid' | 'failed';
  text: string | null;
  modelName: string;
  provider: string;
  promptVersion: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface ProposalListItem {
  id: string;
  status: ProposalStatus;
  actionType: ProposalActionType;
  actionLabel: string;
  proposedQty: string;
  riskLevel: RiskLevel;
  isExpired: boolean;
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    daysRemaining: number;
    status: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  sourceRunId: string;
  createdAt: string;
}

export interface ProposalsListResponse {
  items: ProposalListItem[];
  summary: {
    pending: number;
    total: number;
  };
}

export interface ProposalSummaryResponse {
  pending: number;
}

export interface ProposalDecision {
  id: string;
  decision: 'approved' | 'rejected';
  reason: string | null;
  decidedAt: string;
  decider: {
    id: string;
    fullName: string;
  };
}

export interface ProposalExecutionBrief {
  id: string;
  status: string;
  plannedQty: string;
  actualQty: string | null;
  linkedOutboundId: string | null;
}

export interface ProposalDetailResponse {
  id: string;
  status: ProposalStatus;
  actionType: ProposalActionType;
  actionLabel: string;
  allowedActions: ProposalActionType[];
  proposedQty: string;
  ruleCode: string;
  ruleSummaryText: string;
  sourceRunId: string;
  createdAt: string;
  analyzedAt: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  lot: {
    id: string;
    lotCode: string;
    status: string;
    expiryDate: string;
    daysRemaining: number;
    currentOnHandQty: string;
  };
  risk: {
    assessmentId: string;
    evaluationDate: string;
    expiryDate: string;
    daysRemaining: number;
    isExpired: boolean;
    onHandSnapshot: string;
    allocatedDemand: string;
    estimatedConsumption: string;
    estimatedSurplus: string;
    riskLevel: RiskLevel;
  };
  llmInput: LlmExplanationInput | null;
  explanation: ProposalExplanation | null;
  displayMode: ProposalDisplayMode;
  fallbackReason: ProposalFallbackReason;
  llmDemoToggleEnabled: boolean;
  decision: ProposalDecision | null;
  execution: ProposalExecutionBrief | null;
}

export interface ExplainProposalResponse {
  explanation: ProposalExplanation;
  displayMode: ProposalDisplayMode;
  fallbackReason: ProposalFallbackReason;
  ruleSummaryText: string;
}
