import { Prisma } from '@prisma/client';
import { RiskLevel } from '../../risk/domain/lot-risk.domain';
import { ProposalActionType } from './rules';

export const MAX_EXPLANATION_LENGTH = 1500;

export interface LlmExplanationInput {
  ma_lo: string;
  san_pham: string;
  han_su_dung: string; // YYYY-MM-DD
  so_ngay_con_lai: number;
  ton_luc_phan_tich: number;
  nhu_cau_phan_bo_duoc: number;
  tieu_thu_uoc_tinh: number;
  ton_du_uoc_tinh: number;
  muc_rui_ro: Exclude<RiskLevel, 'low'> | RiskLevel;
  phuong_an: ProposalActionType;
  luong_de_xuat: number;
  allowed_actions: ProposalActionType[];
}

export interface BuildLlmInputParams {
  lotCode: string;
  productCode: string;
  expiryDate: string; // YYYY-MM-DD
  daysRemaining: number;
  onHandSnapshot: Prisma.Decimal | string | number;
  allocatedDemand: Prisma.Decimal | string | number;
  estimatedConsumption: Prisma.Decimal | string | number;
  estimatedSurplus: Prisma.Decimal | string | number;
  riskLevel: RiskLevel;
  actionType: ProposalActionType;
  proposedQty: Prisma.Decimal | string | number;
  allowedActions: readonly ProposalActionType[];
}

export interface ValidateLlmOutputResult {
  status: 'valid' | 'invalid';
  explanation?: string;
  action?: ProposalActionType;
  numbers?: Record<string, number>;
  errors: string[];
}

const NUMERIC_INPUT_KEYS = [
  'ton_luc_phan_tich',
  'nhu_cau_phan_bo_duoc',
  'tieu_thu_uoc_tinh',
  'ton_du_uoc_tinh',
  'luong_de_xuat',
  'so_ngay_con_lai',
] as const;

type NumericInputKey = (typeof NUMERIC_INPUT_KEYS)[number];

const NUMERIC_INPUT_KEY_SET = new Set<string>(NUMERIC_INPUT_KEYS);

function toCleanNumber(value: Prisma.Decimal | string | number): number {
  const dec = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  return Number(dec.toString());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDecimalStrict(value: unknown): Prisma.Decimal | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return new Prisma.Decimal(value);
  }
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return new Prisma.Decimal(value.trim());
  }
  return null;
}

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * Chuyển một token số trích từ văn bản tiếng Việt sang các giá trị Decimal ứng viên hợp lệ:
 * - "1.294" → 1294 (nghìn vi-VN); nếu đúng 1 dấu chấm + 3 chữ số thì cũng xét 1.294 (thập phân chuẩn)
 * - "1.281,5" → 1281.5
 * - "12,5" → 12.5
 * - "251" / "12.5" → 251 / 12.5
 */
function parseTextNumberCandidates(token: string): Prisma.Decimal[] {
  const candidates: Prisma.Decimal[] = [];
  const trimmed = token.trim();

  // Dạng nghìn vi-VN (có thể kèm thập phân dấu phẩy): 1.294 hoặc 1.281,5
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(trimmed)) {
    const viNormalized = trimmed.replace(/\./g, '').replace(',', '.');
    candidates.push(new Prisma.Decimal(viNormalized));

    // Nếu chỉ có đúng 1 dấu chấm, không có dấu phẩy (vd "1.294"), cho phép cả nghĩa thập phân chuẩn
    if (/^-?\d{1,3}\.\d{3}$/.test(trimmed)) {
      candidates.push(new Prisma.Decimal(trimmed));
    }
    return candidates;
  }

  // Dạng thập phân dấu phẩy vi-VN: 12,5
  if (/^-?\d+,\d+$/.test(trimmed)) {
    candidates.push(new Prisma.Decimal(trimmed.replace(',', '.')));
    return candidates;
  }

  // Dạng nghìn dấu phẩy (kiểu Anh): 1,294 hoặc 1,294.5
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) {
    candidates.push(new Prisma.Decimal(trimmed.replace(/,/g, '')));
    return candidates;
  }

  // Dạng số nguyên hoặc thập phân chuẩn: 251, 12.5, -22
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    candidates.push(new Prisma.Decimal(trimmed));
  }

  return candidates;
}

/**
 * Tạo đối tượng đầu vào tối thiểu 12 trường gửi sang LLM (D-026, mockup 23).
 * Tuyệt đối không đưa tên người dùng, tên đại lý, nhà cung cấp hay bí mật hệ thống.
 */
export function buildLlmInput(params: BuildLlmInputParams): LlmExplanationInput {
  return {
    ma_lo: params.lotCode,
    san_pham: params.productCode,
    han_su_dung: params.expiryDate,
    so_ngay_con_lai: Math.trunc(params.daysRemaining),
    ton_luc_phan_tich: toCleanNumber(params.onHandSnapshot),
    nhu_cau_phan_bo_duoc: toCleanNumber(params.allocatedDemand),
    tieu_thu_uoc_tinh: toCleanNumber(params.estimatedConsumption),
    ton_du_uoc_tinh: toCleanNumber(params.estimatedSurplus),
    muc_rui_ro: params.riskLevel,
    phuong_an: params.actionType,
    luong_de_xuat: toCleanNumber(params.proposedQty),
    allowed_actions: [...params.allowedActions],
  };
}

/**
 * Rào chắn kiểm tra chặt đầu ra LLM (bất biến 7, D-001, D-026):
 * 1. Parse JSON + đủ 3 trường bắt buộc (explanation, action, numbers không rỗng).
 * 2. Văn bản không rỗng và <= 1500 ký tự.
 * 3. action thuộc allowed_actions VÀ trùng khớp phương án chính phuong_an.
 * 4. Mọi số trong numbers khớp chính xác trường số tương ứng của input.
 * 5. Mọi ngày và con số trong explanation đều thuộc tập dữ liệu đầu vào (bỏ qua đúng token ma_lo/san_pham).
 */
