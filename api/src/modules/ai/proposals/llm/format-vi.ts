import { Prisma } from '@prisma/client';
import { RISK_LEVEL_LABELS, RiskLevel } from '../../risk/domain/lot-risk.domain';
import { LlmExplanationInput } from '../domain/llm-guard';
import { ACTION_LABELS, formatIsoDateVi, ProposalActionType } from '../domain/rules';

export interface LlmDisplayContext {
  ten_san_pham: string;
  don_vi_tinh: string;
  han_su_dung: string;
  trang_thai_han: string;
  ton_luc_phan_tich: string;
  nhu_cau_phan_bo_duoc: string;
  tieu_thu_uoc_tinh: string;
  ton_du_uoc_tinh: string;
  luong_de_xuat: string;
  muc_rui_ro: string;
  phuong_an: string;
  phuong_an_duoc_phep: string[];
}

/**
 * Định dạng số theo chuẩn vi-VN (dấu chấm ngăn nghìn, dấu phẩy thập phân),
 * giữ nguyên giá trị gốc (không làm tròn khác giá trị gốc, bỏ số 0 vô nghĩa ở cuối phần thập phân).
 */
export function formatNumberViExact(value: Prisma.Decimal | string | number): string {
  const dec = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (!dec.isFinite()) {
    return String(value);
  }

  const isNegative = dec.isNegative() && !dec.isZero();
  const absFixed = dec.abs().toFixed();
  const [intPart, rawFracPart] = absFixed.split('.');
  const fracPart = rawFracPart ? rawFracPart.replace(/0+$/, '') : '';
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = isNegative ? '-' : '';

  return fracPart.length > 0 ? `${sign}${groupedInt},${fracPart}` : `${sign}${groupedInt}`;
}

export function formatQuantityWithUnitVi(
  value: Prisma.Decimal | string | number,
  unit: string,
): string {
  const formattedNumber = formatNumberViExact(value);
  const cleanUnit = unit.trim();
  return cleanUnit.length > 0 ? `${formattedNumber} ${cleanUnit}` : formattedNumber;
}

export function formatDaysRemainingVi(daysRemaining: number): string {
  const days = Math.trunc(daysRemaining);
  if (days < 0) {
    return `quá ${formatNumberViExact(Math.abs(days))} ngày`;
  }
  return `còn ${formatNumberViExact(days)} ngày`;
}

export function formatDateVi(isoDate: string): string {
  return formatIsoDateVi(isoDate);
}

export function formatRiskLevelVi(level: RiskLevel): string {
  return RISK_LEVEL_LABELS[level] ?? level;
}

export function formatActionVi(action: ProposalActionType): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * Tạo khối `hien_thi` bằng tiếng Việt tự nhiên cho prompt v2 (chỉ dựng lúc gọi LLM, không lưu snapshot).
 */
export function buildLlmDisplayContext(input: LlmExplanationInput): LlmDisplayContext {
  const productName = input.ten_san_pham.trim() || input.san_pham;
  const unit = input.don_vi_tinh.trim();

  return {
    ten_san_pham: productName,
    don_vi_tinh: unit,
    han_su_dung: formatDateVi(input.han_su_dung),
    trang_thai_han: formatDaysRemainingVi(input.so_ngay_con_lai),
    ton_luc_phan_tich: formatQuantityWithUnitVi(input.ton_luc_phan_tich, unit),
    nhu_cau_phan_bo_duoc: formatQuantityWithUnitVi(input.nhu_cau_phan_bo_duoc, unit),
    tieu_thu_uoc_tinh: formatQuantityWithUnitVi(input.tieu_thu_uoc_tinh, unit),
    ton_du_uoc_tinh: formatQuantityWithUnitVi(input.ton_du_uoc_tinh, unit),
    luong_de_xuat: formatQuantityWithUnitVi(input.luong_de_xuat, unit),
    muc_rui_ro: formatRiskLevelVi(input.muc_rui_ro),
    phuong_an: formatActionVi(input.phuong_an),
    phuong_an_duoc_phep: input.allowed_actions.map((action) => formatActionVi(action)),
  };
}
