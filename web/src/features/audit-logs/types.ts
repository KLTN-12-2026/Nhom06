export interface AuditLogActor {
  id: string;
  username: string;
  fullName: string;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  actor: AuditLogActor | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
}

export interface AuditLogsListResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogFacetsResponse {
  eventTypes: string[];
  entityTypes: string[];
  actors: AuditLogActor[];
}

export interface AuditLogsQueryParams {
  eventType?: string;
  entityType?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
