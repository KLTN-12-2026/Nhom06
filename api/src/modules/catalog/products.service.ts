import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCodeImmutable, sumOnHandByProduct } from './domain/catalog-policy';
import { ListProductsQueryDto } from './dto/catalog-common.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

export interface ProductResponse {
  id: string;
  code: string;
  name: string;
  group: {
    id: string;
    code: string;
    name: string;
  };
  unit: string;
  shelfLifeDays: number | null;
  onHandQty: string;
  status: string;
}

export interface ProductListResponse {
  items: ProductResponse[];
  total: number;
  page: number;
  pageSize: number;
}

const PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  unit: true,
  shelfLifeDays: true,
  status: true,
  group: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function toProductResponse(record: ProductRecord, onHandQty = '0'): ProductResponse {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    group: record.group,
    unit: record.unit,
    shelfLifeDays: record.shelfLifeDays,
    onHandQty,
    status: record.status,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOnHandMap(productIds: string[]): Promise<Map<string, string>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const balances = await this.prisma.inventoryLotBalance.findMany({
      where: {
        lot: {
          productId: { in: productIds },
        },
      },
      select: {
        onHandQty: true,
        lot: { select: { productId: true } },
      },
    });

    return sumOnHandByProduct(
      balances.map((row) => ({
        productId: row.lot.productId,
        onHandQty: row.onHandQty,
      })),
    );
  }

  private async assertActiveGroup(groupId: string): Promise<void> {
    const group = await this.prisma.productGroup.findUnique({
      where: { id: groupId },
      select: { id: true, status: true },
    });
    if (!group || group.status !== 'active') {
      throw new BadRequestException({
        message: 'Nhóm hàng không tồn tại hoặc đã ngừng hoạt động',
        errors: [{ field: 'groupId', message: 'Nhóm hàng không tồn tại hoặc đã ngừng hoạt động' }],
      });
    }
  }

  async findAll(query: ListProductsQueryDto): Promise<ProductListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.ProductWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.groupId) {
      where.groupId = query.groupId;
    }
    if (query.search) {
      const search = query.search.trim();
      if (search.length > 0) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: PRODUCT_SELECT,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const onHandMap = await this.getOnHandMap(products.map((p) => p.id));

    return {
      items: products.map((product) =>
        toProductResponse(product, onHandMap.get(product.id) ?? '0'),
      ),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: PRODUCT_SELECT,
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    const onHandMap = await this.getOnHandMap([product.id]);
    return toProductResponse(product, onHandMap.get(product.id) ?? '0');
  }

  async create(dto: CreateProductDto, actorUserId: string): Promise<ProductResponse> {
    const duplicate = await this.prisma.product.findFirst({
      where: { code: { equals: dto.code, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({
        message: 'Mã đã tồn tại',
        errors: [{ field: 'code', message: 'Mã đã tồn tại' }],
      });
    }

    await this.assertActiveGroup(dto.groupId);

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          code: dto.code,
          name: dto.name,
          groupId: dto.groupId,
          unit: dto.unit,
          shelfLifeDays: dto.shelfLifeDays ?? null,
          status: 'active',
        },
        select: PRODUCT_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: product.id,
        newData: {
          code: product.code,
          name: product.name,
          groupId: product.group.id,
          unit: product.unit,
          shelfLifeDays: product.shelfLifeDays,
          status: product.status,
        },
      });

      return product;
    });

    return toProductResponse(created, '0');
  }

  async update(id: string, dto: UpdateProductDto, actorUserId: string): Promise<ProductResponse> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: PRODUCT_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    assertCodeImmutable(existing.code, dto.code);

    if (dto.groupId !== undefined && dto.groupId !== existing.group.id) {
      await this.assertActiveGroup(dto.groupId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.groupId !== undefined ? { groupId: dto.groupId } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.shelfLifeDays !== undefined ? { shelfLifeDays: dto.shelfLifeDays } : {}),
        },
        select: PRODUCT_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: id,
        oldData: {
          name: existing.name,
          groupId: existing.group.id,
          unit: existing.unit,
          shelfLifeDays: existing.shelfLifeDays,
        },
        newData: {
          name: product.name,
          groupId: product.group.id,
          unit: product.unit,
          shelfLifeDays: product.shelfLifeDays,
        },
      });

      return product;
    });

    const onHandMap = await this.getOnHandMap([updated.id]);
    return toProductResponse(updated, onHandMap.get(updated.id) ?? '0');
  }

  async updateStatus(
    id: string,
    status: 'active' | 'inactive',
    actorUserId: string,
  ): Promise<ProductResponse> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: PRODUCT_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { status },
        select: PRODUCT_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'PRODUCT_STATUS_CHANGED',
        entityType: 'product',
        entityId: id,
        oldData: { status: existing.status },
        newData: { status: product.status },
      });

      return product;
    });

    const onHandMap = await this.getOnHandMap([updated.id]);
    return toProductResponse(updated, onHandMap.get(updated.id) ?? '0');
  }
}
