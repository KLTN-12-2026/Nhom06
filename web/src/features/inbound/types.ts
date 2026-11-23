export type InboundReceiptStatus = 'draft' | 'confirmed' | 'cancelled';

export interface InboundSupplierRef {
  id: string;
  code: string;
  name: string;
}

export interface InboundUserRef {
  id: string;
  fullName: string;
}

export interface InboundProductRef {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface InboundReceiptSummary {
  id: string;
  receiptNo: string;
  receiptDate: string;
  status: InboundReceiptStatus;
  notes: string | null;
  supplier: InboundSupplierRef;
  creator: InboundUserRef;
  confirmer: InboundUserRef | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  totalQuantity: string;
  totalAmount: string;
}

export interface InboundReceiptItem {
  id: string;
  productId: string;
  product: InboundProductRef;
  lotId: string | null;
  lotCode: string;
  expiryDate: string;
  manufacturedDate: string | null;
  quantity: string;
  unitCost: string | null;
  lineTotal: string | null;
}

export interface InboundReceiptDetail extends InboundReceiptSummary {
  items: InboundReceiptItem[];
}

export interface InboundReceiptListResponse {
  items: InboundReceiptSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListInboundReceiptsParams {
  status?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InboundReceiptItemPayload {
  productId: string;
  lotCode: string;
  expiryDate: string;
  manufacturedDate?: string | null;
  quantity: string;
  unitCost?: string | null;
}

export interface SaveInboundReceiptPayload {
  supplierId: string;
  receiptDate: string;
  notes?: string | null;
  items: InboundReceiptItemPayload[];
}
