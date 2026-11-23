import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/hooks';
import { PROPOSAL_ACTION_LABELS } from '@/features/proposals/constants';
import { type ProposalActionType } from '@/features/proposals/types';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatQuantity, formatTimestampDateVi } from '@/lib/format';
import { ExecutionResultDialog } from '../components/ExecutionResultDialog';
import { EXECUTION_STATUS_META, isTerminalExecutionStatus } from '../constants';
import { useExecutionsQuery } from '../hooks';
import { type ExecutionItem, type ExecutionStatus } from '../types';

export function ExecutionsPage() {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('executions.update');

  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | ''>('');
  const [actionFilter, setActionFilter] = useState<ProposalActionType | ''>('');
  const [editingExecution, setEditingExecution] = useState<ExecutionItem | null>(null);

  const executionsQuery = useExecutionsQuery({
    status: statusFilter,
    actionType: actionFilter,
  });

  const kpi = executionsQuery.data?.kpi;
  const items = executionsQuery.data?.items ?? [];
  const hasFilters = Boolean(statusFilter || actionFilter);

  const handleResetFilters = () => {
    setStatusFilter('');
    setActionFilter('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Theo dõi thực hiện phương án"
        description="Đã duyệt và đã thực hiện là hai trạng thái khác nhau"
      />

      {/* 3 KPI cards khớp mockup 27 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-[var(--text-muted)]">Phương án đã duyệt</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--text)]">
              {kpi ? formatQuantity(kpi.approvedCount) : '—'}
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-muted)]">
              {kpi ? `${formatQuantity(kpi.inProgressCount)} đang thực hiện` : 'Đang tải...'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-[var(--text-muted)]">Lượng cần xử lý</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--text)]">
              {kpi ? formatQuantity(kpi.plannedQtyTotal) : '—'}
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-muted)]">
              theo các phương án đã duyệt
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-[var(--text-muted)]">Đã xử lý thực tế</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--text)]">
              {kpi ? formatQuantity(kpi.actualQtyTotal) : '—'}
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-muted)]">
              ghi nhận bởi nhân viên kho
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hộp ghi chú bất biến nghiệp vụ theo mockup 27 */}
      <div
        role="note"
        className="rounded-lg border border-border border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-relaxed text-[var(--text)]"
      >
        Ghi kết quả ở màn hình này không làm thay đổi tồn kho. Khi phương án được thực hiện bằng
        việc xuất hàng, tồn chỉ giảm qua phiếu xuất và kết quả sẽ trỏ về phiếu xuất đó.
      </div>

      {/* Bộ lọc */}
      <FilterBar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | '')}
          aria-label="Lọc theo tiến độ thực hiện"
          className="h-10 w-full sm:w-52"
        >
          <option value="">Tất cả tiến độ</option>
          <option value="planned">Chưa bắt đầu</option>
          <option value="in_progress">Đang thực hiện</option>
          <option value="completed">Hoàn thành</option>
          <option value="failed">Không thực hiện được</option>
          <option value="cancelled">Đã hủy</option>
        </Select>

        <Select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as ProposalActionType | '')}
          aria-label="Lọc theo phương án"
          className="h-10 w-full sm:w-56"
        >
          <option value="">Tất cả phương án</option>
          {(Object.keys(PROPOSAL_ACTION_LABELS) as ProposalActionType[]).map((key) => (
            <option key={key} value={key}>
              {PROPOSAL_ACTION_LABELS[key]}
            </option>
          ))}
        </Select>

        {hasFilters && (
          <Button type="button" variant="outline" onClick={handleResetFilters}>
            Đặt lại
          </Button>
        )}
      </FilterBar>

      {/* Bảng theo dõi thực hiện phương án (mockup 27) */}
      <Card>
        <CardContent className="p-0">
          {executionsQuery.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              Đang tải danh sách theo dõi thực hiện phương án...
            </div>
          ) : executionsQuery.isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-[var(--risk-critical-fg)]">
                {executionsQuery.error instanceof ApiError
                  ? executionsQuery.error.message
                  : 'Không thể tải danh sách thực hiện phương án. Vui lòng thử lại.'}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void executionsQuery.refetch()}
              >
                Thử lại
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              {hasFilters
                ? 'Không có kết quả phù hợp với bộ lọc hiện tại.'
                : 'Chưa có phương án nào được phê duyệt. Hãy phê duyệt đề xuất xử lý để bắt đầu theo dõi thực hiện.'}
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-label="Danh sách theo dõi thực hiện phương án"
              className="relative overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]">
                    <TableHead scope="col">Lô</TableHead>
                    <TableHead scope="col">Sản phẩm</TableHead>
                    <TableHead scope="col">Phương án</TableHead>
                    <TableHead scope="col" className="text-right">
                      Lượng đề xuất
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Đã xử lý
                    </TableHead>
                    <TableHead scope="col">Người duyệt</TableHead>
                    <TableHead scope="col">Tiến độ</TableHead>
                    <TableHead scope="col" className="w-32 text-right">
                      <span className="sr-only">Thao tác</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const statusMeta = EXECUTION_STATUS_META[item.status] ?? {
                      tone: 'neutral' as const,
                      label: item.status,
                    };
                    const canRecord = canUpdate && !isTerminalExecutionStatus(item.status);
                    const hasHistoryOrLinks =
                      item.updates.length > 0 || item.linkedOutbounds.length > 0;

                    return (
                      <Fragment key={item.id}>
                        <TableRow className="hover:bg-[var(--surface-muted)]/40">
                          <TableCell className="whitespace-nowrap font-medium text-[var(--text)]">
                            <Link
                              to={`/proposals/${item.proposal.id}`}
                              className="text-[var(--text)] hover:text-[var(--info)] hover:underline"
                            >
                              {item.lot.lotCode}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[240px] text-sm">
                              <span className="font-medium text-[var(--text)]">
                                {item.product.code}
                              </span>{' '}
                              <span className="text-[var(--text-muted)]">{item.product.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] text-sm text-[var(--text)]">
                            {item.proposal.actionLabel}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-[var(--text)]">
                            {formatQuantity(item.plannedQty)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-[var(--text)]">
                            {item.actualQty !== null ? (
                              formatQuantity(item.actualQty)
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {item.decision ? (
                              <div>
                                <div className="text-[var(--text)]">
                                  {item.decision.decider.fullName}
                                </div>
                                <div className="text-xs tabular-nums text-[var(--text-muted)]">
                                  {formatTimestampDateVi(item.decision.decidedAt)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <StatusBadge tone={statusMeta.tone} label={statusMeta.label} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {canRecord && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingExecution(item)}
                              >
                                Ghi kết quả
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>

                        {hasHistoryOrLinks && (
                          <TableRow className="bg-[var(--surface-muted)]/35 hover:bg-[var(--surface-muted)]/35">
                            <TableCell colSpan={8} className="py-2.5 pl-6 pr-4">
                              <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
                                {item.updates.map((upd) => (
                                  <div
                                    key={upd.id}
                                    className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
                                  >
                                    <span className="tabular-nums">
                                      {formatDateTime(upd.updatedAt)}
                                    </span>
                                    <span>·</span>
                                    <span className="font-medium text-[var(--text)]">
                                      {upd.updater.fullName}:
                                    </span>
                                    <span>
                                      {upd.note ??
                                        EXECUTION_STATUS_META[upd.status]?.label ??
                                        upd.status}
                                    </span>
                                    {upd.actualQtyDelta !== null &&
                                      Number(upd.actualQtyDelta) > 0 && (
                                        <strong className="font-semibold tabular-nums text-[var(--text)]">
                                          ({formatQuantity(upd.actualQtyDelta)} đơn vị)
                                        </strong>
                                      )}
                                    {upd.linkedOutbound && (
                                      <Link
                                        to={`/outbound/${upd.linkedOutbound.id}`}
                                        className="font-medium text-[var(--info)] hover:underline"
                                      >
                                        [{upd.linkedOutbound.outboundNo}]
                                      </Link>
                                    )}
                                  </div>
                                ))}

                                {item.linkedOutbounds.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                    <span>Phiếu xuất liên kết:</span>
                                    {item.linkedOutbounds.map((ob) => (
                                      <Link
                                        key={ob.id}
                                        to={`/outbound/${ob.id}`}
                                        className="font-medium text-[var(--info)] hover:underline"
                                      >
                                        {ob.outboundNo}
                                      </Link>
                                    ))}
                                  </div>
                                )}
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

      <ExecutionResultDialog
        execution={editingExecution}
        open={Boolean(editingExecution)}
        onOpenChange={(next) => {
          if (!next) {
            setEditingExecution(null);
          }
        }}
      />
    </div>
  );
}
