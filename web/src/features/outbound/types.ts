import { type ExpiryBarSeverity } from '@/components/common/ExpiryBar';

export interface FefoPlanEligibleLot {
  lotId: string;
  lotCode: string;
  expiryDate: string;
  receivedAt: string;
  daysRemaining: number;
  severity: ExpiryBarSeverity;
  onHandQty: string;
  allocateQty: string;
  rank: number;
}

export interface FefoPlanExcludedLot {
  lotId: string;
  lotCode: string;
  expiryDate: string;
  receivedAt: string;
  daysRemaining: number;
  severity: ExpiryBarSeverity;
  onHandQty: string;
  reason: string;
}

export interface FefoPlanOrderItem {
  orderItemId: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  requestedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  allocatedQty: string;
  shortageQty: string;
  lots: FefoPlanEligibleLot[];
  excludedLots: FefoPlanExcludedLot[];
}

export interface OrderFefoPlan {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  agency: {
    id: string;
    code: string;
    name: string;
  };
  evaluationDate: string;
  minDeliveryDays: number;
  totalRequestedQty: string;
  totalRemainingQty: string;
  totalAllocatedQty: string;
  totalShortageQty: string;
  items: FefoPlanOrderItem[];
}

export interface FefoBypassWarning {
  code: 'FEFO_ORDER_BYPASSED';
  orderItemId: string;
  productId: string;
  productCode: string;
  lotId: string;
  lotCode: string;
  expiryDate: string;
  earlierLotId: string;
  earlierLotCode: string;
  earlierExpiryDate: string;
  message: string;
}

export interface OutboundReceiptSummary {
  id: string;
  outboundNo: string;
  outboundType: 'ORDER' | 'RETURN_TO_SUPPLIER' | 'DISPOSAL' | 'OTHER' | string;
  status: string;
  order: {
    id: string;
    orderNo: string;
    agency: {
      id: string;
      code: string;
      name: string;
    };
  } | null;
  creator: {
    id: string;
    fullName: string;
  };
  confirmer: {
    id: string;
    fullName: string;
  } | null;
  confirmedAt: string | null;
  notes: string | null;
  lotCount: number;
  totalQuantity: string;
  matchedLotQty?: string;
  createdAt: string;
}

export interface OutboundReceiptItemDetail {
  id: string;
  orderItemId: string | null;
  lotId: string;
  lotCode: string;
  expiryDate: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  quantity: string;
}

export interface OutboundReceiptDetail extends OutboundReceiptSummary {
  items: OutboundReceiptItemDetail[];
}

export interface ConfirmOrderOutboundPayload {
  items: Array<{
    orderItemId: string;
    lotId: string;
    quantity: string;
  }>;
  notes?: string | null;
}

export interface ConfirmOrderOutboundResponse extends OutboundReceiptDetail {
  orderStatus: 'partial' | 'fulfilled';
  warnings: FefoBypassWarning[];
}

export const OUTBOUND_TYPE_LABELS: Record<string, string> = {
  ORDER: 'Xuất theo đơn',
  RETURN_TO_SUPPLIER: 'Trả nhà cung cấp',
  DISPOSAL: 'Xuất hủy',
  OTHER: 'Xuất khác',
};

export function getOutboundTypeLabel(type: string): string {
  return OUTBOUND_TYPE_LABELS[type] ?? type;
}

export interface OutboundReceiptListResponse {
  items: OutboundReceiptSummary[];
  total: number;
  page: number;
  pageSize: number;
}
