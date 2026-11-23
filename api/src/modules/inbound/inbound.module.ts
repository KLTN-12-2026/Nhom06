import { Module } from '@nestjs/common';
import { InboundReceiptsController } from './inbound-receipts.controller';
import { InboundReceiptsService } from './inbound-receipts.service';

@Module({
  controllers: [InboundReceiptsController],
  providers: [InboundReceiptsService],
  exports: [InboundReceiptsService],
})
export class InboundModule {}
