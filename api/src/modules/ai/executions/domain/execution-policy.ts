import { Prisma } from '@prisma/client';
import { isValidIsoDate, parseDecimalString } from '../../../inbound/domain/inbound-policy';

export const EXECUTION_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'completed',
  'failed',
  'cancelled',
] as const;

export interface ValidateExecutionUpdateInput {
  currentStatus: ExecutionStatus;
  nextStatus: ExecutionStatus;
  plannedQty: Prisma.Decimal;
  currentActualQty: Prisma.Decimal | null;
  actualQtyDeltaRaw?: string | number | null;
  note?: string | null;
  occurredOn?: string | null;
}

export type ValidateExecutionUpdateResult =
  | {
      valid: true;
      delta: Prisma.Decimal | null;
      nextActualQty: Prisma.Decimal | null;
      normalizedNote: string | null;
      normalizedOccurredOn: string | null;
    }
  | {
      valid: false;
      conflict?: boolean;
      message: string;
      field?: string;
    };

export interface DisposalMapping {
  outboundType: 'DISPOSAL' | 'RETURN_TO_SUPPLIER';
  movementType: 'DISPOSAL' | 'RETURN';
}

const ZERO = new Prisma.Decimal(0);

export function isTerminalExecutionStatus(status: string): boolean {
  return (TERMINAL_EXECUTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Kiểm tra hợp lệ cho thao tác ghi kết quả thực hiện (hàm thuần — không gọi DB).
 * - Không cho cập nhật phương án đã kết thúc (completed/failed/cancelled) → conflict (409).
 * - Không cho quay lùi (in_progress → planned) hoặc giữ nguyên planned.
 * - failed/cancelled bắt buộc ghi chú.
 * - actualQtyDelta >= 0; tổng vượt planned_qty bắt buộc ghi chú.
 */
export function validateExecutionUpdate(
  input: ValidateExecutionUpdateInput,
): ValidateExecutionUpdateResult {
  if (isTerminalExecutionStatus(input.currentStatus)) {
    return {
      valid: false,
      conflict: true,
      message: 'Phương án đã kết thúc, không thể cập nhật thêm',
    };
  }

  if (input.currentStatus === 'planned' && input.nextStatus === 'planned') {
    return {
      valid: false,
      field: 'status',
      message: 'Vui lòng chọn trạng thái tiến độ mới',
    };
  }

  if (input.currentStatus === 'in_progress' && input.nextStatus === 'planned') {
    return {
      valid: false,
      field: 'status',
      message: 'Không thể quay lùi trạng thái thực hiện',
    };
  }

  const normalizedNote =
    typeof input.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;

  if ((input.nextStatus === 'failed' || input.nextStatus === 'cancelled') && !normalizedNote) {
    return {
      valid: false,
      field: 'note',
      message: 'Vui lòng nhập ghi chú khi đánh dấu không thực hiện được hoặc hủy',
    };
  }

  let normalizedOccurredOn: string | null = null;
  if (input.occurredOn !== undefined && input.occurredOn !== null && input.occurredOn !== '') {
    const trimmedDate = String(input.occurredOn).trim();
    if (!isValidIsoDate(trimmedDate)) {
      return {
        valid: false,
        field: 'occurredOn',
        message: 'Ngày thực hiện không hợp lệ (định dạng YYYY-MM-DD)',
      };
    }
    normalizedOccurredOn = trimmedDate;
  }

  let delta: Prisma.Decimal | null = null;
  if (
    input.actualQtyDeltaRaw !== undefined &&
    input.actualQtyDeltaRaw !== null &&
    String(input.actualQtyDeltaRaw).trim() !== ''
  ) {
    const parsed = parseDecimalString(input.actualQtyDeltaRaw, {
      allowZero: true,
      maxScale: 3,
      maxIntegerDigits: 11,
    });
    if (!parsed) {
      return {
        valid: false,
        field: 'actualQtyDelta',
        message: 'Lượng thực tế phải lớn hơn hoặc bằng 0 và tối đa 3 chữ số thập phân',
      };
    }
    delta = parsed;
  }

  const nextActualQty =
    delta !== null ? (input.currentActualQty ?? ZERO).add(delta) : input.currentActualQty;

  if (nextActualQty !== null && nextActualQty.gt(input.plannedQty) && !normalizedNote) {
    return {
      valid: false,
      field: 'note',
      message: 'Tổng lượng thực tế vượt lượng đề xuất, vui lòng nhập ghi chú lý do',
    };
  }

  return {
    valid: true,
    delta,
    nextActualQty,
    normalizedNote,
    normalizedOccurredOn,
  };
}

/**
 * Ánh xạ loại phương án đề xuất sang loại phiếu xuất & loại sổ biến động (D-028).
 */
export function resolveDisposalConfig(actionType: string): DisposalMapping | null {
  if (actionType === 'DISPOSE') {
    return { outboundType: 'DISPOSAL', movementType: 'DISPOSAL' };
  }
  if (actionType === 'RETURN_TO_SUPPLIER') {
    return { outboundType: 'RETURN_TO_SUPPLIER', movementType: 'RETURN' };
  }
  return null;
}

/**
 * Chỉ phương án CONTACT_AGENCY hoặc PRIORITIZE_FEFO mới được liên kết phiếu xuất ORDER (D-028).
 */
export function canLinkOrderOutbound(actionType: string): boolean {
  return actionType === 'CONTACT_AGENCY' || actionType === 'PRIORITIZE_FEFO';
}

/**
 * Đồng bộ trạng thái đề xuất tương ứng khi execution đổi tiến độ.
 * Trả về null nếu không cần đổi (kể cả khi execution failed/cancelled vì CHECK DB của proposal không có).
 */
export function resolveSyncedProposalStatus(
  currentProposalStatus: string,
  nextExecutionStatus: ExecutionStatus,
): 'in_progress' | 'completed' | null {
  if (nextExecutionStatus === 'in_progress' && currentProposalStatus === 'approved') {
    return 'in_progress';
  }
  if (
    nextExecutionStatus === 'completed' &&
    (currentProposalStatus === 'approved' || currentProposalStatus === 'in_progress')
  ) {
    return 'completed';
  }
  return null;
}
