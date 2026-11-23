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
  CancelStockCountDto,
  ListStockCountsQueryDto,
  SaveStockCountDto,
} from './dto/stock-count.dto';
import {
  StockCountDetailResponse,
  StockCountListResponse,
  StockCountsService,
} from './stock-counts.service';

const STOCK_COUNT_UUID_PIPE = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Mã phiếu kiểm kê không đúng định dạng UUID'),
});

@ApiTags('Inventory - Stock Counts')
@ApiBearerAuth()
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Danh sách phiếu kiểm kê kho' })
  findAll(@Query() query: ListStockCountsQueryDto): Promise<StockCountListResponse> {
    return this.stockCountsService.findAll(query);
  }

  @Get(':id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Chi tiết phiếu kiểm kê kho' })
  findOne(@Param('id', STOCK_COUNT_UUID_PIPE) id: string): Promise<StockCountDetailResponse> {
    return this.stockCountsService.findOne(id);
  }

  @Post()
  @Permissions('stock_count.create')
  @ApiOperation({ summary: 'Lập phiếu kiểm kê nháp (không làm thay đổi tồn kho)' })
  create(
    @Body() dto: SaveStockCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCountDetailResponse> {
    return this.stockCountsService.create(dto, user.id);
  }

  @Put(':id')
  @Permissions('stock_count.create')
  @ApiOperation({ summary: 'Sửa phiếu kiểm kê ở trạng thái nháp (không làm thay đổi tồn kho)' })
  update(
    @Param('id', STOCK_COUNT_UUID_PIPE) id: string,
    @Body() dto: SaveStockCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCountDetailResponse> {
    return this.stockCountsService.update(id, dto, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Permissions('stock_count.create')
  @ApiOperation({ summary: 'Gửi duyệt phiếu kiểm kê nháp (draft → submitted, không đổi tồn)' })
  submit(
    @Param('id', STOCK_COUNT_UUID_PIPE) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCountDetailResponse> {
    return this.stockCountsService.submit(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Permissions('stock_count.approve')
  @ApiOperation({
    summary: 'Duyệt phiếu kiểm kê và điều chỉnh tồn kho nguyên tử trong một DB transaction',
  })
  approve(
    @Param('id', STOCK_COUNT_UUID_PIPE) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCountDetailResponse> {
    return this.stockCountsService.approve(id, user.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory.read')
  @ApiOperation({
    summary:
      'Hủy phiếu kiểm kê (draft: người lập có stock_count.create; submitted: stock_count.approve; bắt buộc lý do)',
  })
  cancel(
    @Param('id', STOCK_COUNT_UUID_PIPE) id: string,
    @Body() dto: CancelStockCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCountDetailResponse> {
    return this.stockCountsService.cancel(id, dto, user);
  }
}
