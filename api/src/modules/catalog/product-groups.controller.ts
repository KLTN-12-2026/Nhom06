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
import { ListProductGroupsQueryDto, UpdateCatalogStatusDto } from './dto/catalog-common.dto';
import { CreateProductGroupDto, UpdateProductGroupDto } from './dto/product-group.dto';
import { ProductGroupResponse, ProductGroupsService } from './product-groups.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID nhóm hàng không đúng định dạng UUID'),
});

@ApiTags('Catalog - Product Groups')
@ApiBearerAuth()
@Controller('product-groups')
export class ProductGroupsController {
  constructor(private readonly productGroupsService: ProductGroupsService) {}

  @Get()
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Danh sách nhóm hàng (sắp theo mã)' })
  findAll(@Query() query: ListProductGroupsQueryDto): Promise<ProductGroupResponse[]> {
    return this.productGroupsService.findAll(query);
  }

  @Post()
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Tạo nhóm hàng mới' })
  create(
    @Body() dto: CreateProductGroupDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductGroupResponse> {
    return this.productGroupsService.create(dto, actor.id);
  }

  @Patch(':id')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Cập nhật nhóm hàng (không đổi mã)' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateProductGroupDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductGroupResponse> {
    return this.productGroupsService.update(id, dto, actor.id);
  }

  @Patch(':id/status')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Ngừng hoạt động hoặc kích hoạt lại nhóm hàng' })
  updateStatus(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCatalogStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductGroupResponse> {
    return this.productGroupsService.updateStatus(id, dto.status, actor.id);
  }
}
