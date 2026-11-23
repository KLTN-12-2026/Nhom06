import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AnalysisPipelineService } from './analysis-pipeline.service';
import {
  ANALYSIS_DAILY_JOB_NAME,
  AnalysisSchedulerService,
} from './analysis-scheduler.service';

describe('AnalysisSchedulerService (T-013 AC5 — cron 06:00 VN)', () => {
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

    const run = jest.fn().mockResolvedValue({
      id: 'run-sched-1',
      lotCount: 10,
      evaluationDate: '2026-11-23',
    });
    const pipelineService = { run } as unknown as AnalysisPipelineService;

    return {
      configService,
      schedulerRegistry,
      pipelineService,
      addCronJob,
      deleteCronJob,
      doesExist,
      run,
    };
  };

  it('không đăng ký cron job khi ANALYSIS_CRON_ENABLED=false', () => {
    const { configService, schedulerRegistry, pipelineService, addCronJob } = createMocks({
      ANALYSIS_CRON_ENABLED: 'false',
      NODE_ENV: 'production',
    });

    const service = new AnalysisSchedulerService(configService, schedulerRegistry, pipelineService);
    service.onModuleInit();

    expect(addCronJob).not.toHaveBeenCalled();
  });

  it('không đăng ký cron job khi NODE_ENV=test', () => {
    const { configService, schedulerRegistry, pipelineService, addCronJob } = createMocks({
      ANALYSIS_CRON_ENABLED: 'true',
      NODE_ENV: 'test',
    });

    const service = new AnalysisSchedulerService(configService, schedulerRegistry, pipelineService);
    service.onModuleInit();

    expect(addCronJob).not.toHaveBeenCalled();
  });

  it('đăng ký và dọn cron job khi ANALYSIS_CRON_ENABLED=true ngoài môi trường test', () => {
    const { configService, schedulerRegistry, pipelineService, addCronJob, deleteCronJob, doesExist } =
      createMocks({
        ANALYSIS_CRON_ENABLED: 'true',
        NODE_ENV: 'development',
      });

    const service = new AnalysisSchedulerService(configService, schedulerRegistry, pipelineService);
    service.onModuleInit();

    expect(addCronJob).toHaveBeenCalledTimes(1);
    expect(addCronJob).toHaveBeenCalledWith(ANALYSIS_DAILY_JOB_NAME, expect.anything());

    const job = addCronJob.mock.calls[0][1] as { stop: () => void };
    const stopSpy = jest.spyOn(job, 'stop');
    doesExist.mockReturnValue(true);

    service.onModuleDestroy();
    expect(stopSpy).toHaveBeenCalled();
    expect(deleteCronJob).toHaveBeenCalledWith(ANALYSIS_DAILY_JOB_NAME);
  });

  it('runScheduledAnalysis gọi trigger SCHEDULED, bỏ qua 409 và không throw khi lỗi', async () => {
    const { configService, schedulerRegistry, pipelineService, run } = createMocks({
      ANALYSIS_CRON_ENABLED: 'true',
      NODE_ENV: 'development',
    });

    const service = new AnalysisSchedulerService(configService, schedulerRegistry, pipelineService);
    await service.runScheduledAnalysis();
    expect(run).toHaveBeenCalledWith({ trigger: 'SCHEDULED' });

    run.mockRejectedValueOnce(new ConflictException('Đang có lượt phân tích chạy'));
    await expect(service.runScheduledAnalysis()).resolves.toBeUndefined();

    run.mockRejectedValueOnce(new Error('Lỗi ML tạm thời'));
    await expect(service.runScheduledAnalysis()).resolves.toBeUndefined();
  });
});
