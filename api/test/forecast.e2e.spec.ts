import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import {
  MlClient,
  MlForecastRequest,
  MlForecastResponse,
  MlModelInfoResponse,
  MlServiceError,
} from '../src/modules/ai/forecast/ml-client.service';
import { PrismaService } from '../src/prisma/prisma.service';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';

function addUtcDays(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

describe('Forecast API E2E với PostgreSQL thật + MlClient mock (T-012 AC4, AC5, AC6, AC7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mockMlClient: {
    getModelInfo: jest.Mock<Promise<MlModelInfoResponse>, []>;
    forecast: jest.Mock<Promise<MlForecastResponse>, [MlForecastRequest]>;
  };
  let testStartedAt: Date;

  beforeAll(async () => {
    testStartedAt = new Date();

    mockMlClient = {
      getModelInfo: jest.fn(),
      forecast: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MlClient)
      .useValue(mockMlClient)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    mockMlClient.getModelInfo.mockReset();
    mockMlClient.forecast.mockReset();

    mockMlClient.getModelInfo.mockResolvedValue({
      model_version: 'rf-v1',
      trained_at: '2026-11-23T00:00:00Z',
      train_start: '2024-12-01',
      train_end: '2026-09-23',
      n_rows: 12680,
      features: ['lag_1', 'lag_7'],
      params: { n_estimators: 200 },
      data_source: 'mô phỏng',
      metrics: {
        test_days: 60,
        methods: {
          random_forest: { mean_mae: 5.38, mean_rmse: 8.06, pooled_rmse: 8.96 },
          moving_average_7: { mean_mae: 6.65, mean_rmse: 9.17, pooled_rmse: 10.16 },
        },
      },
    });

    mockMlClient.forecast.mockImplementation(async (req: MlForecastRequest) => {
      const lastDate = req.history[req.history.length - 1].date;
      const baseQty = req.method === 'model' ? 22 : 20;
      return {
        product_code: req.product_code,
        method: req.method,
        model_version: req.method === 'model' ? 'rf-v1' : 'moving-avg-7-v1',
        generated_at: '2026-11-23T00:00:00Z',
        forecast: Array.from({ length: req.horizon_days }, (_, idx) => ({
          date: addUtcDays(lastDate, idx + 1),
          qty: baseQty,
        })),
      };
    });
  });

  afterEach(async () => {
    const runs = await prisma.analysisRun.findMany({
      where: { createdAt: { gte: testStartedAt } },
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);
    if (runIds.length > 0) {
      await prisma.demandForecast.deleteMany({
        where: { analysisRunId: { in: runIds } },
      });
      await prisma.analysisRun.deleteMany({
        where: { id: { in: runIds } },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: DEMO_PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  it('AC6: không có token trả 401; nhanvien gọi POST /runs trả 403 và GET /latest trả 200', async () => {
    await request(app.getHttpServer()).post('/api/forecasts/runs').send({}).expect(401);
    await request(app.getHttpServer()).get('/api/forecasts/latest').expect(401);

    const staffToken = await loginAs('nhanvien');
    await request(app.getHttpServer())
      .post('/api/forecasts/runs')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ horizonDays: 10 })
      .expect(403);

    const latestRes = await request(app.getHttpServer())
      .get('/api/forecasts/latest')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(latestRes.body).toHaveProperty('run');
    expect(latestRes.body).toHaveProperty('items');

    const historyRes = await request(app.getHttpServer())
      .get('/api/forecasts/history/daily?days=90')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect((historyRes.body as { items: unknown[] }).items).toHaveLength(90);
  });

  it('AC7 + API contract: quanly chạy dự báo lưu đủ 20 sản phẩm, GET /latest, /runs, /products/:id khớp và tồn kho không đổi', async () => {
    const managerToken = await loginAs('quanly');

    const [movementsBefore, balanceAggBefore] = await Promise.all([
      prisma.stockMovement.count(),
      prisma.inventoryLotBalance.aggregate({ _sum: { onHandQty: true } }),
    ]);

    const runRes = await request(app.getHttpServer())
      .post('/api/forecasts/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 14 })
      .expect(201);

    const createdRun = runRes.body as { id: string; status: string; modelVersion: string };
    expect(createdRun.status).toBe('succeeded');
    expect(createdRun.modelVersion).toBe('rf-v1');

    const savedCount = await prisma.demandForecast.count({
      where: { analysisRunId: createdRun.id },
    });
    expect(savedCount).toBe(20 * 14);

    const [movementsAfter, balanceAggAfter] = await Promise.all([
      prisma.stockMovement.count(),
      prisma.inventoryLotBalance.aggregate({ _sum: { onHandQty: true } }),
    ]);
    expect(movementsAfter).toBe(movementsBefore);
    expect(
      (balanceAggAfter._sum.onHandQty ?? new Prisma.Decimal(0)).equals(
        balanceAggBefore._sum.onHandQty ?? new Prisma.Decimal(0),
      ),
    ).toBe(true);

    const latestRes = await request(app.getHttpServer())
      .get('/api/forecasts/latest')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const latestBody = latestRes.body as {
      run: {
        id: string;
        modelVersion: string;
        horizonDays: number;
        dataSource: string;
        metrics: { model: { mean_mae: number }; baseline: { mean_mae: number } };
      };
      items: Array<{
        productId: string;
        code: string;
        forecastQty: string;
        baselineQty: string;
        onHandQty: string;
        daysToSellOut: number | null;
        assessment: string;
      }>;
    };

    expect(latestBody.run.id).toBe(createdRun.id);
    expect(latestBody.run.modelVersion).toBe('rf-v1');
    expect(latestBody.run.horizonDays).toBe(14);
    expect(latestBody.run.dataSource).toBe('SIMULATED');
    expect(latestBody.run.metrics.model.mean_mae).toBe(5.38);
    expect(latestBody.run.metrics.baseline.mean_mae).toBe(6.65);
    expect(latestBody.items).toHaveLength(20);
    expect(latestBody.items[0].code).toBe('SP001');
    expect(latestBody.items[0].forecastQty).toBe('308.000');
    expect(latestBody.items[0].baselineQty).toBe('280.000');

    const productRes = await request(app.getHttpServer())
      .get(`/api/forecasts/products/${latestBody.items[0].productId}?runId=${createdRun.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect((productRes.body as { items: unknown[] }).items).toHaveLength(14);

    const runsRes = await request(app.getHttpServer())
      .get('/api/forecasts/runs?limit=5')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect((runsRes.body as Array<{ id: string }>)[0].id).toBe(createdRun.id);
  });

  it('AC4: lỗi ML ở sản phẩm thứ 5 → trả 502, đánh dấu run failed kèm errorMessage và 0 dòng demand_forecasts', async () => {
    const managerToken = await loginAs('quanly');

    let calledProducts = 0;
    mockMlClient.forecast.mockImplementation(async (req: MlForecastRequest) => {
      if (req.method === 'model') {
        calledProducts += 1;
      }
      if (calledProducts === 5) {
        throw new MlServiceError('Dịch vụ dự báo timeout tại SP005');
      }
      const lastDate = req.history[req.history.length - 1].date;
      return {
        product_code: req.product_code,
        method: req.method,
        model_version: req.method === 'model' ? 'rf-v1' : 'moving-avg-7-v1',
        generated_at: '2026-11-23T00:00:00Z',
        forecast: [{ date: addUtcDays(lastDate, 1), qty: 20 }],
      };
    });

    const res = await request(app.getHttpServer())
      .post('/api/forecasts/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 1 })
      .expect(502);

    expect((res.body as { message: string }).message).toBe('Dịch vụ dự báo không phản hồi');

    const failedRun = await prisma.analysisRun.findFirst({
      where: { createdAt: { gte: testStartedAt }, status: 'failed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(failedRun).not.toBeNull();
    expect(failedRun?.errorMessage).toContain('SP005');

    const savedRows = await prisma.demandForecast.count({
      where: { analysisRunId: failedRun!.id },
    });
    expect(savedRows).toBe(0);
  });

  it('AC5: gọi POST /runs khi đã có một lượt đang ở trạng thái running trả 409', async () => {
    const managerToken = await loginAs('quanly');

    await prisma.analysisRun.create({
      data: {
        runType: 'FORECAST',
        triggerType: 'MANUAL',
        status: 'running',
        startedAt: new Date(),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/forecasts/runs')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ horizonDays: 60 })
      .expect(409);

    expect((res.body as { message: string }).message).toBe('Đang có lượt phân tích chạy');
  });
});
