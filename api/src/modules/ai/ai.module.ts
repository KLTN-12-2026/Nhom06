import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpiryModule } from '../expiry/expiry.module';
import { ForecastController } from './forecast/forecast.controller';
import { ForecastService } from './forecast/forecast.service';
import { MlClient } from './forecast/ml-client.service';
import { ActualDemandSyncService } from './pipeline/actual-demand-sync.service';
import { AnalysisPipelineService } from './pipeline/analysis-pipeline.service';
import { AnalysisSchedulerService } from './pipeline/analysis-scheduler.service';
import { AnalysisTriggerService } from './pipeline/analysis-trigger.service';
import { LLM_PROVIDER_TOKEN, LlmProvider } from './proposals/llm/llm-provider.interface';
import { FALLBACK_RETRY_DELAYS_MS, FallbackLlmProvider } from './proposals/llm/fallback.provider';
import { MockProvider } from './proposals/llm/mock.provider';
import { NoneProvider } from './proposals/llm/none.provider';
import { OpenAiCompatibleProvider } from './proposals/llm/openai-compatible.provider';
import { ProposalsController } from './proposals/proposals.controller';
import { ProposalsLlmService } from './proposals/proposals-llm.service';
import { ProposalsService } from './proposals/proposals.service';
import { AnalysisController } from './risk/analysis.controller';
import { RiskQueryService } from './risk/risk-query.service';

function parseOptionalTimeoutMs(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

export function createLlmProvider(configService: ConfigService): LlmProvider {
  const provider = configService.get<string>('LLM_PROVIDER') ?? 'none';
  if (provider === 'mock') {
    return new MockProvider();
  }
  if (provider === 'openai_compatible') {
    const primary = new OpenAiCompatibleProvider({
      baseUrl: configService.get<string>('LLM_BASE_URL') ?? '',
      apiKey: configService.get<string>('LLM_API_KEY') ?? '',
      model: configService.get<string>('LLM_MODEL') ?? '',
    });

    const fallbackBaseUrl = (configService.get<string>('LLM_FALLBACK_BASE_URL') ?? '').trim();
    const fallbackModel = (configService.get<string>('LLM_FALLBACK_MODEL') ?? '').trim();
    const fallbackApiKey = (configService.get<string>('LLM_FALLBACK_API_KEY') ?? '').trim();

    if (fallbackBaseUrl && fallbackModel && fallbackApiKey) {
      const fallbackTimeoutMs = parseOptionalTimeoutMs(
        configService.get<number | string>('LLM_FALLBACK_TIMEOUT_MS'),
      );
      const fallback = new OpenAiCompatibleProvider({
        baseUrl: fallbackBaseUrl,
        apiKey: fallbackApiKey,
        model: fallbackModel,
        retryDelaysMs: FALLBACK_RETRY_DELAYS_MS,
      });
      return new FallbackLlmProvider(primary, fallback, fallbackModel, fallbackTimeoutMs);
    }

    return primary;
  }
  return new NoneProvider();
}

@Module({
  imports: [ExpiryModule],
  controllers: [ForecastController, AnalysisController, ProposalsController],
  providers: [
    MlClient,
    ForecastService,
    ActualDemandSyncService,
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [ConfigService],
      useFactory: createLlmProvider,
    },
    ProposalsLlmService,
    ProposalsService,
    AnalysisPipelineService,
    AnalysisSchedulerService,
    AnalysisTriggerService,
    RiskQueryService,
  ],
  exports: [
    MlClient,
    ForecastService,
    AnalysisPipelineService,
    AnalysisTriggerService,
    ProposalsService,
  ],
})
export class AiModule {}
