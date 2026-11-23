import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExpiryThresholdsService } from '../../expiry/expiry-thresholds.service';
import { OutboundReceiptsService } from '../../outbound/outbound-receipts.service';
import { ExecutionsService } from './executions.service';

describe('ExecutionsService — Rollback nguyên tử xuất hủy trên PostgreSQL thật (T-015 AC6)', () => {
  let prisma: PrismaService;
  let thresholdsService: ExpiryThresholdsService;
  let outboundReceiptsService: OutboundReceiptsService;
  let executionsService: ExecutionsService;

  let managerId: string;
  let staffId: string;
  let supplierId: string;
  let productId: string;
  let lotId: string;
  let runId: string;
  let assessmentId: string;
  let proposalId: string;
  let executionId: string;
  let testStartedAt: Date;

  const prefix = `T015_SVC_${Date.now()}_`;

  beforeAll(async () => {
    testStartedAt = new Date();
    prisma = new PrismaService();
    await prisma.$connect();

    thresholdsService = new ExpiryThresholdsService(prisma);
    outboundReceiptsService = new OutboundReceiptsService(prisma, thresholdsService);
    executionsService = new ExecutionsService(prisma, outboundReceiptsService);

    const [manager, staff, supplier, product] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.user.findUniqueOrThrow({ where: { username: 'nhanvien' } }),
      prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
    ]);

    managerId = manager.id;
    staffId = staff.id;
    supplierId = supplier.id;
    productId = product.id;

    // Tạo lô hết hạn còn tồn 44 + đề xuất DISPOSE đã duyệt + execution planned
    const lot = await prisma.lot.create({
      data: {
        productId,
        supplierId,
        lotCode: `${prefix}EXP`,
        expiryDate: new Date('2026-11-10T00:00:00.000Z'),
        receivedAt: new Date('2026-10-01T00:00:00.000Z'),
        initialQuantity: new Prisma.Decimal('44'),
        status: 'active',
        balance: { create: { onHandQty: new Prisma.Decimal('44'), version: 1 } },
      },
    });
    lotId = lot.id;

    const run = await prisma.analysisRun.create({
      data: {
        runType: 'FULL',
        triggerType: 'MANUAL',
        status: 'succeeded',
        requestedBy: managerId,
        modelVersion: 'rf-v1',
        startedAt: testStartedAt,
        finishedAt: testStartedAt,
      },
    });
    runId = run.id;

    const assessment = await prisma.lotRiskAssessment.create({
      data: {
        analysisRunId: runId,
        lotId,
        onHandSnapshot: new Prisma.Decimal('44'),
        estimatedDemandBeforeExpiry: new Prisma.Decimal('0'),
        estimatedSurplusQty: new Prisma.Decimal('44'),
        riskLevel: 'critical',
        basis: { evaluationDate: '2026-11-23', isExpired: true },
      },
    });
    assessmentId = assessment.id;

    const proposal = await prisma.treatmentProposal.create({
      data: {
        riskAssessmentId: assessmentId,
        lotId,
        actionType: 'DISPOSE',
        proposedQty: new Prisma.Decimal('44'),
        rationale: 'Lô đã hết hạn cần hủy',
        sourceRunId: runId,
        status: 'approved',
        snapshot: { actionType: 'DISPOSE', proposedQty: '44.000' },
      },
    });
    proposalId = proposal.id;

    await prisma.proposalDecision.create({
      data: {
        proposalId,
        decision: 'approved',
        decidedBy: managerId,
        reason: 'Duyệt hủy lô hết hạn',
      },
    });

    const execution = await prisma.treatmentExecution.create({
      data: {
        proposalId,
        status: 'planned',
        plannedQty: new Prisma.Decimal('44'),
        actualQty: null,
        responsibleUserId: managerId,
      },
    });
    executionId = execution.id;
  });

  afterAll(async () => {
    try {
      if (executionId) {
        await prisma.treatmentExecutionUpdate.deleteMany({ where: { executionId } });
        await prisma.treatmentExecution.deleteMany({ where: { id: executionId } });
      }
      if (proposalId) {
        await prisma.proposalDecision.deleteMany({ where: { proposalId } });
        await prisma.treatmentProposal.deleteMany({ where: { id: proposalId } });
      }
      if (assessmentId) {
        await prisma.lotRiskAssessment.deleteMany({ where: { id: assessmentId } });
      }
      if (runId) {
        await prisma.analysisRun.deleteMany({ where: { id: runId } });
      }
      if (lotId) {
        const items = await prisma.outboundReceiptItem.findMany({
          where: { lotId },
          select: { outboundId: true },
        });
        const receiptIds = Array.from(new Set(items.map((i) => i.outboundId)));
        if (receiptIds.length > 0) {
          await prisma.stockMovement.deleteMany({
            where: { sourceType: 'OUTBOUND_RECEIPT', sourceId: { in: receiptIds } },
          });
          await prisma.outboundReceiptItem.deleteMany({
            where: { outboundId: { in: receiptIds } },
          });
          await prisma.outboundReceipt.deleteMany({ where: { id: { in: receiptIds } } });
        }
        await prisma.stockMovement.deleteMany({ where: { lotId } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId } });
        await prisma.lot.deleteMany({ where: { id: lotId } });
      }
      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ['outbound_receipt', 'treatment_execution'] },
          createdAt: { gte: testStartedAt },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('ép lỗi ở recordStockMovement khi lập phiếu hủy → rollback hoàn toàn: 0 phiếu xuất, 0 movement, tồn lô và execution giữ nguyên', async () => {
    const spy = jest
      .spyOn(
        outboundReceiptsService as unknown as {
          recordStockMovement: (...args: unknown[]) => Promise<void>;
        },
        'recordStockMovement',
      )
      .mockRejectedValueOnce(new Error('Lỗi giả lập khi ghi stock_movements cho phiếu hủy'));

    try {
      await expect(
        executionsService.createDisposal(
          executionId,
          { quantity: '44', notes: 'Biên bản hủy test rollback' },
          staffId,
        ),
      ).rejects.toThrow('Lỗi giả lập khi ghi stock_movements cho phiếu hủy');
    } finally {
      spy.mockRestore();
    }

    const [receiptItems, movements, balance, executionAfter, updatesAfter, proposalAfter, audits] =
      await Promise.all([
        prisma.outboundReceiptItem.findMany({ where: { lotId } }),
        prisma.stockMovement.findMany({ where: { lotId } }),
        prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId } }),
        prisma.treatmentExecution.findUniqueOrThrow({ where: { id: executionId } }),
        prisma.treatmentExecutionUpdate.findMany({ where: { executionId } }),
        prisma.treatmentProposal.findUniqueOrThrow({ where: { id: proposalId } }),
        prisma.auditLog.findMany({
          where: {
            entityType: { in: ['outbound_receipt', 'treatment_execution'] },
            createdAt: { gte: testStartedAt },
          },
        }),
      ]);

    expect(receiptItems).toHaveLength(0);
    expect(movements).toHaveLength(0);
    expect(balance.onHandQty.toString()).toBe('44');
    expect(balance.version).toBe(1);
    expect(executionAfter.status).toBe('planned');
    expect(executionAfter.actualQty).toBeNull();
    expect(executionAfter.linkedOutboundId).toBeNull();
    expect(executionAfter.startedAt).toBeNull();
    expect(updatesAfter).toHaveLength(0);
    expect(proposalAfter.status).toBe('approved');
    expect(audits).toHaveLength(0);
  });
});
