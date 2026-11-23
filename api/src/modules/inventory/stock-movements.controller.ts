import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto';
import { StockMovementsListResponse, StockMovementsService } from './stock-movements.service';

/**
 * Sổ biến động tồn kho chỉ đọc (Bất biến 2 & PB16):
 * tuyệt đối không khai báo bất kỳ route ghi/sửa/xóa nào.
 */
@ApiTags('Inventory - Stock Movements')
@ApiBearerAuth()
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'Tra cứu lịch sử biến động tồn kho gắn chứng từ (chỉ đọc, lọc ngày theo giờ VN)',
  })
  findAll(@Query() query: ListStockMovementsQueryDto): Promise<StockMovementsListResponse> {
    return this.stockMovementsService.findAll(query);
  }
}
