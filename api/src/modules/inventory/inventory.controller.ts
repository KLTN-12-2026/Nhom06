import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import {
  InventorySummaryQueryDto,
  ListInventoryLotsQueryDto,
} from './dto/inventory-lots-query.dto';
import {
  InventoryLotsListResponse,
  InventoryService,
  InventorySummaryResponse,
} from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('lots')
  @Permissions('inventory.read')
  @ApiOperation({
    summary:
      'Tra cứu tồn kho theo từng lô kèm tình trạng hạn sử dụng (mặc định ẩn lô tồn 0, sắp theo mã SP rồi HSD tăng dần)',
  })
  listLots(@Query() query: ListInventoryLotsQueryDto): Promise<InventoryLotsListResponse> {
    return this.inventoryService.listLots(query);
  }

  @Get('summary')
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'Tổng hợp số lô, tổng lượng tồn và tổng tồn theo từng sản phẩm theo cùng bộ lọc',
  })
  getSummary(@Query() query: InventorySummaryQueryDto): Promise<InventorySummaryResponse> {
    return this.inventoryService.getSummary(query);
  }
}
