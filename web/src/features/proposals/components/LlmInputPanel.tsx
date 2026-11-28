import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { RiskLevelBadge } from '@/components/common/RiskStatusBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type LlmExplanationInput } from '../types';
import { buildLlmInputRows, type LlmInputRow } from './llm-input-format';

export interface LlmInputPanelProps {
  llmInput: LlmExplanationInput | Record<string, unknown> | null | undefined;
}

function renderRowValue(row: LlmInputRow) {
  if (row.kind === 'risk') {
    if (row.level) {
      return <RiskLevelBadge level={row.level} />;
    }
    return <StatusBadge tone="neutral" label={row.rawLabel} />;
  }

  if (row.kind === 'actions') {
    if (row.labels.length === 0) {
      return '—';
    }
    return (
      <ul className="flex flex-wrap justify-end gap-1.5">
        {row.labels.map((label, index) => (
          <li
            key={`${label}-${index}`}
            className="inline-flex items-center rounded-md border border-border bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--text)]"
          >
            {label}
          </li>
        ))}
      </ul>
    );
  }

  return row.text;
}

/**
 * Khối thu gọn hiển thị dữ liệu AI đã dùng để viết giải thích dưới dạng bảng tiếng Việt
 * kèm nút bật/tắt JSON gốc để quản lý/admin đối chiếu nguồn số liệu (T-023).
 */
export function LlmInputPanel({ llmInput }: LlmInputPanelProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const rawJsonId = useId();
  const rows = buildLlmInputRows(llmInput);

  return (
    <details className="group border-t border-border pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <span>Số liệu dùng để diễn giải</span>
      </summary>

      <div className="mt-3 space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-muted)]">
            Chưa có dữ liệu
          </p>
        ) : (
          <>
            <div
              className="overflow-x-auto rounded-lg border border-border"
              tabIndex={0}
              role="region"
              aria-label="Bảng số liệu dùng để diễn giải"
            >
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[var(--surface-muted)]">
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-left text-sm font-medium text-[var(--text-muted)]"
                    >
                      Trường
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right text-sm font-medium text-[var(--text-muted)]"
                    >
                      Giá trị
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-[var(--surface)]">
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left align-top font-normal text-[var(--text-muted)]"
                      >
                        {row.label}
                      </th>
                      <td
                        className={cn(
                          'break-words px-4 py-2.5 text-right align-top font-medium text-[var(--text)]',
                          row.kind === 'text' && row.isNumeric && 'tabular-nums',
                        )}
                      >
                        {renderRowValue(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={showRawJson}
                aria-controls={rawJsonId}
                onClick={() => setShowRawJson((prev) => !prev)}
              >
                {showRawJson ? 'Ẩn dạng JSON' : 'Xem dạng JSON'}
              </Button>
            </div>

            {showRawJson && (
              <pre
                id={rawJsonId}
                role="region"
                aria-label="Dữ liệu JSON gốc đã gửi sang mô hình ngôn ngữ"
                tabIndex={0}
                className="overflow-x-auto rounded-lg border border-border bg-[var(--surface-muted)] p-4 text-xs leading-relaxed text-[var(--text)]"
              >
                <code>{JSON.stringify(llmInput, null, 2)}</code>
              </pre>
            )}
          </>
        )}
      </div>
    </details>
  );
}
