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
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SupplierResponse, SuppliersService } from './suppliers.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID nhà cung cấp không đúng định dạng UUID'),
});

@ApiTags('Catalog - Suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Danh sách nhà cung cấp (tìm kiếm, lọc trạng thái)' })
  findAll(@Query() query: ListCatalogQueryDto): Promise<SupplierResponse[]> {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Chi tiết một nhà cung cấp' })
  findOne(@Param('id', uuidPipe) id: string): Promise<SupplierResponse> {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Tạo nhà cung cấp mới' })
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SupplierResponse> {
    return this.suppliersService.create(dto, actor.id);
  }

  @Patch(':id')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Cập nhật nhà cung cấp (không đổi mã)' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SupplierResponse> {
    return this.suppliersService.update(id, dto, actor.id);
  }

  @Patch(':id/status')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Ngừng hoạt động hoặc kích hoạt lại nhà cung cấp' })
  updateStatus(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCatalogStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SupplierResponse> {
    return this.suppliersService.updateStatus(id, dto.status, actor.id);
  }
}
