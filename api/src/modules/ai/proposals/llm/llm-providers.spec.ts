import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LlmExplanationInput, validateLlmOutput } from '../domain/llm-guard';
import { ProposalsLlmService } from '../proposals-llm.service';
import { LlmProviderError, PROMPT_VERSION } from './llm-provider.interface';
import { MockProvider } from './mock.provider';
import { NoneProvider } from './none.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

describe('LLM Providers (none / mock / openai_compatible + retry T-030)', () => {
  const highInput: LlmExplanationInput = {
    ma_lo: 'L26101802',
    san_pham: 'SP002',
    ten_san_pham: 'Sữa chua uống TH true YOGURT 180ml lốc 4',
    don_vi_tinh: 'thùng',
    han_su_dung: '2026-12-04',
    so_ngay_con_lai: 8,
    ton_luc_phan_tich: 392,
    nhu_cau_phan_bo_duoc: 52.37,
    tieu_thu_uoc_tinh: 52.37,
    ton_du_uoc_tinh: 339.63,
    muc_rui_ro: 'high',
    phuong_an: 'CONTACT_AGENCY',
    luong_de_xuat: 339.63,
    allowed_actions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('NoneProvider', () => {
    it('không gọi mạng và ném LlmProviderError(DISABLED)', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      const provider = new NoneProvider();

      await expect(provider.explain(highInput, { timeoutMs: 5000 })).rejects.toMatchObject({
        name: 'LlmProviderError',
        code: 'DISABLED',
        provider: 'none',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('MockProvider (v2)', () => {
    it('tất định, dùng nhãn tiếng Việt + đơn vị từ hien_thi, gắn [Mô phỏng] và luôn vượt qua validateLlmOutput cho cả 3 nhánh', async () => {
      const provider = new MockProvider();
      const inputs: LlmExplanationInput[] = [
        highInput,
        {
          ...highInput,
          ma_lo: 'L26091802',
          han_su_dung: '2026-10-04',
          so_ngay_con_lai: -53,
          ton_luc_phan_tich: 313,
          nhu_cau_phan_bo_duoc: 0,
          tieu_thu_uoc_tinh: 0,
          ton_du_uoc_tinh: 313,
          muc_rui_ro: 'critical',
          phuong_an: 'DISPOSE',
          luong_de_xuat: 313,
          allowed_actions: ['DISPOSE', 'RETURN_TO_SUPPLIER'],
        },
        {
          ...highInput,
          ma_lo: 'L26111802',
          han_su_dung: '2026-12-31',
          so_ngay_con_lai: 39,
          ton_luc_phan_tich: 1294,
          nhu_cau_phan_bo_duoc: 1108.5,
          tieu_thu_uoc_tinh: 1108.5,
          ton_du_uoc_tinh: 185.5,
          muc_rui_ro: 'medium',
          phuong_an: 'PRIORITIZE_FEFO',
          luong_de_xuat: 185.5,
          allowed_actions: ['PRIORITIZE_FEFO', 'CONTACT_AGENCY', 'CONSIDER_PROMOTION'],
        },
      ];

      for (const input of inputs) {
        const res1 = await provider.explain(input, { timeoutMs: 5000 });
        const res2 = await provider.explain(input, { timeoutMs: 5000 });

        expect(res1).toEqual(res2);
        expect(res1.provider).toBe('mock');
        expect(res1.modelName).toContain('[Mô phỏng]');

        const check = validateLlmOutput(res1.rawText, input);
        expect(check.status).toBe('valid');
        expect(check.errors).toEqual([]);
        expect(check.explanation).toContain(input.ten_san_pham);
        expect(check.explanation).toContain(input.don_vi_tinh);
        // Không lộ mã enum hay ngày ISO trong đoạn diễn giải
        expect(check.explanation).not.toMatch(
          /\b(high|critical|medium|low|DISPOSE|CONTACT_AGENCY|PRIORITIZE_FEFO)\b/,
        );
        expect(check.explanation).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
      }
    });
  });

  describe('OpenAiCompatibleProvider', () => {
    const validMockContent = JSON.stringify({
      explanation:
        'Lô L26101802 của sản phẩm Sữa chua uống TH true YOGURT 180ml lốc 4 còn 8 ngày trước hạn 04/12/2026, nhu cầu phân bổ được 52,37 thùng, tồn dư 339,63 thùng ở mức rủi ro nguy cấp.',
      action: 'CONTACT_AGENCY',
      numbers: {
        ton_luc_phan_tich: 392,
        nhu_cau_phan_bo_duoc: 52.37,
        ton_du_uoc_tinh: 339.63,
        so_ngay_con_lai: 8,
      },
    });

    it('gửi POST {LLM_BASE_URL}/chat/completions với prompt v2 (có khối hien_thi) và response_format json_object', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: validMockContent } }],
        }),
      } as Response);

      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1/',
        apiKey: 'sk-secret-do-not-leak',
        model: 'gemini-4-hydrogen',
      });

      const result = await provider.explain(highInput, { timeoutMs: 20_000 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://llm.example.com/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk-secret-do-not-leak',
      );
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        response_format: { type: string };
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.model).toBe('gemini-4-hydrogen');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages).toHaveLength(2);
      expect(body.messages[1].content).toContain('"hien_thi"');
      expect(body.messages[1].content).toContain('"52,37 thùng"');
      expect(body.messages[1].content).toContain('"04/12/2026"');
      expect(result).toEqual({
        provider: 'openai_compatible',
        modelName: 'gemini-4-hydrogen',
        rawText: validMockContent,
      });
    });

    it('không lộ LLM_API_KEY khi dịch vụ trả HTTP 401 hoặc quá thời gian chờ', async () => {
      const secretKey = 'sk-super-secret-xyz-987';
      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1',
        apiKey: secretKey,
        model: 'gemini-4-hydrogen',
        sleep: async () => undefined,
      });

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => `Invalid API key: ${secretKey}`,
      } as Response);

      let caughtHttp: unknown;
      try {
        await provider.explain(highInput, { timeoutMs: 20_000 });
      } catch (err) {
        caughtHttp = err;
      }
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(caughtHttp).toBeInstanceOf(LlmProviderError);
      expect((caughtHttp as LlmProviderError).code).toBe('HTTP_ERROR');
      expect((caughtHttp as LlmProviderError).message).not.toContain(secretKey);

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

      let caughtTimeout: unknown;
      try {
        await provider.explain(highInput, { timeoutMs: 1200 });
      } catch (err) {
        caughtTimeout = err;
      }
      expect(caughtTimeout).toBeInstanceOf(LlmProviderError);
      expect((caughtTimeout as LlmProviderError).code).toBe('TIMEOUT');
      expect((caughtTimeout as LlmProviderError).message).not.toContain(secretKey);
    });

    it('retry 503 → 200 thành công ở lượt 2, ghi log số lượt và không lộ key hay prompt', async () => {
      const secretKey = 'sk-retry-secret-must-not-appear';
      let fakeNow = 1_000;
      const delays: number[] = [];
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: validMockContent } }],
          }),
        } as Response);

      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: secretKey,
        model: 'gemini-4-hydrogen',
        now: () => fakeNow,
        sleep: async (ms) => {
          delays.push(ms);
          fakeNow += ms;
        },
      });

      const result = await provider.explain(highInput, { timeoutMs: 60_000 });
      expect(result.rawText).toBe(validMockContent);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(delays).toEqual([2_000]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = String(warnSpy.mock.calls[0][0]);
      expect(loggedMessage).toContain('gemini-4-hydrogen');
      expect(loggedMessage).toContain('lượt 2/3');
      expect(loggedMessage).toContain('HTTP 503');
      expect(loggedMessage).not.toContain(secretKey);
      expect(loggedMessage).not.toContain('Authorization');
      expect(loggedMessage).not.toContain(highInput.ten_san_pham);
    });

    it('retry 503 ×3 hết lượt ném LlmProviderError và ProposalsLlmService rơi về fallback (failed)', async () => {
      let fakeNow = 0;
      const delays: number[] = [];
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
      } as Response);

      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: 'sk-test-key',
        model: 'gemini-4-hydrogen',
        now: () => fakeNow,
        sleep: async (ms) => {
          delays.push(ms);
          fakeNow += ms;
        },
      });

      await expect(provider.explain(highInput, { timeoutMs: 60_000 })).rejects.toMatchObject({
        name: 'LlmProviderError',
        code: 'HTTP_ERROR',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(delays).toEqual([2_000, 4_000]);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(String(warnSpy.mock.calls[0][0])).toContain('lượt 2/3');
      expect(String(warnSpy.mock.calls[1][0])).toContain('lượt 3/3');

      // Kiểm chứng fallback ở ProposalsLlmService: không ném lỗi ra ngoài, lưu status='failed' và promptVersion='v2'
      const createdAt = new Date('2026-11-26T10:00:00.000Z');
      const createMock = jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'exp-fallback-1',
        createdAt,
        ...data,
      }));
      const fakePrisma = {
        llmExplanation: { create: createMock },
      } as unknown as PrismaService;
      const fakeConfig = {
        get: (key: string) => {
          if (key === 'LLM_TIMEOUT_MS') return 60_000;
          if (key === 'LLM_API_KEY') return 'sk-test-key';
          return undefined;
        },
      } as unknown as ConfigService;

      const service = new ProposalsLlmService(fakePrisma, fakeConfig, provider);
      const view = await service.explainAndPersist('proposal-1', highInput);
      expect(view.status).toBe('failed');
      expect(view.text).toBeNull();
      expect(view.promptVersion).toBe(PROMPT_VERSION);
      expect(view.errorMessage).toContain('HTTP 503');
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            promptVersion: 'v2',
            validationStatus: 'failed',
            inputSnapshot: highInput,
          }),
        }),
      );
    });

    it('retry 429 → 200 và lỗi mạng (ECONNRESET) → 200 thành công ở lượt 2', async () => {
      let fakeNow = 0;
      const delays: number[] = [];
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: validMockContent } }] }),
        } as Response);

      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1',
        apiKey: 'sk-test',
        model: 'gemini-4-hydrogen',
        now: () => fakeNow,
        sleep: async (ms) => {
          delays.push(ms);
          fakeNow += ms;
        },
      });

      const res429 = await provider.explain(highInput, { timeoutMs: 60_000 });
      expect(res429.rawText).toBe(validMockContent);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(delays).toEqual([2_000]);

      fetchSpy.mockClear();
      delays.length = 0;
      const netErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      fetchSpy.mockRejectedValueOnce(netErr).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: validMockContent } }] }),
      } as Response);

      const resNet = await provider.explain(highInput, { timeoutMs: 60_000 });
      expect(resNet.rawText).toBe(validMockContent);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(delays).toEqual([2_000]);
    });

    it('không thử lại với HTTP 400 và EMPTY_RESPONSE (fetch gọi đúng 1 lần)', async () => {
      const sleepSpy = jest.fn(async () => undefined);
      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1',
        apiKey: 'sk-test',
        model: 'gemini-4-hydrogen',
        sleep: sleepSpy,
      });

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as Response);

      await expect(provider.explain(highInput, { timeoutMs: 60_000 })).rejects.toMatchObject({
        code: 'HTTP_ERROR',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).not.toHaveBeenCalled();

      fetchSpy.mockClear();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '   ' } }] }),
      } as Response);

      await expect(provider.explain(highInput, { timeoutMs: 60_000 })).rejects.toMatchObject({
        code: 'EMPTY_RESPONSE',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    it('tổng thời gian không vượt LLM_TIMEOUT_MS và dừng thử lại khi không đủ tối thiểu 5s cho lượt kế', async () => {
      let fakeNow = 0;
      const delays: number[] = [];
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      // Tổng ngân sách 15s:
      // - Lượt 1 tốn 4s rồi trả 503 → còn 11s; chờ 2s còn 9s (>= 5s) → chạy lượt 2 lúc t=6s
      // - Lượt 2 tốn 3s rồi trả 503 → còn 6s; nếu chờ 4s chỉ còn 2s (< 5s) → dừng ngay không ngủ, không gọi lượt 3
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementationOnce(async () => {
          fakeNow += 4_000;
          return { ok: false, status: 503 } as Response;
        })
        .mockImplementationOnce(async () => {
          fakeNow += 3_000;
          return { ok: false, status: 503 } as Response;
        });

      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1',
        apiKey: 'sk-test',
        model: 'gemini-4-hydrogen',
        now: () => fakeNow,
        sleep: async (ms) => {
          delays.push(ms);
          fakeNow += ms;
        },
      });

      const totalBudgetMs = 15_000;
      await expect(provider.explain(highInput, { timeoutMs: totalBudgetMs })).rejects.toMatchObject(
        {
          code: 'HTTP_ERROR',
        },
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(delays).toEqual([2_000]);
      expect(fakeNow).toBe(9_000);
      expect(fakeNow).toBeLessThanOrEqual(totalBudgetMs);
    });
  });
});
