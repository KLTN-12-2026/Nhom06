import { apiFetch } from '@/lib/api';
import {
  type AuthUser,
  type ChangePasswordPayload,
  type LoginPayload,
  type LoginResponse,
} from './types';

export function loginRequest(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuthRedirect: true,
  });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/me');
}

export function logoutRequest(): Promise<void> {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
    skipAuthRedirect: true,
  });
}

export function changePasswordRequest(payload: ChangePasswordPayload): Promise<void> {
  return apiFetch<void>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
