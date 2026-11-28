import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { RiskLevelBadge } from '@/components/common/RiskStatusBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatDateVi, formatQuantity } from '@/lib/format';
import { LlmInputPanel } from '../components/LlmInputPanel';
import { ProposalDecisionCard } from '../components/ProposalDecisionCard';
import { ProposalExplanationBlock } from '../components/ProposalExplanationBlock';
import { formatRemainingDaysText, PROPOSAL_STATUS_META } from '../constants';
import { useExplainProposalMutation, useProposalDetailQuery } from '../hooks';

export function ProposalDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const detailQuery = useProposalDetailQuery(id);
  const explainMutation = useExplainProposalMutation(id);

  const proposal = detailQuery.data;
  const canRunExplain = hasPermission('analysis.run');
  const canViewLlmInput = hasPermission('proposals.approve') || hasPermission('users.manage');

  const handleExplain = async (simulateFailure: boolean) => {
    try {
      await explainMutation.mutateAsync({ simulateFailure });
      showToast(
        simulateFailure
          ? 'Đang hiển thị tóm tắt nghiệp vụ dự phòng.'
          : 'Đã cập nhật phần diễn giải cho đề xuất.',
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Không thể cập nhật diễn giải lúc này. Vui lòng thử lại.';
      showToast(message, 'error');
    }
  };

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chi tiết đề xuất xử lý" description="Đang tải dữ liệu đề xuất..." />
        <Card>
          <CardContent className="py-12 text-center text-sm text-[var(--text-muted)]">
            Đang tải chi tiết đề xuất xử lý...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detailQuery.isError || !proposal) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chi tiết đề xuất xử lý" description="Không tải được thông tin đề xuất" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-[var(--risk-critical-fg)]">
              {detailQuery.error instanceof ApiError
                ? detailQuery.error.message
                : 'Không thể tải chi tiết đề xuất xử lý. Vui lòng thử lại.'}
            </p>
            <div className="flex items-center gap-2">
              <Button asChild type="button" variant="outline">
                <Link to="/proposals">Quay lại danh sách</Link>
              </Button>
              <Button type="button" variant="secondary" onClick={() => void detailQuery.refetch()}>
                Thử lại
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canToggleDemo = proposal.llmDemoToggleEnabled && canRunExplain;
  const inventoryLotUrl =
    Number(proposal.lot.currentOnHandQty) <= 0
      ? `/inventory?lotId=${proposal.lot.id}&includeEmpty=true`
      : `/inventory?lotId=${proposal.lot.id}`;
  const headerBadge =
    proposal.status === 'pending' || proposal.status === 'new' ? (
      <RiskLevelBadge level={proposal.risk.riskLevel} isExpired={proposal.risk.isExpired} />
    ) : proposal.status === 'approved' ? (
      <StatusBadge tone="active" label="Đã phê duyệt" />
    ) : proposal.status === 'rejected' ? (
      <StatusBadge tone="critical" label="Đã từ chối" />
    ) : (
      <StatusBadge
        tone={PROPOSAL_STATUS_META[proposal.status]?.tone ?? 'neutral'}
        label={PROPOSAL_STATUS_META[proposal.status]?.label ?? proposal.status}
      />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Lô ${proposal.lot.lotCode}`}
        description={`${proposal.product.code} · ${proposal.product.name}`}
        actions={headerBadge}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Cột trái (2/3): Card Tình trạng lô và đề xuất xử lý (mockup 22, 23, 24) */}
        <div className="min-w-0 lg:col-span-8">
          <Card>
            <CardHeader className="flex flex-col gap-1 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <CardTitle className="text-lg font-semibold">
                Tình trạng lô và đề xuất xử lý
              </CardTitle>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                Phân tích lúc {formatDateTime(proposal.analyzedAt)}
              </span>
            </CardHeader>

            <CardContent className="space-y-6 p-4 sm:p-6">
              {/* Khối diễn giải LLM hoặc fallback theo bộ quy tắc */}
              <ProposalExplanationBlock
                displayMode={proposal.displayMode}
                fallbackReason={proposal.fallbackReason}
                explanation={proposal.explanation}
                ruleSummaryText={proposal.ruleSummaryText}
                canToggleDemo={canToggleDemo}
                isUpdating={explainMutation.isPending}
                onSimulateFailure={() => void handleExplain(true)}
                onRestoreExplanation={() => void handleExplain(false)}
              />

              {/* Lưới 6 ô số liệu (3x2) khớp mockup 22 */}
              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border sm:grid-cols-3">
                <div className="border-b border-border p-4 sm:border-r">
                  <div className="text-xs text-[var(--text-muted)]">Tồn lúc phân tích</div>
                  <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--text)]">
                    {formatQuantity(proposal.risk.onHandSnapshot)}
                  </div>
                </div>

                <div className="border-b border-border p-4 sm:border-r">
                  <div className="text-xs text-[var(--text-muted)]">Nhu cầu phân bổ được</div>
                  <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--text)]">
                    {formatQuantity(proposal.risk.allocatedDemand)}
                  </div>
                </div>

                <div className="border-b border-border p-4">
                  <div className="text-xs text-[var(--text-muted)]">Tồn dư ước tính</div>
                  <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--risk-medium-kpi)]">
                    {formatQuantity(proposal.risk.estimatedSurplus)}
                  </div>
                </div>

                <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
                  <div className="text-xs text-[var(--text-muted)]">Hạn sử dụng</div>
                  <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--text)]">
                    {formatDateVi(proposal.risk.expiryDate)}
                  </div>
                </div>

                <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
                  <div className="text-xs text-[var(--text-muted)]">Hạn dùng còn lại</div>
                  <div className="mt-1.5 text-xl font-semibold tabular-nums text-[var(--text)]">
                    {formatRemainingDaysText(proposal.risk.daysRemaining)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-xs text-[var(--text-muted)]">Mức rủi ro</div>
                  <div className="mt-2">
                    <RiskLevelBadge
                      level={proposal.risk.riskLevel}
                      isExpired={proposal.risk.isExpired}
                    />
                  </div>
                </div>
              </div>

              {/* Khối thu gọn "Dữ liệu AI đã dùng để giải thích" — chỉ Quản lý kho / Admin thấy (T-023) */}
              {canViewLlmInput && <LlmInputPanel llmInput={proposal.llmInput} />}
            </CardContent>
          </Card>
        </div>

        {/* Cột phải (1/3): Card Quyết định (mockup 22 → 25 → 26) + Card Tình trạng lô hiện tại */}
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <ProposalDecisionCard
            proposal={proposal}
            onConflictRefresh={() => void detailQuery.refetch()}
          />

          <Card>
            <CardHeader className="border-b border-border px-4 py-4 sm:px-6">
              <CardTitle className="text-lg font-semibold">Tình trạng lô hiện tại</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 p-4 sm:p-6">
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-[var(--text-muted)]">Mã lô</dt>
                  <dd className="min-w-0 break-words text-right font-medium text-[var(--text)]">
                    {proposal.lot.lotCode}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-[var(--text-muted)]">Tồn hiện tại</dt>
                  <dd className="min-w-0 break-words text-right font-medium tabular-nums text-[var(--text)]">
                    {formatQuantity(proposal.lot.currentOnHandQty)} {proposal.product.unit}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-[var(--text-muted)]">Hạn sử dụng</dt>
                  <dd className="min-w-0 break-words text-right font-medium tabular-nums text-[var(--text)]">
                    {formatDateVi(proposal.lot.expiryDate)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-[var(--text-muted)]">Còn lại</dt>
                  <dd className="min-w-0 break-words text-right font-medium tabular-nums text-[var(--text)]">
                    {formatRemainingDaysText(proposal.lot.daysRemaining)}
                  </dd>
                </div>
              </dl>

              <Button asChild type="button" variant="secondary" size="sm">
                <Link to={inventoryLotUrl}>Xem trong tồn kho</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
