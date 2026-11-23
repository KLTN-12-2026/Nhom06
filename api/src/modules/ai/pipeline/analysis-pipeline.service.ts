import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatDateOnly, getVnTodayDateString } from '../../expiry/domain/vn-date';
import { ExpiryThresholdsService } from '../../expiry/expiry-thresholds.service';
import { ForecastRunMetrics, ForecastService } from '../forecast/forecast.service';
import { MlServiceError } from '../forecast/ml-client.service';
import { buildLlmInput, LlmExplanationInput } from '../proposals/domain/llm-guard';
import { ACTIVE_PROPOSAL_STATUSES, decideProposal } from '../proposals/domain/rules';
import { ExplainBatchTask, ProposalsLlmService } from '../proposals/proposals-llm.service';
import {
  ComputedLotRisk,
  computeLotRisks,
  QUANTITY_DECIMAL_PLACES,
  RiskLotInput,
} from '../risk/domain/lot-risk.domain';
import { ActualDemandSyncService } from './actual-demand-sync.service';

export type AnalysisTriggerType = 'MANUAL' | 'SCHEDULED' | 'STOCK_CHANGE';

export interface RunAnalysisPipelineOptions {
  trigger: AnalysisTriggerType;
  requestedBy?: string | null;
  horizonDays?: number;
}

export interface AnalysisWarning {
  code: 'MISSING_FORECAST';
  productId: string;
  productCode: string;
  productName: string;
  lotCount: number;
  reason: string;
}

export interface FullAnalysisMetrics {
  evaluationDate: string;
  minDeliveryDays: number;
  lotCount: number;
  riskCounts: {
    expired: number;
    high: number;
    medium: number;
    low: number;
  };
  surplusLotCount: number;
  createdProposals: number;
  skippedProposals: number;
  actualSyncedCount: number;
  forecast: ForecastRunMetrics;
  warnings: AnalysisWarning[];
}

export interface AnalysisRunResult {
  id: string;
  runType: string;
  trigger: AnalysisTriggerType;
  triggerType: AnalysisTriggerType;
  status: string;
  requestedBy: {
    id: string;
    username: string;
    fullName: string;
  } | null;
  modelVersion: string | null;
  evaluationDate: string;
  lotCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  errorMessage: string | null;
  metrics: FullAnalysisMetrics;
}

const FULL_RUN_TYPE = 'FULL';
const DEFAULT_HORIZON_DAYS = 60;

function extractSafeErrorMessage(error: unknown): string {
  if (error instanceof MlServiceError) {
    return error.message;
  }
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const msg = (response as { message?: unknown }).message;
      if (typeof msg === 'string') {
        return msg;
      }
      if (Array.isArray(msg) && msg.length > 0) {
        return String(msg[0]);
      }
    }
    return error.message;
  }
  if (error instanceof Error) {
    return `Lỗi khi chạy lượt phân tích: ${error.message}`;
  }
  return 'Lỗi không xác định khi chạy lượt phân tích';
}

@Injectable()
export class AnalysisPipelineService {
  private readonly logger = new Logger(AnalysisPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecastService: ForecastService,
    private readonly expiryThresholdsService: ExpiryThresholdsService,
    private readonly actualDemandSyncService: ActualDemandSyncService,
    @Optional() private readonly proposalsLlmService?: ProposalsLlmService,
  ) {}

