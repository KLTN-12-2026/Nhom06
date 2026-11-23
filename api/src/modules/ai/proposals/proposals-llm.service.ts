import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmExplanationInput, validateLlmOutput } from './domain/llm-guard';
import {
  LLM_PROVIDER_TOKEN,
  LlmProvider,
  LlmProviderError,
  PROMPT_VERSION,
} from './llm/llm-provider.interface';

export interface ProposalExplanationView {
  id: string;
  status: 'pending' | 'valid' | 'invalid' | 'failed';
  text: string | null;
  modelName: string;
  provider: string;
  promptVersion: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface ExplainBatchTask {
  proposalId: string;
  llmInput: LlmExplanationInput;
}

const DEFAULT_LLM_TIMEOUT_MS = 20_000;
const DEFAULT_BATCH_CONCURRENCY = 3;

@Injectable()
export class ProposalsLlmService {
  private readonly logger = new Logger(ProposalsLlmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LlmProvider,
  ) {}

  private sanitizeText(message: string): string {
    const apiKey = (this.configService.get<string>('LLM_API_KEY') ?? '').trim();
    if (apiKey.length > 0 && message.includes(apiKey)) {
      return message.split(apiKey).join('[REDACTED]');
    }
    return message;
  }

  private getTimeoutMs(): number {
    const raw = this.configService.get<number>('LLM_TIMEOUT_MS');
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1000
      ? Math.trunc(raw)
      : DEFAULT_LLM_TIMEOUT_MS;
  }

  /**
   * Gọi LLM diễn giải (hoặc giả lập lỗi khi demo), kiểm tra rào chắn và lưu một bản ghi mới vào `llm_explanations`.
   * Không bao giờ ném lỗi ra ngoài để không làm gián đoạn pipeline phân tích hay nghiệp vụ kho (bất biến 7).
   */
  async explainAndPersist(
    proposalId: string,
    llmInput: LlmExplanationInput,
    options?: { simulateFailure?: boolean },
  ): Promise<ProposalExplanationView> {
    if (options?.simulateFailure) {
      const saved = await this.prisma.llmExplanation.create({
        data: {
          proposalId,
          provider: this.llmProvider.providerName.slice(0, 50),
          modelName: 'simulated-failure',
          promptVersion: PROMPT_VERSION,
          inputSnapshot: llmInput as unknown as Prisma.InputJsonValue,
          explanationText: '',
          validationStatus: 'failed',
          errorMessage: 'Mô phỏng dịch vụ diễn giải không phản hồi',
        },
      });
      return this.toView(saved);
    }

    const timeoutMs = this.getTimeoutMs();

    try {
      const result = await this.llmProvider.explain(llmInput, {
        timeoutMs,
        promptVersion: PROMPT_VERSION,
      });

      const validation = validateLlmOutput(result.rawText, llmInput);
      const safeProvider = result.provider.slice(0, 50);
      const safeModel = result.modelName.slice(0, 80);

      if (validation.status === 'valid' && validation.explanation) {
        const saved = await this.prisma.llmExplanation.create({
          data: {
            proposalId,
            provider: safeProvider,
            modelName: safeModel,
            promptVersion: PROMPT_VERSION,
            inputSnapshot: llmInput as unknown as Prisma.InputJsonValue,
            explanationText: this.sanitizeText(validation.explanation),
            validationStatus: 'valid',
            errorMessage: null,
          },
        });
        return this.toView(saved);
      }

      const errorSummary = this.sanitizeText(validation.errors.join('; '));
      const savedInvalid = await this.prisma.llmExplanation.create({
        data: {
          proposalId,
          provider: safeProvider,
          modelName: safeModel,
          promptVersion: PROMPT_VERSION,
          inputSnapshot: llmInput as unknown as Prisma.InputJsonValue,
          explanationText: this.sanitizeText(result.rawText.slice(0, 2000)),
          validationStatus: 'invalid',
          errorMessage: errorSummary || 'Đầu ra mô hình ngôn ngữ không hợp lệ',
        },
      });
      return this.toView(savedInvalid);
    } catch (error) {
      const provider =
        error instanceof LlmProviderError
          ? error.provider.slice(0, 50)
          : this.llmProvider.providerName.slice(0, 50);
      const modelName =
        error instanceof LlmProviderError ? error.modelName.slice(0, 80) : 'unknown';
      const rawMessage =
        error instanceof LlmProviderError
          ? error.message
          : error instanceof Error
            ? `Dịch vụ diễn giải LLM gặp lỗi: ${error.message}`
            : 'Dịch vụ diễn giải LLM không phản hồi';

      const savedFailed = await this.prisma.llmExplanation.create({
        data: {
          proposalId,
          provider,
          modelName,
          promptVersion: PROMPT_VERSION,
          inputSnapshot: llmInput as unknown as Prisma.InputJsonValue,
          explanationText: '',
          validationStatus: 'failed',
          errorMessage: this.sanitizeText(rawMessage),
        },
      });
      return this.toView(savedFailed);
    }
  }

  /**
   * Diễn giải hàng loạt cho các đề xuất vừa tạo SAU khi transaction phân tích đã commit,
   * giới hạn đồng thời tối đa `concurrency` (mặc định 3).
   */
  async explainProposalsBatch(
    tasks: readonly ExplainBatchTask[],
    concurrency = DEFAULT_BATCH_CONCURRENCY,
  ): Promise<void> {
    if (tasks.length === 0) {
      return;
    }

    const limit = Math.max(1, Math.min(concurrency, tasks.length));
    let cursor = 0;

    const runWorker = async () => {
      while (cursor < tasks.length) {
        const index = cursor;
        cursor += 1;
        const task = tasks[index];
        try {
          await this.explainAndPersist(task.proposalId, task.llmInput);
        } catch (error) {
          const detail = error instanceof Error ? this.sanitizeText(error.message) : String(error);
          this.logger.warn(
            `Không thể lưu diễn giải LLM cho đề xuất ${task.proposalId}: ${detail}`,
          );
        }
      }
    };

    await Promise.all(Array.from({ length: limit }, () => runWorker()));
  }

  toView(row: {
    id: string;
    validationStatus: string;
    explanationText: string;
    modelName: string;
    provider: string;
    promptVersion: string;
    errorMessage: string | null;
    createdAt: Date;
  }): ProposalExplanationView {
    const status = row.validationStatus as ProposalExplanationView['status'];
    return {
      id: row.id,
      status,
      // Chỉ trả văn bản LLM khi đã vượt qua rào chắn kiểm định (status === 'valid')
      text: status === 'valid' ? row.explanationText : null,
      modelName: row.modelName,
      provider: row.provider,
      promptVersion: row.promptVersion,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
