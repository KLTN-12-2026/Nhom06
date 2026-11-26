import { Logger } from '@nestjs/common';
import { LlmExplanationInput } from '../domain/llm-guard';
import {
  LlmExplainOptions,
  LlmExplainResult,
  LlmProvider,
  LlmProviderError,
} from './llm-provider.interface';
import { buildLlmMessages } from './prompt';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  retryDelaysMs?: readonly number[];
  minAttemptTimeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

interface AttemptFailure {
  error: LlmProviderError;
  retryable: boolean;
  reason: string;
}

const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000];
const DEFAULT_MIN_ATTEMPT_TIMEOUT_MS = 5_000;
const RETRYABLE_HTTP_STATUSES = new Set([429, 503]);

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const defaultNow = (): number => Date.now();

/**
 * Provider gọi dịch vụ LLM tương thích chuẩn OpenAI (`POST {LLM_BASE_URL}/chat/completions`).
 * Hỗ trợ thử lại tối đa 2 lần (tổng 3 lượt) cho lỗi tạm thời (HTTP 503/429, timeout lượt, lỗi mạng)
 * trong tổng ngân sách `LLM_TIMEOUT_MS`.
 * Mọi log và thông báo lỗi đều an toàn, không bao giờ làm lộ LLM_API_KEY, header hay nội dung prompt.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly providerName = 'openai_compatible';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly retryDelaysMs: readonly number[];
  private readonly minAttemptTimeoutMs: number;

  constructor(config: OpenAiCompatibleConfig) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.model = config.model.trim();
    this.sleep = config.sleep ?? defaultSleep;
    this.now = config.now ?? defaultNow;
    this.retryDelaysMs = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.minAttemptTimeoutMs = config.minAttemptTimeoutMs ?? DEFAULT_MIN_ATTEMPT_TIMEOUT_MS;
  }

  async explain(
    input: LlmExplanationInput,
    options: LlmExplainOptions,
  ): Promise<LlmExplainResult> {
    const safeModelName = (this.model || 'unknown').slice(0, 80);

    if (!this.baseUrl || !this.model || !this.apiKey) {
      throw new LlmProviderError(
        'Thiếu cấu hình dịch vụ LLM (cần LLM_BASE_URL, LLM_MODEL và LLM_API_KEY)',
        {
          provider: this.providerName,
          modelName: safeModelName,
          code: 'CONFIG_ERROR',
        },
      );
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const totalTimeoutMs = Math.max(1000, Math.trunc(options.timeoutMs));
    const deadline = this.now() + totalTimeoutMs;
    const maxAttempts = 1 + this.retryDelaysMs.length;
    const requestBody = JSON.stringify({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: buildLlmMessages(input),
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingMs = deadline - this.now();
      if (attempt > 1 && remainingMs < this.minAttemptTimeoutMs) {
        throw new LlmProviderError(`Dịch vụ LLM quá thời gian chờ (${totalTimeoutMs} ms)`, {
          provider: this.providerName,
          modelName: safeModelName,
          code: 'TIMEOUT',
        });
      }

      const attemptTimeoutMs = Math.max(1, remainingMs);
      const outcome = await this.executeAttempt(
        endpoint,
        requestBody,
        safeModelName,
        attemptTimeoutMs,
        totalTimeoutMs,
      );

      if ('result' in outcome) {
        return outcome.result;
      }

      const { failure } = outcome;
      if (!failure.retryable || attempt >= maxAttempts) {
        throw failure.error;
      }

      const delayMs = this.retryDelaysMs[attempt - 1] ?? 0;
      const remainingBeforeSleep = deadline - this.now();
      if (remainingBeforeSleep - delayMs < this.minAttemptTimeoutMs) {
        throw failure.error;
      }

      this.logger.warn(
        `LLM ${safeModelName}: lượt ${attempt + 1}/${maxAttempts} sau ${failure.reason}`,
      );
      await this.sleep(delayMs);

      const remainingAfterSleep = deadline - this.now();
      if (remainingAfterSleep < this.minAttemptTimeoutMs) {
        throw failure.error;
      }
    }

    throw new LlmProviderError('Không kết nối được tới dịch vụ LLM', {
      provider: this.providerName,
      modelName: safeModelName,
      code: 'NETWORK',
    });
  }

  private async executeAttempt(
    endpoint: string,
    requestBody: string,
    safeModelName: string,
    attemptTimeoutMs: number,
    totalTimeoutMs: number,
  ): Promise<{ result: LlmExplainResult } | { failure: AttemptFailure }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: requestBody,
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
        return {
          failure: {
            error: new LlmProviderError(`Dịch vụ LLM trả về mã lỗi HTTP ${response.status}`, {
              provider: this.providerName,
              modelName: safeModelName,
              code: 'HTTP_ERROR',
            }),
            retryable,
            reason: `HTTP ${response.status}`,
          },
        };
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        return {
          failure: {
            error: new LlmProviderError('Phản hồi từ dịch vụ LLM không chứa nội dung văn bản', {
              provider: this.providerName,
              modelName: safeModelName,
              code: 'EMPTY_RESPONSE',
            }),
            retryable: false,
            reason: 'EMPTY_RESPONSE',
          },
        };
      }

      return {
        result: {
          provider: this.providerName,
          modelName: safeModelName,
          rawText: content,
        },
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return {
          failure: {
            error,
            retryable: false,
            reason: error.code,
          },
        };
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          failure: {
            error: new LlmProviderError(`Dịch vụ LLM quá thời gian chờ (${totalTimeoutMs} ms)`, {
              provider: this.providerName,
              modelName: safeModelName,
              code: 'TIMEOUT',
            }),
            retryable: true,
            reason: 'timeout',
          },
        };
      }
      return {
        failure: {
          error: new LlmProviderError('Không kết nối được tới dịch vụ LLM', {
            provider: this.providerName,
            modelName: safeModelName,
            code: 'NETWORK',
          }),
          retryable: true,
          reason: 'lỗi mạng',
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
