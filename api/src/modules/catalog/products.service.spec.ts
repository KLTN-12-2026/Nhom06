import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';

describe('ProductsService (lọc dữ liệu seed — AC3)', () => {
  let prisma: PrismaService;
  let service: ProductsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ProductsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lọc sản phẩm theo search=SP00 trả đúng 9 mục SP001..SP009 sắp theo mã', async () => {
    const result = await service.findAll({ search: 'SP00', status: 'active' });

    expect(result.total).toBe(9);
    expect(result.items).toHaveLength(9);
    expect(result.items.map((item) => item.code)).toEqual([
      'SP001',
      'SP002',
      'SP003',
      'SP004',
      'SP005',
      'SP006',
      'SP007',
      'SP008',
      'SP009',
    ]);
    expect(typeof result.items[0].onHandQty).toBe('string');
  });

  it('lọc sản phẩm theo groupId của nhóm Sữa trả đúng 5 sản phẩm', async () => {
    const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });

    const result = await service.findAll({ groupId: suaGroup.id, status: 'active' });

    expect(result.total).toBe(5);
    expect(result.items).toHaveLength(5);
    expect(result.items.every((item) => item.group.code === 'SUA')).toBe(true);
  });

  it('kết hợp lọc theo groupId + status + search không phân biệt hoa thường và bỏ khoảng trắng', async () => {
    const suaGroup = await prisma.productGroup.findUniqueOrThrow({ where: { code: 'SUA' } });

    const result = await service.findAll({
      groupId: suaGroup.id,
      status: 'active',
      search: '  sữa đặc  ',
    });

    expect(result.total).toBe(1);
    expect(result.items[0].code).toBe('SP003');
    expect(result.items[0].shelfLifeDays).toBe(365);
  });
});
