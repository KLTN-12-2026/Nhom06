import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InboundReceiptsService } from './inbound-receipts.service';

describe('InboundReceiptsService — Rollback nguyên tử trên PostgreSQL thật (AC6)', () => {
  let prisma: PrismaService;
  let service: InboundReceiptsService;

  let staffId: string;
  let supplierId: string;
  let product1Id: string;
  let product2Id: string;
  let receiptId: string;
  let testStartedAt: Date;

  const prefix = `T007_SVC_${Date.now()}_`;

  beforeAll(async () => {
    testStartedAt = new Date();
    prisma = new PrismaService();
    await prisma.$connect();
    service = new InboundReceiptsService(prisma);

    const staff = await prisma.user.findUniqueOrThrow({ where: { username: 'nhanvien' } });
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } });
    const product1 = await prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } });
    const product2 = await prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } });

    staffId = staff.id;
    supplierId = supplier.id;
    product1Id = product1.id;
    product2Id = product2.id;
  });

  afterAll(async () => {
    try {
      if (receiptId) {
        await prisma.stockMovement.deleteMany({
          where: { sourceType: 'INBOUND_RECEIPT', sourceId: receiptId },
        });
        await prisma.inboundReceiptItem.deleteMany({ where: { receiptId } });
        await prisma.inboundReceipt.deleteMany({ where: { id: receiptId } });
      }
      const leftoverLots = await prisma.lot.findMany({
        where: { lotCode: { startsWith: prefix } },
        select: { id: true },
      });
      if (leftoverLots.length > 0) {
        const lotIds = leftoverLots.map((l) => l.id);
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
      }
      await prisma.auditLog.deleteMany({
        where: { entityType: 'inbound_receipt', createdAt: { gte: testStartedAt } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rollback toàn bộ lô 1, tồn kho và sổ biến động khi lỗi xảy ra lúc ghi movement dòng thứ 2', async () => {
    const lotCode1 = `${prefix}LOT1`;
    const lotCode2 = `${prefix}LOT2`;

    const created = await service.create(
      {
        supplierId,
        receiptDate: '2026-11-23',
        notes: 'Test rollback movement dòng 2',
        items: [
          {
            productId: product1Id,
            lotCode: lotCode1,
            expiryDate: '2027-06-01',
            quantity: '25',
            unitCost: '100000',
          },
          {
            productId: product2Id,
            lotCode: lotCode2,
            expiryDate: '2027-07-01',
            quantity: '15',
            unitCost: '120000',
          },
        ],
      },
      staffId,
    );
    receiptId = created.id;

    // Ép lỗi ở lần ghi stock_movements thứ 2 trong khi mọi lệnh khác chạy trên PostgreSQL thật
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
          throw new Error('Lỗi giả lập khi ghi sổ biến động dòng thứ 2');
        }
        return originalRecordMovement(args[0] as Prisma.TransactionClient, args[1]);
      });

    try {
      await expect(service.confirm(receiptId, staffId)).rejects.toThrow(
        'Lỗi giả lập khi ghi sổ biến động dòng thứ 2',
      );
    } finally {
      spy.mockRestore();
    }

    // Xác minh rollback hoàn toàn trên PostgreSQL thật
    const receiptAfter = await prisma.inboundReceipt.findUniqueOrThrow({
      where: { id: receiptId },
      include: { items: true },
    });
    expect(receiptAfter.status).toBe('draft');
    expect(receiptAfter.confirmedBy).toBeNull();
    expect(receiptAfter.confirmedAt).toBeNull();
    expect(receiptAfter.items.every((item) => item.lotId === null)).toBe(true);

    const lotsCreated = await prisma.lot.findMany({
      where: { lotCode: { in: [lotCode1, lotCode2] } },
    });
    expect(lotsCreated).toHaveLength(0);

    const movements = await prisma.stockMovement.findMany({
      where: { sourceType: 'INBOUND_RECEIPT', sourceId: receiptId },
    });
    expect(movements).toHaveLength(0);

    const confirmAudit = await prisma.auditLog.findMany({
      where: { entityType: 'inbound_receipt', entityId: receiptId, eventType: 'INBOUND_CONFIRMED' },
    });
    expect(confirmAudit).toHaveLength(0);
  });
});
