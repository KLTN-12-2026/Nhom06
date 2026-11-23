import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  diffCalendarDays,
  formatDateOnly,
  getVnTodayDateString,
  parseIsoDateStrict,
} from '../../expiry/domain/vn-date';
import {
  AnalysisTriggerType,
  AnalysisWarning,
  FullAnalysisMetrics,
} from '../pipeline/analysis-pipeline.service';
import {
  compareRiskAssessmentItems,
  LotRiskBasis,
  QUANTITY_DECIMAL_PLACES,
  RiskLevel,
} from './domain/lot-risk.domain';
import { LatestRiskQueryDto, ListAnalysisRunsQueryDto } from './dto/analysis-query.dto';

export interface AnalysisRunActorView {
  id: string;
  username: string;
  fullName: string;
}

export interface AnalysisRunHistoryItem {
  id: string;
  runType: string;
  trigger: AnalysisTriggerType;
  status: string;
  requestedBy: AnalysisRunActorView | null;
  lotCount: number;
  modelVersion: string | null;
  evaluationDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  warningsCount: number;
}

export interface AnalysisRunHistoryResponse {
  items: AnalysisRunHistoryItem[];
}

export interface RiskRunSummaryView {
  id: string;
  trigger: AnalysisTriggerType;
  requestedBy: AnalysisRunActorView | null;
  finishedAt: string | null;
  lotCount: number;
  modelVersion: string | null;
  evaluationDate: string;
  warnings: AnalysisWarning[];
}

export interface RiskAssessmentItemView {
  assessmentId: string;
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    daysRemaining: number;
    status: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
  };
  onHandSnapshot: string;
  allocatedDemand: string;
  estimatedConsumption: string;
  estimatedSurplus: string;
  riskLevel: RiskLevel;
  isExpired: boolean;
}

export interface LatestRiskResponse {
  run: RiskRunSummaryView | null;
  items: RiskAssessmentItemView[];
}

export interface LotRiskDetailResponse {
  run: RiskRunSummaryView;
  assessment: RiskAssessmentItemView & {
    calculatedAt: string;
    lot: RiskAssessmentItemView['lot'] & {
      receivedAt: string;
    };
    product: RiskAssessmentItemView['product'] & {
      unit: string;
    };
    basis: LotRiskBasis;
  };
}

const FULL_RUN_TYPE = 'FULL';
const DEFAULT_RUN_HISTORY_LIMIT = 20;

function parseFullMetrics(raw: Prisma.JsonValue | null): Partial<FullAnalysisMetrics> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw as unknown as Partial<FullAnalysisMetrics>;
}

function parseBasis(raw: Prisma.JsonValue): Partial<LotRiskBasis> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as unknown as Partial<LotRiskBasis>;
}

function formatQty(value: Prisma.Decimal): string {
  return new Prisma.Decimal(value).toFixed(QUANTITY_DECIMAL_PLACES);
}

