export type ExpirySeverity = 'expired' | 'critical' | 'warning' | 'normal';
export type ExpiryStatusFilter = 'expired' | 'near_expiry' | 'critical' | 'warning' | 'normal';
export type LotStatus = 'active' | 'blocked' | 'closed';

export type MovementType = 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT' | 'RETURN' | 'DISPOSAL';
export type MovementSourceType = 'INBOUND_RECEIPT' | 'OUTBOUND_RECEIPT' | 'STOCK_COUNT';

export type StockCountStatus = 'draft' | 'submitted' | 'approved' | 'cancelled';

export interface InventoryLotItem {
  lotId: string;
  lotCode: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
    group: {
      id: string;
      code: string;
      name: string;
    };
  };
  expiryDate: string;
  receivedAt: string;
  daysRemaining: number;
  onHandQty: string;
  lotStatus: LotStatus;
  expiryStatus: ExpirySeverity;
  warningDays: number;
}

export interface InventoryLotsListResponse {
  evaluationDate: string;
  items: InventoryLotItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductInventorySummaryItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  group: {
    id: string;
    code: string;
    name: string;
  };
  lotCount: number;
  totalQty: string;
}

export interface InventorySummaryResponse {
  evaluationDate: string;
  lotCount: number;
  totalQty: string;
  byProduct: ProductInventorySummaryItem[];
}

export interface InventoryFilterParams {
  search?: string;
  groupId?: string;
  productId?: string;
  expiryStatus?: ExpiryStatusFilter | '';
  expiryFrom?: string;
  expiryTo?: string;
  lotStatus?: LotStatus | '';
  includeEmpty?: boolean;
}

export interface ListInventoryLotsParams extends InventoryFilterParams {
  page?: number;
  pageSize?: number;
}

export interface UpdateLotStatusPayload {
  status: 'active' | 'blocked';
  reason: string;
}

export interface StockMovementItem {
  id: string;
  occurredAt: string;
  movementType: MovementType;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  lotId: string;
  lotCode: string;
  quantityDelta: string;
  balanceAfter: string;
  source: {
    type: MovementSourceType;
    id: string;
    documentNo: string | null;
    url: string;
  };
  actor: {
    id: string;
    fullName: string;
  };
}

export interface StockMovementsListResponse {
  items: StockMovementItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListStockMovementsParams {
  search?: string;
  movementType?: MovementType | '';
  from?: string;
  to?: string;
  sourceType?: MovementSourceType | '';
  sourceId?: string;
  lotId?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}

export interface StockCountSummary {
  id: string;
  countNo: string;
  status: StockCountStatus;
  countedAt: string;
  note: string | null;
  creator: {
    id: string;
    fullName: string;
  };
  approver: {
    id: string;
    fullName: string;
  } | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  discrepancyCount: number;
  totalVarianceQty: string;
}

export interface StockCountItem {
  id: string;
  lotId: string;
  lotCode: string;
  lotStatus: string;
  expiryDate: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  systemQty: string;
  countedQty: string;
  varianceQty: string;
  currentOnHandQty: string;
  hasBalanceDrift: boolean;
  reason: string | null;
}

export interface StockCountDetail extends StockCountSummary {
  items: StockCountItem[];
}

export interface StockCountListResponse {
  items: StockCountSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListStockCountsParams {
  status?: StockCountStatus | '';
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SaveStockCountItemPayload {
  lotId: string;
  countedQty: string;
  reason?: string | null;
}

export interface SaveStockCountPayload {
  countedAt: string;
  note?: string | null;
  items: SaveStockCountItemPayload[];
}

export interface CancelStockCountPayload {
  reason: string;
}
