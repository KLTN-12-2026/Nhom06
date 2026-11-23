import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatDateVi, getMonthStartIsoVn, getVnTodayIso } from '@/lib/format';
import { downloadStockLedgerXlsx } from '../api';
import { RiskReportTab } from '../components/RiskReportTab';
import { StockLedgerTab } from '../components/StockLedgerTab';

type ReportTabKey = 'stock-ledger' | 'risk';

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const initialTab: ReportTabKey = searchParams.get('tab') === 'risk' ? 'risk' : 'stock-ledger';
  const [activeTab, setActiveTab] = useState<ReportTabKey>(initialTab);

  const defaultToday = useMemo(() => getVnTodayIso(), []);
  const defaultMonthStart = useMemo(() => getMonthStartIsoVn(defaultToday), [defaultToday]);

  const [ledgerFilters, setLedgerFilters] = useState({
    from: defaultMonthStart,
    to: defaultToday,
    groupId: '',
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleTabChange = (nextTab: ReportTabKey) => {
    setActiveTab(nextTab);
    if (nextTab === 'risk') {
      setSearchParams({ tab: 'risk' });
    } else {
      setSearchParams({});
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const { blob, filename } = await downloadStockLedgerXlsx({
        from: ledgerFilters.from,
        to: ledgerFilters.to,
        groupId: ledgerFilters.groupId || undefined,
      });

      const resolvedFilename =
        filename ?? `Bao-cao-NXT_${ledgerFilters.from}_${ledgerFilters.to}.xlsx`;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = resolvedFilename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      showToast(`Đã xuất file ${resolvedFilename}`);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Không thể xuất file Excel. Vui lòng thử lại.';
      showToast(message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const headerTitle =
    activeTab === 'stock-ledger' ? 'Báo cáo nhập — xuất — tồn' : 'Báo cáo rủi ro cận hạn';

  const headerDescription =
    activeTab === 'stock-ledger'
      ? `Kỳ ${formatDateVi(ledgerFilters.from)} đến ${formatDateVi(
          ledgerFilters.to,
        )} · chỉ tính chứng từ kho đã xác nhận`
      : 'Tổng hợp lô cận hạn, đánh giá rủi ro mới nhất và tiến độ xử lý';

  return (
    <div className="space-y-6">
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        actions={
          activeTab === 'stock-ledger' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleExportExcel()}
              disabled={isExporting}
            >
              {isExporting ? 'Đang xuất Excel...' : 'Xuất Excel'}
            </Button>
          ) : undefined
        }
      />

      {/* Thanh chuyển 2 tab theo docs/DESIGN.md (gạch chân 2px --brand) */}
      <div
        className="overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="Loại báo cáo"
      >
        <div className="flex gap-6 whitespace-nowrap">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stock-ledger'}
            onClick={() => handleTabChange('stock-ledger')}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              activeTab === 'stock-ledger'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Nhập — xuất — tồn
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'risk'}
            onClick={() => handleTabChange('risk')}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              activeTab === 'risk'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Rủi ro cận hạn
          </button>
        </div>
      </div>

      {activeTab === 'stock-ledger' ? (
        <StockLedgerTab
          appliedFilters={ledgerFilters}
          onApplyFilters={setLedgerFilters}
        />
      ) : (
        <RiskReportTab />
      )}
    </div>
  );
}