@Injectable()
export class RiskQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listRuns(query: ListAnalysisRunsQueryDto): Promise<AnalysisRunHistoryResponse> {
    if (query.from) {
      try {
        parseIsoDateStrict(query.from);
      } catch {
        throw new BadRequestException({
          message: 'Ngày bắt đầu không hợp lệ',
          errors: [{ field: 'from', message: 'Ngày bắt đầu phải đúng định dạng YYYY-MM-DD' }],
        });
      }
    }
    if (query.to) {
      try {
        parseIsoDateStrict(query.to);
      } catch {
        throw new BadRequestException({
          message: 'Ngày kết thúc không hợp lệ',
          errors: [{ field: 'to', message: 'Ngày kết thúc phải đúng định dạng YYYY-MM-DD' }],
        });
      }
    }
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [{ field: 'from', message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc' }],
      });
    }

    const where: Prisma.AnalysisRunWhereInput = {
      runType: FULL_RUN_TYPE,
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.trigger) {
      where.triggerType = query.trigger;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000+07:00`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999+07:00`) } : {}),
      };
    }

    const limit = query.limit ?? DEFAULT_RUN_HISTORY_LIMIT;
    const rows = await this.prisma.analysisRun.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        runType: true,
        triggerType: true,
        status: true,
        modelVersion: true,
        metrics: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        errorMessage: true,
        requester: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            lotRiskAssessments: true,
          },
        },
      },
    });

    return {
      items: rows.map((row) => {
        const metrics = parseFullMetrics(row.metrics);
        const lotCount =
          typeof metrics?.lotCount === 'number' ? metrics.lotCount : row._count.lotRiskAssessments;
        const warningsCount = Array.isArray(metrics?.warnings) ? metrics.warnings.length : 0;

        return {
          id: row.id,
          runType: row.runType,
          trigger: row.triggerType as AnalysisTriggerType,
          status: row.status,
          requestedBy: row.requester,
          lotCount,
          modelVersion: row.modelVersion,
          evaluationDate:
            typeof metrics?.evaluationDate === 'string' ? metrics.evaluationDate : null,
          startedAt: row.startedAt ? row.startedAt.toISOString() : null,
          finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          errorMessage: row.errorMessage,
          warningsCount,
        };
      }),
    };
  }

  async getLatestRisk(query: LatestRiskQueryDto): Promise<LatestRiskResponse> {
    const latestRun = await this.prisma.analysisRun.findFirst({
      where: {
        runType: FULL_RUN_TYPE,
        status: 'succeeded',
      },
      orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        triggerType: true,
        modelVersion: true,
        metrics: true,
        finishedAt: true,
        createdAt: true,
        requester: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            lotRiskAssessments: true,
          },
        },
      },
    });

    if (!latestRun) {
      return { run: null, items: [] };
    }

    const metrics = parseFullMetrics(latestRun.metrics);
    const evaluationDate =
      typeof metrics?.evaluationDate === 'string'
        ? metrics.evaluationDate
        : getVnTodayDateString(latestRun.finishedAt ?? latestRun.createdAt);
    const lotCount =
      typeof metrics?.lotCount === 'number'
        ? metrics.lotCount
        : latestRun._count.lotRiskAssessments;
    const warnings = Array.isArray(metrics?.warnings) ? metrics.warnings : [];

    const assessmentWhere: Prisma.LotRiskAssessmentWhereInput = {
      analysisRunId: latestRun.id,
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.productId ? { lot: { productId: query.productId } } : {}),
    };

    const assessments = await this.prisma.lotRiskAssessment.findMany({
      where: assessmentWhere,
      select: {
        id: true,
        onHandSnapshot: true,
        estimatedDemandBeforeExpiry: true,
        estimatedSurplusQty: true,
        riskLevel: true,
        basis: true,
        lot: {
          select: {
            id: true,
            lotCode: true,
            expiryDate: true,
            status: true,
            product: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const items: RiskAssessmentItemView[] = assessments
      .map((row) => {
        const basis = parseBasis(row.basis);
        const expiryDate = formatDateOnly(row.lot.expiryDate);
        const daysRemaining =
          typeof basis.daysRemaining === 'number'
            ? basis.daysRemaining
            : diffCalendarDays(expiryDate, evaluationDate);
        const isExpired =
          typeof basis.isExpired === 'boolean' ? basis.isExpired : daysRemaining < 0;
        const estimatedConsumption =
          typeof basis.estimatedConsumption === 'string'
            ? basis.estimatedConsumption
            : formatQty(row.onHandSnapshot.sub(row.estimatedSurplusQty));

        return {
          assessmentId: row.id,
          lot: {
            id: row.lot.id,
            lotCode: row.lot.lotCode,
            expiryDate,
            daysRemaining,
            status: row.lot.status,
          },
          product: row.lot.product,
          onHandSnapshot: formatQty(row.onHandSnapshot),
          allocatedDemand: formatQty(row.estimatedDemandBeforeExpiry),
          estimatedConsumption,
          estimatedSurplus: formatQty(row.estimatedSurplusQty),
          riskLevel: row.riskLevel as RiskLevel,
          isExpired,
        };
      })
      .sort((a, b) =>
        compareRiskAssessmentItems(
          {
            riskLevel: a.riskLevel,
            isExpired: a.isExpired,
            estimatedSurplus: a.estimatedSurplus,
            productCode: a.product.code,
            expiryDate: a.lot.expiryDate,
            lotCode: a.lot.lotCode,
          },
          {
            riskLevel: b.riskLevel,
            isExpired: b.isExpired,
            estimatedSurplus: b.estimatedSurplus,
            productCode: b.product.code,
            expiryDate: b.lot.expiryDate,
            lotCode: b.lot.lotCode,
          },
        ),
      );

    return {
      run: {
        id: latestRun.id,
        trigger: latestRun.triggerType as AnalysisTriggerType,
        requestedBy: latestRun.requester,
        finishedAt: latestRun.finishedAt ? latestRun.finishedAt.toISOString() : null,
        lotCount,
        modelVersion: latestRun.modelVersion,
        evaluationDate,
        warnings,
      },
      items,
    };
  }

  async getLotRiskDetail(lotId: string, runId?: string): Promise<LotRiskDetailResponse> {
    const targetRun = runId
      ? await this.prisma.analysisRun.findFirst({
          where: { id: runId, runType: FULL_RUN_TYPE },
          select: {
            id: true,
            triggerType: true,
            modelVersion: true,
            metrics: true,
            finishedAt: true,
            createdAt: true,
            requester: { select: { id: true, username: true, fullName: true } },
            _count: { select: { lotRiskAssessments: true } },
          },
        })
      : await this.prisma.analysisRun.findFirst({
          where: { runType: FULL_RUN_TYPE, status: 'succeeded' },
          orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            triggerType: true,
            modelVersion: true,
            metrics: true,
            finishedAt: true,
            createdAt: true,
            requester: { select: { id: true, username: true, fullName: true } },
            _count: { select: { lotRiskAssessments: true } },
          },
        });

    if (!targetRun) {
      throw new NotFoundException(
        runId ? 'Không tìm thấy lượt phân tích yêu cầu' : 'Chưa có lượt phân tích nào hoàn tất',
      );
    }

    const row = await this.prisma.lotRiskAssessment.findUnique({
      where: {
        analysisRunId_lotId: {
          analysisRunId: targetRun.id,
          lotId,
        },
      },
      select: {
        id: true,
        onHandSnapshot: true,
        estimatedDemandBeforeExpiry: true,
        estimatedSurplusQty: true,
        riskLevel: true,
        basis: true,
        calculatedAt: true,
        lot: {
          select: {
            id: true,
            lotCode: true,
            expiryDate: true,
            receivedAt: true,
            status: true,
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
    });

    if (!row) {
      throw new NotFoundException('Không tìm thấy kết quả phân tích cho lô này');
    }

    const metrics = parseFullMetrics(targetRun.metrics);
    const evaluationDate =
      typeof metrics?.evaluationDate === 'string'
        ? metrics.evaluationDate
        : getVnTodayDateString(targetRun.finishedAt ?? targetRun.createdAt);
    const lotCount =
      typeof metrics?.lotCount === 'number'
        ? metrics.lotCount
        : targetRun._count.lotRiskAssessments;
    const warnings = Array.isArray(metrics?.warnings) ? metrics.warnings : [];

    const basis = row.basis as unknown as LotRiskBasis;
    const expiryDate = formatDateOnly(row.lot.expiryDate);
    const daysRemaining =
      typeof basis.daysRemaining === 'number'
        ? basis.daysRemaining
        : diffCalendarDays(expiryDate, evaluationDate);
    const isExpired =
      typeof basis.isExpired === 'boolean' ? basis.isExpired : daysRemaining < 0;
    const estimatedConsumption =
      typeof basis.estimatedConsumption === 'string'
        ? basis.estimatedConsumption
        : formatQty(row.onHandSnapshot.sub(row.estimatedSurplusQty));

    return {
      run: {
        id: targetRun.id,
        trigger: targetRun.triggerType as AnalysisTriggerType,
        requestedBy: targetRun.requester,
        finishedAt: targetRun.finishedAt ? targetRun.finishedAt.toISOString() : null,
        lotCount,
        modelVersion: targetRun.modelVersion,
        evaluationDate,
        warnings,
      },
      assessment: {
        assessmentId: row.id,
        calculatedAt: row.calculatedAt.toISOString(),
        lot: {
          id: row.lot.id,
          lotCode: row.lot.lotCode,
          expiryDate,
          receivedAt: formatDateOnly(row.lot.receivedAt),
          daysRemaining,
          status: row.lot.status,
        },
        product: row.lot.product,
        onHandSnapshot: formatQty(row.onHandSnapshot),
        allocatedDemand: formatQty(row.estimatedDemandBeforeExpiry),
        estimatedConsumption,
        estimatedSurplus: formatQty(row.estimatedSurplusQty),
        riskLevel: row.riskLevel as RiskLevel,
        isExpired,
        basis,
      },
    };
  }
}
