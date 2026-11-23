export type SupplierStatus = 'active' | 'inactive';

export interface SupplierItem {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: SupplierStatus;
}

export interface CreateSupplierPayload {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface UpdateSupplierPayload {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}
