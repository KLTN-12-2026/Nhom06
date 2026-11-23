import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ExpiryAlertsService } from './expiry-alerts.service';

export const EXPIRY_DAILY_JOB_NAME = 'expiry-daily-evaluation';
const EXPIRY_DAILY_CRON_EXPRESSION = '5 0 * * *';
const EXPIRY_TIMEZONE = 'Asia/Ho_Chi_Minh';

@Injectable()
export class ExpirySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirySchedulerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly alertsService: ExpiryAlertsService,
  ) {}

  onModuleInit(): void {
    const enabled = this.configService.get<string>('EXPIRY_CRON_ENABLED', 'true') === 'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!enabled || nodeEnv === 'test') {
      return;
    }

    const job = new CronJob(
      EXPIRY_DAILY_CRON_EXPRESSION,
      () => {
        void this.runDailyEvaluation();
      },
      null,
      false,
      EXPIRY_TIMEZONE,
    );

    this.schedulerRegistry.addCronJob(EXPIRY_DAILY_JOB_NAME, job as never);
    job.start();
    this.logger.log(
      `Đã bật lịch đánh giá cảnh báo HSD hằng ngày (${EXPIRY_DAILY_CRON_EXPRESSION}, ${EXPIRY_TIMEZONE})`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('cron', EXPIRY_DAILY_JOB_NAME)) {
      const job = this.schedulerRegistry.getCronJob(EXPIRY_DAILY_JOB_NAME);
      void job.stop();
      this.schedulerRegistry.deleteCronJob(EXPIRY_DAILY_JOB_NAME);
    }
  }

  async runDailyEvaluation(): Promise<void> {
    try {
      const result = await this.alertsService.evaluate(undefined, null, 'SCHEDULED');
      this.logger.log(
        `Hoàn tất đánh giá HSD ngày ${result.evaluationDate}: ${result.evaluatedLots} lô (${result.expiredLots} hết hạn, ${result.criticalLots} nguy cấp, ${result.warningLots} trung bình)`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi khi chạy lịch đánh giá HSD hằng ngày: ${detail}`);
    }
  }
}
