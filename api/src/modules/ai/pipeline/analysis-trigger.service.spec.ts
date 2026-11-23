import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisPipelineService } from './analysis-pipeline.service';
import { AnalysisTriggerService } from './analysis-trigger.service';

const flushAsync = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('AnalysisTriggerService (T-013 AC5 — hook STOCK_CHANGE + debounce)', () => {
  const createMocks = (envMap: Record<string, string | number | undefined>) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        envMap[key] !== undefined ? envMap[key] : defaultValue,
      ),
    } as unknown as ConfigService;

    const run = jest.fn().mockResolvedValue({
      id: 'run-stock-1',
      lotCount: 5,
      evaluationDate: '2026-11-23',
    });
    const pipelineService = { run } as unknown as AnalysisPipelineService;

    const service = new AnalysisTriggerService(configService, pipelineService);
    return { service, configService, pipelineService, run };
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('không kích hoạt khi ANALYSIS_AUTO_ENABLED=false hoặc NODE_ENV=test', async () => {
    const disabled = createMocks({
      ANALYSIS_AUTO_ENABLED: 'false',
      ANALYSIS_AUTO_DEBOUNCE_MS: 0,
      NODE_ENV: 'production',
    });
    disabled.service.notifyStockChanged({ sourceType: 'INBOUND_RECEIPT', sourceId: 'in-1' });
    await flushAsync();
    expect(disabled.run).not.toHaveBeenCalled();

    const inTest = createMocks({
      ANALYSIS_AUTO_ENABLED: 'true',
      ANALYSIS_AUTO_DEBOUNCE_MS: 0,
      NODE_ENV: 'test',
    });
    inTest.service.notifyStockChanged({ sourceType: 'OUTBOUND_RECEIPT', sourceId: 'out-1' });
    await flushAsync();
    expect(inTest.run).not.toHaveBeenCalled();
  });

  it('gom nhiều biến động tồn liên tiếp bằng debounce thành đúng 1 lượt chạy STOCK_CHANGE', async () => {
    jest.useFakeTimers();
    const { service, run } = createMocks({
      ANALYSIS_AUTO_ENABLED: 'true',
      ANALYSIS_AUTO_DEBOUNCE_MS: 30000,
      NODE_ENV: 'development',
    });

    service.notifyStockChanged({ sourceType: 'INBOUND_RECEIPT', sourceId: 'in-1', receiptNo: 'PN01' });
    jest.advanceTimersByTime(10000);
    service.notifyStockChanged({ sourceType: 'INBOUND_RECEIPT', sourceId: 'in-2', receiptNo: 'PN02' });
    jest.advanceTimersByTime(20000);
    service.notifyStockChanged({ sourceType: 'OUTBOUND_RECEIPT', sourceId: 'out-1', receiptNo: 'PX01' });

    // Chưa hết 30s từ sự kiện cuối nên chưa chạy
    jest.advanceTimersByTime(29999);
    expect(run).not.toHaveBeenCalled();

    // Đủ 30s từ sự kiện cuối → chạy đúng 1 lượt
    jest.advanceTimersByTime(1);
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ trigger: 'STOCK_CHANGE' });

    service.onModuleDestroy();
  });

  it('bỏ qua không lỗi khi đang có lượt chạy (in-flight hoặc DB trả 409) và không crash khi pipeline ném lỗi', async () => {
    const { service, run } = createMocks({
      ANALYSIS_AUTO_ENABLED: 'true',
      ANALYSIS_AUTO_DEBOUNCE_MS: 0,
      NODE_ENV: 'development',
    });

    let resolveFirst!: () => void;
    run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ id: 'r1', lotCount: 1, evaluationDate: '2026-11-23' });
        }),
    );

    // Gọi 2 lần khi lần 1 đang chạy → lần 2 bị bỏ qua ngay
    service.notifyStockChanged({ sourceType: 'INBOUND_RECEIPT', sourceId: 'in-1' });
    service.notifyStockChanged({ sourceType: 'INBOUND_RECEIPT', sourceId: 'in-2' });
    await flushAsync();
    expect(run).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushAsync();

    // Lần kế tiếp gặp 409 từ DB → bỏ qua không lỗi
    run.mockRejectedValueOnce(new ConflictException('Đang có lượt phân tích chạy'));
    service.notifyStockChanged({ sourceType: 'OUTBOUND_RECEIPT', sourceId: 'out-1' });
    await flushAsync();
    expect(run).toHaveBeenCalledTimes(2);

    // Lần kế tiếp pipeline ném lỗi bất ngờ → chỉ log, không làm hỏng caller
    run.mockRejectedValueOnce(new Error('ML lỗi không phản hồi'));
    expect(() =>
      service.notifyStockChanged({ sourceType: 'INBOUND_RECEIPT', sourceId: 'in-3' }),
    ).not.toThrow();
    await flushAsync();
    expect(run).toHaveBeenCalledTimes(3);
  });
});
