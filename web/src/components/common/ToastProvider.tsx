import { type ReactNode, useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ToastContext, type ToastMessage } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, variant: 'default' | 'error' = 'default') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-md"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-md px-4 py-3 text-sm font-medium text-white shadow-sm',
              toast.variant === 'error'
                ? 'bg-[var(--risk-critical-fg)]'
                : 'bg-[var(--text)]',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
