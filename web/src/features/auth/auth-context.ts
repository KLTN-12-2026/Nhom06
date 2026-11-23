import { createContext } from 'react';
import { type AuthUser, type LoginPayload } from './types';

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (code?: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
