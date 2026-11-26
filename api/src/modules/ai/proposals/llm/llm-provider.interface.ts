import { LlmExplanationInput } from '../domain/llm-guard';

export const LLM_PROVIDER_TOKEN = Symbol('LLM_PROVIDER');
export const PROMPT_VERSION = 'v2';

export type LlmProviderErrorCode =
  | 'DISABLED'
  | 'CONFIG_ERROR'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP_ERROR'
  | 'EMPTY_RESPONSE';

export class LlmProviderError extends Error {
  readonly provider: string;
  readonly modelName: string;
  readonly code: LlmProviderErrorCode;
  readonly httpStatus?: number;

  constructor(
    message: string,
    meta: {
      provider: string;
      modelName: string;
      code: LlmProviderErrorCode;
      httpStatus?: number;
    },
  ) {
    super(message);
    this.name = 'LlmProviderError';
    this.provider = meta.provider;
    this.modelName = meta.modelName;
    this.code = meta.code;
    this.httpStatus = meta.httpStatus;
  }
}

export interface LlmExplainOptions {
  timeoutMs: number;
  promptVersion?: string;
}

export interface LlmExplainResult {
  provider: string;
  modelName: string;
  rawText: string;
}

export interface LlmProvider {
  readonly providerName: string;
  explain(input: LlmExplanationInput, options: LlmExplainOptions): Promise<LlmExplainResult>;
}
