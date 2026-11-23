import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDateOnly, parseIsoDateStrict } from '../expiry/domain/vn-date';
import { ExpiryAlertsService } from '../expiry/expiry-alerts.service';
import { buildVnDayRangeUtc } from '../inventory/domain/inventory-policy';
import {
  countByStatus,
  deduplicateLatestLotAssessments,
  RISK_LEVEL_PRIORITY,
  type RiskLevel,
  type RiskLevelSummaryItem,
  selectLinkedProposalForLot,
  summarizeRiskLevels,
} from './domain/risk-report.domain';
import {
  EXECUTION_STATUS_VALUES,
  PROPOSAL_STATUS_VALUES,
  RiskReportQueryDto,
} from './dto/risk-report-query.dto';

export interface RiskReportLatestRun {
  id: string;
  runType: string;
  modelVersion: string | null;
  finishedAt: string | null;
}

export interface RiskReportLotItem {
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    status: string;
    onHandQty: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  forecastDemand: string;
  estimatedSurplus: string;
  actualHandledQty: string | null;
  riskLevel: RiskLevel;
  actionType: string | null;
  proposalStatus: string | null;
  executionStatus: string | null;
  runId: string;
  proposalId: string | null;
}

export interface RiskReportResponse {
  latestRun: RiskReportLatestRun | null;
  expiry: {
    evaluationDate: string;
    nearExpiry: { lots: number; qty: string };
    expired: { lots: number; qty: string };
  };
  byRiskLevel: RiskLevelSummaryItem[];
  proposalsByStatus: Record<string, number>;
  executionsByStatus: Record<string, number>;
  hasSufficientActualData: boolean;
  lots: RiskReportLotItem[];
}

function validateOptionalDate(raw: string | undefined, field: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return formatDateOnly(parseIsoDateStrict(raw));
  } catch {
    throw new BadRequestException({
      message: 'Ngày lọc không hợp lệ',
      errors: [{ field, message: 'Ngày lọc phải đúng định dạng YYYY-MM-DD' }],
    });
  }
}

