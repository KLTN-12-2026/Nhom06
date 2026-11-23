import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { runDemoSeed } from '../../prisma/seed/demo';
import { configureApp } from '../../src/app.config';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { verifyInventoryInvariants } from './inventory-invariants.helper';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';

describe('Seed demo tự động & bất biến dữ liệu (T-017 AC1, AC2, AC3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const originalEnv = {
    ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED,
    EXPIRY_CRON_ENABLED: process.env.EXPIRY_CRON_ENABLED,
    ANALYSIS_CRON_ENABLED: process.env.ANALYSIS_CRON_ENABLED,
    ANALYSIS_AUTO_ENABLED: process.env.ANALYSIS_AUTO_ENABLED,
    ANALYSIS_AUTO_DEBOUNCE_MS: process.env.ANALYSIS_AUTO_DEBOUNCE_MS,
  };

  beforeAll(async () => {
    process.env.ALLOW_DEMO_SEED = 'true';
    process.env.EXPIRY_CRON_ENABLED = 'false';
    process.env.ANALYSIS_CRON_ENABLED = 'false';
    process.env.ANALYSIS_AUTO_ENABLED = 'false';
    process.env.ANALYSIS_AUTO_DEBOUNCE_MS = '0';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    process.env.ALLOW_DEMO_SEED = originalEnv.ALLOW_DEMO_SEED;
    process.env.EXPIRY_CRON_ENABLED = originalEnv.EXPIRY_CRON_ENABLED;
    process.env.ANALYSIS_CRON_ENABLED = originalEnv.ANALYSIS_CRON_ENABLED;
    process.env.ANALYSIS_AUTO_ENABLED = originalEnv.ANALYSIS_AUTO_ENABLED;
    process.env.ANALYSIS_AUTO_DEBOUNCE_MS = originalEnv.ANALYSIS_AUTO_DEBOUNCE_MS;
  });

  it('AC1 + AC2 + AC3: chạy seed:demo --reset 2 lần < 2 phút, cấu trúc nhất quán, tồn = tổng movement và khớp bức tranh demo', async () => {
    const t0 = Date.now();
    const first = await runDemoSeed({ reset: true, env: { ...process.env, ALLOW_DEMO_SEED: 'true' } });
    const firstMs = Date.now() - t0;
    expect(firstMs).toBeLessThan(120_000);

    // Chạy không --reset khi đã có dữ liệu nghiệp vụ phải bị từ chối
    await expect(
      runDemoSeed({ reset: false, env: { ...process.env, ALLOW_DEMO_SEED: 'true' } }),
    ).rejects.toThrow(/--reset/);

    const t1 = Date.now();
    const second = await runDemoSeed({ reset: true, env: { ...process.env, ALLOW_DEMO_SEED: 'true' } });
    const secondMs = Date.now() - t1;
    expect(secondMs).toBeLessThan(120_000);

    // AC1: chạy lại 2 lần cho cùng cấu trúc
    expect(second.activeLotCount).toBe(first.activeLotCount);
    expect(second.activeLotCount).toBe(40);
    expect(second.expiredLotCount).toBe(first.expiredLotCount);
    expect(second.expiredLotCount).toBe(4);
    expect(second.nearExpiryLotCount).toBe(first.nearExpiryLotCount);
    expect(second.nearExpiryLotCount).toBe(3);
    expect(second.pendingOrderCount).toBe(first.pendingOrderCount);
    expect(second.pendingOrderCount).toBe(3);
    expect(second.partialOrderCount).toBe(1);
    expect(second.proposalCount).toBe(first.proposalCount);
    expect(second.proposalCount).toBeGreaterThanOrEqual(7);

    // AC2: kiểm tra bất biến tồn kho toàn cục
    const invariants = await verifyInventoryInvariants(prisma);
    expect(invariants.violations).toEqual([]);
    expect(invariants.checkedLots).toBeGreaterThanOrEqual(40);
    expect(invariants.checkedMovements).toBeGreaterThan(0);

    // AC3: đối chiếu bức tranh qua HTTP API như giao diện web
    const server = app.getHttpServer();
    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: 'quanly', password: DEMO_PASSWORD })
      .expect(200);
    const managerToken = (loginRes.body as { accessToken: string }).accessToken;

    const [dashboardRes, alertsRes, thresholdsRes, forecastRes, riskRes, proposalsRes, execRes, ordersRes] =
      await Promise.all([
        request(server)
          .get('/api/reports/dashboard')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/expiry-alerts?pageSize=100')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/expiry-thresholds')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/forecasts/latest')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/analysis/risk/latest')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/proposals')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/executions')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
        request(server)
          .get('/api/orders?pageSize=100')
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200),
      ]);

    const dashboard = dashboardRes.body as {
      lotsInStock: number;
      expired: { lots: number; qty: string };
      nearExpiry: { lots: number; qty: string };
      valueAtRisk: { amount: string; surplusQty: string; lotsWithoutCost: number } | null;
      monthlyInOut: Array<{ month: string; inbound: string; outbound: string }>;
      pendingOrders: Array<{ status: string }>;
    };
    expect(dashboard.lotsInStock).toBe(40);
    expect(dashboard.expired.lots).toBe(4);
    expect(dashboard.nearExpiry.lots).toBe(3);
    expect(dashboard.valueAtRisk).not.toBeNull();
    expect(new Prisma.Decimal(dashboard.valueAtRisk!.amount).gt(0)).toBe(true);
    expect(dashboard.valueAtRisk!.lotsWithoutCost).toBe(0);
    expect(dashboard.monthlyInOut).toHaveLength(12);
    for (const point of dashboard.monthlyInOut) {
      expect(new Prisma.Decimal(point.inbound).gt(0)).toBe(true);
      expect(new Prisma.Decimal(point.outbound).gt(0)).toBe(true);
    }

    const alertItems = (
      alertsRes.body as {
        items: Array<{ product: { code: string }; severity: string; daysRemaining: number }>;
      }
    ).items;
    expect(
      alertItems.filter((a) => a.product.code === 'SP002' && a.severity === 'expired'),
    ).toHaveLength(4);
    expect(
      alertItems.some((a) => a.product.code === 'SP002' && a.daysRemaining === 8),
    ).toBe(true);
    expect(
      alertItems.some((a) => a.product.code === 'SP004' && a.daysRemaining === 20),
    ).toBe(true);
    expect(
      alertItems.some((a) => a.product.code === 'SP007' && a.daysRemaining === 20),
    ).toBe(true);

    const thresholds = thresholdsRes.body as {
      overrides: Array<{ scope: string; target: { code?: string }; warningDays: number }>;
    };
    expect(
      thresholds.overrides.some(
        (o) => o.scope === 'PRODUCT' && o.target.code === 'SP002' && o.warningDays === 10,
      ),
    ).toBe(true);
    expect(
      thresholds.overrides.some(
        (o) => o.scope === 'PRODUCT_GROUP' && o.target.code === 'SUA' && o.warningDays === 45,
      ),
    ).toBe(true);

    const forecast = forecastRes.body as { run: { id: string } | null; items: unknown[] };
    expect(forecast.run).not.toBeNull();
    expect(forecast.items).toHaveLength(20);

    const risk = riskRes.body as { run: { id: string } | null; items: unknown[] };
    expect(risk.run).not.toBeNull();
    expect(risk.items).toHaveLength(40);

    const proposals = proposalsRes.body as {
      items: Array<{ status: string; actionType: string }>;
      summary: { pending: number };
    };
    expect(proposals.summary.pending).toBeGreaterThanOrEqual(6);
    expect(proposals.items.some((p) => p.actionType === 'DISPOSE')).toBe(true);
    expect(proposals.items.some((p) => p.actionType === 'CONTACT_AGENCY')).toBe(true);
    expect(proposals.items.some((p) => p.actionType === 'PRIORITIZE_FEFO')).toBe(true);

    const executions = execRes.body as {
      items: Array<{
        status: string;
        actualQty: string | null;
        proposal: { actionType: string };
      }>;
    };
    expect(executions.items).toHaveLength(1);
    expect(executions.items[0].proposal.actionType).toBe('PRIORITIZE_FEFO');
    expect(executions.items[0].status).toBe('in_progress');
    expect(new Prisma.Decimal(executions.items[0].actualQty ?? '0').eq(120)).toBe(true);

    const orders = ordersRes.body as { items: Array<{ status: string }> };
    expect(orders.items.filter((o) => o.status === 'confirmed')).toHaveLength(3);
    expect(orders.items.filter((o) => o.status === 'partial')).toHaveLength(1);
  });
});
