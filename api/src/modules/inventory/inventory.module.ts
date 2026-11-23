import { Module } from '@nestjs/common';
import { ExpiryModule } from '../expiry/expiry.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { StockCountsController } from './stock-counts.controller';
import { StockCountsService } from './stock-counts.service';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';

@Module({
  imports: [ExpiryModule],
  controllers: [
    LotsController,
    InventoryController,
    StockMovementsController,
    StockCountsController,
  ],
  providers: [LotsService, InventoryService, StockMovementsService, StockCountsService],
  exports: [LotsService, InventoryService],
})
export class InventoryModule {}
