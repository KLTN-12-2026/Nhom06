import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  CreateOverrideThresholdDto,
  ThresholdHistoryQueryDto,
  UpdateGlobalThresholdDto,
  UpdateOverrideThresholdDto,
} from './dto/expiry-threshold.dto';
import {
  ActiveThresholdsResponse,
  ExpiryThresholdsService,
  GlobalThresholdResponse,
  OverrideThresholdResponse,
  ThresholdHistoryItemResponse,
  ThresholdHistoryResponse,
} from './expiry-thresholds.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID ngưỡng cảnh báo không đúng định dạng UUID'),
});

@ApiTags('Expiry - Thresholds')
@ApiBearerAuth()
@Controller('expiry-thresholds')
export class ExpiryThresholdsController {
  constructor(private readonly thresholdsService: ExpiryThresholdsService) {}

  @Get()
  @Permissions('expiry.read')
  @ApiOperation({ summary: 'Xem ngưỡng cảnh báo HSD chung và các ngưỡng riêng đang hiệu lực' })
  getActive(): Promise<ActiveThresholdsResponse> {
    return this.thresholdsService.getActiveThresholds();
  }

  @Get('history')
  @Permissions('expiry.read')
  @ApiOperation({ summary: 'Xem lịch sử các phiên bản ngưỡng cảnh báo HSD' })
  getHistory(@Query() query: ThresholdHistoryQueryDto): Promise<ThresholdHistoryResponse> {
    return this.thresholdsService.getHistory(query);
  }

  @Put('global')
  @Permissions('expiry.manage')
  @ApiOperation({ summary: 'Cập nhật cấu hình ngưỡng cảnh báo HSD chung (đóng bản cũ, tạo bản mới)' })
  updateGlobal(
    @Body() dto: UpdateGlobalThresholdDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<GlobalThresholdResponse> {
    return this.thresholdsService.updateGlobal(dto, actor.id);
  }

  @Post('overrides')
  @Permissions('expiry.manage')
  @ApiOperation({ summary: 'Tạo ngưỡng cảnh báo riêng theo sản phẩm hoặc nhóm hàng' })
  createOverride(
    @Body() dto: CreateOverrideThresholdDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OverrideThresholdResponse> {
    return this.thresholdsService.createOverride(dto, actor.id);
  }

  @Put('overrides/:id')
  @Permissions('expiry.manage')
  @ApiOperation({ summary: 'Cập nhật số ngày cảnh báo cho ngưỡng riêng đang hiệu lực' })
  updateOverride(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateOverrideThresholdDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OverrideThresholdResponse> {
    return this.thresholdsService.updateOverride(id, dto, actor.id);
  }

  @Post('overrides/:id/end')
  @HttpCode(HttpStatus.OK)
  @Permissions('expiry.manage')
  @ApiOperation({ summary: 'Kết thúc hiệu lực ngưỡng riêng (giữ lịch sử, không xóa)' })
  endOverride(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ThresholdHistoryItemResponse> {
    return this.thresholdsService.endOverride(id, actor.id);
  }
}
