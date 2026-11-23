import { createContext } from 'react';
import { type AuthUser, type LoginPayload } from './types';

export interface LogoutOptions {
  skipServerRequest?: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: (options?: LogoutOptions) => Promise<void>;
  hasPermission: (code?: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
