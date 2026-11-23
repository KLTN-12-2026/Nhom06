import { Module } from '@nestjs/common';
import { ExpiryModule } from '../expiry/expiry.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OutboundReceiptsController } from './outbound-receipts.controller';
import { OutboundReceiptsService } from './outbound-receipts.service';

@Module({
  imports: [ExpiryModule],
  controllers: [OrdersController, OutboundReceiptsController],
  providers: [OrdersService, OutboundReceiptsService],
  exports: [OrdersService, OutboundReceiptsService],
})
export class OutboundModule {}
