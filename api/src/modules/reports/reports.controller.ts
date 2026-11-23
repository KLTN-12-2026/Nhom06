import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { type AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DashboardService } from './dashboard.service';
import { MonthlyInOutQueryDto } from './dto/monthly-in-out-query.dto';
import { RiskReportQueryDto } from './dto/risk-report-query.dto';
import { StockLedgerQueryDto } from './dto/stock-ledger-query.dto';
import { RiskReportService } from './risk-report.service';
import { StockLedgerService } from './stock-ledger.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly riskReportService: RiskReportService,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Tổng hợp bảng điều khiển (yêu cầu reports.read hoặc inventory.read)',
  })
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDashboard(user);
  }

  @Get('stock-ledger')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Báo cáo nhập — xuất — tồn theo kỳ và sản phẩm' })
  getStockLedger(@Query() query: StockLedgerQueryDto) {
    return this.stockLedgerService.getStockLedger(query);
  }

  @Get('stock-ledger.xlsx')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Xuất file Excel báo cáo nhập — xuất — tồn' })
  async exportStockLedgerXlsx(
    @Query() query: StockLedgerQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.stockLedgerService.exportStockLedgerXlsx(query);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('stock-ledger/monthly')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Biến động nhập và xuất theo từng tháng' })
  getMonthlyInOut(@Query() query: MonthlyInOutQueryDto) {
    return this.stockLedgerService.getMonthlyInOut(query);
  }

  @Get('risk')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Báo cáo rủi ro cận hạn, đề xuất và kết quả thực hiện' })
  getRiskReport(@Query() query: RiskReportQueryDto) {
    return this.riskReportService.getRiskReport(query);
  }
}
