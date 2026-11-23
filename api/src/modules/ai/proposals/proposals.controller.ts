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
import { ExplainProposalDto } from './dto/explain-proposal.dto';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';
import { ApproveProposalDto, RejectProposalDto } from './dto/proposal-decision.dto';
import { ProposalsService } from './proposals.service';

const PROPOSAL_UUID_PIPE = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Mã đề xuất không đúng định dạng UUID'),
});

@ApiTags('Proposals')
@ApiBearerAuth()
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Get('summary')
  @Permissions('proposals.read')
  @ApiOperation({ summary: 'Đếm số đề xuất đang chờ quyết định cho badge sidebar' })
  getSummary() {
    return this.proposalsService.getSummary();
  }

  @Get()
  @Permissions('proposals.read')
  @ApiOperation({ summary: 'Danh sách đề xuất xử lý hàng cận hạn' })
  list(@Query() query: ListProposalsQueryDto) {
    return this.proposalsService.list(query);
  }

  @Get(':id')
  @Permissions('proposals.read')
  @ApiOperation({
    summary: 'Chi tiết đề xuất kèm tình trạng lô hiện tại, số liệu thô LLM và trạng thái diễn giải',
  })
  getDetail(@Param('id', PROPOSAL_UUID_PIPE) id: string) {
    return this.proposalsService.getDetail(id);
  }

  @Post(':id/explain')
  @Permissions('analysis.run')
  @ApiOperation({ summary: 'Diễn giải lại đề xuất bằng LLM (hoặc mô phỏng lỗi khi bật demo)' })
  explain(@Param('id', PROPOSAL_UUID_PIPE) id: string, @Body() dto: ExplainProposalDto) {
    return this.proposalsService.explain(id, dto);
  }

  @Post(':id/approve')
  @Permissions('proposals.approve')
  @ApiOperation({ summary: 'Quản lý kho phê duyệt đề xuất xử lý (không đổi tồn kho)' })
  approve(
    @Param('id', PROPOSAL_UUID_PIPE) id: string,
    @Body() dto: ApproveProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalsService.approve(id, dto, user.id);
  }

  @Post(':id/reject')
  @Permissions('proposals.approve')
  @ApiOperation({ summary: 'Quản lý kho từ chối đề xuất xử lý kèm lý do bắt buộc' })
  reject(
    @Param('id', PROPOSAL_UUID_PIPE) id: string,
    @Body() dto: RejectProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalsService.reject(id, dto, user.id);
  }
}
