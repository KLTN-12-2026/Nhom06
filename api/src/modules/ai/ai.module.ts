import { Module } from '@nestjs/common';
import { ExpiryModule } from '../expiry/expiry.module';
import { ForecastController } from './forecast/forecast.controller';
import { ForecastService } from './forecast/forecast.service';
import { MlClient } from './forecast/ml-client.service';
import { ActualDemandSyncService } from './pipeline/actual-demand-sync.service';
import { AnalysisPipelineService } from './pipeline/analysis-pipeline.service';
import { AnalysisSchedulerService } from './pipeline/analysis-scheduler.service';
import { AnalysisTriggerService } from './pipeline/analysis-trigger.service';
import { AnalysisController } from './risk/analysis.controller';
import { RiskQueryService } from './risk/risk-query.service';

@Module({
  imports: [ExpiryModule],
  controllers: [ForecastController, AnalysisController],
  providers: [
    MlClient,
    ForecastService,
    ActualDemandSyncService,
    AnalysisPipelineService,
    AnalysisSchedulerService,
    AnalysisTriggerService,
    RiskQueryService,
  ],
  exports: [MlClient, ForecastService, AnalysisPipelineService, AnalysisTriggerService],
})
export class AiModule {}
