import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      onPageChange(totalPages);
    }
  }, [onPageChange, page, totalPages]);

  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
      <span className="tabular-nums">
        Trang {page} / {totalPages} ({numberFormatter.format(total)} dòng)
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Trang trước
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}
