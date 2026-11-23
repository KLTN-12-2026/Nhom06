import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api';
import { GlobalThresholdCard } from '../components/GlobalThresholdCard';
import { OverridesCard } from '../components/OverridesCard';
import { OverrideThresholdDialog } from '../components/OverrideThresholdDialog';
import { ThresholdHistoryDialog } from '../components/ThresholdHistoryDialog';
import {
  useActiveProductGroupsForExpiryQuery,
  useActiveProductsForExpiryQuery,
  useActiveThresholdsQuery,
  useEndOverrideThresholdMutation,
} from '../hooks';
import { type OverrideThreshold } from '../types';
import { formatOverrideTargetLabel } from '../utils';

export function ExpiryThresholdsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();

  const canManage = hasPermission('expiry.manage');
  const canReadCatalog = hasPermission('catalog.read');

  const thresholdsQuery = useActiveThresholdsQuery();
  const productsQuery = useActiveProductsForExpiryQuery(canManage && canReadCatalog);
  const groupsQuery = useActiveProductGroupsForExpiryQuery(canManage && canReadCatalog);
  const endMutation = useEndOverrideThresholdMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<OverrideThreshold | null>(null);
  const [endingOverride, setEndingOverride] = useState<OverrideThreshold | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const openCreateDialog = () => {
    setEditingOverride(null);
    setDialogOpen(true);
  };

  const openEditDialog = (item: OverrideThreshold) => {
    setEditingOverride(item);
    setDialogOpen(true);
  };

  const handleConfirmEnd = async () => {
    if (!endingOverride) {
      return;
    }
    try {
      await endMutation.mutateAsync(endingOverride.id);
      const label = formatOverrideTargetLabel(endingOverride);
      setEndingOverride(null);
      showToast(`Đã kết thúc hiệu lực ngưỡng riêng cho ${label}.`);
    } catch (error) {
      setEndingOverride(null);
      showToast(
        error instanceof ApiError
          ? error.message
          : 'Không thể kết thúc ngưỡng riêng. Vui lòng thử lại.',
        'error',
      );
    }
  };

  const headerActions = useMemo(
    () => (
      <>
        <Button type="button" variant="outline" onClick={() => setHistoryOpen(true)}>
          Lịch sử thay đổi
        </Button>
        {canManage && (
          <Button
            type="button"
            className="bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-95"
            onClick={openCreateDialog}
          >
            Thêm ngưỡng riêng
          </Button>
        )}
      </>
    ),
    [canManage],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ngưỡng cảnh báo hạn sử dụng"
        description="Ngưỡng theo sản phẩm được ưu tiên hơn ngưỡng theo nhóm hàng, nhóm hàng ưu tiên hơn ngưỡng chung"
        actions={headerActions}
      />

      {thresholdsQuery.isLoading ? (
        <Card>
          <CardContent className="px-6 py-10 text-sm text-[var(--text-muted)]">
            Đang tải cấu hình ngưỡng cảnh báo hạn sử dụng...
          </CardContent>
        </Card>
      ) : thresholdsQuery.isError || !thresholdsQuery.data ? (
        <Card>
          <CardContent className="p-6">
            <div className="rounded-md border border-[var(--risk-critical-fg)] bg-[var(--risk-critical-bg)] p-4 text-sm text-[var(--risk-critical-fg)]">
              Không thể tải cấu hình ngưỡng cảnh báo hạn sử dụng.{' '}
              <button
                type="button"
                onClick={() => void thresholdsQuery.refetch()}
                className="underline"
              >
                Thử lại
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <GlobalThresholdCard
              global={thresholdsQuery.data.global}
              canManage={canManage}
              onSuccess={(message) => showToast(message)}
            />
          </div>
          <div className="lg:col-span-7">
            <OverridesCard
              overrides={thresholdsQuery.data.overrides}
              canManage={canManage}
              onEdit={openEditDialog}
              onEnd={setEndingOverride}
            />
          </div>
        </div>
      )}

      <OverrideThresholdDialog
        open={dialogOpen}
        editing={editingOverride}
        products={productsQuery.data?.items ?? []}
        groups={groupsQuery.data ?? []}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            setEditingOverride(null);
          }
        }}
        onSuccess={(message) => showToast(message)}
      />

      <ThresholdHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

      <ConfirmDialog
        open={Boolean(endingOverride)}
        onOpenChange={(next) => {
          if (!next) {
            setEndingOverride(null);
          }
        }}
        title={
          endingOverride
            ? `Kết thúc ngưỡng riêng cho ${formatOverrideTargetLabel(endingOverride)}?`
            : 'Kết thúc ngưỡng riêng?'
        }
        description="Ngưỡng riêng này sẽ ngừng hiệu lực từ hôm nay và đối tượng sẽ quay về áp dụng ngưỡng cấp thấp hơn. Bản ghi lịch sử vẫn được giữ nguyên."
        confirmLabel="Xác nhận kết thúc"
        variant="destructive"
        isPending={endMutation.isPending}
        onConfirm={() => void handleConfirmEnd()}
      />
    </div>
  );
}
