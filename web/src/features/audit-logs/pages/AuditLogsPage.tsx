import { Fragment, useState } from 'react';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { useAuditLogFacetsQuery, useAuditLogsQuery } from '../hooks';
import {
  formatShortEntityId,
  getEntityTypeLabel,
  getEventLabel,
  getEventTone,
} from '../labels';

const PAGE_SIZE = 50;

function formatJsonBlock(data: unknown): string | null {
  if (data === null || data === undefined) {
    return null;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function AuditLogsPage() {
  const [eventType, setEventType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const facetsQuery = useAuditLogFacetsQuery();
  const logsQuery = useAuditLogsQuery({
    eventType: eventType || undefined,
    entityType: entityType || undefined,
    actorUserId: actorUserId || undefined,
    from: from || undefined,
    to: to || undefined,
    search: search.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasFilters = Boolean(
    eventType || entityType || actorUserId || from || to || search.trim(),
  );

  const handleResetFilters = () => {
    setEventType('');
    setEntityType('');
    setActorUserId('');
    setFrom('');
    setTo('');
    setSearch('');
    setPage(1);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const items = logsQuery.data?.items ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhật ký hệ thống"
        description="Tra cứu lịch sử thao tác"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="search" className="flex-1">
          <FilterBar>
            <Select
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo sự kiện"
              className="h-10 w-full sm:w-52"
            >
              <option value="">Tất cả sự kiện</option>
              {(facetsQuery.data?.eventTypes ?? []).map((code) => (
                <option key={code} value={code}>
                  {getEventLabel(code)}
                </option>
              ))}
            </Select>

            <Select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo đối tượng"
              className="h-10 w-full sm:w-44"
            >
              <option value="">Tất cả đối tượng</option>
              {(facetsQuery.data?.entityTypes ?? []).map((type) => (
                <option key={type} value={type}>
                  {getEntityTypeLabel(type)}
                </option>
              ))}
            </Select>

            <Select
              value={actorUserId}
              onChange={(e) => {
                setActorUserId(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo người thực hiện"
              className="h-10 w-full sm:w-52"
            >
              <option value="">Tất cả người thực hiện</option>
              {(facetsQuery.data?.actors ?? []).map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.fullName} ({actor.username})
                </option>
              ))}
            </Select>

            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Từ ngày"
              title="Từ ngày (giờ VN)"
              className="h-10 w-full sm:w-40"
            />

            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              aria-label="Đến ngày"
              title="Đến ngày (giờ VN)"
              className="h-10 w-full sm:w-40"
            />

            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm mã đối tượng, chứng từ, tài khoản..."
              aria-label="Tìm kiếm nhật ký"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full sm:w-64"
            />

            {hasFilters && (
              <Button type="button" variant="outline" onClick={handleResetFilters}>
                Đặt lại
              </Button>
            )}
          </FilterBar>
        </div>

        <p className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
          {formatQuantity(total)} bản ghi
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {logsQuery.isLoading && (
            <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
              Đang tải nhật ký hệ thống...
            </div>
          )}

          {logsQuery.isError && (
            <div className="m-6 rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
              Không thể tải nhật ký hệ thống.{' '}
              <button
                type="button"
                onClick={() => void logsQuery.refetch()}
                className="underline"
              >
                Thử lại
              </button>
            </div>
          )}

          {!logsQuery.isLoading && !logsQuery.isError && items.length === 0 && (
            <div className="px-6 py-8 text-sm text-[var(--text-muted)]">
              {hasFilters
                ? 'Không có kết quả phù hợp.'
                : 'Chưa có bản ghi nhật ký hệ thống nào.'}
            </div>
          )}

          {!logsQuery.isLoading && !logsQuery.isError && items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời điểm</TableHead>
                    <TableHead>Người thực hiện</TableHead>
                    <TableHead>Sự kiện</TableHead>
                    <TableHead>Đối tượng</TableHead>
                    <TableHead className="text-right">Chi tiết</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => {
                    const isExpanded = expandedIds.has(row.id);
                    const oldJson = formatJsonBlock(row.oldData);
                    const newJson = formatJsonBlock(row.newData);

                    return (
                      <Fragment key={row.id}>
                        <TableRow className="hover:bg-[var(--surface-muted)]/40">
                          <TableCell className="tabular-nums whitespace-nowrap text-[var(--text)]">
                            {formatDateTime(row.createdAt)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.actor ? (
                              <div className="flex flex-col">
                                <span className="font-medium text-[var(--text)]">
                                  {row.actor.fullName}
                                </span>
                                <span className="text-xs text-[var(--text-muted)]">
                                  {row.actor.username}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[var(--text-muted)]">Hệ thống</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <StatusBadge
                              tone={getEventTone(row.eventType)}
                              label={getEventLabel(row.eventType)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-wrap items-baseline gap-1.5">
                              <span className="font-medium text-[var(--text)]">
                                {getEntityTypeLabel(row.entityType)}
                              </span>
                              {row.entityId && (
                                <code
                                  title={row.entityId}
                                  className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-muted)]"
                                >
                                  {formatShortEntityId(row.entityId)}
                                </code>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-expanded={isExpanded}
                              onClick={() => toggleExpand(row.id)}
                            >
                              {isExpanded ? 'Thu gọn' : 'Chi tiết'}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-[var(--surface-muted)]/35 hover:bg-[var(--surface-muted)]/35">
                            <TableCell colSpan={5} className="p-4">
                              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                                <span>
                                  Mã sự kiện: <code className="font-mono">{row.eventType}</code>
                                </span>
                                <span>
                                  Loại đối tượng:{' '}
                                  <code className="font-mono">{row.entityType}</code>
                                </span>
                                {row.entityId && (
                                  <span>
                                    ID đối tượng:{' '}
                                    <code className="font-mono">{row.entityId}</code>
                                  </span>
                                )}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                                  <div className="mb-1.5 text-xs font-semibold text-[var(--text-muted)]">
                                    Trước
                                  </div>
                                  {oldJson ? (
                                    <pre className="max-h-64 overflow-auto font-mono text-xs text-[var(--text)]">
                                      {oldJson}
                                    </pre>
                                  ) : (
                                    <p className="text-xs italic text-[var(--text-muted)]">
                                      Không có dữ liệu
                                    </p>
                                  )}
                                </div>
                                <div className="rounded-md border border-border bg-[var(--surface)] p-3">
                                  <div className="mb-1.5 text-xs font-semibold text-[var(--text-muted)]">
                                    Sau
                                  </div>
                                  {newJson ? (
                                    <pre className="max-h-64 overflow-auto font-mono text-xs text-[var(--text)]">
                                      {newJson}
                                    </pre>
                                  ) : (
                                    <p className="text-xs italic text-[var(--text-muted)]">
                                      Không có dữ liệu
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span className="tabular-nums">
            Trang {page} / {totalPages} ({formatQuantity(total)} dòng)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trang trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
