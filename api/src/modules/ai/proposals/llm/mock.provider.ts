import { LlmExplanationInput } from '../domain/llm-guard';
import { buildLlmDisplayContext } from './format-vi';
import { LlmExplainOptions, LlmExplainResult, LlmProvider } from './llm-provider.interface';

const MOCK_MODEL_NAME = 'kho-ai-mock-v2 [Mô phỏng]';

function lowercaseFirst(text: string): string {
  if (!text) {
    return text;
  }
  return text.charAt(0).toLocaleLowerCase('vi-VN') + text.slice(1);
}

/**
 * Provider giả lập tất định (v2) để demo và kiểm thử không cần khóa API bên ngoài.
 * Dùng trực tiếp khối `hien_thi` (tên sản phẩm, đơn vị tính, ngày dd/MM/yyyy, số vi-VN, nhãn tiếng Việt)
 * để đoạn diễn giải nhất quán với prompt v2 và luôn vượt qua rào chắn validateLlmOutput.
 */
export class MockProvider implements LlmProvider {
  readonly providerName = 'mock';

  async explain(
    input: LlmExplanationInput,
    _options: LlmExplainOptions,
  ): Promise<LlmExplainResult> {
    const display = buildLlmDisplayContext(input);
    const riskLabel = lowercaseFirst(display.muc_rui_ro);
    const actionLabel = lowercaseFirst(display.phuong_an);

    let explanation: string;
    if (input.phuong_an === 'DISPOSE') {
      const expiryClause =
        input.so_ngay_con_lai < 0
          ? `đã hết hạn ngày ${display.han_su_dung} (${display.trang_thai_han})`
          : `chạm ngưỡng hết hạn ngày ${display.han_su_dung} (${display.trang_thai_han})`;

      explanation =
        `Lô ${input.ma_lo} của sản phẩm ${display.ten_san_pham} ${expiryClause} và đang còn tồn ${display.ton_luc_phan_tich}. ` +
        `Lô không đủ điều kiện phân bổ bán ra (nhu cầu phân bổ được ${display.nhu_cau_phan_bo_duoc}), toàn bộ ${display.ton_du_uoc_tinh} là tồn dư ở mức rủi ro ${riskLabel}. ` +
        `Phương án đề xuất là ${actionLabel} cho ${display.luong_de_xuat} để tách khỏi hàng hợp lệ trong kho.`;
    } else if (input.phuong_an === 'CONTACT_AGENCY') {
      explanation =
        `Lô ${input.ma_lo} của sản phẩm ${display.ten_san_pham} có hạn sử dụng ngày ${display.han_su_dung} (${display.trang_thai_han}) và hiện tồn ${display.ton_luc_phan_tich}. ` +
        `Sau khi trừ các lô hết hạn sớm hơn, nhu cầu dự báo phân bổ được cho lô này chỉ đạt ${display.nhu_cau_phan_bo_duoc}, ước tính còn dư ${display.ton_du_uoc_tinh} ở mức rủi ro ${riskLabel}. ` +
        `Thời gian còn lại ngắn nên chờ đơn tự nhiên sẽ không kịp, phương án khả thi nhất là ${actionLabel} cho lượng đề xuất ${display.luong_de_xuat}.`;
    } else {
      explanation =
        `Lô ${input.ma_lo} của sản phẩm ${display.ten_san_pham} có hạn sử dụng ngày ${display.han_su_dung} (${display.trang_thai_han}) với tồn lúc phân tích là ${display.ton_luc_phan_tich}. ` +
        `Nhu cầu dự báo phân bổ được cho lô là ${display.nhu_cau_phan_bo_duoc}, ước tính còn dư ${display.ton_du_uoc_tinh} ở mức rủi ro ${riskLabel}. ` +
        `Phương án phù hợp là ${actionLabel} cho ${display.luong_de_xuat} và theo dõi sát tốc độ tiêu thụ trong các kỳ tiếp theo.`;
    }

    const payload = {
      explanation,
      action: input.phuong_an,
      numbers: {
        ton_luc_phan_tich: input.ton_luc_phan_tich,
        nhu_cau_phan_bo_duoc: input.nhu_cau_phan_bo_duoc,
        tieu_thu_uoc_tinh: input.tieu_thu_uoc_tinh,
        ton_du_uoc_tinh: input.ton_du_uoc_tinh,
        luong_de_xuat: input.luong_de_xuat,
        so_ngay_con_lai: input.so_ngay_con_lai,
      },
    };

    return {
      provider: this.providerName,
      modelName: MOCK_MODEL_NAME,
      rawText: JSON.stringify(payload),
    };
  }
}
