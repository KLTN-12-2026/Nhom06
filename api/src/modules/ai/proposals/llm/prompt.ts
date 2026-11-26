import { LlmExplanationInput } from '../domain/llm-guard';
import { buildLlmDisplayContext } from './format-vi';

export interface LlmChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Prompt v2 ràng buộc chặt LLM chỉ làm lớp trình bày bằng tiếng Việt tự nhiên (D-001, D-026, T-030).
 */
export const LLM_SYSTEM_PROMPT_V2 = [
  'Bạn là trợ lý diễn giải nghiệp vụ cho hệ thống quản lý kho hàng có hạn sử dụng.',
  'Vai trò của bạn CHỈ là viết đoạn giải thích ngắn gọn bằng tiếng Việt tự nhiên như người quản lý kho viết, dựa trên đúng số liệu JSON được cấp.',
  'QUY TẮC BẮT BUỘC:',
  '1. Trả về DUY NHẤT một đối tượng JSON hợp lệ theo dạng: {"explanation": string, "action": string, "numbers": object}.',
  '2. Trường "action" PHẢI giữ nguyên mã enum nằm trong "allowed_actions" và trùng khớp chính xác với trường "phuong_an".',
  '3. Trường "numbers" PHẢI giữ nguyên các giá trị số gốc trích từ đầu vào (ton_luc_phan_tich, nhu_cau_phan_bo_duoc, tieu_thu_uoc_tinh, ton_du_uoc_tinh, luong_de_xuat, so_ngay_con_lai).',
  '4. Trong "explanation", viết tiếng Việt tự nhiên, nhắc tên sản phẩm bằng tên tiếng Việt (ten_san_pham), và CHỈ dùng các nhãn tiếng Việt, ngày dd/MM/yyyy và số liệu kèm đơn vị trong khối "hien_thi" khi nói về mức rủi ro, phương án, hạn sử dụng, số ngày và số lượng.',
  '5. Trong "explanation", TUYỆT ĐỐI KHÔNG viết mã tiếng Anh hoặc mã enum (như high, critical, medium, low, DISPOSE, CONTACT_AGENCY, PRIORITIZE_FEFO, RETURN_TO_SUPPLIER, CONSIDER_PROMOTION), KHÔNG viết tên trường JSON, KHÔNG viết ngày ISO (YYYY-MM-DD) và KHÔNG viết số kiểu Anh (dấu chấm làm dấu thập phân).',
  '6. Trong "explanation", CHỈ sử dụng đúng các con số và ngày có trong dữ liệu đầu vào. Tuyệt đối KHÔNG tự bịa số, KHÔNG tự làm tròn khác giá trị gốc, KHÔNG đề xuất mức giá hay tỷ lệ giảm giá, KHÔNG thêm thông tin ngoài dữ liệu cung cấp.',
  '7. Đoạn "explanation" mạch lạc, rõ ràng, tối đa 1500 ký tự.',
].join('\n');

export function buildLlmMessages(input: LlmExplanationInput): LlmChatMessage[] {
  const promptPayload = {
    ...input,
    hien_thi: buildLlmDisplayContext(input),
  };

  return [
    { role: 'system', content: LLM_SYSTEM_PROMPT_V2 },
    {
      role: 'user',
      content: `Hãy diễn giải đề xuất xử lý cho lô hàng theo dữ liệu sau:\n${JSON.stringify(promptPayload)}`,
    },
  ];
}
