import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InboundReceiptsController } from './inbound-receipts.controller';
import { InboundReceiptsService } from './inbound-receipts.service';

@Module({
  imports: [AiModule],
  controllers: [InboundReceiptsController],
  providers: [InboundReceiptsService],
  exports: [InboundReceiptsService],
})
export class InboundModule {}
