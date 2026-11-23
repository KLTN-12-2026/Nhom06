import { Module } from '@nestjs/common';
import { ExpiryAlertsController } from './expiry-alerts.controller';
import { ExpiryAlertsService } from './expiry-alerts.service';
import { ExpirySchedulerService } from './expiry-scheduler.service';
import { ExpiryThresholdsController } from './expiry-thresholds.controller';
import { ExpiryThresholdsService } from './expiry-thresholds.service';

@Module({
  controllers: [ExpiryThresholdsController, ExpiryAlertsController],
  providers: [ExpiryThresholdsService, ExpiryAlertsService, ExpirySchedulerService],
  exports: [ExpiryThresholdsService, ExpiryAlertsService],
})
export class ExpiryModule {}
