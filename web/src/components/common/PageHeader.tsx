import { type ReactNode } from 'react';
import { usePageHeader } from '@/app/page-header-context';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Khi render bên trong AppLayout: đồng bộ tiêu đề, mô tả và cụm nút hành động lên thanh header
 * chuẩn của layout. Khi render độc lập (vd: unit test component): render header tại chỗ.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const hasLayoutHeader = usePageHeader({ title, description, actions });

  if (hasLayoutHeader) {
    return null;
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
