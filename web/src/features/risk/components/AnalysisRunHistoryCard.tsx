import { StatusBadge, type StatusTone } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { TRIGGER_LABELS } from '../constants';
import { type AnalysisRunHistoryItem, type AnalysisRunStatus } from '../types';

const RUN_STATUS_META: Record<AnalysisRunStatus, { tone: StatusTone; label: string }> = {
  succeeded: { tone: 'active', label: 'Thành công' },
  failed: { tone: 'critical', label: 'Thất bại' },
  running: { tone: 'warning', label: 'Đang chạy' },
  queued: { tone: 'neutral', label: 'Chờ chạy' },
};

export interface AnalysisRunHistoryCardProps {
  runs?: readonly AnalysisRunHistoryItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function AnalysisRunHistoryCard({
  runs,
  isLoading,
  isError,
  onRetry,
}: AnalysisRunHistoryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle id="analysis-run-history-heading" className="text-lg font-semibold">
          Lịch sử lượt phân tích
        </CardTitle>
        <p className="text-sm text-[var(--text-muted)]">
          Phân tích tự động và thủ công dùng chung một luồng xử lý
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
            Đang tải lịch sử lượt phân tích...
          </div>
        ) : isError ? (
          <div className="m-6 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
            Không thể tải lịch sử lượt phân tích.{' '}
            <button type="button" onClick={onRetry} className="underline">
              Thử lại
            </button>
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
            Chưa có lượt phân tích nào được ghi nhận.
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="analysis-run-history-heading"
            className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Thời điểm</TableHead>
                  <TableHead scope="col">Nguồn kích hoạt</TableHead>
                  <TableHead scope="col">Người chạy</TableHead>
                  <TableHead scope="col" className="text-right">
                    Số lô
                  </TableHead>
                  <TableHead scope="col">Kết quả</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const statusMeta = RUN_STATUS_META[run.status] ?? {
                    tone: 'neutral' as StatusTone,
                    label: run.status,
                  };
                  const timestamp = run.finishedAt ?? run.startedAt ?? run.createdAt;
                  return (
                    <TableRow key={run.id} className="hover:bg-[var(--surface-muted)]/40">
                      <TableCell className="tabular-nums whitespace-nowrap text-[var(--text)]">
                        {formatDateTime(timestamp)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="neutral" className="rounded-md font-normal">
                          {TRIGGER_LABELS[run.trigger] ?? run.trigger}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[var(--text)]">
                        {run.requestedBy?.fullName ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap text-[var(--text)]">
                        {formatQuantity(run.lotCount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={statusMeta.tone} label={statusMeta.label} />
                          {run.status === 'failed' && run.errorMessage && (
                            <span className="text-sm text-[var(--text-muted)]">
                              {run.errorMessage}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
