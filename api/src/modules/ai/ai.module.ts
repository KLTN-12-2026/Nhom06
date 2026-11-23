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
import { MockProvider } from './proposals/llm/mock.provider';
import { NoneProvider } from './proposals/llm/none.provider';
import { OpenAiCompatibleProvider } from './proposals/llm/openai-compatible.provider';
import { ProposalsController } from './proposals/proposals.controller';
import { ProposalsLlmService } from './proposals/proposals-llm.service';
import { ProposalsService } from './proposals/proposals.service';
import { AnalysisController } from './risk/analysis.controller';
import { RiskQueryService } from './risk/risk-query.service';

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
      useFactory: (configService: ConfigService): LlmProvider => {
        const provider = configService.get<string>('LLM_PROVIDER') ?? 'none';
        if (provider === 'mock') {
          return new MockProvider();
        }
        if (provider === 'openai_compatible') {
          return new OpenAiCompatibleProvider({
            baseUrl: configService.get<string>('LLM_BASE_URL') ?? '',
            apiKey: configService.get<string>('LLM_API_KEY') ?? '',
            model: configService.get<string>('LLM_MODEL') ?? '',
          });
        }
        return new NoneProvider();
      },
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
