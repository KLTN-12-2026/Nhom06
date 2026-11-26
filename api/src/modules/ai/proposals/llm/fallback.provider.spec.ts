import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateEnv } from '../../../../config/env.validation';
import { PrismaService } from '../../../../prisma/prisma.service';
import { createLlmProvider } from '../../ai.module';
import { LlmExplanationInput } from '../domain/llm-guard';
import { ProposalsLlmService } from '../proposals-llm.service';
import { FALLBACK_RETRY_DELAYS_MS, FallbackLlmProvider } from './fallback.provider';
import {
  LlmExplainOptions,
  LlmProvider,
  LlmProviderError,
  PROMPT_VERSION,
} from './llm-provider.interface';
import { MockProvider } from './mock.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

describe('FallbackLlmProvider — provider dự phòng tùy chọn (T-030 lượt 2, AC6–AC7)', () => {
  const PRIMARY_URL = 'https://api.deepseek.com';
  const FALLBACK_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
  const PRIMARY_MODEL = 'deepseek-flash';
  const FALLBACK_MODEL = 'gemini-4-hydrogen';
  const PRIMARY_KEY = 'sk-primary-secret-never-log';
  const FALLBACK_KEY = 'sk-fallback-secret-never-log';

  const sampleInput: LlmExplanationInput = {
    ma_lo: 'L26101802',
    san_pham: 'SP002',
    ten_san_pham: 'Sữa chua uống TH true YOGURT 180ml lốc 4',
    don_vi_tinh: 'thùng',
    han_su_dung: '2026-12-04',
    so_ngay_con_lai: 8,
    ton_luc_phan_tich: 1294,
    nhu_cau_phan_bo_duoc: 52.37,
    tieu_thu_uoc_tinh: 52.37,
    ton_du_uoc_tinh: 1241.63,
    muc_rui_ro: 'high',
    phuong_an: 'CONTACT_AGENCY',
    luong_de_xuat: 1241.63,
    allowed_actions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
  };

  const validContent = JSON.stringify({
    explanation:
      'Lô L26101802 của sản phẩm Sữa chua uống TH true YOGURT 180ml lốc 4 có hạn sử dụng 04/12/2026 (còn 8 ngày) và tồn 1.294 thùng. Nhu cầu phân bổ được là 52,37 thùng, tồn dư ước tính 1.241,63 thùng ở mức rủi ro nguy cấp; cần liên hệ đại lý đẩy hàng.',
    action: 'CONTACT_AGENCY',
    numbers: {
      ton_luc_phan_tich: 1294,
      nhu_cau_phan_bo_duoc: 52.37,
      tieu_thu_uoc_tinh: 52.37,
      ton_du_uoc_tinh: 1241.63,
      luong_de_xuat: 1241.63,
      so_ngay_con_lai: 8,
    },
  });

  function createServiceWithProvider(provider: FallbackLlmProvider | OpenAiCompatibleProvider) {
    const createdAt = new Date('2026-11-27T00:00:00.000Z');
    const persistedRows: Array<Record<string, unknown>> = [];
    const fakePrisma = {
      llmExplanation: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          persistedRows.push(data);
          return {
            id: `exp-${persistedRows.length}`,
            createdAt,
            ...data,
          };
        }),
      },
    } as unknown as PrismaService;

    const fakeConfig = {
      get: (key: string) => {
        if (key === 'LLM_TIMEOUT_MS') return 30_000;
        if (key === 'LLM_API_KEY') return PRIMARY_KEY;
        if (key === 'LLM_FALLBACK_API_KEY') return FALLBACK_KEY;
        return undefined;
      },
    } as unknown as ConfigService;

    return {
      service: new ProposalsLlmService(fakePrisma, fakeConfig, provider),
      persistedRows,
    };
  }

  function createFallbackPair(options?: {
    primaryApiKey?: string;
    onSleep?: (ms: number) => void;
    now?: () => number;
  }) {
    let clock = 0;
    const now = options?.now ?? (() => clock);
    const sleep = async (ms: number) => {
      options?.onSleep?.(ms);
      clock += ms;
    };

    const primary = new OpenAiCompatibleProvider({
      baseUrl: PRIMARY_URL,
      apiKey: options?.primaryApiKey ?? PRIMARY_KEY,
      model: PRIMARY_MODEL,
      now,
      sleep,
    });
    const fallback = new OpenAiCompatibleProvider({
      baseUrl: FALLBACK_URL,
      apiKey: FALLBACK_KEY,
      model: FALLBACK_MODEL,
      retryDelaysMs: FALLBACK_RETRY_DELAYS_MS,
      now,
      sleep,
    });

    return new FallbackLlmProvider(primary, fallback, FALLBACK_MODEL);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('kịch bản 1: chính 503 hết retry (3 lượt), dự phòng 200 → valid, lưu modelName=gemini-4-hydrogen và log không lộ key', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const delays: number[] = [];

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(PRIMARY_URL)) {
        return { ok: false, status: 503 } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: validContent } }] }),
      } as Response;
    });

    const provider = createFallbackPair({ onSleep: (ms) => delays.push(ms) });
    const { service, persistedRows } = createServiceWithProvider(provider);

    const view = await service.explainAndPersist('prop-1', sampleInput);

    expect(view.status).toBe('valid');
    expect(view.modelName).toBe(FALLBACK_MODEL);
    expect(view.provider).toBe('openai_compatible');
    expect(view.promptVersion).toBe(PROMPT_VERSION);
    expect(persistedRows).toHaveLength(1);
    expect(persistedRows[0].modelName).toBe(FALLBACK_MODEL);
    expect(persistedRows[0].validationStatus).toBe('valid');

    // Chính gọi 3 lượt (2 retry: 2s, 4s) rồi dự phòng gọi 1 lượt
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([2_000, 4_000]);

    const logged = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(
      logged.some((line) => line.includes(`Chuyển sang dự phòng ${FALLBACK_MODEL} sau lỗi HTTP 503`)),
    ).toBe(true);
    for (const line of logged) {
      expect(line).not.toContain(PRIMARY_KEY);
      expect(line).not.toContain(FALLBACK_KEY);
    }
  });

  it('kịch bản 2: chính 404 (sai model) không retry, dự phòng 200 (có retry tối đa 1 lần khi 503) → valid, modelName=gemini-4-hydrogen', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    let fallbackCalls = 0;

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(PRIMARY_URL)) {
        return { ok: false, status: 404 } as Response;
      }
      fallbackCalls += 1;
      if (fallbackCalls === 1) {
        return { ok: false, status: 503 } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: validContent } }] }),
      } as Response;
    });

    const provider = createFallbackPair();
    const { service, persistedRows } = createServiceWithProvider(provider);

    const view = await service.explainAndPersist('prop-2', sampleInput);

    expect(view.status).toBe('valid');
    expect(view.modelName).toBe(FALLBACK_MODEL);
    expect(persistedRows[0].modelName).toBe(FALLBACK_MODEL);
    // 1 lần chính (404 không retry) + 2 lần dự phòng (503 → 200)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fallbackCalls).toBe(2);

    const logged = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(
      logged.some((line) => line.includes(`Chuyển sang dự phòng ${FALLBACK_MODEL} sau lỗi HTTP 404`)),
    ).toBe(true);
  });

  it('kịch bản 2b: chính CONFIG_ERROR (thiếu key chính) vẫn chuyển sang dự phòng nếu dự phòng đủ cấu hình', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: validContent } }] }),
    } as Response);

    const provider = createFallbackPair({ primaryApiKey: '' });
    const { service } = createServiceWithProvider(provider);

    const view = await service.explainAndPersist('prop-2b', sampleInput);
    expect(view.status).toBe('valid');
    expect(view.modelName).toBe(FALLBACK_MODEL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${FALLBACK_URL}/chat/completions`);
    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes(`Chuyển sang dự phòng ${FALLBACK_MODEL} sau lỗi CONFIG_ERROR`),
      ),
    ).toBe(true);
  });

  it('kịch bản 3: chính lỗi (503 ×3) và dự phòng cũng lỗi (503 ×2, tối đa 1 retry) → rơi về tóm tắt quy tắc (failed)', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const delays: number[] = [];

    let primaryCalls = 0;
    let fallbackCalls = 0;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(PRIMARY_URL)) {
        primaryCalls += 1;
      } else {
        fallbackCalls += 1;
      }
      return { ok: false, status: 503 } as Response;
    });

    const provider = createFallbackPair({ onSleep: (ms) => delays.push(ms) });
    const { service, persistedRows } = createServiceWithProvider(provider);

    const view = await service.explainAndPersist('prop-3', sampleInput);

    expect(view.status).toBe('failed');
    expect(view.text).toBeNull();
    expect(view.modelName).toBe(FALLBACK_MODEL);
    expect(view.errorMessage).toContain('HTTP 503');
    expect(persistedRows[0].validationStatus).toBe('failed');
    expect(primaryCalls).toBe(3);
    expect(fallbackCalls).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    // Chính ngủ 2s + 4s; dự phòng ngủ tối đa 1 lần 2s
    expect(delays).toEqual([2_000, 4_000, 2_000]);
  });

  it('kịch bản 4: chính trả đầu ra sai rào chắn (invalid) → KHÔNG gọi dự phòng', async () => {
    const invalidContent = JSON.stringify({
      explanation:
        'Lô L26101802 của sản phẩm Sữa chua uống TH true YOGURT 180ml lốc 4 cần đẩy gấp 9999 thùng.',
      action: 'CONTACT_AGENCY',
      numbers: { ton_du_uoc_tinh: 1241.63 },
    });

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: invalidContent } }] }),
    } as Response);

    const provider = createFallbackPair();
    const { service, persistedRows } = createServiceWithProvider(provider);

    const view = await service.explainAndPersist('prop-4', sampleInput);

    expect(view.status).toBe('invalid');
    expect(view.text).toBeNull();
    expect(view.modelName).toBe(PRIMARY_MODEL);
    expect(persistedRows[0].modelName).toBe(PRIMARY_MODEL);
    expect(persistedRows[0].validationStatus).toBe('invalid');
    // Chỉ gọi duy nhất provider chính, tuyệt đối không gọi dự phòng
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${PRIMARY_URL}/chat/completions`);
  });

  it('kịch bản 5: không cấu hình đủ 3 biến dự phòng → hành vi như cũ; cấu hình đủ → dùng FallbackLlmProvider; env validation cho phép tùy chọn', async () => {
    const makeConfig = (values: Record<string, string>) =>
      ({
        get: (key: string) => values[key],
      }) as unknown as ConfigService;

    // Không cấu hình dự phòng → trả trực tiếp OpenAiCompatibleProvider
    const withoutFallback = createLlmProvider(
      makeConfig({
        LLM_PROVIDER: 'openai_compatible',
        LLM_BASE_URL: PRIMARY_URL,
        LLM_API_KEY: PRIMARY_KEY,
        LLM_MODEL: PRIMARY_MODEL,
      }),
    );
    expect(withoutFallback).toBeInstanceOf(OpenAiCompatibleProvider);

    // Thiếu 1 trong 3 biến dự phòng (thiếu LLM_FALLBACK_API_KEY) → vẫn như cũ
    const partialFallback = createLlmProvider(
      makeConfig({
        LLM_PROVIDER: 'openai_compatible',
        LLM_BASE_URL: PRIMARY_URL,
        LLM_API_KEY: PRIMARY_KEY,
        LLM_MODEL: PRIMARY_MODEL,
        LLM_FALLBACK_BASE_URL: FALLBACK_URL,
        LLM_FALLBACK_MODEL: FALLBACK_MODEL,
        LLM_FALLBACK_API_KEY: '',
      }),
    );
    expect(partialFallback).toBeInstanceOf(OpenAiCompatibleProvider);

    // Đủ 3 biến dự phòng → trả về FallbackLlmProvider
    const withFallback = createLlmProvider(
      makeConfig({
        LLM_PROVIDER: 'openai_compatible',
        LLM_BASE_URL: PRIMARY_URL,
        LLM_API_KEY: PRIMARY_KEY,
        LLM_MODEL: PRIMARY_MODEL,
        LLM_FALLBACK_BASE_URL: FALLBACK_URL,
        LLM_FALLBACK_MODEL: FALLBACK_MODEL,
        LLM_FALLBACK_API_KEY: FALLBACK_KEY,
      }),
    );
    expect(withFallback).toBeInstanceOf(FallbackLlmProvider);

    // LLM_PROVIDER=mock bỏ qua biến dự phòng
    const mockProvider = createLlmProvider(
      makeConfig({
        LLM_PROVIDER: 'mock',
        LLM_FALLBACK_BASE_URL: FALLBACK_URL,
        LLM_FALLBACK_MODEL: FALLBACK_MODEL,
        LLM_FALLBACK_API_KEY: FALLBACK_KEY,
      }),
    );
    expect(mockProvider).toBeInstanceOf(MockProvider);

    // Kiểm tra env.validation.ts chấp nhận cả có và không có 3 biến dự phòng
    const baseEnv = {
      DATABASE_URL: 'postgresql://kho_ai:dev@db:5432/kho_ai_test?schema=public',
      JWT_SECRET: 'test-secret',
      ML_SERVICE_URL: 'http://ml:8000',
    };
    const envWithoutFallback = validateEnv(baseEnv);
    expect(envWithoutFallback.LLM_FALLBACK_BASE_URL).toBe('');
    expect(envWithoutFallback.LLM_FALLBACK_MODEL).toBe('');
    expect(envWithoutFallback.LLM_FALLBACK_API_KEY).toBe('');

    const envWithFallback = validateEnv({
      ...baseEnv,
      LLM_FALLBACK_BASE_URL: FALLBACK_URL,
      LLM_FALLBACK_MODEL: FALLBACK_MODEL,
      LLM_FALLBACK_API_KEY: 'placeholder',
    });
    expect(envWithFallback.LLM_FALLBACK_BASE_URL).toBe(FALLBACK_URL);
    expect(envWithFallback.LLM_FALLBACK_MODEL).toBe(FALLBACK_MODEL);
  });

  describe('LLM_FALLBACK_TIMEOUT_MS — thời gian chờ riêng cho nhánh dự phòng (T-031)', () => {
    it('có fallbackTimeoutMs = 60000 → dự phòng nhận timeoutMs = 60000, model chính vẫn nhận LLM_TIMEOUT_MS', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const primaryExplain = jest
        .fn<ReturnType<LlmProvider['explain']>, [LlmExplanationInput, LlmExplainOptions]>()
        .mockRejectedValueOnce(
          new LlmProviderError('Hết thời gian chờ', {
            provider: 'openai_compatible',
            modelName: PRIMARY_MODEL,
            code: 'TIMEOUT',
          }),
        );
      const fallbackExplain = jest
        .fn<ReturnType<LlmProvider['explain']>, [LlmExplanationInput, LlmExplainOptions]>()
        .mockResolvedValueOnce({
          provider: 'openai_compatible',
          modelName: FALLBACK_MODEL,
          rawText: validContent,
        });

      const primary: LlmProvider = {
        providerName: 'openai_compatible',
        explain: primaryExplain,
      };
      const fallback: LlmProvider = {
        providerName: 'openai_compatible',
        explain: fallbackExplain,
      };

      const provider = new FallbackLlmProvider(primary, fallback, FALLBACK_MODEL, 60_000);
      const result = await provider.explain(sampleInput, { timeoutMs: 30_000 });

      expect(result.modelName).toBe(FALLBACK_MODEL);
      expect(primaryExplain).toHaveBeenCalledWith(sampleInput, { timeoutMs: 30_000 });
      expect(fallbackExplain).toHaveBeenCalledWith(sampleInput, { timeoutMs: 60_000 });
    });

    it('không đặt fallbackTimeoutMs → dự phòng nhận LLM_TIMEOUT_MS như cũ', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const primaryExplain = jest
        .fn<ReturnType<LlmProvider['explain']>, [LlmExplanationInput, LlmExplainOptions]>()
        .mockRejectedValueOnce(
          new LlmProviderError('HTTP 503', {
            provider: 'openai_compatible',
            modelName: PRIMARY_MODEL,
            code: 'HTTP_ERROR',
            httpStatus: 503,
          }),
        );
      const fallbackExplain = jest
        .fn<ReturnType<LlmProvider['explain']>, [LlmExplanationInput, LlmExplainOptions]>()
        .mockResolvedValueOnce({
          provider: 'openai_compatible',
          modelName: FALLBACK_MODEL,
          rawText: validContent,
        });

      const primary: LlmProvider = {
        providerName: 'openai_compatible',
        explain: primaryExplain,
      };
      const fallback: LlmProvider = {
        providerName: 'openai_compatible',
        explain: fallbackExplain,
      };

      const provider = new FallbackLlmProvider(primary, fallback, FALLBACK_MODEL);
      await provider.explain(sampleInput, { timeoutMs: 30_000 });

      expect(primaryExplain).toHaveBeenCalledWith(sampleInput, { timeoutMs: 30_000 });
      expect(fallbackExplain).toHaveBeenCalledWith(sampleInput, { timeoutMs: 30_000 });
    });

    it('createLlmProvider đọc đúng LLM_FALLBACK_TIMEOUT_MS (số, chuỗi số, chuỗi rỗng, không đặt)', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const baseValues: Record<string, unknown> = {
        LLM_PROVIDER: 'openai_compatible',
        LLM_BASE_URL: PRIMARY_URL,
        LLM_API_KEY: PRIMARY_KEY,
        LLM_MODEL: PRIMARY_MODEL,
        LLM_FALLBACK_BASE_URL: FALLBACK_URL,
        LLM_FALLBACK_MODEL: FALLBACK_MODEL,
        LLM_FALLBACK_API_KEY: FALLBACK_KEY,
      };

      const runWithTimeoutConfig = async (rawTimeout: unknown) => {
        const receivedTimeouts: number[] = [];
        const explainSpy = jest
          .spyOn(OpenAiCompatibleProvider.prototype, 'explain')
          .mockImplementationOnce(async (_input, opts) => {
            receivedTimeouts.push(opts.timeoutMs);
            throw new LlmProviderError('HTTP 503', {
              provider: 'openai_compatible',
              modelName: PRIMARY_MODEL,
              code: 'HTTP_ERROR',
              httpStatus: 503,
            });
          })
          .mockImplementationOnce(async (_input, opts) => {
            receivedTimeouts.push(opts.timeoutMs);
            return {
              provider: 'openai_compatible',
              modelName: FALLBACK_MODEL,
              rawText: validContent,
            };
          });

        const config = {
          get: (key: string) =>
            key === 'LLM_FALLBACK_TIMEOUT_MS' ? rawTimeout : baseValues[key],
        } as unknown as ConfigService;

        const provider = createLlmProvider(config);
        expect(provider).toBeInstanceOf(FallbackLlmProvider);
        await provider.explain(sampleInput, { timeoutMs: 30_000 });
        explainSpy.mockRestore();
        return receivedTimeouts;
      };

      expect(await runWithTimeoutConfig(60_000)).toEqual([30_000, 60_000]);
      expect(await runWithTimeoutConfig('60000')).toEqual([30_000, 60_000]);
      expect(await runWithTimeoutConfig('')).toEqual([30_000, 30_000]);
      expect(await runWithTimeoutConfig('   ')).toEqual([30_000, 30_000]);
      expect(await runWithTimeoutConfig(undefined)).toEqual([30_000, 30_000]);
    });

    it('validateEnv chấp nhận LLM_FALLBACK_TIMEOUT_MS tùy chọn, chuỗi rỗng và số nguyên >= 1000; từ chối giá trị sai', () => {
      const baseEnv = {
        DATABASE_URL: 'postgresql://kho_ai:dev@db:5432/kho_ai_test?schema=public',
        JWT_SECRET: 'test-secret',
        ML_SERVICE_URL: 'http://ml:8000',
      };

      expect(validateEnv(baseEnv).LLM_FALLBACK_TIMEOUT_MS).toBeUndefined();
      expect(
        validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: '' }).LLM_FALLBACK_TIMEOUT_MS,
      ).toBeUndefined();
      expect(
        validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: '   ' }).LLM_FALLBACK_TIMEOUT_MS,
      ).toBeUndefined();
      expect(
        validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: '60000' }).LLM_FALLBACK_TIMEOUT_MS,
      ).toBe(60_000);
      expect(
        validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: 60_000 }).LLM_FALLBACK_TIMEOUT_MS,
      ).toBe(60_000);

      expect(() => validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: '500' })).toThrow();
      expect(() => validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: 'abc' })).toThrow();
      expect(() => validateEnv({ ...baseEnv, LLM_FALLBACK_TIMEOUT_MS: '1200.5' })).toThrow();
    });
  });
});
