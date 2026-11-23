import { Module } from '@nestjs/common';
import { ExpiryModule } from '../expiry/expiry.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { RiskReportService } from './risk-report.service';
import { StockLedgerService } from './stock-ledger.service';

@Module({
  imports: [InventoryModule, ExpiryModule],
  controllers: [ReportsController],
  providers: [DashboardService, StockLedgerService, RiskReportService],
  exports: [DashboardService, StockLedgerService, RiskReportService],
})
export class ReportsModule {}
