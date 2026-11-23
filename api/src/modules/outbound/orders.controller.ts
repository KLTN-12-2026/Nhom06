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
  CancelAgencyOrderDto,
  CreateAgencyOrderDto,
  ListAgencyOrdersQueryDto,
  UpdateAgencyOrderDto,
} from './dto/agency-order.dto';
import { ConfirmOrderOutboundDto } from './dto/outbound-receipt.dto';
import {
  AgencyOrderDetailResponse,
  AgencyOrderListResponse,
  OrderFefoPlanResponse,
  OrdersService,
} from './orders.service';
import {
  ConfirmOrderOutboundResponse,
  OutboundReceiptsService,
} from './outbound-receipts.service';

const orderUuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID đơn hàng không đúng định dạng UUID'),
});

@ApiTags('Outbound - Agency Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly outboundReceiptsService: OutboundReceiptsService,
  ) {}

  @Get()
  @Permissions('orders.read')
  @ApiOperation({ summary: 'Danh sách đơn hàng đại lý có lọc trạng thái, đại lý, khoảng ngày, tìm kiếm' })
  findAll(@Query() query: ListAgencyOrdersQueryDto): Promise<AgencyOrderListResponse> {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @Permissions('orders.read')
  @ApiOperation({ summary: 'Chi tiết đơn đại lý kèm tồn khả dụng hôm nay và danh sách phiếu xuất liên quan' })
  findOne(@Param('id', orderUuidPipe) id: string): Promise<AgencyOrderDetailResponse> {
    return this.ordersService.findOne(id);
  }

  @Post()
  @Permissions('orders.create')
  @ApiOperation({ summary: 'Tạo đơn đặt hàng hộ đại lý (không làm thay đổi tồn kho)' })
  create(
    @Body() dto: CreateAgencyOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgencyOrderDetailResponse> {
    return this.ordersService.create(dto, actor.id);
  }

  @Put(':id')
  @Permissions('orders.create')
  @ApiOperation({ summary: 'Cập nhật đơn đặt hàng đại lý khi chưa phát sinh xuất kho' })
  update(
    @Param('id', orderUuidPipe) id: string,
    @Body() dto: UpdateAgencyOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgencyOrderDetailResponse> {
    return this.ordersService.update(id, dto, actor.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('orders.cancel')
  @ApiOperation({ summary: 'Hủy đơn đại lý (bắt buộc lý do, không đổi tồn kho)' })
  cancel(
    @Param('id', orderUuidPipe) id: string,
    @Body() dto: CancelAgencyOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgencyOrderDetailResponse> {
    return this.ordersService.cancel(id, dto, actor.id);
  }

  @Get(':id/fefo-plan')
  @Permissions('outbound.read')
  @ApiOperation({ summary: 'Tính gợi ý phân bổ lô theo FEFO cho đơn đại lý (không ghi DB)' })
  getFefoPlan(@Param('id', orderUuidPipe) id: string): Promise<OrderFefoPlanResponse> {
    return this.ordersService.getFefoPlan(id);
  }

  @Post(':id/outbound')
  @Permissions('outbound.confirm')
  @ApiOperation({ summary: 'Tạo và xác nhận phiếu xuất kho cho đơn đại lý (nguyên tử trong 1 transaction)' })
  confirmOutbound(
    @Param('id', orderUuidPipe) id: string,
    @Body() dto: ConfirmOrderOutboundDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ConfirmOrderOutboundResponse> {
    return this.outboundReceiptsService.confirmForOrder(id, dto, actor.id);
  }
}
