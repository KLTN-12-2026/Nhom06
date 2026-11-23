import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AnalysisPipelineService } from './analysis-pipeline.service';

export const ANALYSIS_DAILY_JOB_NAME = 'analysis-daily-pipeline';
export const ANALYSIS_DAILY_CRON_EXPRESSION = '0 6 * * *';
const ANALYSIS_TIMEZONE = 'Asia/Ho_Chi_Minh';

@Injectable()
export class AnalysisSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisSchedulerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly pipelineService: AnalysisPipelineService,
  ) {}

  onModuleInit(): void {
    const enabled = this.configService.get<string>('ANALYSIS_CRON_ENABLED', 'true') === 'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!enabled || nodeEnv === 'test') {
      return;
    }

    const job = new CronJob(
      ANALYSIS_DAILY_CRON_EXPRESSION,
      () => {
        void this.runScheduledAnalysis();
      },
      null,
      false,
      ANALYSIS_TIMEZONE,
    );

    this.schedulerRegistry.addCronJob(ANALYSIS_DAILY_JOB_NAME, job as never);
    job.start();
    this.logger.log(
      `Đã bật lịch phân tích tồn dư hằng ngày (${ANALYSIS_DAILY_CRON_EXPRESSION}, ${ANALYSIS_TIMEZONE})`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('cron', ANALYSIS_DAILY_JOB_NAME)) {
      const job = this.schedulerRegistry.getCronJob(ANALYSIS_DAILY_JOB_NAME);
      void job.stop();
      this.schedulerRegistry.deleteCronJob(ANALYSIS_DAILY_JOB_NAME);
    }
  }

  async runScheduledAnalysis(): Promise<void> {
    try {
      const result = await this.pipelineService.run({ trigger: 'SCHEDULED' });
      this.logger.log(
        `Hoàn tất lượt phân tích định kỳ (${result.id}): ${result.lotCount} lô, ngày ${result.evaluationDate}`,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.log('Bỏ qua lượt phân tích định kỳ vì đang có lượt phân tích chạy');
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi khi chạy lượt phân tích định kỳ: ${detail}`);
    }
  }
}
