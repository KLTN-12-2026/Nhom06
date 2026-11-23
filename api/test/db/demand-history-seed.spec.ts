import { Prisma, PrismaClient } from '@prisma/client';
import { runSeed } from '../../prisma/seed';

describe('Bảng demand_history và seed lịch sử nhu cầu mô phỏng (T-012 AC1)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('nạp đủ 20 × 722 = 14.440 dòng SIMULATED, chạy lại lần 2 không nhân đôi và chạy nhanh dưới 60 giây', async () => {
    const startMs = Date.now();
    await runSeed(prisma);
    const firstCount = await prisma.demandHistory.count({
      where: { source: 'SIMULATED' },
    });

    await runSeed(prisma);
    const secondCount = await prisma.demandHistory.count({
      where: { source: 'SIMULATED' },
    });
    const elapsedMs = Date.now() - startMs;

    expect(firstCount).toBe(20 * 722);
    expect(secondCount).toBe(firstCount);
    expect(elapsedMs).toBeLessThan(60_000);

    const perProduct = await prisma.demandHistory.groupBy({
      by: ['productId'],
      where: { source: 'SIMULATED' },
      _count: { _all: true },
    });
    expect(perProduct).toHaveLength(20);
    for (const row of perProduct) {
      expect(row._count._all).toBe(722);
    }
  });

  it('từ chối qty âm, source ngoài SIMULATED/ACTUAL và trùng (product_id, history_date, source)', async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { code: 'SP001' } });
    const testDate = new Date('2099-01-01T00:00:00.000Z');

    await prisma.demandHistory.deleteMany({
      where: { productId: product.id, historyDate: testDate },
    });

    try {
      await expect(
        prisma.demandHistory.create({
          data: {
            productId: product.id,
            historyDate: testDate,
            qty: new Prisma.Decimal(-1),
            source: 'ACTUAL',
          },
        }),
      ).rejects.toThrow();

      await expect(
        prisma.demandHistory.create({
          data: {
            productId: product.id,
            historyDate: testDate,
            qty: new Prisma.Decimal(10),
            source: 'INVALID_SOURCE',
          },
        }),
      ).rejects.toThrow();

      await prisma.demandHistory.create({
        data: {
          productId: product.id,
          historyDate: testDate,
          qty: new Prisma.Decimal(15),
          source: 'ACTUAL',
        },
      });

      await expect(
        prisma.demandHistory.create({
          data: {
            productId: product.id,
            historyDate: testDate,
            qty: new Prisma.Decimal(20),
            source: 'ACTUAL',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.demandHistory.deleteMany({
        where: { productId: product.id, historyDate: testDate },
      });
    }
  });
});
