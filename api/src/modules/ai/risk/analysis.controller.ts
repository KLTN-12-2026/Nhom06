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
import { AnalysisPipelineService } from '../pipeline/analysis-pipeline.service';
import {
  LatestRiskQueryDto,
  ListAnalysisRunsQueryDto,
  LotRiskDetailQueryDto,
  RunAnalysisDto,
} from './dto/analysis-query.dto';
import { RiskQueryService } from './risk-query.service';

const LOT_UUID_PIPE = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Mã lô không đúng định dạng UUID'),
});

@ApiTags('Analysis')
@ApiBearerAuth()
@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly pipelineService: AnalysisPipelineService,
    private readonly riskQueryService: RiskQueryService,
  ) {}

  @Post('runs')
  @Permissions('analysis.run')
  @ApiOperation({ summary: 'Chạy đồng bộ lượt phân tích đầy đủ (FULL): đồng bộ ACTUAL → dự báo → rủi ro theo lô' })
  runAnalysis(
    @Body() dto: RunAnalysisDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pipelineService.run({
      trigger: 'MANUAL',
      requestedBy: user.id,
      horizonDays: dto?.horizonDays,
    });
  }

  @Get('runs')
  @Permissions('analysis.read')
  @ApiOperation({ summary: 'Lịch sử các lượt phân tích (FULL)' })
  listRuns(@Query() query: ListAnalysisRunsQueryDto) {
    return this.riskQueryService.listRuns(query);
  }

  @Get('risk/latest')
  @Permissions('analysis.read')
  @ApiOperation({ summary: 'Kết quả phân tích nguy cơ tồn dư của lượt FULL thành công mới nhất' })
  getLatestRisk(@Query() query: LatestRiskQueryDto) {
    return this.riskQueryService.getLatestRisk(query);
  }

  @Get('risk/lots/:lotId')
  @Permissions('analysis.read')
  @ApiOperation({ summary: 'Chi tiết rủi ro tồn dư và căn cứ tính đầy đủ (basis) của một lô' })
  getLotRiskDetail(
    @Param('lotId', LOT_UUID_PIPE) lotId: string,
    @Query() query: LotRiskDetailQueryDto,
  ) {
    return this.riskQueryService.getLotRiskDetail(lotId, query.runId);
  }
}
