import {
  RISK_LEVEL_BADGE_META,
  type SharedRiskLevel,
} from '@/components/common/risk-status-meta';
import { formatDateVi, formatQuantity } from '@/lib/format';
import { type LlmExplanationInput, type ProposalActionType } from '../types';

export type LlmInputKnownKey = keyof LlmExplanationInput;

export const LLM_INPUT_FIELD_ORDER: readonly LlmInputKnownKey[] = [
  'ma_lo',
  'san_pham',
  'han_su_dung',
  'so_ngay_con_lai',
  'ton_luc_phan_tich',
  'nhu_cau_phan_bo_duoc',
  'tieu_thu_uoc_tinh',
  'ton_du_uoc_tinh',
  'muc_rui_ro',
  'phuong_an',
  'luong_de_xuat',
  'allowed_actions',
] as const;

export const LLM_INPUT_FIELD_LABELS: Record<LlmInputKnownKey, string> = {
  ma_lo: 'Mã lô',
  san_pham: 'Sản phẩm',
  han_su_dung: 'Hạn sử dụng',
  so_ngay_con_lai: 'Số ngày còn lại',
  ton_luc_phan_tich: 'Tồn lúc phân tích',
  nhu_cau_phan_bo_duoc: 'Nhu cầu phân bổ được',
  tieu_thu_uoc_tinh: 'Tiêu thụ ước tính',
  ton_du_uoc_tinh: 'Tồn dư ước tính',
  muc_rui_ro: 'Mức rủi ro',
  phuong_an: 'Phương án đề xuất',
  luong_de_xuat: 'Lượng đề xuất',
  allowed_actions: 'Phương án được phép',
};

/**
 * Nhãn ngắn cho bảng dữ liệu gửi LLM theo T-023 (dùng thống nhất cho cả phuong_an và allowed_actions).
 */
export const LLM_ACTION_LABELS: Record<ProposalActionType, string> = {
  DISPOSE: 'Hủy hàng',
  RETURN_TO_SUPPLIER: 'Trả nhà cung cấp',
  PRIORITIZE_FEFO: 'Ưu tiên xuất FEFO',
  CONTACT_AGENCY: 'Liên hệ đại lý',
  CONSIDER_PROMOTION: 'Cân nhắc khuyến mãi',
};

const QUANTITY_KEYS = new Set<LlmInputKnownKey>([
  'ton_luc_phan_tich',
  'nhu_cau_phan_bo_duoc',
  'tieu_thu_uoc_tinh',
  'ton_du_uoc_tinh',
  'luong_de_xuat',
]);

const KNOWN_KEY_SET = new Set<string>(LLM_INPUT_FIELD_ORDER);

export type LlmInputRow =
  | {
      key: string;
      label: string;
      kind: 'text';
      text: string;
      isNumeric?: boolean;
    }
  | {
      key: string;
      label: string;
      kind: 'risk';
      level: SharedRiskLevel | null;
      rawLabel: string;
    }
  | {
      key: string;
      label: string;
      kind: 'actions';
      labels: string[];
    };

export function formatUnknownLlmValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatLlmActionLabel(action: unknown): string {
  if (action === null || action === undefined || action === '') {
    return '—';
  }
  const raw = typeof action === 'string' ? action : formatUnknownLlmValue(action);
  const normalized = raw.trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(LLM_ACTION_LABELS, normalized)) {
    return LLM_ACTION_LABELS[normalized as ProposalActionType];
  }
  return raw;
}

export function formatLlmRemainingDays(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return formatUnknownLlmValue(value);
  }
  if (num < 0) {
    return `Quá ${formatQuantity(Math.abs(num))} ngày`;
  }
  return `${formatQuantity(num)} ngày`;
}

function isSharedRiskLevel(value: unknown): value is SharedRiskLevel {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(RISK_LEVEL_BADGE_META, value)
  );
}

function formatKnownRow(key: LlmInputKnownKey, value: unknown): LlmInputRow {
  const label = LLM_INPUT_FIELD_LABELS[key];

  if (key === 'ma_lo' || key === 'san_pham') {
    return { key, label, kind: 'text', text: formatUnknownLlmValue(value) };
  }

  if (key === 'han_su_dung') {
    return {
      key,
      label,
      kind: 'text',
      text: typeof value === 'string' ? formatDateVi(value) : formatUnknownLlmValue(value),
      isNumeric: true,
    };
  }

  if (key === 'so_ngay_con_lai') {
    return {
      key,
      label,
      kind: 'text',
      text: formatLlmRemainingDays(value),
      isNumeric: true,
    };
  }

  if (QUANTITY_KEYS.has(key)) {
    if (value === null || value === undefined || value === '') {
      return { key, label, kind: 'text', text: '—', isNumeric: true };
    }
    const input =
      typeof value === 'number' || typeof value === 'string' ? value : formatUnknownLlmValue(value);
    return {
      key,
      label,
      kind: 'text',
      text: formatQuantity(input),
      isNumeric: true,
    };
  }

  if (key === 'muc_rui_ro') {
    if (value === null || value === undefined || value === '') {
      return { key, label, kind: 'text', text: '—' };
    }
    if (isSharedRiskLevel(value)) {
      return { key, label, kind: 'risk', level: value, rawLabel: value };
    }
    return { key, label, kind: 'risk', level: null, rawLabel: formatUnknownLlmValue(value) };
  }

  if (key === 'phuong_an') {
    return { key, label, kind: 'text', text: formatLlmActionLabel(value) };
  }

  // allowed_actions
  if (Array.isArray(value)) {
    return {
      key,
      label,
      kind: 'actions',
      labels: value.map((item) => formatLlmActionLabel(item)),
    };
  }
  return { key, label, kind: 'text', text: formatUnknownLlmValue(value) };
}

export function buildLlmInputRows(llmInput: unknown): LlmInputRow[] {
  if (!llmInput || typeof llmInput !== 'object' || Array.isArray(llmInput)) {
    return [];
  }

  const record = llmInput as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return [];
  }

  const rows: LlmInputRow[] = [];

  for (const knownKey of LLM_INPUT_FIELD_ORDER) {
    if (Object.prototype.hasOwnProperty.call(record, knownKey)) {
      rows.push(formatKnownRow(knownKey, record[knownKey]));
    }
  }

  for (const extraKey of keys) {
    if (!KNOWN_KEY_SET.has(extraKey)) {
      rows.push({
        key: extraKey,
        label: extraKey,
        kind: 'text',
        text: formatUnknownLlmValue(record[extraKey]),
      });
    }
  }

  return rows;
}