  /**
   * Luồng phân tích tổng hợp (D-004, D-025) dùng chung cho MANUAL, SCHEDULED và STOCK_CHANGE:
   * 1. Tạo `analysis_runs` (`FULL`, `running`) — chống chạy trùng qua partial unique index.
   * 2. Đồng bộ `demand_history` ACTUAL từ xuất kho ORDER đã xác nhận.
   * 3. Chạy dự báo mọi sản phẩm active qua `ForecastService.generateForecastForRun`.
   * 4. Tính tồn dư & rủi ro cho mọi lô có tồn > 0 bằng hàm thuần `computeLotRisks`.
   * 5. Lưu toàn bộ `demand_forecasts` + `lot_risk_assessments` + chốt `succeeded` trong 1 transaction cuối.
   * Không bao giờ thay đổi tồn kho, sổ biến động hay quyết định đề xuất đã duyệt (bất biến 1 & 8).
   */
  async run(options: RunAnalysisPipelineOptions): Promise<AnalysisRunResult> {
    const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;

    let run;
    try {
      run = await this.prisma.analysisRun.create({
        data: {
          runType: FULL_RUN_TYPE,
          triggerType: options.trigger,
          status: 'running',
          requestedBy: options.requestedBy ?? null,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Đang có lượt phân tích chạy');
      }
      throw error;
    }

    try {
      const evaluationDate = getVnTodayDateString();
      const minDeliveryDays = await this.expiryThresholdsService.getMinDeliveryDays(evaluationDate);

      // Bước 1: Đồng bộ lịch sử xuất thực tế (ACTUAL) trước khi dự báo
      const actualSyncedCount =
        await this.actualDemandSyncService.syncFromConfirmedOrderOutbounds();

      // Bước 2: Dự báo nhu cầu toàn bộ sản phẩm active (dữ liệu nằm trên bộ nhớ, chưa ghi DB)
      const forecastBundle = await this.forecastService.generateForecastForRun(run.id, horizonDays);

      // Bước 3: Tải toàn bộ lô còn tồn > 0 (bao gồm cả lô hết hạn và blocked)
      const stockLots = await this.prisma.lot.findMany({
        where: {
          balance: {
            onHandQty: { gt: 0 },
          },
        },
        select: {
          id: true,
          productId: true,
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
              status: true,
            },
          },
          balance: {
            select: {
              onHandQty: true,
            },
          },
        },
      });

      const lotsByProduct = new Map<
        string,
        {
          product: { id: string; code: string; name: string; unit: string; status: string };
          lots: RiskLotInput[];
        }
      >();

      for (const row of stockLots) {
        if (!row.balance || row.balance.onHandQty.lte(0)) {
          continue;
        }
        const entry = lotsByProduct.get(row.productId) ?? {
          product: row.product,
          lots: [],
        };
        entry.lots.push({
          id: row.id,
          productId: row.productId,
          lotCode: row.lotCode,
          expiryDate: formatDateOnly(row.expiryDate),
          receivedAt: formatDateOnly(row.receivedAt),
          status: row.status,
          onHandQty: row.balance.onHandQty,
        });
        lotsByProduct.set(row.productId, entry);
      }

      const skippedReasonByCode = new Map(
        forecastBundle.metrics.skipped.map((item) => [item.productCode, item.reason]),
      );

      // Bước 4: Tính tồn dư theo lô; sản phẩm thiếu dự báo không tạo kết quả giả mà ghi warnings (PB22 AC8)
      const riskRows: Prisma.LotRiskAssessmentCreateManyInput[] = [];
      const computedByLotId = new Map<
        string,
        {
          computed: ComputedLotRisk;
          product: { id: string; code: string; name: string; unit: string };
        }
      >();
      const warnings: AnalysisWarning[] = [];
      const riskCounts = { expired: 0, high: 0, medium: 0, low: 0 };
      let surplusLotCount = 0;

      const sortedProductGroups = Array.from(lotsByProduct.values()).sort((a, b) =>
        a.product.code.localeCompare(b.product.code),
      );

      for (const group of sortedProductGroups) {
        const productForecast = forecastBundle.dailyForecastByProduct.get(group.product.id);
        if (!productForecast || productForecast.length === 0) {
          const reason =
            skippedReasonByCode.get(group.product.code) ??
            (group.product.status !== 'active'
              ? 'Sản phẩm đã ngừng kinh doanh nên không có dự báo'
              : 'Sản phẩm chưa có dữ liệu dự báo nhu cầu');
          warnings.push({
            code: 'MISSING_FORECAST',
            productId: group.product.id,
            productCode: group.product.code,
            productName: group.product.name,
            lotCount: group.lots.length,
            reason,
          });
          continue;
        }

        const computedRisks = computeLotRisks(
          group.lots,
          productForecast,
          evaluationDate,
          minDeliveryDays,
          {
            forecastRunId: run.id,
            modelVersion: forecastBundle.modelVersion,
          },
        );

        for (const item of computedRisks) {
          riskRows.push({
            analysisRunId: run.id,
            lotId: item.lotId,
            forecastId: null,
            onHandSnapshot: item.onHandSnapshot,
            estimatedDemandBeforeExpiry: item.allocatedDemand,
            estimatedSurplusQty: item.estimatedSurplus,
            riskLevel: item.riskLevel,
            basis: item.basis as unknown as Prisma.InputJsonValue,
          });
          computedByLotId.set(item.lotId, {
            computed: item,
            product: {
              id: group.product.id,
              code: group.product.code,
              name: group.product.name,
              unit: group.product.unit,
            },
          });

          if (item.isExpired || item.riskLevel === 'critical') {
            riskCounts.expired += 1;
          } else if (item.riskLevel === 'high') {
            riskCounts.high += 1;
          } else if (item.riskLevel === 'medium') {
            riskCounts.medium += 1;
          } else {
            riskCounts.low += 1;
          }

          if (item.estimatedSurplus.gt(0)) {
            surplusLotCount += 1;
          }
        }
      }

      // Bước 5: Lưu toàn bộ kết quả lượt phân tích + sinh đề xuất xử lý trong một DB transaction nguyên tử
      const { finishedRun, metrics, llmTasks } = await this.prisma.$transaction(async (tx) => {
        if (forecastBundle.forecastRows.length > 0) {
          await tx.demandForecast.createMany({ data: forecastBundle.forecastRows });
        }

        const createdAssessments =
          riskRows.length > 0
            ? await tx.lotRiskAssessment.createManyAndReturn({
                data: riskRows,
                select: { id: true, lotId: true },
              })
            : [];

        // T-014: áp bộ quy tắc đề xuất xử lý cho từng lô có tồn dư > 0, bỏ qua lô đã có đề xuất đang hoạt động
        const proposalCandidates: Array<{
          lotId: string;
          riskAssessmentId: string;
          computed: ComputedLotRisk;
          product: { id: string; code: string; name: string; unit: string };
          decision: NonNullable<ReturnType<typeof decideProposal>>;
          llmInput: LlmExplanationInput;
        }> = [];

        for (const assessment of createdAssessments) {
          const ctx = computedByLotId.get(assessment.lotId);
          if (!ctx) {
            continue;
          }
          const decision = decideProposal({
            riskLevel: ctx.computed.riskLevel,
            isExpired: ctx.computed.isExpired,
            daysRemaining: ctx.computed.daysRemaining,
            expiryDate: ctx.computed.expiryDate,
            onHandSnapshot: ctx.computed.onHandSnapshot,
            allocatedDemand: ctx.computed.allocatedDemand,
            estimatedSurplus: ctx.computed.estimatedSurplus,
          });
          if (!decision) {
            continue;
          }

          const llmInput = buildLlmInput({
            lotCode: ctx.computed.lotCode,
            productCode: ctx.product.code,
            expiryDate: ctx.computed.expiryDate,
            daysRemaining: ctx.computed.daysRemaining,
            onHandSnapshot: ctx.computed.onHandSnapshot,
            allocatedDemand: ctx.computed.allocatedDemand,
            estimatedConsumption: ctx.computed.estimatedConsumption,
            estimatedSurplus: ctx.computed.estimatedSurplus,
            riskLevel: ctx.computed.riskLevel,
            actionType: decision.actionType,
            proposedQty: ctx.computed.estimatedSurplus,
            allowedActions: decision.allowedActions,
          });

          proposalCandidates.push({
            lotId: assessment.lotId,
            riskAssessmentId: assessment.id,
            computed: ctx.computed,
            product: ctx.product,
            decision,
            llmInput,
          });
        }

        const candidateLotIds = proposalCandidates.map((item) => item.lotId);
        const existingActive =
          candidateLotIds.length > 0
            ? await tx.treatmentProposal.findMany({
                where: {
                  lotId: { in: candidateLotIds },
                  status: { in: [...ACTIVE_PROPOSAL_STATUSES] },
                },
                select: { lotId: true },
              })
            : [];
        const activeLotIdSet = new Set(existingActive.map((row) => row.lotId));

        let skippedProposals = 0;
        const proposalsToCreate: Prisma.TreatmentProposalCreateManyInput[] = [];
        const llmInputByLotId = new Map<string, LlmExplanationInput>();

        for (const candidate of proposalCandidates) {
          if (activeLotIdSet.has(candidate.lotId)) {
            skippedProposals += 1;
            continue;
          }

          const snapshot = {
            evaluationDate,
            expiryDate: candidate.computed.expiryDate,
            daysRemaining: candidate.computed.daysRemaining,
            isExpired: candidate.computed.isExpired,
            lotCode: candidate.computed.lotCode,
            productCode: candidate.product.code,
            productName: candidate.product.name,
            productUnit: candidate.product.unit,
            onHandSnapshot: candidate.computed.onHandSnapshot.toFixed(QUANTITY_DECIMAL_PLACES),
            allocatedDemand: candidate.computed.allocatedDemand.toFixed(QUANTITY_DECIMAL_PLACES),
            estimatedConsumption: candidate.computed.estimatedConsumption.toFixed(
              QUANTITY_DECIMAL_PLACES,
            ),
            estimatedSurplus: candidate.computed.estimatedSurplus.toFixed(QUANTITY_DECIMAL_PLACES),
            riskLevel: candidate.computed.riskLevel,
            actionType: candidate.decision.actionType,
            proposedQty: candidate.computed.estimatedSurplus.toFixed(QUANTITY_DECIMAL_PLACES),
            allowedActions: candidate.decision.allowedActions,
            ruleCode: candidate.decision.ruleCode,
            ruleSummaryText: candidate.decision.ruleSummaryText,
            llmInput: candidate.llmInput,
          };

          proposalsToCreate.push({
            riskAssessmentId: candidate.riskAssessmentId,
            lotId: candidate.lotId,
            actionType: candidate.decision.actionType,
            proposedQty: candidate.computed.estimatedSurplus,
            rationale: candidate.decision.ruleSummaryText,
            sourceRunId: run.id,
            status: 'pending',
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
          });
          llmInputByLotId.set(candidate.lotId, candidate.llmInput);
        }

        const createdProposals =
          proposalsToCreate.length > 0
            ? await tx.treatmentProposal.createManyAndReturn({
                data: proposalsToCreate,
                select: { id: true, lotId: true },
              })
            : [];

        const batchTasks: ExplainBatchTask[] = [];
        for (const created of createdProposals) {
          const llmInput = llmInputByLotId.get(created.lotId);
          if (llmInput) {
            batchTasks.push({ proposalId: created.id, llmInput });
          }
        }

        const finalMetrics: FullAnalysisMetrics = {
          evaluationDate,
          minDeliveryDays,
          lotCount: riskRows.length,
          riskCounts,
          surplusLotCount,
          createdProposals: createdProposals.length,
          skippedProposals,
          actualSyncedCount,
          forecast: forecastBundle.metrics,
          warnings,
        };

        const updatedRun = await tx.analysisRun.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            modelVersion: forecastBundle.modelVersion,
            metrics: finalMetrics as unknown as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
          select: {
            id: true,
            runType: true,
            triggerType: true,
            status: true,
            modelVersion: true,
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
          },
        });

        return {
          finishedRun: updatedRun,
          metrics: finalMetrics,
          llmTasks: batchTasks,
        };
      });

