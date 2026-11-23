import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { clearAccessToken, getAccessToken, onUnauthorized, setAccessToken } from '@/lib/auth';
import { fetchCurrentUser, loginRequest, logoutRequest } from './api';
import { AuthContext } from './auth-context';
import { type AuthUser, type LoginPayload } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(getAccessToken()));

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setIsLoading(false);
      queryClient.clear();
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    fetchCurrentUser()
      .then((profile) => {
        if (!cancelled) {
          setUser(profile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearAccessToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<AuthUser> => {
    const response = await loginRequest(payload);
    setAccessToken(response.accessToken);
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(
    async (options?: { skipServerRequest?: boolean }): Promise<void> => {
      try {
        if (!options?.skipServerRequest && getAccessToken()) {
          await logoutRequest();
        }
      } catch {
        // Vẫn xóa phiên cục bộ ngay cả khi token đã hết hạn trên server
      } finally {
        clearAccessToken();
        setUser(null);
        queryClient.clear();
      }
    },
    [queryClient],
  );

  const permissionSet = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const hasPermission = useCallback(
    (code?: string): boolean => {
      if (!code) {
        return true;
      }
      return permissionSet.has(code);
    },
    [permissionSet],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      hasPermission,
    }),
    [user, isLoading, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
