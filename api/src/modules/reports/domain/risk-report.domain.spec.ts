import { Prisma } from '@prisma/client';
import {
  computeValueAtRisk,
  deduplicateLatestLotAssessments,
  selectLinkedProposalForLot,
  summarizeRiskLevels,
  type LotValueAtRiskInput,
  type ProposalLinkCandidate,
} from './risk-report.domain';

describe('risk-report.domain (AC5 + chống đếm trùng PB30)', () => {
  it('tính valueAtRisk theo đơn giá bình quân gia quyền và đếm đúng lotsWithoutCost', () => {
    const inputs: LotValueAtRiskInput[] = [
      // Lô 1: nhập 2 đợt (100 * 10.000 + 300 * 14.000) / 400 = 13.000; surplus 50 → 650.000
      {
        lotId: 'lot-1',
        estimatedSurplusQty: new Prisma.Decimal('50'),
        inboundCosts: [
          { quantity: new Prisma.Decimal('100'), unitCost: new Prisma.Decimal('10000') },
          { quantity: new Prisma.Decimal('300'), unitCost: new Prisma.Decimal('14000') },
        ],
      },
      // Lô 2: 1 đợt giá 25.000; surplus 20 → 500.000
      {
        lotId: 'lot-2',
        estimatedSurplusQty: new Prisma.Decimal('20'),
        inboundCosts: [
          { quantity: new Prisma.Decimal('200'), unitCost: new Prisma.Decimal('25000') },
        ],
      },
      // Lô 3: surplus 30 nhưng không có đơn giá → tăng lotsWithoutCost
      {
        lotId: 'lot-3',
        estimatedSurplusQty: new Prisma.Decimal('30'),
        inboundCosts: [],
      },
      // Lô 4: surplus = 0, không có đơn giá → không cộng vào surplus và không đếm lotsWithoutCost
      {
        lotId: 'lot-4',
        estimatedSurplusQty: new Prisma.Decimal('0'),
        inboundCosts: [],
      },
    ];

    const result = computeValueAtRisk(inputs);
    expect(result).toEqual({
      amount: '1150000',
      surplusQty: '100',
      lotsWithoutCost: 1,
    });
  });

  it('gom đủ 4 mức rủi ro theo thứ tự cố định critical → high → medium → low', () => {
    const summary = summarizeRiskLevels([
      { riskLevel: 'medium', estimatedSurplusQty: new Prisma.Decimal('120') },
      { riskLevel: 'critical', estimatedSurplusQty: new Prisma.Decimal('50') },
      { riskLevel: 'critical', estimatedSurplusQty: new Prisma.Decimal('30.5') },
      { riskLevel: 'low', estimatedSurplusQty: new Prisma.Decimal('0') },
    ]);

    expect(summary).toEqual([
      { level: 'critical', lots: 2, surplusQty: '80.5' },
      { level: 'high', lots: 0, surplusQty: '0' },
      { level: 'medium', lots: 1, surplusQty: '120' },
      { level: 'low', lots: 1, surplusQty: '0' },
    ]);
  });

  it('chống đếm trùng lô giữa nhiều lượt phân tích bằng cách chỉ giữ kết quả lượt mới nhất', () => {
    const deduped = deduplicateLatestLotAssessments([
      {
        id: 'a-old',
        lotId: 'lot-1',
        runFinishedAt: new Date('2026-11-20T06:00:00Z'),
        calculatedAt: new Date('2026-11-20T06:00:00Z'),
      },
      {
        id: 'a-new',
        lotId: 'lot-1',
        runFinishedAt: new Date('2026-11-22T06:00:00Z'),
        calculatedAt: new Date('2026-11-22T06:00:00Z'),
      },
      {
        id: 'b-only',
        lotId: 'lot-2',
        runFinishedAt: new Date('2026-11-21T06:00:00Z'),
        calculatedAt: new Date('2026-11-21T06:00:00Z'),
      },
    ]);

    expect(deduped.map((r) => r.id).sort()).toEqual(['a-new', 'b-only']);
  });

  it('liên kết đề xuất theo riskAssessmentId trước rồi fallback về đề xuất hoạt động từ lượt trước (D-026)', () => {
    const proposals: ProposalLinkCandidate[] = [
      {
        id: 'prop-active-old',
        riskAssessmentId: 'assess-old',
        status: 'approved',
        createdAt: new Date('2026-11-20T08:00:00Z'),
      },
      {
        id: 'prop-rejected-newer',
        riskAssessmentId: 'assess-mid',
        status: 'rejected',
        createdAt: new Date('2026-11-21T08:00:00Z'),
      },
    ];

    // Không khớp trực tiếp assess-latest → ưu tiên đề xuất đang hoạt động (approved)
    expect(selectLinkedProposalForLot(proposals, 'assess-latest')?.id).toBe('prop-active-old');

    // Nếu có đề xuất gắn trực tiếp assess-mid → ưu tiên khớp trực tiếp
    expect(selectLinkedProposalForLot(proposals, 'assess-mid')?.id).toBe('prop-rejected-newer');
  });
});
