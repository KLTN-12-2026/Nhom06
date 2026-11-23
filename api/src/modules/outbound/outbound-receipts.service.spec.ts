import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpiryThresholdsService } from '../expiry/expiry-thresholds.service';
import { OrdersService } from './orders.service';
import { OutboundReceiptsService } from './outbound-receipts.service';

describe('OutboundReceiptsService — Rollback nguyên tử trên PostgreSQL thật (AC8)', () => {
  let prisma: PrismaService;
  let thresholdsService: ExpiryThresholdsService;
  let ordersService: OrdersService;
  let outboundService: OutboundReceiptsService;

  let staffId: string;
  let agencyId: string;
  let supplierId: string;
  let product1Id: string;
  let product2Id: string;
  let lot1Id: string;
  let lot2Id: string;
  let orderId: string;
  let testStartedAt: Date;

  const prefix = `T009_SVC_${Date.now()}_`;

  beforeAll(async () => {
    testStartedAt = new Date();
    prisma = new PrismaService();
    await prisma.$connect();
    thresholdsService = new ExpiryThresholdsService(prisma);
    ordersService = new OrdersService(prisma, thresholdsService);
    outboundService = new OutboundReceiptsService(prisma, thresholdsService);

    const staff = await prisma.user.findUniqueOrThrow({ where: { username: 'nhanvien' } });
    const agency = await prisma.agency.findUniqueOrThrow({ where: { code: 'DL001' } });
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: 'NCC001' } });
    const product1 = await prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } });
    const product2 = await prisma.product.findUniqueOrThrow({ where: { code: 'SP002' } });

    staffId = staff.id;
    agencyId = agency.id;
    supplierId = supplier.id;
    product1Id = product1.id;
    product2Id = product2.id;

    // Tạo 2 lô hợp lệ với tồn mỗi lô = 50
    const lot1 = await prisma.lot.create({
      data: {
        productId: product1Id,
        supplierId,
        lotCode: `${prefix}L1`,
        expiryDate: new Date('2027-08-01'),
        receivedAt: new Date('2026-11-01'),
        initialQuantity: new Prisma.Decimal('50'),
        status: 'active',
        balance: { create: { onHandQty: new Prisma.Decimal('50'), version: 1 } },
      },
    });
    const lot2 = await prisma.lot.create({
      data: {
        productId: product2Id,
        supplierId,
        lotCode: `${prefix}L2`,
        expiryDate: new Date('2027-09-01'),
        receivedAt: new Date('2026-11-01'),
        initialQuantity: new Prisma.Decimal('50'),
        status: 'active',
        balance: { create: { onHandQty: new Prisma.Decimal('50'), version: 1 } },
      },
    });
    lot1Id = lot1.id;
    lot2Id = lot2.id;
  });

  afterAll(async () => {
    try {
      if (orderId) {
        const receipts = await prisma.outboundReceipt.findMany({
          where: { orderId },
          select: { id: true },
        });
        const receiptIds = receipts.map((r) => r.id);
        if (receiptIds.length > 0) {
          await prisma.stockMovement.deleteMany({
            where: { sourceType: 'OUTBOUND_RECEIPT', sourceId: { in: receiptIds } },
          });
          await prisma.outboundReceiptItem.deleteMany({
            where: { outboundId: { in: receiptIds } },
          });
          await prisma.outboundReceipt.deleteMany({ where: { id: { in: receiptIds } } });
        }
        const orderItems = await prisma.agencyOrderItem.findMany({
          where: { orderId },
          select: { id: true },
        });
        const orderItemIds = orderItems.map((i) => i.id);
        if (orderItemIds.length > 0) {
          await prisma.orderLotAllocation.deleteMany({
            where: { orderItemId: { in: orderItemIds } },
          });
        }
        await prisma.agencyOrderItem.deleteMany({ where: { orderId } });
        await prisma.agencyOrder.deleteMany({ where: { id: orderId } });
      }

      const lotIds = [lot1Id, lot2Id].filter(Boolean);
      if (lotIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.inventoryLotBalance.deleteMany({ where: { lotId: { in: lotIds } } });
        await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
      }

      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ['agency_order', 'outbound_receipt'] },
          createdAt: { gte: testStartedAt },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('ép lỗi khi ghi sổ biến động ở lô thứ 2 → rollback hoàn toàn: 0 phiếu xuất, 0 movement, tồn 2 lô và đơn giữ nguyên', async () => {
    const order = await ordersService.create(
      {
        agencyId,
        orderDate: '2026-11-23',
        notes: 'Test rollback AC8',
        items: [
          { productId: product1Id, requestedQty: '20' },
          { productId: product2Id, requestedQty: '15' },
        ],
      },
      staffId,
    );
    orderId = order.id;

    const item1 = order.items.find((i) => i.productId === product1Id);
    const item2 = order.items.find((i) => i.productId === product2Id);
    expect(item1).toBeDefined();
    expect(item2).toBeDefined();

    const originalRecordMovement = (
      outboundService as unknown as {
        recordStockMovement: (tx: Prisma.TransactionClient, input: unknown) => Promise<void>;
      }
    ).recordStockMovement.bind(outboundService);

    let callCount = 0;
    const spy = jest
      .spyOn(
        outboundService as unknown as {
          recordStockMovement: (...args: unknown[]) => Promise<void>;
        },
        'recordStockMovement',
      )
      .mockImplementation(async (...args: unknown[]) => {
        callCount += 1;
        if (callCount === 2) {
          throw new Error('Lỗi giả lập khi ghi sổ biến động lô thứ 2');
        }
        return originalRecordMovement(args[0] as Prisma.TransactionClient, args[1]);
      });

    try {
      await expect(
        outboundService.confirmForOrder(
          orderId,
          {
            items: [
              { orderItemId: item1!.id, lotId: lot1Id, quantity: '20' },
              { orderItemId: item2!.id, lotId: lot2Id, quantity: '15' },
            ],
            notes: 'Xuất test rollback',
          },
          staffId,
        ),
      ).rejects.toThrow('Lỗi giả lập khi ghi sổ biến động lô thứ 2');
    } finally {
      spy.mockRestore();
    }

    // Kiểm tra rollback toàn phần trên PostgreSQL thật
    const receipts = await prisma.outboundReceipt.findMany({ where: { orderId } });
    expect(receipts).toHaveLength(0);

    const movements = await prisma.stockMovement.findMany({
      where: { lotId: { in: [lot1Id, lot2Id] } },
    });
    expect(movements).toHaveLength(0);

    const [bal1, bal2] = await Promise.all([
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot1Id } }),
      prisma.inventoryLotBalance.findUniqueOrThrow({ where: { lotId: lot2Id } }),
    ]);
    expect(bal1.onHandQty.toString()).toBe('50');
    expect(bal1.version).toBe(1);
    expect(bal2.onHandQty.toString()).toBe('50');
    expect(bal2.version).toBe(1);

    const orderAfter = await prisma.agencyOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(orderAfter.status).toBe('confirmed');
    expect(orderAfter.items.every((i) => i.fulfilledQty.eq(0) && i.status === 'pending')).toBe(
      true,
    );

    const allocations = await prisma.orderLotAllocation.findMany({
      where: { orderItemId: { in: [item1!.id, item2!.id] } },
    });
    expect(allocations).toHaveLength(0);

    const confirmAudits = await prisma.auditLog.findMany({
      where: {
        entityType: 'outbound_receipt',
        eventType: 'OUTBOUND_CONFIRMED',
        createdAt: { gte: testStartedAt },
      },
    });
    expect(confirmAudits).toHaveLength(0);
  });
});
