import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { DailyHistoryQueryDto } from './dto/daily-history-query.dto';
import { ListRunsQueryDto } from './dto/list-runs-query.dto';
import { ProductForecastQueryDto } from './dto/product-forecast-query.dto';
import { RunForecastDto } from './dto/run-forecast.dto';
import { ForecastService } from './forecast.service';

@ApiTags('Forecasts')
@ApiBearerAuth()
@Controller('forecasts')
export class ForecastController {
  constructor(private readonly forecastService: ForecastService) {}

  @Post('runs')
  @Permissions('analysis.run')
  @ApiOperation({ summary: 'Chạy lượt dự báo nhu cầu đồng bộ cho mọi sản phẩm đang hoạt động' })
  runForecast(
    @Body() dto: RunForecastDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.forecastService.runForecast(dto?.horizonDays ?? 60, user.id);
  }

  @Get('runs')
  @Permissions('forecast.read')
  @ApiOperation({ summary: 'Danh sách lịch sử các lượt chạy dự báo (FORECAST)' })
  listRuns(@Query() query: ListRunsQueryDto) {
    return this.forecastService.listRuns(query.limit ?? 10);
  }

  @Get('latest')
  @Permissions('forecast.read')
  @ApiOperation({ summary: 'Lượt dự báo thành công mới nhất và bảng tổng hợp theo sản phẩm' })
  getLatest() {
    return this.forecastService.getLatest();
  }

  @Get('products/:productId')
  @Permissions('forecast.read')
  @ApiOperation({ summary: 'Chi tiết dự báo theo ngày của một sản phẩm (model + baseline)' })
  getProductForecast(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Query() query: ProductForecastQueryDto,
  ) {
    return this.forecastService.getProductForecast(productId, query.runId);
  }

  @Get('history/daily')
  @Permissions('forecast.read')
  @ApiOperation({ summary: 'Tổng nhu cầu lịch sử theo ngày mọi sản phẩm (mặc định 90 ngày gần nhất)' })
  getDailyHistory(@Query() query: DailyHistoryQueryDto) {
    return this.forecastService.getDailyHistory(query.days ?? 90);
  }
}
