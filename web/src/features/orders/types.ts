export type AgencyOrderStatus = 'confirmed' | 'partial' | 'fulfilled' | 'cancelled';

export interface AgencyOrderSummary {
  id: string;
  orderNo: string;
  orderDate: string;
  status: AgencyOrderStatus | string;
  notes: string | null;
  agency: {
    id: string;
    code: string;
    name: string;
  };
  creator: {
    id: string;
    fullName: string;
  };
  canceller: {
    id: string;
    fullName: string;
  } | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  totalRequestedQty: string;
  totalFulfilledQty: string;
  totalRemainingQty: string;
}

export interface AgencyOrderItemDetail {
  id: string;
  productId: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  requestedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  availableQty: string;
  status: string;
}

export interface OrderLinkedOutbound {
  id: string;
  outboundNo: string;
  outboundType: string;
  status: string;
  confirmedAt: string | null;
  confirmer: {
    id: string;
    fullName: string;
  } | null;
  lotCount: number;
  totalQuantity: string;
}

export interface AgencyOrderDetail extends AgencyOrderSummary {
  evaluationDate: string;
  minDeliveryDays: number;
  items: AgencyOrderItemDetail[];
  outboundReceipts: OrderLinkedOutbound[];
}

export interface AgencyOrderListResponse {
  items: AgencyOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  pendingCount: number;
}

export interface OrderItemPayload {
  productId: string;
  requestedQty: string;
}

export interface SaveAgencyOrderPayload {
  agencyId: string;
  orderDate: string;
  notes?: string | null;
  items: OrderItemPayload[];
}

export interface CancelAgencyOrderPayload {
  reason: string;
}
