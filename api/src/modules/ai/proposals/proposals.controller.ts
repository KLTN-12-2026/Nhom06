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
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ExplainProposalDto } from './dto/explain-proposal.dto';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';
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
}
