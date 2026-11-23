import { Module } from '@nestjs/common';
import { AgenciesController } from './agencies.controller';
import { AgenciesService } from './agencies.service';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  controllers: [
    ProductGroupsController,
    ProductsController,
    SuppliersController,
    AgenciesController,
  ],
  providers: [ProductGroupsService, ProductsService, SuppliersService, AgenciesService],
  exports: [ProductGroupsService, ProductsService, SuppliersService, AgenciesService],
})
export class CatalogModule {}
