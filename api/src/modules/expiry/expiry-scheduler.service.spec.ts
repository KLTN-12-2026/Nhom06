import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ExpiryAlertsService } from './expiry-alerts.service';
import { EXPIRY_DAILY_JOB_NAME, ExpirySchedulerService } from './expiry-scheduler.service';

describe('ExpirySchedulerService (AC6)', () => {
  const createMocks = (envMap: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => envMap[key] ?? defaultValue),
    } as unknown as ConfigService;

    let registeredJob: { stop: () => void } | undefined;
    const addCronJob = jest.fn((_name: string, job: { stop: () => void }) => {
      registeredJob = job;
    });
    const getCronJob = jest.fn(() => registeredJob);
    const deleteCronJob = jest.fn();
    const doesExist = jest.fn().mockReturnValue(false);
    const schedulerRegistry = {
      addCronJob,
      getCronJob,
      deleteCronJob,
      doesExist,
    } as unknown as SchedulerRegistry;

    const evaluate = jest.fn().mockResolvedValue({
      evaluationDate: '2026-11-23',
      evaluatedLots: 2,
      expiredLots: 1,
      criticalLots: 1,
      warningLots: 0,
    });
    const alertsService = { evaluate } as unknown as ExpiryAlertsService;

    return { configService, schedulerRegistry, alertsService, addCronJob, deleteCronJob, doesExist, evaluate };
  };

  it('không đăng ký cron job khi EXPIRY_CRON_ENABLED=false', () => {
    const { configService, schedulerRegistry, alertsService, addCronJob } = createMocks({
      EXPIRY_CRON_ENABLED: 'false',
      NODE_ENV: 'production',
    });

    const service = new ExpirySchedulerService(configService, schedulerRegistry, alertsService);
    service.onModuleInit();

    expect(addCronJob).not.toHaveBeenCalled();
  });

  it('không đăng ký cron job khi NODE_ENV=test', () => {
    const { configService, schedulerRegistry, alertsService, addCronJob } = createMocks({
      EXPIRY_CRON_ENABLED: 'true',
      NODE_ENV: 'test',
    });

    const service = new ExpirySchedulerService(configService, schedulerRegistry, alertsService);
    service.onModuleInit();

    expect(addCronJob).not.toHaveBeenCalled();
  });

  it('đăng ký và dừng cron job khi EXPIRY_CRON_ENABLED=true ngoài môi trường test', () => {
    const { configService, schedulerRegistry, alertsService, addCronJob, deleteCronJob, doesExist } =
      createMocks({
        EXPIRY_CRON_ENABLED: 'true',
        NODE_ENV: 'development',
      });

    const service = new ExpirySchedulerService(configService, schedulerRegistry, alertsService);
    service.onModuleInit();

    expect(addCronJob).toHaveBeenCalledTimes(1);
    expect(addCronJob).toHaveBeenCalledWith(EXPIRY_DAILY_JOB_NAME, expect.anything());

    const job = addCronJob.mock.calls[0][1] as { stop: () => void };
    const stopSpy = jest.spyOn(job, 'stop');
    doesExist.mockReturnValue(true);

    service.onModuleDestroy();
    expect(stopSpy).toHaveBeenCalled();
    expect(deleteCronJob).toHaveBeenCalledWith(EXPIRY_DAILY_JOB_NAME);
  });

  it('runDailyEvaluation gọi evaluate(undefined, null) và không throw khi lỗi', async () => {
    const { configService, schedulerRegistry, alertsService, evaluate } = createMocks({
      EXPIRY_CRON_ENABLED: 'true',
      NODE_ENV: 'development',
    });

    const service = new ExpirySchedulerService(configService, schedulerRegistry, alertsService);
    await service.runDailyEvaluation();
    expect(evaluate).toHaveBeenCalledWith(undefined, null, 'SCHEDULED');

    evaluate.mockRejectedValueOnce(new Error('DB tạm lỗi'));
    await expect(service.runDailyEvaluation()).resolves.toBeUndefined();
  });
});
