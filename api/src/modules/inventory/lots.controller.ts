import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { UpdateLotStatusDto } from './dto/update-lot-status.dto';
import { LotListResponse, LotResponse, LotsService } from './lots.service';

const LOT_UUID_PIPE = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Mã lô không đúng định dạng UUID'),
});

@ApiTags('Inventory - Lots')
@ApiBearerAuth()
@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'Tra cứu lô hàng theo sản phẩm, khoảng HSD, mã lô, trạng thái kèm tồn hiện tại',
  })
  findAll(@Query() query: ListLotsQueryDto): Promise<LotListResponse> {
    return this.lotsService.findAll(query);
  }

  @Patch(':id/status')
  @Permissions('stock_count.approve')
  @ApiOperation({
    summary: 'Khóa hoặc mở khóa lô hàng (active ↔ blocked, bắt buộc lý do, không đổi tồn kho)',
  })
  updateStatus(
    @Param('id', LOT_UUID_PIPE) id: string,
    @Body() dto: UpdateLotStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LotResponse> {
    return this.lotsService.updateStatus(id, dto, user.id);
  }
}
