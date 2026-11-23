import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ListOutboundReceiptsQueryDto } from './dto/outbound-receipt.dto';
import {
  OutboundReceiptDetailResponse,
  OutboundReceiptListResponse,
  OutboundReceiptsService,
} from './outbound-receipts.service';

const outboundUuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID phiếu xuất không đúng định dạng UUID'),
});

@ApiTags('Outbound - Receipts')
@ApiBearerAuth()
@Controller('outbound-receipts')
export class OutboundReceiptsController {
  constructor(private readonly outboundReceiptsService: OutboundReceiptsService) {}

  @Get()
  @Permissions('outbound.read')
  @ApiOperation({ summary: 'Danh sách phiếu xuất kho đã xác nhận có lọc loại, đơn, ngày, tìm kiếm' })
  findAll(@Query() query: ListOutboundReceiptsQueryDto): Promise<OutboundReceiptListResponse> {
    return this.outboundReceiptsService.findAll(query);
  }

  @Get(':id')
  @Permissions('outbound.read')
  @ApiOperation({ summary: 'Chi tiết một phiếu xuất kho theo lô' })
  findOne(@Param('id', outboundUuidPipe) id: string): Promise<OutboundReceiptDetailResponse> {
    return this.outboundReceiptsService.findOne(id);
  }
}
