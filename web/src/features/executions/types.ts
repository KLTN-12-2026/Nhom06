import { type ProposalActionType } from '@/features/proposals/types';

export type ExecutionStatus = 'planned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface LinkedOutboundRef {
  id: string;
  outboundNo: string;
  outboundType: string;
  confirmedAt: string | null;
}

export interface ExecutionUpdateItem {
  id: string;
  status: ExecutionStatus;
  actualQtyDelta: string | null;
  note: string | null;
  occurredOn: string | null;
  updatedAt: string;
  updater: {
    id: string;
    fullName: string;
  };
  linkedOutbound: LinkedOutboundRef | null;
}

export interface ExecutionItem {
  id: string;
  proposalId: string;
  status: ExecutionStatus;
  plannedQty: string;
  actualQty: string | null;
  remainingQty: string;
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  proposal: {
    id: string;
    actionType: ProposalActionType;
    actionLabel: string;
    status: string;
    proposedQty: string;
  };
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    status: string;
    currentOnHandQty: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  decision: {
    decidedAt: string;
    reason: string | null;
    decider: {
      id: string;
      fullName: string;
    };
  } | null;
  responsibleUser: {
    id: string;
    fullName: string;
  };
  linkedOutbound: LinkedOutboundRef | null;
  linkedOutbounds: LinkedOutboundRef[];
  updates: ExecutionUpdateItem[];
}

export interface ExecutionsKpi {
  approvedCount: number;
  inProgressCount: number;
  plannedQtyTotal: string;
  actualQtyTotal: string;
}

export interface ExecutionsListResponse {
  kpi: ExecutionsKpi;
  items: ExecutionItem[];
}

export interface RecordExecutionUpdatePayload {
  status: ExecutionStatus;
  actualQtyDelta?: string;
  note?: string | null;
  occurredOn?: string;
}

export interface CreateExecutionDisposalPayload {
  quantity: string;
  notes?: string | null;
}

export interface CreateExecutionDisposalResponse {
  execution: ExecutionItem;
  outboundReceipt: {
    id: string;
    outboundNo: string;
    outboundType: string;
    status: string;
    totalQuantity: string;
  };
}

export interface LinkExecutionOutboundPayload {
  outboundReceiptId: string;
}
