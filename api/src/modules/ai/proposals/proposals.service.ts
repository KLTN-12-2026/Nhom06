import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../../common/utils/audit-log.util';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  diffCalendarDays,
  formatDateOnly,
  getVnTodayDateString,
} from '../../expiry/domain/vn-date';
import { isPgConcurrencyConflictError } from '../../outbound/domain/outbound-policy';
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
import { ApproveProposalDto, RejectProposalDto } from './dto/proposal-decision.dto';
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

export interface ProposalDecisionView {
  id: string;
  decision: 'approved' | 'rejected';
  reason: string | null;
  decidedAt: string;
  decider: {
    id: string;
    fullName: string;
  };
}

export interface ProposalExecutionBriefView {
  id: string;
  status: string;
  plannedQty: string;
  actualQty: string | null;
  linkedOutboundId: string | null;
}

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
  decision: ProposalDecisionView | null;
  execution: ProposalExecutionBriefView | null;
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

  private async loadProposalRecord(
    id: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const row = await client.treatmentProposal.findUnique({
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
        decision: {
          select: {
            id: true,
            decision: true,
            reason: true,
            decidedAt: true,
            decider: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        execution: {
          select: {
            id: true,
            status: true,
            plannedQty: true,
            actualQty: true,
            linkedOutboundId: true,
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
        decision: row.decision
          ? {
              id: row.decision.id,
              decision: row.decision.decision as 'approved' | 'rejected',
              reason: row.decision.reason,
              decidedAt: row.decision.decidedAt.toISOString(),
              decider: row.decision.decider,
            }
          : null,
        execution: row.execution
          ? {
              id: row.execution.id,
              status: row.execution.status,
              plannedQty: formatQty(row.execution.plannedQty),
              actualQty:
                row.execution.actualQty !== null ? formatQty(row.execution.actualQty) : null,
              linkedOutboundId: row.execution.linkedOutboundId,
            }
          : null,
      } satisfies ProposalDetailResponse,
      llmInput,
      ruleSummaryText,
    };
  }

  async getDetail(id: string): Promise<ProposalDetailResponse> {
    const row = await this.loadProposalRecord(id);
    return this.extractDetailContext(row).detail;
  }

  async approve(
    id: string,
    dto: ApproveProposalDto,
    actorUserId: string,
  ): Promise<ProposalDetailResponse> {
    return this.decide(id, {
      decision: 'approved',
      reason: dto.note ?? null,
      responsibleUserId: dto.responsibleUserId,
      actorUserId,
    });
  }

  async reject(
    id: string,
    dto: RejectProposalDto,
    actorUserId: string,
  ): Promise<ProposalDetailResponse> {
    const reason = dto.reason?.trim() ?? '';
    if (!reason) {
      throw new BadRequestException({
        message: 'Vui lòng nhập lý do từ chối',
        errors: [{ field: 'reason', message: 'Vui lòng nhập lý do từ chối' }],
      });
    }
    return this.decide(id, {
      decision: 'rejected',
      reason,
      actorUserId,
    });
  }

  /**
   * Phê duyệt hoặc từ chối đề xuất trong một DB transaction có khóa bi quan (D-028, bất biến 1 & 8):
   * - Khóa treatment_proposals (FOR UPDATE), kiểm status = 'pending'.
   * - Khóa lots & inventory_lot_balances (FOR UPDATE), kiểm lô chưa 'closed' và tồn > 0.
   * - Ghi proposal_decisions (UNIQUE proposal_id chặn quyết định thứ 2), chốt trạng thái đề xuất bằng điều kiện kép.
   * - Nếu phê duyệt: tạo treatment_executions (planned); KHÔNG tạo phiếu xuất, KHÔNG đổi tồn.
   */
  private async decide(
    id: string,
    params: {
      decision: 'approved' | 'rejected';
      reason: string | null;
      responsibleUserId?: string;
      actorUserId: string;
    },
  ): Promise<ProposalDetailResponse> {
    const decidedAt = new Date();

    try {
      const updatedRecord = await this.prisma.$transaction(
        async (tx) => {
          const lockedProposals = await tx.$queryRaw<
            Array<{
              id: string;
              lot_id: string;
              action_type: string;
              proposed_qty: string;
              status: string;
            }>
          >`
            SELECT id, lot_id, action_type, proposed_qty::text AS proposed_qty, status
            FROM treatment_proposals
            WHERE id = ${id}::uuid
            FOR UPDATE
          `;
          const locked = lockedProposals[0];
          if (!locked) {
            throw new NotFoundException('Không tìm thấy đề xuất xử lý');
          }
          if (locked.status !== 'pending') {
            throw new ConflictException('Đề xuất đã có quyết định hoặc không ở trạng thái chờ duyệt');
          }

          // Khóa lô và tồn theo đúng thứ tự chuẩn (lots → inventory_lot_balances) để kiểm tồn > 0 trong transaction
          const lockedLots = await tx.$queryRaw<
            Array<{ id: string; lot_code: string; status: string }>
          >`
            SELECT id, lot_code, status
            FROM lots
            WHERE id = ${locked.lot_id}::uuid
            FOR UPDATE
          `;
          const lot = lockedLots[0];
          if (!lot || lot.status === 'closed') {
            throw new ConflictException('Đề xuất không còn phù hợp với tồn hiện tại');
          }

          const lockedBalances = await tx.$queryRaw<Array<{ on_hand_qty: string }>>`
            SELECT on_hand_qty::text AS on_hand_qty
            FROM inventory_lot_balances
            WHERE lot_id = ${locked.lot_id}::uuid
            FOR UPDATE
          `;
          const currentOnHand = lockedBalances[0]
            ? new Prisma.Decimal(lockedBalances[0].on_hand_qty)
            : new Prisma.Decimal(0);
          if (currentOnHand.lte(0)) {
            throw new ConflictException('Đề xuất không còn phù hợp với tồn hiện tại');
          }

          let responsibleUserId = params.actorUserId;
          if (
            params.decision === 'approved' &&
            params.responsibleUserId &&
            params.responsibleUserId !== params.actorUserId
          ) {
            const responsibleUser = await tx.user.findUnique({
              where: { id: params.responsibleUserId },
              select: { id: true, status: true },
            });
            if (!responsibleUser || responsibleUser.status !== 'active') {
              throw new BadRequestException({
                message: 'Người phụ trách không tồn tại hoặc đã bị khóa',
                errors: [
                  {
                    field: 'responsibleUserId',
                    message: 'Người phụ trách không tồn tại hoặc đã bị khóa',
                  },
                ],
              });
            }
            responsibleUserId = responsibleUser.id;
          }

          let decisionRow: { id: string };
          try {
            decisionRow = await tx.proposalDecision.create({
              data: {
                proposalId: locked.id,
                decision: params.decision,
                decidedBy: params.actorUserId,
                reason: params.reason,
                decidedAt,
              },
              select: { id: true },
            });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              throw new ConflictException('Đề xuất đã có quyết định');
            }
            throw error;
          }

          const proposalUpdate = await tx.treatmentProposal.updateMany({
            where: { id: locked.id, status: 'pending' },
            data: { status: params.decision },
          });
          if (proposalUpdate.count !== 1) {
            throw new ConflictException('Đề xuất đã có quyết định');
          }

          let executionId: string | null = null;
          if (params.decision === 'approved') {
            const execution = await tx.treatmentExecution.create({
              data: {
                proposalId: locked.id,
                status: 'planned',
                plannedQty: new Prisma.Decimal(locked.proposed_qty),
                actualQty: null,
                responsibleUserId,
                linkedOutboundId: null,
                note: params.reason,
              },
              select: { id: true },
            });
            executionId = execution.id;
          }

          await writeAuditLog(tx, {
            actorUserId: params.actorUserId,
            eventType: params.decision === 'approved' ? 'PROPOSAL_APPROVED' : 'PROPOSAL_REJECTED',
            entityType: 'treatment_proposal',
            entityId: locked.id,
            oldData: { status: 'pending' },
            newData: {
              status: params.decision,
              decisionId: decisionRow.id,
              executionId,
              reason: params.reason,
              lotId: locked.lot_id,
              lotCode: lot.lot_code,
              actionType: locked.action_type,
              onHandAtDecision: currentOnHand.toString(),
            },
          });

          return this.loadProposalRecord(locked.id, tx);
        },
        { timeout: 10_000 },
      );

      return this.extractDetailContext(updatedRecord).detail;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Đề xuất đã có quyết định');
      }
      if (isPgConcurrencyConflictError(error)) {
        throw new ConflictException('Đề xuất đang được xử lý đồng thời, vui lòng thử lại');
      }
      throw error;
    }
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
