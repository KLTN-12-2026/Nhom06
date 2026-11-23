import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHealthQuery } from '../hooks';
import { type DependencyStatus } from '../types';

function DependencyBadge({ label, status }: { label: string; status: DependencyStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>{label}:</span>
      <StatusBadge
        tone={status === 'up' ? 'active' : 'critical'}
        label={status === 'up' ? 'Hoạt động (up)' : 'Ngừng kết nối (down)'}
      />
    </span>
  );
}

export function SystemHealthCompactCard() {
  const { data, isLoading, isError, refetch, isFetching } = useHealthQuery(true);

  return (
    <Card data-testid="system-health-compact-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-3.5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Trạng thái dịch vụ (Quản trị)
          </span>

          {isLoading && (
            <span className="text-xs text-[var(--text-muted)]">Đang kiểm tra kết nối...</span>
          )}

          {isError && (
            <span className="text-xs text-[var(--risk-critical-fg)]">
              Không thể kết nối tới dịch vụ API.
            </span>
          )}

          {data && (
            <div className="flex flex-wrap items-center gap-4">
              <DependencyBadge label="PostgreSQL" status={data.db} />
              <DependencyBadge label="ML" status={data.ml} />
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
        </Button>
      </CardContent>
    </Card>
  );
}
