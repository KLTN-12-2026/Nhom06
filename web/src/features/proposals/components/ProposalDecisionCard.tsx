import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { useApproveProposalMutation, useRejectProposalMutation } from '../hooks';
import { type ProposalDetailResponse } from '../types';

export interface ProposalDecisionCardProps {
  proposal: ProposalDetailResponse;
  onConflictRefresh: () => void;
}

export function ProposalDecisionCard({
  proposal,
  onConflictRefresh,
}: ProposalDecisionCardProps) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'approve' | 'reject' | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  const approveMutation = useApproveProposalMutation(proposal.id);
  const rejectMutation = useRejectProposalMutation(proposal.id);

  const canApprove = hasPermission('proposals.approve');
  const canReadExecutions = hasPermission('executions.read');
  const isPending = proposal.status === 'pending';
  const isSubmitting = approveMutation.isPending || rejectMutation.isPending;

  const handleOpenApprove = () => {
    setReasonError(null);
    setConfirmMode('approve');
  };

  const handleOpenReject = () => {
    if (note.trim().length === 0) {
      setReasonError('Vui lòng nhập lý do từ chối trước khi xác nhận.');
      noteInputRef.current?.focus();
      return;
    }
    setReasonError(null);
    setConfirmMode('reject');
  };

  const handleConfirmDecision = async () => {
    if (!confirmMode) {
      return;
    }

    try {
      if (confirmMode === 'approve') {
        await approveMutation.mutateAsync({
          note: note.trim().length > 0 ? note.trim() : null,
        });
        setConfirmMode(null);
        setNote('');
        showToast('Đã ghi nhận quyết định: phê duyệt.');
      } else {
        await rejectMutation.mutateAsync({ reason: note.trim() });
        setConfirmMode(null);
        setNote('');
        showToast('Đã ghi nhận quyết định: từ chối.');
      }
    } catch (error) {
      setConfirmMode(null);
      if (error instanceof ApiError) {
        if (error.statusCode === 409) {
          showToast(error.message, 'error');
          onConflictRefresh();
          return;
        }
        const reasonFieldErr = error.errors?.find((item) => item.field === 'reason');
        if (reasonFieldErr) {
          setReasonError(reasonFieldErr.message);
          noteInputRef.current?.focus();
          return;
        }
        showToast(error.message, 'error');
        return;
      }
      showToast('Không thể ghi nhận quyết định lúc này. Vui lòng thử lại.', 'error');
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
        <CardTitle className="text-lg font-semibold">Quyết định</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-[var(--surface-muted)]/60 p-4">
          <div className="text-xs text-[var(--text-muted)]">Phương án theo quy tắc nghiệp vụ</div>
          <div className="mt-1 text-base font-semibold text-[var(--text)]">
            {proposal.actionLabel}
          </div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">
            Lượng đề xuất xử lý{' '}
            <strong className="font-semibold tabular-nums text-[var(--text)]">
              {formatQuantity(proposal.proposedQty)} {proposal.product.unit}
            </strong>
          </div>
        </div>

        {proposal.decision ? (
          <div className="space-y-4">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[var(--text-muted)]">Kết quả</dt>
                <dd className="min-w-0 break-words text-right font-medium text-[var(--text)]">
                  {proposal.decision.decision === 'approved' ? 'Phê duyệt' : 'Từ chối'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[var(--text-muted)]">Người quyết định</dt>
                <dd className="min-w-0 break-words text-right font-medium text-[var(--text)]">
                  {proposal.decision.decider.fullName}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[var(--text-muted)]">Thời điểm</dt>
                <dd className="min-w-0 break-words text-right font-medium tabular-nums text-[var(--text)]">
                  {formatDateTime(proposal.decision.decidedAt)}
                </dd>
              </div>
              {proposal.decision.reason && (
                <div className="space-y-1 border-t border-border pt-2.5">
                  <dt className="text-xs text-[var(--text-muted)]">
                    {proposal.decision.decision === 'approved' ? 'Ý kiến' : 'Lý do từ chối'}
                  </dt>
                  <dd className="whitespace-pre-line break-words text-sm text-[var(--text)]">
                    {proposal.decision.reason}
                  </dd>
                </div>
              )}
            </dl>

            {proposal.decision.decision === 'approved' && canReadExecutions && (
              <Button asChild type="button" variant="secondary" className="w-full sm:w-auto">
                <Link to="/executions">Theo dõi thực hiện</Link>
              </Button>
            )}
          </div>
        ) : isPending && canApprove ? (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor="proposal-decision-note"
                className="block text-sm font-medium text-[var(--text)]"
              >
                Ý kiến (bắt buộc khi từ chối)
              </label>
              <textarea
                ref={noteInputRef}
                id="proposal-decision-note"
                name="decisionNote"
                rows={3}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (reasonError && e.target.value.trim().length > 0) {
                    setReasonError(null);
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={reasonError ? 'true' : 'false'}
                aria-describedby={reasonError ? 'proposal-decision-error' : undefined}
                placeholder="Ghi lý do hoặc lưu ý cho người thực hiện"
                className="w-full rounded-md border border-border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)] disabled:cursor-not-allowed disabled:opacity-60"
              />
              {reasonError && (
                <p
                  id="proposal-decision-error"
                  role="alert"
                  className="text-xs font-medium text-[var(--risk-critical-fg)]"
                >
                  {reasonError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting}
                onClick={handleOpenReject}
              >
                Từ chối
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={isSubmitting}
                onClick={handleOpenApprove}
              >
                Phê duyệt
              </Button>
            </div>

            <div
              role="note"
              className="rounded-md border border-border border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-3.5 py-3 text-xs leading-relaxed text-[var(--text)]"
            >
              Phê duyệt chỉ ghi nhận quyết định. Tồn kho không thay đổi cho đến khi phương án được
              thực hiện bằng một phiếu xuất thật.
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              {isPending
                ? 'Đề xuất đang chờ quản lý kho xem xét và phê duyệt.'
                : 'Đề xuất không còn ở trạng thái chờ duyệt.'}
            </p>
            <div
              role="note"
              className="rounded-md border border-border border-l-4 border-l-[var(--info)] bg-[var(--surface-muted)] px-3.5 py-3 text-xs leading-relaxed text-[var(--text)]"
            >
              Phê duyệt chỉ ghi nhận quyết định. Tồn kho không thay đổi cho đến khi phương án được
              thực hiện bằng một phiếu xuất thật.
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmMode === 'approve'}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setConfirmMode(null);
          }
        }}
        title="Phê duyệt đề xuất này?"
        description="Quyết định được ghi lại kèm người thực hiện và thời điểm. Việc này không tạo chứng từ xuất và không trừ tồn kho."
        confirmLabel="Phê duyệt"
        cancelLabel="Quay lại"
        variant="default"
        isPending={isSubmitting}
        onConfirm={() => void handleConfirmDecision()}
      />

      <ConfirmDialog
        open={confirmMode === 'reject'}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setConfirmMode(null);
          }
        }}
        title="Từ chối đề xuất này?"
        description="Quyết định từ chối kèm lý do sẽ được ghi lại cùng người thực hiện và thời điểm. Việc này không tạo chứng từ xuất và không thay đổi tồn kho."
        confirmLabel="Từ chối"
        cancelLabel="Quay lại"
        variant="destructive"
        isPending={isSubmitting}
        onConfirm={() => void handleConfirmDecision()}
      />
    </Card>
  );
}
