import { LlmExplanationInput } from '../domain/llm-guard';

export interface LlmChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Prompt v1 ràng buộc chặt LLM chỉ làm lớp trình bày bằng tiếng Việt (D-001, D-026).
 */
export const LLM_SYSTEM_PROMPT_V1 = [
  'Bạn là trợ lý diễn giải nghiệp vụ cho hệ thống quản lý kho hàng có hạn sử dụng.',
  'Vai trò của bạn CHỈ là viết đoạn giải thích ngắn gọn bằng tiếng Việt từ đúng số liệu JSON được cấp.',
  'QUY TẮC BẮT BUỘC:',
  '1. Trả về DUY NHẤT một đối tượng JSON hợp lệ theo dạng: {"explanation": string, "action": string, "numbers": object}.',
  '2. Trường "action" PHẢI nằm trong "allowed_actions" và trùng khớp chính xác với trường "phuong_an".',
  '3. Trường "numbers" chỉ chứa các số trích dẫn nguyên vẹn từ đầu vào (ton_luc_phan_tich, nhu_cau_phan_bo_duoc, tieu_thu_uoc_tinh, ton_du_uoc_tinh, luong_de_xuat, so_ngay_con_lai).',
  '4. Trong "explanation", CHỈ sử dụng đúng các con số và ngày có trong dữ liệu đầu vào. Tuyệt đối KHÔNG tự bịa số, KHÔNG đề xuất mức giá hay tỷ lệ giảm giá, KHÔNG thêm thông tin ngoài dữ liệu cung cấp.',
  '5. Đoạn "explanation" bằng tiếng Việt tự nhiên, rõ ràng, tối đa 1500 ký tự.',
].join('\n');

export function buildLlmMessages(input: LlmExplanationInput): LlmChatMessage[] {
  return [
    { role: 'system', content: LLM_SYSTEM_PROMPT_V1 },
    {
      role: 'user',
      content: `Hãy diễn giải đề xuất xử lý cho lô hàng theo dữ liệu sau:\n${JSON.stringify(input)}`,
    },
  ];
}
