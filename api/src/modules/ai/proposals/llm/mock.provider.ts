import { LlmExplanationInput } from '../domain/llm-guard';
import { formatIsoDateVi, formatNumberVi } from '../domain/rules';
import { LlmExplainOptions, LlmExplainResult, LlmProvider } from './llm-provider.interface';

const MOCK_MODEL_NAME = 'kho-ai-mock-v1 [Mô phỏng]';

/**
 * Provider giả lập tất định để demo và kiểm thử không cần khóa API bên ngoài.
 * Mọi con số đều lấy trực tiếp từ LlmExplanationInput để luôn vượt qua rào chắn validateLlmOutput.
 */
export class MockProvider implements LlmProvider {
  readonly providerName = 'mock';

  async explain(
    input: LlmExplanationInput,
    _options: LlmExplainOptions,
  ): Promise<LlmExplainResult> {
    const onHand = formatNumberVi(input.ton_luc_phan_tich);
    const allocated = formatNumberVi(input.nhu_cau_phan_bo_duoc);
    const surplus = formatNumberVi(input.ton_du_uoc_tinh);
    const expiryVi = formatIsoDateVi(input.han_su_dung);

    let explanation: string;
    if (input.phuong_an === 'DISPOSE') {
      const overdueText =
        input.so_ngay_con_lai < 0
          ? `đã quá hạn ${Math.abs(input.so_ngay_con_lai)} ngày so với ngày ${expiryVi}`
          : `chạm ngưỡng hết hạn ngày ${expiryVi} (còn ${input.so_ngay_con_lai} ngày)`;

      explanation =
        `Lô ${input.ma_lo} của sản phẩm ${input.san_pham} ${overdueText} và đang còn tồn ${onHand} đơn vị. ` +
        `Lô không đủ điều kiện phân bổ bán ra (nhu cầu phân bổ ${allocated}), toàn bộ ${surplus} đơn vị là tồn dư ở mức hết hạn. ` +
        `Phương án theo quy tắc là loại bỏ và lập biên bản huỷ ${surplus} đơn vị để tách khỏi hàng hợp lệ trong kho.`;
    } else if (input.phuong_an === 'CONTACT_AGENCY') {
      explanation =
        `Lô ${input.ma_lo} của sản phẩm ${input.san_pham} còn ${input.so_ngay_con_lai} ngày trước hạn ${expiryVi} và đang tồn ${onHand} đơn vị. ` +
        `Nhu cầu dự báo phân bổ được cho lô này sau khi trừ các lô hết hạn sớm hơn chỉ còn ${allocated} đơn vị, để lại khoảng ${surplus} đơn vị có nguy cơ không kịp tiêu thụ ở mức rủi ro nguy cấp. ` +
        `Với ${input.so_ngay_con_lai} ngày còn lại thì chờ đơn đến là không kịp, nên phương án khả thi nhất là chủ động liên hệ đại lý đẩy hàng cho lượng đề xuất ${surplus} đơn vị.`;
    } else {
      explanation =
        `Lô ${input.ma_lo} của sản phẩm ${input.san_pham} còn ${input.so_ngay_con_lai} ngày trước hạn ${expiryVi} với tồn lúc phân tích là ${onHand} đơn vị. ` +
        `Nhu cầu dự báo phân bổ được vào lô là ${allocated} đơn vị, ước tính còn dư ${surplus} đơn vị ở mức rủi ro trung bình. ` +
        `Phương án phù hợp là ưu tiên xuất theo FEFO cho ${surplus} đơn vị tồn dư ước tính và theo dõi sát tốc độ tiêu thụ trong các kỳ tiếp theo.`;
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
