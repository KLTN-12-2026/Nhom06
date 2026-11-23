import { Prisma } from '@prisma/client';
import {
  ACTION_LABELS,
  compareProposalItems,
  decideProposal,
  ProposalRuleInput,
} from './rules';

describe('decideProposal — Bộ quy tắc đề xuất xử lý (T-014 AC1)', () => {
  const baseInput: ProposalRuleInput = {
    riskLevel: 'high',
    isExpired: false,
    daysRemaining: 8,
    expiryDate: '2026-11-30',
    onHandSnapshot: new Prisma.Decimal('392'),
    allocatedDemand: new Prisma.Decimal('141'),
    estimatedSurplus: new Prisma.Decimal('251'),
  };

  it('trả về null khi tồn dư ước tính bằng 0 hoặc âm', () => {
    expect(
      decideProposal({
        ...baseInput,
        riskLevel: 'low',
        allocatedDemand: new Prisma.Decimal('392'),
        estimatedSurplus: new Prisma.Decimal('0'),
      }),
    ).toBeNull();

    expect(
      decideProposal({
        ...baseInput,
        estimatedSurplus: new Prisma.Decimal('0.000'),
      }),
    ).toBeNull();

    expect(
      decideProposal({
        ...baseInput,
        estimatedSurplus: new Prisma.Decimal('-1'),
      }),
    ).toBeNull();
  });

  it('nhánh 1 (lô hết hạn còn tồn): chọn DISPOSE, allowedActions chỉ gồm DISPOSE/RETURN_TO_SUPPLIER và không bao giờ ra CONTACT_AGENCY hoặc PRIORITIZE_FEFO', () => {
    const decision = decideProposal({
      riskLevel: 'critical',
      isExpired: true,
      daysRemaining: -22,
      expiryDate: '2026-11-01',
      onHandSnapshot: new Prisma.Decimal('313'),
      allocatedDemand: new Prisma.Decimal('0'),
      estimatedSurplus: new Prisma.Decimal('313'),
    });

    expect(decision).not.toBeNull();
    expect(decision!.actionType).toBe('DISPOSE');
    expect(decision!.ruleCode).toBe('RULE_EXPIRED_DISPOSE');
    expect(decision!.allowedActions).toEqual(['DISPOSE', 'RETURN_TO_SUPPLIER']);
    expect(decision!.allowedActions).not.toContain('CONTACT_AGENCY');
    expect(decision!.allowedActions).not.toContain('PRIORITIZE_FEFO');
    expect(ACTION_LABELS[decision!.actionType]).toBe('Loại bỏ và lập biên bản huỷ');
    expect(decision!.ruleSummaryText).toBe(
      'Tồn 313, lô đã hết hạn ngày 01/11/2026 (quá 22 ngày), nhu cầu dự báo phân bổ được 0. Tồn dư ước tính 313, mức rủi ro hết hạn.',
    );
  });

  it('bảo vệ tuyệt đối: lô hết hạn ở biên (daysRemaining = -1) hoặc đánh dấu isExpired/critical không bao giờ ra CONTACT_AGENCY hay PRIORITIZE_FEFO', () => {
    const expiredByDays = decideProposal({
      ...baseInput,
      riskLevel: 'high',
      isExpired: false,
      daysRemaining: -1,
    });
    expect(expiredByDays?.actionType).toBe('DISPOSE');
    expect(expiredByDays?.allowedActions).not.toContain('CONTACT_AGENCY');
    expect(expiredByDays?.allowedActions).not.toContain('PRIORITIZE_FEFO');

    const expiredByFlag = decideProposal({
      ...baseInput,
      riskLevel: 'medium',
      isExpired: true,
      daysRemaining: 0,
    });
    expect(expiredByFlag?.actionType).toBe('DISPOSE');
    expect(expiredByFlag?.allowedActions).not.toContain('CONTACT_AGENCY');
    expect(expiredByFlag?.allowedActions).not.toContain('PRIORITIZE_FEFO');
  });

  it('nhánh 2 (nguy cấp, còn <= 14 ngày, tồn dư > 0): chọn CONTACT_AGENCY và sinh ruleSummaryText đúng nguyên văn mockup 24', () => {
    const decision = decideProposal(baseInput);

    expect(decision).not.toBeNull();
    expect(decision!.actionType).toBe('CONTACT_AGENCY');
    expect(decision!.ruleCode).toBe('RULE_HIGH_RISK_CONTACT_AGENCY');
    expect(decision!.allowedActions).toEqual([
      'CONTACT_AGENCY',
      'CONSIDER_PROMOTION',
      'RETURN_TO_SUPPLIER',
    ]);
    expect(ACTION_LABELS[decision!.actionType]).toBe('Liên hệ đại lý đẩy hàng');
    expect(decision!.ruleSummaryText).toBe(
      'Tồn 392, nhu cầu dự báo phân bổ được 141 trước hạn 30/11/2026 (còn 8 ngày). Tồn dư ước tính 251, mức rủi ro nguy cấp.',
    );
  });

  it('biên nhánh 2: còn đúng 0 ngày hoặc đúng 14 ngày đều chọn CONTACT_AGENCY', () => {
    const day0 = decideProposal({ ...baseInput, daysRemaining: 0, riskLevel: 'high' });
    const day14 = decideProposal({ ...baseInput, daysRemaining: 14, riskLevel: 'high' });

    expect(day0?.actionType).toBe('CONTACT_AGENCY');
    expect(day14?.actionType).toBe('CONTACT_AGENCY');
  });

  it('nhánh 3 (trung bình, còn > 14 ngày, tồn dư > 0): chọn PRIORITIZE_FEFO và định dạng số lớn theo vi-VN (1.294)', () => {
    const decision = decideProposal({
      riskLevel: 'medium',
      isExpired: false,
      daysRemaining: 24,
      expiryDate: '2026-12-17',
      onHandSnapshot: new Prisma.Decimal('1294'),
      allocatedDemand: new Prisma.Decimal('1126'),
      estimatedSurplus: new Prisma.Decimal('168'),
    });

    expect(decision).not.toBeNull();
    expect(decision!.actionType).toBe('PRIORITIZE_FEFO');
    expect(decision!.ruleCode).toBe('RULE_MEDIUM_RISK_PRIORITIZE_FEFO');
    expect(decision!.allowedActions).toEqual([
      'PRIORITIZE_FEFO',
      'CONTACT_AGENCY',
      'CONSIDER_PROMOTION',
    ]);
    expect(ACTION_LABELS[decision!.actionType]).toBe('Ưu tiên xuất theo FEFO');
    expect(decision!.ruleSummaryText).toBe(
      'Tồn 1.294, nhu cầu dự báo phân bổ được 1.126 trước hạn 17/12/2026 (còn 24 ngày). Tồn dư ước tính 168, mức rủi ro trung bình.',
    );
  });

  it('sắp xếp danh sách đề xuất theo thứ tự hết hạn → nguy cấp → trung bình, cùng mức theo tồn dư giảm dần', () => {
    const items = [
      {
        riskLevel: 'medium',
        isExpired: false,
        proposedQty: '70',
        expiryDate: '2026-12-12',
        lotCode: 'L04',
        createdAt: '2026-11-23T07:00:00Z',
      },
      {
        riskLevel: 'high',
        isExpired: false,
        proposedQty: '251',
        expiryDate: '2026-11-30',
        lotCode: 'L03',
        createdAt: '2026-11-23T07:00:00Z',
      },
      {
        riskLevel: 'critical',
        isExpired: true,
        proposedQty: '189',
        expiryDate: '2026-10-15',
        lotCode: 'L02',
        createdAt: '2026-11-23T07:00:00Z',
      },
      {
        riskLevel: 'critical',
        isExpired: true,
        proposedQty: '313',
        expiryDate: '2026-11-01',
        lotCode: 'L01',
        createdAt: '2026-11-23T07:00:00Z',
      },
      {
        riskLevel: 'medium',
        isExpired: false,
        proposedQty: '186',
        expiryDate: '2026-12-31',
        lotCode: 'L05',
        createdAt: '2026-11-23T07:00:00Z',
      },
    ];

    const sorted = [...items].sort(compareProposalItems);
    expect(sorted.map((item) => item.lotCode)).toEqual(['L01', 'L02', 'L03', 'L05', 'L04']);
  });
});