      // Bước 6 (SAU commit): gọi LLM diễn giải cho từng đề xuất mới (giới hạn đồng thời 3).
      // Lỗi/timeout từ LLM tuyệt đối không làm hỏng trạng thái succeeded của lượt phân tích (bất biến 7).
      if (llmTasks.length > 0 && this.proposalsLlmService) {
        try {
          await this.proposalsLlmService.explainProposalsBatch(llmTasks, 3);
        } catch (llmError) {
          const detail = llmError instanceof Error ? llmError.message : String(llmError);
          this.logger.warn(`Lỗi diễn giải LLM sau lượt phân tích ${run.id}: ${detail}`);
        }
      }

      return {
        id: finishedRun.id,
        runType: finishedRun.runType,
        trigger: finishedRun.triggerType as AnalysisTriggerType,
        triggerType: finishedRun.triggerType as AnalysisTriggerType,
        status: finishedRun.status,
        requestedBy: finishedRun.requester,
        modelVersion: finishedRun.modelVersion,
        evaluationDate,
        lotCount: metrics.lotCount,
        startedAt: finishedRun.startedAt,
        finishedAt: finishedRun.finishedAt,
        createdAt: finishedRun.createdAt,
        errorMessage: finishedRun.errorMessage,
        metrics,
      };
    } catch (error) {
      const errorMessage = extractSafeErrorMessage(error);

      try {
        await this.prisma.analysisRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            errorMessage,
          },
        });
      } catch (updateError) {
        const detail = updateError instanceof Error ? updateError.message : String(updateError);
        this.logger.error(
          `Không thể cập nhật trạng thái failed cho analysis_runs(${run.id}): ${detail}`,
        );
      }

      if (error instanceof MlServiceError) {
        throw new BadGatewayException('Dịch vụ dự báo không phản hồi');
      }
      throw error;
    }
  }
}
