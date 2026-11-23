import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { LotListResponse, LotsService } from './lots.service';

@ApiTags('Inventory - Lots')
@ApiBearerAuth()
@Controller('lots')
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Tra cứu lô hàng theo sản phẩm, khoảng HSD, mã lô, trạng thái kèm tồn hiện tại' })
  findAll(@Query() query: ListLotsQueryDto): Promise<LotListResponse> {
    return this.lotsService.findAll(query);
  }
}
