import { apiFetch } from '@/lib/api';
import {
  type CreateUserPayload,
  type PermissionMatrixResponse,
  type RoleOption,
  type UpdateUserProfilePayload,
  type UserItem,
} from './types';

export interface ListUsersParams {
  search?: string;
  status?: string;
}

export function fetchUsers(params: ListUsersParams = {}): Promise<UserItem[]> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params.status) {
    query.set('status', params.status);
  }
  const qs = query.toString();
  return apiFetch<UserItem[]>(`/users${qs ? `?${qs}` : ''}`);
}

export function createUser(payload: CreateUserPayload): Promise<UserItem> {
  return apiFetch<UserItem>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUserProfile(id: string, payload: UpdateUserProfilePayload): Promise<UserItem> {
  return apiFetch<UserItem>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateUserStatus(id: string, status: 'active' | 'locked'): Promise<UserItem> {
  return apiFetch<UserItem>(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function updateUserRole(id: string, roleCode: string): Promise<UserItem> {
  return apiFetch<UserItem>(`/users/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ roleCode }),
  });
}

export function fetchRoles(): Promise<RoleOption[]> {
  return apiFetch<RoleOption[]>('/roles');
}

export function fetchPermissionMatrix(): Promise<PermissionMatrixResponse> {
  return apiFetch<PermissionMatrixResponse>('/permissions/matrix');
}
