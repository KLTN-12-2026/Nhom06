import { Module } from '@nestjs/common';
import { OutboundModule } from '../../outbound/outbound.module';
import { AiModule } from '../ai.module';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';

@Module({
  imports: [OutboundModule, AiModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