export function validateLlmOutput(
  raw: unknown,
  input: LlmExplanationInput,
): ValidateLlmOutputResult {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      return { status: 'invalid', errors: ['Sai định dạng: Không parse được JSON'] };
    }
  }

  if (!isPlainObject(parsed)) {
    return { status: 'invalid', errors: ['Sai định dạng: Phản hồi phải là đối tượng JSON'] };
  }

  const rawExplanation = parsed.explanation;
  const rawAction = parsed.action;
  const rawNumbers = parsed.numbers;

  if (
    typeof rawExplanation !== 'string' ||
    typeof rawAction !== 'string' ||
    !isPlainObject(rawNumbers) ||
    Object.keys(rawNumbers).length === 0
  ) {
    return {
      status: 'invalid',
      errors: ['Sai định dạng: Thiếu trường bắt buộc (explanation, action, numbers)'],
    };
  }

  const errors: string[] = [];
  const explanation = rawExplanation.trim();

  if (explanation.length === 0) {
    errors.push('Nội dung diễn giải rỗng');
  } else if (explanation.length > MAX_EXPLANATION_LENGTH) {
    errors.push(`Nội dung diễn giải vượt quá ${MAX_EXPLANATION_LENGTH} ký tự`);
  }

  if (!input.allowed_actions.includes(rawAction as ProposalActionType)) {
    errors.push('Phương án ngoài danh sách cho phép');
  } else if (rawAction !== input.phuong_an) {
    errors.push('Phương án ngoài danh sách cho phép hoặc không khớp phương án chính');
  }

  const normalizedNumbers: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawNumbers)) {
    if (!NUMERIC_INPUT_KEY_SET.has(key)) {
      errors.push(`Số liệu không khớp: trường không hợp lệ (${key})`);
      continue;
    }

    const actualDecimal = parseDecimalStrict(value);
    const expectedDecimal = new Prisma.Decimal(input[key as NumericInputKey]);
    if (!actualDecimal || !actualDecimal.equals(expectedDecimal)) {
      errors.push(`Số liệu không khớp tại trường ${key}`);
      continue;
    }

    normalizedNumbers[key] = Number(actualDecimal.toString());
  }

  // Kiểm tra mọi ngày & số xuất hiện trong văn bản explanation
  if (explanation.length > 0 && explanation.length <= MAX_EXPLANATION_LENGTH) {
    const dateParts = parseIsoDateParts(input.han_su_dung);
    const allowedDecimals: Prisma.Decimal[] = [
      new Prisma.Decimal(input.ton_luc_phan_tich),
      new Prisma.Decimal(input.nhu_cau_phan_bo_duoc),
      new Prisma.Decimal(input.tieu_thu_uoc_tinh),
      new Prisma.Decimal(input.ton_du_uoc_tinh),
      new Prisma.Decimal(input.luong_de_xuat),
      new Prisma.Decimal(input.so_ngay_con_lai),
      new Prisma.Decimal(Math.abs(input.so_ngay_con_lai)),
    ];
    if (dateParts) {
      allowedDecimals.push(
        new Prisma.Decimal(dateParts.day),
        new Prisma.Decimal(dateParts.month),
        new Prisma.Decimal(dateParts.year),
      );
    }

    let textToScan = explanation;

    // Loại bỏ đúng mã lô và mã sản phẩm theo biên chữ-số để tránh nhận nhầm chữ số trong mã
    for (const identifier of [input.ma_lo, input.san_pham]) {
      const trimmedId = identifier.trim();
      if (trimmedId.length > 0) {
        const idRegex = new RegExp(
          `(?<![A-Za-z0-9])${escapeRegExp(trimmedId)}(?![A-Za-z0-9])`,
          'gi',
        );
        textToScan = textToScan.replace(idRegex, ' ');
      }
    }

    // Đối chiếu toàn vẹn ngày dd/MM/yyyy và YYYY-MM-DD trước khi quét số đơn lẻ
    textToScan = textToScan.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (full, d, m, y) => {
      if (
        !dateParts ||
        Number(d) !== dateParts.day ||
        Number(m) !== dateParts.month ||
        Number(y) !== dateParts.year
      ) {
        errors.push(`Có số liệu không có trong dữ liệu nguồn: ngày ${full}`);
      }
      return ' ';
    });

    textToScan = textToScan.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (full, y, m, d) => {
      if (
        !dateParts ||
        Number(y) !== dateParts.year ||
        Number(m) !== dateParts.month ||
        Number(d) !== dateParts.day
      ) {
        errors.push(`Có số liệu không có trong dữ liệu nguồn: ngày ${full}`);
      }
      return ' ';
    });

    const numberTokens = textToScan.match(/(?:(?<=^|[\s(])-)?\d+(?:[.,]\d+)*/g) ?? [];
    for (const token of numberTokens) {
      const candidates = parseTextNumberCandidates(token);
      const matched =
        candidates.length > 0 &&
        candidates.some((cand) => allowedDecimals.some((allowed) => cand.equals(allowed)));
      if (!matched) {
        errors.push(`Có số liệu không có trong dữ liệu nguồn: ${token}`);
      }
    }
  }

  if (errors.length > 0) {
    return { status: 'invalid', errors };
  }

  return {
    status: 'valid',
    explanation,
    action: rawAction as ProposalActionType,
    numbers: normalizedNumbers,
    errors: [],
  };
}
