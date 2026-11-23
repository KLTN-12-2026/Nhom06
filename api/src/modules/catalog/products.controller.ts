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
import { ListProductsQueryDto, UpdateCatalogStatusDto } from './dto/catalog-common.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductListResponse, ProductResponse, ProductsService } from './products.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('ID sản phẩm không đúng định dạng UUID'),
});

@ApiTags('Catalog - Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Danh sách sản phẩm có phân trang, tìm kiếm, lọc nhóm và trạng thái' })
  findAll(@Query() query: ListProductsQueryDto): Promise<ProductListResponse> {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @Permissions('catalog.read')
  @ApiOperation({ summary: 'Chi tiết một sản phẩm kèm tồn kho hiện tại' })
  findOne(@Param('id', uuidPipe) id: string): Promise<ProductResponse> {
    return this.productsService.findOne(id);
  }

  @Post()
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Tạo sản phẩm mới' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductResponse> {
    return this.productsService.create(dto, actor.id);
  }

  @Patch(':id')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Cập nhật thông tin sản phẩm (không đổi mã)' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductResponse> {
    return this.productsService.update(id, dto, actor.id);
  }

  @Patch(':id/status')
  @Permissions('catalog.manage')
  @ApiOperation({ summary: 'Ngừng kinh doanh hoặc kích hoạt lại sản phẩm' })
  updateStatus(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateCatalogStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ProductResponse> {
    return this.productsService.updateStatus(id, dto.status, actor.id);
  }
}
