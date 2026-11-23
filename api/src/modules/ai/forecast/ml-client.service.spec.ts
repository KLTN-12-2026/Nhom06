import { ConfigService } from '@nestjs/config';
import { MlClient, MlServiceError } from './ml-client.service';

describe('MlClient (T-012 AC4)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createClient(timeoutMs = 10000): MlClient {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'ML_SERVICE_URL') return 'http://ml:8000/';
        if (key === 'ML_TIMEOUT_MS') return timeoutMs;
        return defaultValue;
      }),
    } as unknown as ConfigService;

    return new MlClient(configService);
  }

  it('gọi POST /forecast đúng hợp đồng và trả về kết quả hợp lệ', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        product_code: 'SP001',
        method: 'model',
        model_version: 'rf-v1',
        generated_at: '2026-11-23T00:00:00Z',
        forecast: [{ date: '2026-11-23', qty: 21.5 }],
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const client = createClient();
    const res = await client.forecast({
      product_code: 'SP001',
      history: [{ date: '2026-11-22', qty: 20 }],
      horizon_days: 1,
      method: 'model',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://ml:8000/forecast',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.model_version).toBe('rf-v1');
    expect(res.forecast).toEqual([{ date: '2026-11-23', qty: 21.5 }]);
  });

  it('ném MlServiceError khi dịch vụ ML trả lỗi HTTP 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Error',
    }) as unknown as typeof fetch;

    const client = createClient();
    await expect(
      client.forecast({
        product_code: 'SP001',
        history: [{ date: '2026-11-22', qty: 20 }],
        horizon_days: 1,
        method: 'model',
      }),
    ).rejects.toBeInstanceOf(MlServiceError);
  });

  it('ném MlServiceError khi hết thời gian chờ (timeout)', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'TimeoutError';
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;

    const client = createClient(50);
    await expect(client.getModelInfo()).rejects.toBeInstanceOf(MlServiceError);
  });
});
