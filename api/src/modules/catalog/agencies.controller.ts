import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ListCatalogQueryDto, UpdateCatalogStatusDto } from './dto/catalog-common.dto';
import { CreateAgencyDto, UpdateAgencyDto } from './dto/agency.dto';
import { AgenciesService, AgencyResponse } from './agencies.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID đại lý không đúng định dạng UUID'),
});

@ApiTags('Catalog - Agencies')
@ApiBearerAuth()
@Controller('agencies')
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  @Get()
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Danh sách đại lý (tìm kiếm, lọc trạng thái)' })
  findAll(@Query() query: ListCatalogQueryDto): Promise<AgencyResponse[]> {
    return this.agenciesService.findAll(query);
  }

  @Get(':id')
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Chi tiết một đại lý' })
  findOne(@Param('id', uuidPipe) id: string): Promise<AgencyResponse> {
    return this.agenciesService.findOne(id);
  }

  @Post()
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Tạo đại lý mới' })
  create(
    @Body() dto: CreateAgencyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgencyResponse> {
    return this.agenciesService.create(dto, actor.id);
  }

  @Patch(':id')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Cập nhật đại lý (không đổi mã)' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateAgencyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgencyResponse> {
    return this.agenciesService.update(id, dto, actor.id);
  }

  @Patch(':id/status')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Ngừng hoạt động hoặc kích hoạt lại đại lý' })
  updateStatus(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCatalogStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AgencyResponse> {
    return this.agenciesService.updateStatus(id, dto.status, actor.id);
  }
}
