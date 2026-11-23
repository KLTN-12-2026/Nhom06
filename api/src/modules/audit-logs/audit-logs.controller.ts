import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import {
  AuditLogFacetsResponse,
  AuditLogsListResponse,
  AuditLogsService,
} from './audit-logs.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Permissions('audit.read')
  @ApiOperation({ summary: 'Tra cứu nhật ký hệ thống (chỉ đọc, dành cho Admin)' })
  findAll(@Query() query: ListAuditLogsQueryDto): Promise<AuditLogsListResponse> {
    return this.auditLogsService.findAll(query);
  }

  @Get('facets')
  @Permissions('audit.read')
  @ApiOperation({ summary: 'Danh sách sự kiện, đối tượng và người thực hiện để lọc nhật ký' })
  getFacets(): Promise<AuditLogFacetsResponse> {
    return this.auditLogsService.getFacets();
  }
}
