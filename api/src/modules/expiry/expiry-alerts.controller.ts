import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  EvaluateExpiryAlertsDto,
  ExpiryAlertsSummaryQueryDto,
  ListExpiryAlertsQueryDto,
} from './dto/expiry-alert.dto';
import {
  EvaluateExpiryAlertsResponse,
  ExpiryAlertsListResponse,
  ExpiryAlertsService,
  ExpiryAlertsSummaryResponse,
} from './expiry-alerts.service';

@ApiTags('Expiry - Alerts')
@ApiBearerAuth()
@Controller('expiry-alerts')
export class ExpiryAlertsController {
  constructor(private readonly alertsService: ExpiryAlertsService) {}

  @Get()
  @Permissions('expiry.read')
  @ApiOperation({ summary: 'Danh sách lô hết hạn và cận hạn còn tồn theo ngày đánh giá' })
  list(@Query() query: ListExpiryAlertsQueryDto): Promise<ExpiryAlertsListResponse> {
    return this.alertsService.list(query);
  }

  @Get('summary')
  @Permissions('expiry.read')
  @ApiOperation({ summary: 'Tổng hợp số lô, tổng đơn vị hết hạn/cận hạn và tóm tắt ngưỡng' })
  summary(@Query() query: ExpiryAlertsSummaryQueryDto): Promise<ExpiryAlertsSummaryResponse> {
    return this.alertsService.summary(query.date);
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @Permissions('expiry.manage')
  @ApiOperation({ summary: 'Chạy đánh giá và ghi snapshot cảnh báo HSD cho ngày đánh giá' })
  evaluate(
    @Body() dto: EvaluateExpiryAlertsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<EvaluateExpiryAlertsResponse> {
    return this.alertsService.evaluate(dto.date, actor.id, 'MANUAL');
  }
}
