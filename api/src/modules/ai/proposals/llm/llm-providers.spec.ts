import { LlmExplanationInput, validateLlmOutput } from '../domain/llm-guard';
import { LlmProviderError } from './llm-provider.interface';
import { MockProvider } from './mock.provider';
import { NoneProvider } from './none.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

describe('LLM Providers (none / mock / openai_compatible)', () => {
  const highInput: LlmExplanationInput = {
    ma_lo: 'L26101802',
    san_pham: 'SP002',
    han_su_dung: '2026-11-30',
    so_ngay_con_lai: 8,
    ton_luc_phan_tich: 392,
    nhu_cau_phan_bo_duoc: 141,
    tieu_thu_uoc_tinh: 141,
    ton_du_uoc_tinh: 251,
    muc_rui_ro: 'high',
    phuong_an: 'CONTACT_AGENCY',
    luong_de_xuat: 251,
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

  describe('MockProvider', () => {
    it('tất định, gắn [Mô phỏng] trong modelName và luôn vượt qua validateLlmOutput cho cả 3 nhánh', async () => {
      const provider = new MockProvider();
      const inputs: LlmExplanationInput[] = [
        highInput,
        {
          ...highInput,
          ma_lo: 'L26091802',
          han_su_dung: '2026-11-01',
          so_ngay_con_lai: -22,
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
          nhu_cau_phan_bo_duoc: 1108,
          tieu_thu_uoc_tinh: 1108,
          ton_du_uoc_tinh: 186,
          muc_rui_ro: 'medium',
          phuong_an: 'PRIORITIZE_FEFO',
          luong_de_xuat: 186,
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
      }
    });
  });

  describe('OpenAiCompatibleProvider', () => {
    it('gửi POST {LLM_BASE_URL}/chat/completions với response_format json_object và trích content', async () => {
      const mockContent = JSON.stringify({
        explanation: 'Lô L26101802 của SP002 còn 8 ngày, tồn dư 251 đơn vị.',
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 251, so_ngay_con_lai: 8 },
      });

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: mockContent } }],
        }),
      } as Response);

      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1/',
        apiKey: 'sk-secret-do-not-leak',
        model: 'gpt-4o-mini',
      });

      const result = await provider.explain(highInput, { timeoutMs: 5000 });

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
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages).toHaveLength(2);
      expect(result).toEqual({
        provider: 'openai_compatible',
        modelName: 'gpt-4o-mini',
        rawText: mockContent,
      });
    });

    it('không lộ LLM_API_KEY khi dịch vụ trả HTTP 401/500 hoặc quá thời gian chờ', async () => {
      const secretKey = 'sk-super-secret-xyz-987';
      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://llm.example.com/v1',
        apiKey: secretKey,
        model: 'gpt-4o-mini',
      });

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => `Invalid API key: ${secretKey}`,
      } as Response);

      let caughtHttp: unknown;
      try {
        await provider.explain(highInput, { timeoutMs: 5000 });
      } catch (err) {
        caughtHttp = err;
      }
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
  });
});
