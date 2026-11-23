export type CatalogStatus = 'active' | 'inactive';

export interface ProductGroupItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: CatalogStatus;
}

export interface ProductItem {
  id: string;
  code: string;
  name: string;
  group: {
    id: string;
    code: string;
    name: string;
  };
  unit: string;
  shelfLifeDays: number | null;
  onHandQty: string;
  status: CatalogStatus;
}

export interface ProductListResponse {
  items: ProductItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateProductGroupPayload {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateProductGroupPayload {
  name?: string;
  description?: string | null;
}

export interface CreateProductPayload {
  code: string;
  name: string;
  groupId: string;
  unit: string;
  shelfLifeDays?: number;
}

export interface UpdateProductPayload {
  name?: string;
  groupId?: string;
  unit?: string;
  shelfLifeDays?: number | null;
}
