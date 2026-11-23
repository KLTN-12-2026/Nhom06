import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  diffCalendarDays,
  formatDateOnly,
  getVnTodayDateString,
} from '../../expiry/domain/vn-date';
import {
  LotRiskBasis,
  QUANTITY_DECIMAL_PLACES,
  RiskLevel,
} from '../risk/domain/lot-risk.domain';
import { buildLlmInput, LlmExplanationInput } from './domain/llm-guard';
import {
  ACTION_LABELS,
  compareProposalItems,
  decideProposal,
  ProposalActionType,
  ProposalRuleCode,
  ProposalStatus,
} from './domain/rules';
import { ExplainProposalDto } from './dto/explain-proposal.dto';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';
import { ProposalExplanationView, ProposalsLlmService } from './proposals-llm.service';

export interface ProposalSnapshotData {
  evaluationDate?: string;
  expiryDate?: string;
  daysRemaining?: number;
  isExpired?: boolean;
  lotCode?: string;
  productCode?: string;
  productName?: string;
  productUnit?: string;
  onHandSnapshot?: string;
  allocatedDemand?: string;
  estimatedConsumption?: string;
  estimatedSurplus?: string;
  riskLevel?: RiskLevel;
  actionType?: ProposalActionType;
  proposedQty?: string;
  allowedActions?: ProposalActionType[];
  ruleCode?: ProposalRuleCode;
  ruleSummaryText?: string;
  llmInput?: LlmExplanationInput;
}

export interface ProposalListItemView {
  id: string;
  status: ProposalStatus;
  actionType: ProposalActionType;
  actionLabel: string;
  proposedQty: string;
  riskLevel: RiskLevel;
  isExpired: boolean;
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
    unit: string;
  };
  sourceRunId: string;
  createdAt: string;
}

export interface ProposalsListResponse {
  items: ProposalListItemView[];
  summary: {
    pending: number;
    total: number;
  };
}

export interface ProposalSummaryResponse {
  pending: number;
}

export type ProposalDisplayMode = 'llm' | 'fallback';
export type ProposalFallbackReason = 'invalid' | 'failed' | 'unavailable' | null;

export interface ProposalDetailResponse {
  id: string;
  status: ProposalStatus;
  actionType: ProposalActionType;
  actionLabel: string;
  allowedActions: ProposalActionType[];
  proposedQty: string;
  ruleCode: string;
  ruleSummaryText: string;
  sourceRunId: string;
  createdAt: string;
  analyzedAt: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  lot: {
    id: string;
    lotCode: string;
    status: string;
    expiryDate: string;
    daysRemaining: number;
    currentOnHandQty: string;
  };
  risk: {
    assessmentId: string;
    evaluationDate: string;
    expiryDate: string;
    daysRemaining: number;
    isExpired: boolean;
    onHandSnapshot: string;
    allocatedDemand: string;
    estimatedConsumption: string;
    estimatedSurplus: string;
    riskLevel: RiskLevel;
  };
  llmInput: LlmExplanationInput;
  explanation: ProposalExplanationView | null;
  displayMode: ProposalDisplayMode;
  fallbackReason: ProposalFallbackReason;
  llmDemoToggleEnabled: boolean;
}

export interface ExplainProposalResponse {
  explanation: ProposalExplanationView;
  displayMode: ProposalDisplayMode;
  fallbackReason: ProposalFallbackReason;
  ruleSummaryText: string;
}

function formatQty(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(QUANTITY_DECIMAL_PLACES);
}

function parseJsonObject<T>(raw: Prisma.JsonValue | null | undefined): Partial<T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as unknown as Partial<T>;
}

