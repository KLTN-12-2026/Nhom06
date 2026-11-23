import { createContext, useContext } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
  variant?: 'default' | 'error';
}

export interface ToastContextValue {
  showToast: (message: string, variant?: 'default' | 'error') => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast phải được dùng bên trong ToastProvider');
  }
  return ctx;
}
