import { createContext, type ReactNode, useContext, useEffect } from 'react';

export interface PageHeaderConfig {
  title?: string;
  description?: string;
  actions?: ReactNode;
}

export interface PageHeaderContextValue {
  hasLayoutHeader: boolean;
  setHeader: (config: PageHeaderConfig | null) => void;
}

export const PageHeaderContext = createContext<PageHeaderContextValue>({
  hasLayoutHeader: false,
  setHeader: () => {},
});

export function usePageHeader(config: PageHeaderConfig): boolean {
  const { hasLayoutHeader, setHeader } = useContext(PageHeaderContext);
  const { title, description, actions } = config;

  useEffect(() => {
    if (!hasLayoutHeader) {
      return;
    }
    setHeader({ title, description, actions });
    return () => setHeader(null);
  }, [hasLayoutHeader, setHeader, title, description, actions]);

  return hasLayoutHeader;
}
