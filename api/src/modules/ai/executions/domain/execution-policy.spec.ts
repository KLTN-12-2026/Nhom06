import { Prisma } from '@prisma/client';
import {
  canLinkOrderOutbound,
  isTerminalExecutionStatus,
  resolveDisposalConfig,
  resolveSyncedProposalStatus,
  validateExecutionUpdate,
} from './execution-policy';

describe('execution-policy — Hàm thuần kiểm tra tiến độ và ràng buộc thực hiện (T-015)', () => {
  it('nhận diện đúng trạng thái kết thúc (terminal)', () => {
    expect(isTerminalExecutionStatus('planned')).toBe(false);
    expect(isTerminalExecutionStatus('in_progress')).toBe(false);
    expect(isTerminalExecutionStatus('completed')).toBe(true);
    expect(isTerminalExecutionStatus('failed')).toBe(true);
    expect(isTerminalExecutionStatus('cancelled')).toBe(true);
  });

  it('cho phép planned -> in_progress (+120) -> completed (+131) và cộng dồn chính xác Decimal', () => {
    const step1 = validateExecutionUpdate({
      currentStatus: 'planned',
      nextStatus: 'in_progress',
      plannedQty: new Prisma.Decimal('251'),
      currentActualQty: null,
      actualQtyDeltaRaw: '120',
      note: 'Đã liên hệ 3 đại lý',
      occurredOn: '2026-11-23',
    });
    expect(step1.valid).toBe(true);
    if (step1.valid) {
      expect(step1.delta?.toString()).toBe('120');
      expect(step1.nextActualQty?.toString()).toBe('120');
      expect(step1.normalizedOccurredOn).toBe('2026-11-23');
    }

    const step2 = validateExecutionUpdate({
      currentStatus: 'in_progress',
      nextStatus: 'completed',
      plannedQty: new Prisma.Decimal('251'),
      currentActualQty: new Prisma.Decimal('120'),
      actualQtyDeltaRaw: '131',
      note: 'Đã giao hết phần còn lại',
    });
    expect(step2.valid).toBe(true);
    if (step2.valid) {
      expect(step2.delta?.toString()).toBe('131');
      expect(step2.nextActualQty?.toString()).toBe('251');
    }
  });

  it('chặn quay lùi in_progress -> planned và chặn cập nhật khi đã kết thúc', () => {
    const rollback = validateExecutionUpdate({
      currentStatus: 'in_progress',
      nextStatus: 'planned',
      plannedQty: new Prisma.Decimal('100'),
      currentActualQty: new Prisma.Decimal('20'),
    });
    expect(rollback.valid).toBe(false);
    if (!rollback.valid) {
      expect(rollback.conflict).toBeFalsy();
      expect(rollback.field).toBe('status');
    }

    for (const terminal of ['completed', 'failed', 'cancelled'] as const) {
      const res = validateExecutionUpdate({
        currentStatus: terminal,
        nextStatus: 'in_progress',
        plannedQty: new Prisma.Decimal('100'),
        currentActualQty: new Prisma.Decimal('50'),
      });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.conflict).toBe(true);
      }
    }
  });

  it('bắt buộc ghi chú khi đánh dấu failed hoặc cancelled', () => {
    for (const status of ['failed', 'cancelled'] as const) {
      const missing = validateExecutionUpdate({
        currentStatus: 'planned',
        nextStatus: status,
        plannedQty: new Prisma.Decimal('100'),
        currentActualQty: null,
        note: '   ',
      });
      expect(missing.valid).toBe(false);
      if (!missing.valid) {
        expect(missing.field).toBe('note');
      }

      const ok = validateExecutionUpdate({
        currentStatus: 'planned',
        nextStatus: status,
        plannedQty: new Prisma.Decimal('100'),
        currentActualQty: null,
        note: 'Đại lý hủy nhận hàng',
      });
      expect(ok.valid).toBe(true);
    }
  });

  it('chặn actualQtyDelta âm hoặc vượt plannedQty khi thiếu ghi chú; cho phép vượt nếu có ghi chú', () => {
    const negative = validateExecutionUpdate({
      currentStatus: 'planned',
      nextStatus: 'in_progress',
      plannedQty: new Prisma.Decimal('100'),
      currentActualQty: null,
      actualQtyDeltaRaw: '-5',
    });
    expect(negative.valid).toBe(false);
    if (!negative.valid) {
      expect(negative.field).toBe('actualQtyDelta');
    }

    const exceedNoNote = validateExecutionUpdate({
      currentStatus: 'in_progress',
      nextStatus: 'in_progress',
      plannedQty: new Prisma.Decimal('100'),
      currentActualQty: new Prisma.Decimal('80'),
      actualQtyDeltaRaw: '30',
      note: '',
    });
    expect(exceedNoNote.valid).toBe(false);
    if (!exceedNoNote.valid) {
      expect(exceedNoNote.field).toBe('note');
    }

    const exceedWithNote = validateExecutionUpdate({
      currentStatus: 'in_progress',
      nextStatus: 'completed',
      plannedQty: new Prisma.Decimal('100'),
      currentActualQty: new Prisma.Decimal('80'),
      actualQtyDeltaRaw: '30',
      note: 'Đại lý nhận thêm 10 đơn vị',
    });
    expect(exceedWithNote.valid).toBe(true);
    if (exceedWithNote.valid) {
      expect(exceedWithNote.nextActualQty?.toString()).toBe('110');
    }
  });

  it('chặn ngày occurredOn không hợp lệ và giữ actualQty=null khi không ghi số lượng', () => {
    const badDate = validateExecutionUpdate({
      currentStatus: 'planned',
      nextStatus: 'in_progress',
      plannedQty: new Prisma.Decimal('50'),
      currentActualQty: null,
      occurredOn: '2026-02-30',
    });
    expect(badDate.valid).toBe(false);
    if (!badDate.valid) {
      expect(badDate.field).toBe('occurredOn');
    }

    const noQty = validateExecutionUpdate({
      currentStatus: 'planned',
      nextStatus: 'in_progress',
      plannedQty: new Prisma.Decimal('50'),
      currentActualQty: null,
      note: 'Bắt đầu gọi đại lý',
    });
    expect(noQty.valid).toBe(true);
    if (noQty.valid) {
      expect(noQty.delta).toBeNull();
      expect(noQty.nextActualQty).toBeNull();
    }
  });

  it('ánh xạ đúng loại phương án cho disposal/return, link-outbound và đồng bộ trạng thái đề xuất', () => {
    expect(resolveDisposalConfig('DISPOSE')).toEqual({
      outboundType: 'DISPOSAL',
      movementType: 'DISPOSAL',
    });
    expect(resolveDisposalConfig('RETURN_TO_SUPPLIER')).toEqual({
      outboundType: 'RETURN_TO_SUPPLIER',
      movementType: 'RETURN',
    });
    expect(resolveDisposalConfig('CONTACT_AGENCY')).toBeNull();
    expect(resolveDisposalConfig('PRIORITIZE_FEFO')).toBeNull();

    expect(canLinkOrderOutbound('CONTACT_AGENCY')).toBe(true);
    expect(canLinkOrderOutbound('PRIORITIZE_FEFO')).toBe(true);
    expect(canLinkOrderOutbound('DISPOSE')).toBe(false);
    expect(canLinkOrderOutbound('RETURN_TO_SUPPLIER')).toBe(false);

    expect(resolveSyncedProposalStatus('approved', 'in_progress')).toBe('in_progress');
    expect(resolveSyncedProposalStatus('approved', 'completed')).toBe('completed');
    expect(resolveSyncedProposalStatus('in_progress', 'completed')).toBe('completed');
    expect(resolveSyncedProposalStatus('approved', 'failed')).toBeNull();
    expect(resolveSyncedProposalStatus('in_progress', 'cancelled')).toBeNull();
  });
});
