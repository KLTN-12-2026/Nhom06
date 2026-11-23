import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockCountsService } from './stock-counts.service';

describe('StockCountsService — Rollback nguyên tử trên PostgreSQL thật (AC6)', () => {
  let prisma: PrismaService;
  let service: StockCountsService;

  let staffId: string;
  let managerId: string;
  let supplierId: string;
  let product1Id: string;
  let product2Id: string;
  let lot1Id: string;
  let lot2Id: string;
  let stockCountId: string;
  let testStartedAt: Date;

  const prefix = `T010_SVC_${Date.now()}_`;

  beforeAll(async () => {
    testStartedAt = new Date();
    prisma = new PrismaService();
    await prisma.$connect();
    service = new StockCountsService(prisma);

    const [staff, manager, supplier, product1, product2] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'nhanvien' } }),
      prisma.user.findUniqueOrThrow({ where: { username: 'quanly' } }),
      prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } }),
      prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } }),
    ]);

    staffId = staff.id;
    managerId = manager.id;
    supplierId = supplier.id;
    product1Id = product1.id;
    product2Id = product2.id;
  });

  afterAll(async () => {
    try {
      if (stockCountId) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'STOCK_COUNT', sourceId: stockCountId },
        });
        await prisma.stockCountItem.deleteMany({ where: { countId: stockCountId } });
        await prisma.stockCount.deleteMany({ where: { id: stockCountId } });
      }

      const lotIds = [lot1Id, lot2Id].filter(Boolean);
      if (lotIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'stock_count',
          createdAt: { gte: testStartedAt },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rollback toàn bộ tồn kho, version, sổ biến động và trạng thái phiếu khi ép lỗi ghi movement ở lô thứ 2', async () => {
    const lot1 = await prisma.lot.create({
      data: {
        productId: product1Id,
        supplierId,
        lotCode: `${prefix}LOT1`,
        expiryDate: new Date('2027-06-01'),
        receivedAt: new Date('2026-11-10'),
        initialQuantity: new Prisma.Decimal('20.000'),
        status: 'active',
      },
    });
    const lot2 = await prisma.lot.create({
      data: {
        productId: product2Id,
        supplierId,
        lotCode: `${prefix}LOT2`,
        expiryDate: new Date('2027-07-01'),
        receivedAt: new Date('2026-11-10'),
        initialQuantity: new Prisma.Decimal('30.000'),
        status: 'active',
      },
    });
    lot1Id = lot1.id;
    lot2Id = lot2.id;

    await prisma.inventoryLotBalance.createMany({
      data: [
        { lotId: lot1Id, onHandQty: new Prisma.Decimal('20.000'), version: 2 },
        { lotId: lot2Id, onHandQty: new Prisma.Decimal('30.000'), version: 3 },
      ],
    });

    const created = await service.create(
      {
        countedAt: '2026-11-23T10:00:00+07:00',
        note: 'Test rollback duyệt kiểm kê dòng thứ 2',
        items: [
          { lotId: lot1Id, countedQty: '17', reason: 'Thiếu 3 thùng do bể vỡ' },
          { lotId: lot2Id, countedQty: '35', reason: 'Thừa 5 lốc khi kiểm thực tế' },
        ],
      },
      staffId,
    );
    stockCountId = created.id;

    await service.submit(stockCountId, staffId);

    const originalRecordMovement = (
      service as unknown as {
        recordStockMovement: (
          tx: Prisma.TransactionClient,
          input: unknown,
        ) => Promise<void>;
      }
    ).recordStockMovement.bind(service);

    let callCount = 0;
    const spy = jest
      .spyOn(
        service as unknown as { recordStockMovement: (...args: unknown[]) => Promise<void> },
        'recordStockMovement',
      )
      .mockImplementation(async (...args: unknown[]) => {
        callCount += 1;
        if (callCount === 2) {
          throw new Error('Lỗi giả lập khi ghi sổ biến động điều chỉnh lô thứ 2');
        }
        return originalRecordMovement(args[0] as Prisma.TransactionClient, args[1]);
      });

    try {
      await expect(service.approve(stockCountId, managerId)).rejects.toThrow(
        'Lỗi giả lập khi ghi sổ biến động điều chỉnh lô thứ 2',
      );
    } finally {
      spy.mockRestore();
    }

    // Xác minh rollback hoàn toàn trên PostgreSQL thật
    const countAfter = await prisma.stockCount.findUniqueOrThrow({ where: { id: stockCountId } });
    expect(countAfter.status).toBe('submitted');
    expect(countAfter.approvedBy).toBeNull();
    expect(countAfter.approvedAt).toBeNull();

    const [bal1After, bal2After] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot1Id } }),
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot2Id } }),
    ]);
    expect(bal1After.onHandQty.toString()).toBe('20');
    expect(bal1After.version).toBe(2);
    expect(bal2After.onHandQty.toString()).toBe('30');
    expect(bal2After.version).toBe(3);

    const movements = await prisma.stockMovement.findMany({
      where: { sourceType: 'STOCK_COUNT', sourceId: stockCountId },
    });
    expect(movements).toHaveLength(0);

    const approvedAudits = await prisma.auditLog.findMany({
      where: {
        entityType: 'stock_count',
        entityId: stockCountId,
        eventType: 'STOCK_COUNT_APPROVED',
      },
    });
    expect(approvedAudits).toHaveLength(0);
  });
});
