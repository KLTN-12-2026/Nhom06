import { Logger } from '@nestjs/common';
import { LlmExplanationInput } from '../domain/llm-guard';
import {
  LlmExplainOptions,
  LlmExplainResult,
  LlmProvider,
  LlmProviderError,
} from './llm-provider.interface';

export const FALLBACK_RETRY_DELAYS_MS: readonly number[] = [2_000];

/**
 * Wrapper điều phối provider chính → provider dự phòng khi provider chính ném `LlmProviderError`.
 * Mỗi provider giữ ngân sách `LLM_TIMEOUT_MS` riêng (tổng chuỗi không vượt 2 * LLM_TIMEOUT_MS).
 * Đầu ra sai rào chắn (`invalid`) được kiểm tra ở tầng service nên không bao giờ kích hoạt dự phòng.
 */
export class FallbackLlmProvider implements LlmProvider {
  private readonly logger = new Logger(FallbackLlmProvider.name);
  private readonly safeFallbackModel: string;

  constructor(
    private readonly primary: LlmProvider,
    private readonly fallback: LlmProvider,
    fallbackModelName: string,
  ) {
    this.safeFallbackModel = (fallbackModelName.trim() || 'unknown').slice(0, 80);
  }

  get providerName(): string {
    return this.primary.providerName;
  }

  async explain(
    input: LlmExplanationInput,
    options: LlmExplainOptions,
  ): Promise<LlmExplainResult> {
    try {
      return await this.primary.explain(input, options);
    } catch (error) {
      if (!(error instanceof LlmProviderError)) {
        throw error;
      }

      const errorCode = error.httpStatus ? `HTTP ${error.httpStatus}` : error.code;
      this.logger.warn(`Chuyển sang dự phòng ${this.safeFallbackModel} sau lỗi ${errorCode}`);
      return this.fallback.explain(input, options);
    }
  }
}