function deriveFallbackState(explanation: ProposalExplanationView | null): {
  displayMode: ProposalDisplayMode;
  fallbackReason: ProposalFallbackReason;
} {
  if (explanation?.status === 'valid') {
    return { displayMode: 'llm', fallbackReason: null };
  }
  if (explanation?.status === 'invalid') {
    return { displayMode: 'fallback', fallbackReason: 'invalid' };
  }
  if (explanation?.status === 'failed') {
    return { displayMode: 'fallback', fallbackReason: 'failed' };
  }
  return { displayMode: 'fallback', fallbackReason: 'unavailable' };
}

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly proposalsLlmService: ProposalsLlmService,
  ) {}

  isDemoToggleEnabled(): boolean {
    return this.configService.get<string>('LLM_DEMO_TOGGLE') === 'true';
  }

  async getSummary(): Promise<ProposalSummaryResponse> {
    const pending = await this.prisma.treatmentProposal.count({
      where: { status: 'pending' },
    });
    return { pending };
  }

  async list(query: ListProposalsQueryDto): Promise<ProposalsListResponse> {
    const where: Prisma.TreatmentProposalWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
      ...(query.lotId ? { lotId: query.lotId } : {}),
      ...(query.productId ? { lot: { productId: query.productId } } : {}),
      ...(query.riskLevel ? { riskAssessment: { riskLevel: query.riskLevel } } : {}),
    };

    const [rows, pending] = await Promise.all([
      this.prisma.treatmentProposal.findMany({
        where,
        select: {
          id: true,
          status: true,
          actionType: true,
          proposedQty: true,
          sourceRunId: true,
          createdAt: true,
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
                  unit: true,
                },
              },
            },
          },
          riskAssessment: {
            select: {
              riskLevel: true,
              basis: true,
            },
          },
        },
      }),
      this.prisma.treatmentProposal.count({ where: { status: 'pending' } }),
    ]);

    const todayVn = getVnTodayDateString();

    const items: ProposalListItemView[] = rows
      .map((row) => {
        const expiryDate = formatDateOnly(row.lot.expiryDate);
        const daysRemaining = diffCalendarDays(expiryDate, todayVn);
        const basis = parseJsonObject<LotRiskBasis>(row.riskAssessment.basis);
        const riskLevel = row.riskAssessment.riskLevel as RiskLevel;
        const isExpired =
          riskLevel === 'critical' ||
          (typeof basis.isExpired === 'boolean' ? basis.isExpired : daysRemaining < 0);
        const actionType = row.actionType as ProposalActionType;

        return {
          id: row.id,
          status: row.status as ProposalStatus,
          actionType,
          actionLabel: ACTION_LABELS[actionType] ?? actionType,
          proposedQty: formatQty(row.proposedQty),
          riskLevel,
          isExpired,
          lot: {
            id: row.lot.id,
            lotCode: row.lot.lotCode,
            expiryDate,
            daysRemaining,
            status: row.lot.status,
          },
          product: row.lot.product,
          sourceRunId: row.sourceRunId,
          createdAt: row.createdAt.toISOString(),
        };
      })
      .sort((a, b) =>
        compareProposalItems(
          {
            riskLevel: a.riskLevel,
            isExpired: a.isExpired,
            proposedQty: a.proposedQty,
            expiryDate: a.lot.expiryDate,
            lotCode: a.lot.lotCode,
            createdAt: a.createdAt,
          },
          {
            riskLevel: b.riskLevel,
            isExpired: b.isExpired,
            proposedQty: b.proposedQty,
            expiryDate: b.lot.expiryDate,
            lotCode: b.lot.lotCode,
            createdAt: b.createdAt,
          },
        ),
      );

    return {
      items,
      summary: {
        pending,
        total: items.length,
      },
    };
  }

  private async loadProposalRecord(id: string) {
    const row = await this.prisma.treatmentProposal.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        actionType: true,
        proposedQty: true,
        rationale: true,
        sourceRunId: true,
        snapshot: true,
        createdAt: true,
        sourceRun: {
          select: {
            id: true,
            finishedAt: true,
            createdAt: true,
          },
        },
        riskAssessment: {
          select: {
            id: true,
            onHandSnapshot: true,
            estimatedDemandBeforeExpiry: true,
            estimatedSurplusQty: true,
            riskLevel: true,
            basis: true,
            calculatedAt: true,
          },
        },
        lot: {
          select: {
            id: true,
            lotCode: true,
            status: true,
            expiryDate: true,
            balance: {
              select: {
                onHandQty: true,
              },
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
        llmExplanations: {
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            provider: true,
            modelName: true,
            promptVersion: true,
            inputSnapshot: true,
            explanationText: true,
            validationStatus: true,
            errorMessage: true,
            createdAt: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Không tìm thấy đề xuất xử lý');
    }

    return row;
  }

  private extractDetailContext(row: Awaited<ReturnType<ProposalsService['loadProposalRecord']>>) {
    const snapshot = parseJsonObject<ProposalSnapshotData>(row.snapshot);
    const basis = parseJsonObject<LotRiskBasis>(row.riskAssessment.basis);
    const todayVn = getVnTodayDateString();

    const lotExpiryDate = formatDateOnly(row.lot.expiryDate);
    const currentDaysRemaining = diffCalendarDays(lotExpiryDate, todayVn);
    const currentOnHandQty = formatQty(row.lot.balance?.onHandQty ?? 0);

    const riskExpiryDate =
      typeof snapshot.expiryDate === 'string'
        ? snapshot.expiryDate
        : typeof basis.expiryDate === 'string'
          ? basis.expiryDate
          : lotExpiryDate;
    const evaluationDate =
      typeof snapshot.evaluationDate === 'string'
        ? snapshot.evaluationDate
        : typeof basis.evaluationDate === 'string'
          ? basis.evaluationDate
          : getVnTodayDateString(row.riskAssessment.calculatedAt);
    const snapshotDaysRemaining =
      typeof snapshot.daysRemaining === 'number'
        ? snapshot.daysRemaining
        : typeof basis.daysRemaining === 'number'
          ? basis.daysRemaining
          : diffCalendarDays(riskExpiryDate, evaluationDate);

    const riskLevel = (snapshot.riskLevel ?? row.riskAssessment.riskLevel) as RiskLevel;
    const isExpired =
      typeof snapshot.isExpired === 'boolean'
        ? snapshot.isExpired
        : typeof basis.isExpired === 'boolean'
          ? basis.isExpired
          : riskLevel === 'critical' || snapshotDaysRemaining < 0;

    const onHandSnapshot = formatQty(snapshot.onHandSnapshot ?? row.riskAssessment.onHandSnapshot);
    const allocatedDemand = formatQty(
      snapshot.allocatedDemand ?? row.riskAssessment.estimatedDemandBeforeExpiry,
    );
    const estimatedSurplus = formatQty(
      snapshot.estimatedSurplus ?? row.riskAssessment.estimatedSurplusQty,
    );
    const estimatedConsumption = formatQty(
      snapshot.estimatedConsumption ??
        basis.estimatedConsumption ??
        new Prisma.Decimal(onHandSnapshot).sub(new Prisma.Decimal(estimatedSurplus)),
    );

    const actionType = row.actionType as ProposalActionType;
    const proposedQty = formatQty(row.proposedQty);

    const computedRule = decideProposal({
      riskLevel,
      isExpired,
      daysRemaining: snapshotDaysRemaining,
      expiryDate: riskExpiryDate,
      onHandSnapshot,
      allocatedDemand,
      estimatedSurplus,
    });

    const allowedActions: ProposalActionType[] =
      Array.isArray(snapshot.allowedActions) && snapshot.allowedActions.length > 0
        ? snapshot.allowedActions
        : (computedRule?.allowedActions ?? [actionType]);

    const ruleCode = snapshot.ruleCode ?? computedRule?.ruleCode ?? 'RULE_PROPOSAL';
    const ruleSummaryText =
      snapshot.ruleSummaryText ?? row.rationale ?? computedRule?.ruleSummaryText ?? '';

    // Luôn dựng llmInput đúng 12 trường sạch theo D-026 (không bao giờ chứa user/đại lý/key)
    const llmInput = buildLlmInput({
      lotCode: row.lot.lotCode,
      productCode: row.lot.product.code,
      expiryDate: riskExpiryDate,
      daysRemaining: snapshotDaysRemaining,
      onHandSnapshot,
      allocatedDemand,
      estimatedConsumption,
      estimatedSurplus,
      riskLevel,
      actionType,
      proposedQty,
      allowedActions,
    });

    const latestRow = row.llmExplanations[0] ?? null;
    const explanation = latestRow ? this.proposalsLlmService.toView(latestRow) : null;
    const { displayMode, fallbackReason } = deriveFallbackState(explanation);

    const analyzedAt = (
      row.sourceRun.finishedAt ??
      row.riskAssessment.calculatedAt ??
      row.createdAt
    ).toISOString();

    return {
      detail: {
        id: row.id,
        status: row.status as ProposalStatus,
        actionType,
        actionLabel: ACTION_LABELS[actionType] ?? actionType,
        allowedActions,
        proposedQty,
        ruleCode,
        ruleSummaryText,
        sourceRunId: row.sourceRunId,
        createdAt: row.createdAt.toISOString(),
        analyzedAt,
        product: row.lot.product,
        lot: {
          id: row.lot.id,
          lotCode: row.lot.lotCode,
          status: row.lot.status,
          expiryDate: lotExpiryDate,
          daysRemaining: currentDaysRemaining,
          currentOnHandQty,
        },
        risk: {
          assessmentId: row.riskAssessment.id,
          evaluationDate,
          expiryDate: riskExpiryDate,
          daysRemaining: snapshotDaysRemaining,
          isExpired,
          onHandSnapshot,
          allocatedDemand,
          estimatedConsumption,
          estimatedSurplus,
          riskLevel,
        },
        llmInput,
        explanation,
        displayMode,
        fallbackReason,
        llmDemoToggleEnabled: this.isDemoToggleEnabled(),
      } satisfies ProposalDetailResponse,
      llmInput,
      ruleSummaryText,
    };
  }

  async getDetail(id: string): Promise<ProposalDetailResponse> {
    const row = await this.loadProposalRecord(id);
    return this.extractDetailContext(row).detail;
  }

  async explain(id: string, dto: ExplainProposalDto): Promise<ExplainProposalResponse> {
    const simulateFailure = dto?.simulateFailure === true;
    if (simulateFailure && !this.isDemoToggleEnabled()) {
      throw new BadRequestException('Chế độ mô phỏng lỗi dịch vụ diễn giải chưa được bật');
    }

    const row = await this.loadProposalRecord(id);
    const { llmInput, ruleSummaryText } = this.extractDetailContext(row);

    const explanation = await this.proposalsLlmService.explainAndPersist(row.id, llmInput, {
      simulateFailure,
    });
    const { displayMode, fallbackReason } = deriveFallbackState(explanation);

    return {
      explanation,
      displayMode,
      fallbackReason,
      ruleSummaryText,
    };
  }
}
