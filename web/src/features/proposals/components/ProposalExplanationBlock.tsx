import { type ReactNode } from 'react';
import {
  type ProposalDisplayMode,
  type ProposalExplanation,
  type ProposalFallbackReason,
} from '../types';

export interface ProposalExplanationBlockProps {
  displayMode: ProposalDisplayMode;
  fallbackReason: ProposalFallbackReason;
  explanation: ProposalExplanation | null;
  ruleSummaryText: string;
  canToggleDemo: boolean;
  isUpdating: boolean;
  onSimulateFailure: () => void;
  onRestoreExplanation: () => void;
}

const HIGHLIGHT_TOKEN_REGEX =
  /(\b\d{1,2}\/\d{1,2}\/\d{4}\b|(?<![A-Za-z0-9])\d+(?:[.,]\d+)*(?:\s+ngày)?(?![A-Za-z0-9])|\b(?:nguy cấp|hết hạn|trung bình)\b)/gi;

function renderHighlightedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  HIGHLIGHT_TOKEN_REGEX.lastIndex = 0;
  while ((match = HIGHLIGHT_TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={key++} className="font-semibold text-[var(--text)]">
        {match[0]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function ProposalExplanationBlock({
  displayMode,
  fallbackReason,
  explanation,
  ruleSummaryText,
  canToggleDemo,
  isUpdating,
  onSimulateFailure,
  onRestoreExplanation,
}: ProposalExplanationBlockProps) {
  if (displayMode === 'llm' && explanation?.status === 'valid' && explanation.text) {
    return (
      <div className="space-y-3">
        <p className="text-[15px] leading-relaxed text-[var(--text)]">
          {renderHighlightedText(explanation.text)}
        </p>

        <div className="space-y-1.5">
          <p className="text-xs text-[var(--text-muted)]">
            Viết lại từ số liệu bên dưới bởi mô hình ngôn ngữ. Mọi con số đều lấy nguyên từ kết quả
            phân tích.
            {explanation.modelName.includes('[Mô phỏng]') && (
              <span className="ml-1 font-medium">({explanation.modelName})</span>
            )}
          </p>

          {canToggleDemo && (
            <div>
              <button
                type="button"
                disabled={isUpdating}
                onClick={onSimulateFailure}
                className="text-sm text-[var(--info)] underline underline-offset-4 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
              >
                {isUpdating ? 'Đang mô phỏng lỗi…' : 'Mô phỏng lỗi dịch vụ'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const warningMessage =
    fallbackReason === 'invalid'
      ? 'Phần diễn giải không vượt qua kiểm tra số liệu, nên phần dưới là câu tóm tắt do bộ quy tắc sinh ra. Số liệu phân tích và phương án xử lý không phụ thuộc vào dịch vụ này.'
      : 'Dịch vụ diễn giải không phản hồi, nên phần dưới là câu tóm tắt do bộ quy tắc sinh ra. Số liệu phân tích và phương án xử lý không phụ thuộc vào dịch vụ này.';

  return (
    <div className="space-y-3">
      <div
        role="status"
        className="rounded-lg border border-[var(--risk-medium-bar)]/40 bg-[var(--risk-medium-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--risk-medium-fg)]"
      >
        {warningMessage}
      </div>

      <p className="text-[15px] leading-relaxed text-[var(--text)]">{ruleSummaryText}</p>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>Nguồn: bộ quy tắc nghiệp vụ</span>
        {canToggleDemo && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={onRestoreExplanation}
            className="text-sm text-[var(--info)] underline underline-offset-4 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]"
          >
            {isUpdating ? 'Đang khôi phục…' : 'Khôi phục dịch vụ diễn giải'}
          </button>
        )}
      </div>
    </div>
  );
}
