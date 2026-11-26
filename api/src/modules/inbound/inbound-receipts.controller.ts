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
  CreateInboundReceiptDto,
  ListInboundReceiptsQueryDto,
  UpdateInboundReceiptDto,
} from './dto/inbound-receipt.dto';
import {
  InboundReceiptDetailResponse,
  InboundReceiptListResponse,
  InboundReceiptsService,
} from './inbound-receipts.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID phiếu nhập không đúng định dạng UUID'),
});

function canReadMoney(user: AuthenticatedUser): boolean {
  return (user.permissions ?? []).includes('reports.read');
}

@ApiTags('Inbound - Receipts')
@ApiBearerAuth()
@Controller('inbound-receipts')
export class InboundReceiptsController {
  constructor(private readonly inboundReceiptsService: InboundReceiptsService) {}

  @Get()
  @Permissions('inbound.read')
  @ApiOperation({ summary: 'Danh sách phiếu nhập kho có lọc theo trạng thái, NCC, khoảng ngày, tìm kiếm' })
  findAll(
    @Query() query: ListInboundReceiptsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InboundReceiptListResponse> {
    return this.inboundReceiptsService.findAll(query, { includeMoney: canReadMoney(actor) });
  }

  @Get(':id')
  @Permissions('inbound.read')
  @ApiOperation({ summary: 'Chi tiết một phiếu nhập kho kèm danh sách dòng hàng' })
  findOne(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InboundReceiptDetailResponse> {
    return this.inboundReceiptsService.findOne(id, { includeMoney: canReadMoney(actor) });
  }

  @Post()
  @Permissions('inbound.create')
  @ApiOperation({ summary: 'Lập phiếu nhập kho ở trạng thái nháp (không thay đổi tồn kho)' })
  create(
    @Body() dto: CreateInboundReceiptDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InboundReceiptDetailResponse> {
    return this.inboundReceiptsService.create(dto, actor.id, {
      includeMoney: canReadMoney(actor),
    });
  }

  @Put(':id')
  @Permissions('inbound.create')
  @ApiOperation({ summary: 'Cập nhật toàn bộ thông tin và dòng hàng của phiếu nhập nháp' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateInboundReceiptDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InboundReceiptDetailResponse> {
    return this.inboundReceiptsService.update(id, dto, actor.id, {
      includeMoney: canReadMoney(actor),
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('inbound.create')
  @ApiOperation({ summary: 'Hủy phiếu nhập nháp (không thay đổi tồn kho)' })
  cancel(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InboundReceiptDetailResponse> {
    return this.inboundReceiptsService.cancel(id, actor.id, {
      includeMoney: canReadMoney(actor),
    });
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Permissions('inbound.confirm')
  @ApiOperation({ summary: 'Xác nhận nhập kho (cập nhật lô, tồn kho và sổ biến động trong 1 transaction)' })
  confirm(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InboundReceiptDetailResponse> {
    return this.inboundReceiptsService.confirm(id, actor.id, {
      includeMoney: canReadMoney(actor),
    });
  }
}
