import { LlmExplanationInput } from '../domain/llm-guard';
import {
  LlmExplainOptions,
  LlmExplainResult,
  LlmProvider,
  LlmProviderError,
} from './llm-provider.interface';

/**
 * Provider mặc định khi LLM_PROVIDER=none: không gọi mạng, báo lỗi DISABLED để hệ thống dùng tóm tắt quy tắc.
 */
export class NoneProvider implements LlmProvider {
  readonly providerName = 'none';

  async explain(
    _input: LlmExplanationInput,
    _options: LlmExplainOptions,
  ): Promise<LlmExplainResult> {
    throw new LlmProviderError('Dịch vụ diễn giải LLM chưa được bật (LLM_PROVIDER=none)', {
      provider: this.providerName,
      modelName: 'none',
      code: 'DISABLED',
    });
  }
}
