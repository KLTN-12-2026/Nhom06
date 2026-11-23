import { useMutation } from '@tanstack/react-query';
import { useContext } from 'react';
import { changePasswordRequest } from './api';
import { AuthContext, type AuthContextValue } from './auth-context';
import { type ChangePasswordPayload } from './types';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return ctx;
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changePasswordRequest(payload),
  });
}