@Injectable()
export class RiskReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expiryAlertsService: ExpiryAlertsService,
  ) {}

  private async getExpirySummary(productId?: string) {
    if (!productId) {
      const summary = await this.expiryAlertsService.summary();
      return {
        evaluationDate: summary.evaluationDate,
        nearExpiry: summary.nearExpiry,
        expired: summary.expired,
      };
    }

    const list = await this.expiryAlertsService.list({
      productId,
      page: 1,
      pageSize: 10000,
    });

    let expiredLots = 0;
    let expiredQty = new Prisma.Decimal(0);
    let nearExpiryLots = 0;
    let nearExpiryQty = new Prisma.Decimal(0);

    for (const item of list.items) {
      const qty = new Prisma.Decimal(item.onHandQty);
      if (item.severity === 'expired') {
        expiredLots += 1;
        expiredQty = expiredQty.plus(qty);
      } else {
        nearExpiryLots += 1;
        nearExpiryQty = nearExpiryQty.plus(qty);
      }
    }

    return {
      evaluationDate: list.evaluationDate,
      nearExpiry: { lots: nearExpiryLots, qty: nearExpiryQty.toString() },
      expired: { lots: expiredLots, qty: expiredQty.toString() },
    };
  }

  async getRiskReport(query: RiskReportQueryDto): Promise<RiskReportResponse> {
    const from = validateOptionalDate(query.from, 'from');
    const to = validateOptionalDate(query.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [
          {
            field: 'from',
            message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
          },
        ],
      });
    }

    const runWhere: Prisma.AnalysisRunWhereInput = {
      status: 'succeeded',
      runType: { in: ['RISK', 'FULL'] },
    };
    if (from || to) {
      runWhere.finishedAt = buildVnDayRangeUtc(from, to);
    }

    const [expiry, latestRunRow, assessmentRows] = await Promise.all([
      this.getExpirySummary(query.productId),
      this.prisma.analysisRun.findFirst({
        where: runWhere,
        orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          runType: true,
          modelVersion: true,
          finishedAt: true,
        },
      }),
      this.prisma.lotRiskAssessment.findMany({
        where: {
          analysisRun: runWhere,
          ...(query.productId ? { lot: { productId: query.productId } } : {}),
        },
        select: {
          id: true,
          analysisRunId: true,
          lotId: true,
          estimatedDemandBeforeExpiry: true,
          estimatedSurplusQty: true,
          riskLevel: true,
          calculatedAt: true,
          analysisRun: {
            select: {
              finishedAt: true,
            },
          },
          lot: {
            select: {
              id: true,
              lotCode: true,
              expiryDate: true,
              status: true,
              balance: {
                select: { onHandQty: true },
              },
              product: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  unit: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const deduped = deduplicateLatestLotAssessments(
      assessmentRows.map((row) => ({
        ...row,
        runFinishedAt: row.analysisRun.finishedAt,
      })),
    );

    const lotIds = deduped.map((row) => row.lotId);
    const proposalRows =
      lotIds.length > 0
        ? await this.prisma.treatmentProposal.findMany({
            where: { lotId: { in: lotIds } },
            select: {
              id: true,
              riskAssessmentId: true,
              lotId: true,
              actionType: true,
              status: true,
              createdAt: true,
              execution: {
                select: {
                  status: true,
                  actualQty: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
          })
        : [];

    const proposalsByLot = new Map<string, typeof proposalRows>();
    for (const proposal of proposalRows) {
      const list = proposalsByLot.get(proposal.lotId) ?? [];
      list.push(proposal);
      proposalsByLot.set(proposal.lotId, list);
    }

    const mapped = deduped.map((assessment) => {
      const linkedProposal = selectLinkedProposalForLot(
        proposalsByLot.get(assessment.lotId) ?? [],
        assessment.id,
      );
      const onHand = assessment.lot.balance?.onHandQty ?? new Prisma.Decimal(0);
      const actualQty = linkedProposal?.execution?.actualQty ?? null;

      return {
        assessment,
        item: {
          lot: {
            id: assessment.lot.id,
            lotCode: assessment.lot.lotCode,
            expiryDate: formatDateOnly(assessment.lot.expiryDate),
            status: assessment.lot.status,
            onHandQty: onHand.toString(),
          },
          product: assessment.lot.product,
          forecastDemand: assessment.estimatedDemandBeforeExpiry.toString(),
          estimatedSurplus: assessment.estimatedSurplusQty.toString(),
          actualHandledQty: actualQty !== null ? actualQty.toString() : null,
          riskLevel: assessment.riskLevel as RiskLevel,
          actionType: linkedProposal?.actionType ?? null,
          proposalStatus: linkedProposal?.status ?? null,
          executionStatus: linkedProposal?.execution?.status ?? null,
          runId: assessment.analysisRunId,
          proposalId: linkedProposal?.id ?? null,
        } satisfies RiskReportLotItem,
      };
    });

    const filtered = mapped
      .filter(({ item }) => {
        if (query.riskLevel && item.riskLevel !== query.riskLevel) {
          return false;
        }
        if (query.proposalStatus && item.proposalStatus !== query.proposalStatus) {
          return false;
        }
        if (query.executionStatus && item.executionStatus !== query.executionStatus) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const pA = RISK_LEVEL_PRIORITY[a.item.riskLevel] ?? 99;
        const pB = RISK_LEVEL_PRIORITY[b.item.riskLevel] ?? 99;
        if (pA !== pB) {
          return pA - pB;
        }
        const expCmp = a.item.lot.expiryDate.localeCompare(b.item.lot.expiryDate);
        if (expCmp !== 0) {
          return expCmp;
        }
        return a.item.lot.lotCode.localeCompare(b.item.lot.lotCode);
      });

    const lots = filtered.map((entry) => entry.item);
    const byRiskLevel = summarizeRiskLevels(filtered.map((entry) => entry.assessment));
    const proposalsByStatus = countByStatus(
      lots.map((l) => l.proposalStatus),
      PROPOSAL_STATUS_VALUES,
    );
    const executionsByStatus = countByStatus(
      lots.map((l) => l.executionStatus),
      EXECUTION_STATUS_VALUES,
    );
    const hasSufficientActualData = lots.some((l) => l.actualHandledQty !== null);

    return {
      latestRun: latestRunRow
        ? {
            id: latestRunRow.id,
            runType: latestRunRow.runType,
            modelVersion: latestRunRow.modelVersion,
            finishedAt: latestRunRow.finishedAt ? latestRunRow.finishedAt.toISOString() : null,
          }
        : null,
      expiry,
      byRiskLevel,
      proposalsByStatus,
      executionsByStatus,
      hasSufficientActualData,
      lots,
    };
  }
}
