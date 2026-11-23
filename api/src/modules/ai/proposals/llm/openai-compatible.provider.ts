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
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

/**
 * Provider gọi dịch vụ LLM tương thích chuẩn OpenAI (`POST {LLM_BASE_URL}/chat/completions`).
 * Mọi thông báo lỗi đều được chuẩn hóa sang tiếng Việt an toàn, không bao giờ làm lộ LLM_API_KEY.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly providerName = 'openai_compatible';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: OpenAiCompatibleConfig) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.model = config.model.trim();
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
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Math.trunc(options.timeoutMs));
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: buildLlmMessages(input),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new LlmProviderError(`Dịch vụ LLM trả về mã lỗi HTTP ${response.status}`, {
          provider: this.providerName,
          modelName: safeModelName,
          code: 'HTTP_ERROR',
        });
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new LlmProviderError('Phản hồi từ dịch vụ LLM không chứa nội dung văn bản', {
          provider: this.providerName,
          modelName: safeModelName,
          code: 'EMPTY_RESPONSE',
        });
      }

      return {
        provider: this.providerName,
        modelName: safeModelName,
        rawText: content,
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LlmProviderError(`Dịch vụ LLM quá thời gian chờ (${timeoutMs} ms)`, {
          provider: this.providerName,
          modelName: safeModelName,
          code: 'TIMEOUT',
        });
      }
      throw new LlmProviderError('Không kết nối được tới dịch vụ LLM', {
        provider: this.providerName,
        modelName: safeModelName,
        code: 'NETWORK',
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
