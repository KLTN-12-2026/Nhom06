import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { CreateExecutionDisposalDto } from './dto/create-execution-disposal.dto';
import { LinkExecutionOutboundDto } from './dto/link-execution-outbound.dto';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';
import { RecordExecutionUpdateDto } from './dto/record-execution-update.dto';
import { ExecutionsService } from './executions.service';

const EXECUTION_UUID_PIPE = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Mã phương án thực hiện không đúng định dạng UUID'),
});

@ApiTags('Executions')
@ApiBearerAuth()
@Controller('executions')
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Get()
  @Permissions('executions.read')
  @ApiOperation({ summary: 'Danh sách theo dõi thực hiện phương án đã duyệt kèm KPI tổng quan' })
  list(@Query() query: ListExecutionsQueryDto) {
    return this.executionsService.list(query);
  }

  @Get(':id')
  @Permissions('executions.read')
  @ApiOperation({
    summary: 'Chi tiết phương án thực hiện kèm lịch sử cập nhật, người duyệt và phiếu xuất liên kết',
  })
  getDetail(@Param('id', EXECUTION_UUID_PIPE) id: string) {
    return this.executionsService.getDetail(id);
  }

  @Post(':id/updates')
  @Permissions('executions.update')
  @ApiOperation({ summary: 'Ghi kết quả thực hiện thủ công (không làm thay đổi tồn kho)' })
  recordUpdate(
    @Param('id', EXECUTION_UUID_PIPE) id: string,
    @Body() dto: RecordExecutionUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.executionsService.recordUpdate(id, dto, user.id);
  }

  @Post(':id/disposal')
  @Permissions('executions.update', 'outbound.confirm')
  @ApiOperation({
    summary: 'Lập và xác nhận phiếu xuất hủy hoặc trả nhà cung cấp nguyên tử theo lô của đề xuất',
  })
  createDisposal(
    @Param('id', EXECUTION_UUID_PIPE) id: string,
    @Body() dto: CreateExecutionDisposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.executionsService.createDisposal(id, dto, user.id);
  }

  @Post(':id/link-outbound')
  @Permissions('executions.update')
  @ApiOperation({ summary: 'Liên kết phiếu xuất ORDER đã xác nhận chứa lô của đề xuất' })
  linkOutbound(
    @Param('id', EXECUTION_UUID_PIPE) id: string,
    @Body() dto: LinkExecutionOutboundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.executionsService.linkOutbound(id, dto, user.id);
  }
}
