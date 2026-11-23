import { Module } from '@nestjs/common';
import { ForecastController } from './forecast/forecast.controller';
import { ForecastService } from './forecast/forecast.service';
import { MlClient } from './forecast/ml-client.service';

@Module({
  controllers: [ForecastController],
  providers: [MlClient, ForecastService],
  exports: [MlClient, ForecastService],
})
export class AiModule {}
