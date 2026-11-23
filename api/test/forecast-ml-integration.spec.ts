import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '123456';
const runRealMl = process.env.RUN_ML_INTEGRATION === 'true';
const describeRealMl = runRealMl ? describe : describe.skip;

describeRealMl('Tích hợp POST /api/forecasts/runs với dịch vụ ML thật (T-012 AC3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      if (createdRunIds.length > 0) {
        await prisma.demandForecast.deleteMany({
          where: { analysisRunId: { in: createdRunIds } },
        });
        await prisma.analysisRun.deleteMany({
          where: { id: { in: createdRunIds } },
        });
      }
    } finally {
      await app.close();
    }
  });

  it(
    'AC3: tạo 1 run succeeded, 20 × 60 = 1.200 dòng demand_forecasts có cả forecast_qty và baseline_qty, model_version=rf-v1 và metrics có MAE',
    async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'quanly', password: DEMO_PASSWORD })
        .expect(200);
      const token = (loginRes.body as { accessToken: string }).accessToken;

      const runRes = await request(app.getHttpServer())
        .post('/api/forecasts/runs')
        .set('Authorization', `Bearer ${token}`)
        .send({ horizonDays: 60 })
        .expect(201);

      const run = runRes.body as {
        id: string;
        status: string;
        modelVersion: string;
        metrics: {
          model: { mean_mae: number; mean_rmse: number } | null;
          baseline: { mean_mae: number } | null;
          productCount: number;
          horizonDays: number;
        };
      };
      createdRunIds.push(run.id);

      expect(run.status).toBe('succeeded');
      expect(run.modelVersion).toBe('rf-v1');
      expect(run.metrics.horizonDays).toBe(60);
      expect(run.metrics.productCount).toBe(20);
      expect(typeof run.metrics.model?.mean_mae).toBe('number');
      expect(typeof run.metrics.baseline?.mean_mae).toBe('number');

      const forecastRows = await prisma.demandForecast.findMany({
        where: { analysisRunId: run.id },
        select: { forecastQty: true, baselineQty: true },
      });
      expect(forecastRows).toHaveLength(20 * 60);
      expect(forecastRows.every((row) => row.baselineQty !== null)).toBe(true);

      const latestRes = await request(app.getHttpServer())
        .get('/api/forecasts/latest')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((latestRes.body as { items: unknown[] }).items).toHaveLength(20);
    },
    60_000,
  );
});
