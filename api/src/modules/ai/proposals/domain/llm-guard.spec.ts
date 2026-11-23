import { Prisma } from '@prisma/client';
import { buildLlmInput, LlmExplanationInput, validateLlmOutput } from './llm-guard';

describe('llm-guard — buildLlmInput & validateLlmOutput (T-014 AC2, AC6)', () => {
  const sampleInput: LlmExplanationInput = {
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

  it('buildLlmInput chỉ chứa đúng 12 trường tối thiểu theo D-026 và không chứa tên người dùng hay đại lý', () => {
    const built = buildLlmInput({
      lotCode: 'L26101802',
      productCode: 'SP002',
      expiryDate: '2026-11-30',
      daysRemaining: 8,
      onHandSnapshot: new Prisma.Decimal('392.000'),
      allocatedDemand: new Prisma.Decimal('141.000'),
      estimatedConsumption: new Prisma.Decimal('141.000'),
      estimatedSurplus: new Prisma.Decimal('251.000'),
      riskLevel: 'high',
      actionType: 'CONTACT_AGENCY',
      proposedQty: new Prisma.Decimal('251.000'),
      allowedActions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
    });

    expect(Object.keys(built).sort()).toEqual(
      [
        'ma_lo',
        'san_pham',
        'han_su_dung',
        'so_ngay_con_lai',
        'ton_luc_phan_tich',
        'nhu_cau_phan_bo_duoc',
        'tieu_thu_uoc_tinh',
        'ton_du_uoc_tinh',
        'muc_rui_ro',
        'phuong_an',
        'luong_de_xuat',
        'allowed_actions',
      ].sort(),
    );
    expect(built).toEqual(sampleInput);
  });

  it('ca 1 (hợp lệ): chấp nhận JSON chuẩn có mã lô, mã SP, các con số khớp đầu vào và ngày 30/11/2026', () => {
    const raw = JSON.stringify({
      explanation:
        'Lô L26101802 của sản phẩm SP002 còn 8 ngày trước hạn 30/11/2026 với tồn 392 đơn vị. Nhu cầu phân bổ được là 141 đơn vị nên tồn dư ước tính 251 đơn vị ở mức nguy cấp; cần liên hệ đại lý đẩy hàng sớm.',
      action: 'CONTACT_AGENCY',
      numbers: {
        ton_luc_phan_tich: 392,
        nhu_cau_phan_bo_duoc: 141,
        tieu_thu_uoc_tinh: 141,
        ton_du_uoc_tinh: 251,
        luong_de_xuat: 251,
        so_ngay_con_lai: 8,
      },
    });

    const result = validateLlmOutput(raw, sampleInput);
    expect(result.status).toBe('valid');
    expect(result.errors).toEqual([]);
    expect(result.action).toBe('CONTACT_AGENCY');
    expect(result.explanation).toContain('L26101802');
  });

  it('ca 2 (JSON hỏng): từ chối chuỗi không parse được thành JSON', () => {
    const result = validateLlmOutput('{ explanation: "không hợp lệ" ', sampleInput);
    expect(result.status).toBe('invalid');
    expect(result.explanation).toBeUndefined();
    expect(result.errors.some((e) => e.includes('Sai định dạng'))).toBe(true);
  });

  it('ca 3 (thiếu trường): từ chối khi thiếu explanation, action hoặc numbers rỗng', () => {
    const missingAction = validateLlmOutput(
      JSON.stringify({
        explanation: 'Tồn dư 251 đơn vị.',
        numbers: { ton_du_uoc_tinh: 251 },
      }),
      sampleInput,
    );
    expect(missingAction.status).toBe('invalid');
    expect(missingAction.errors.some((e) => e.includes('Sai định dạng'))).toBe(true);

    const emptyNumbers = validateLlmOutput(
      JSON.stringify({
        explanation: 'Tồn dư 251 đơn vị.',
        action: 'CONTACT_AGENCY',
        numbers: {},
      }),
      sampleInput,
    );
    expect(emptyNumbers.status).toBe('invalid');
    expect(emptyNumbers.errors.some((e) => e.includes('Sai định dạng'))).toBe(true);
  });

  it('ca 4 (action ngoài allowed_actions): từ chối phương án không nằm trong danh sách cho phép', () => {
    const raw = JSON.stringify({
      explanation: 'Lô L26101802 còn 8 ngày, tồn dư 251 đơn vị.',
      action: 'DISPOSE',
      numbers: { ton_du_uoc_tinh: 251, so_ngay_con_lai: 8 },
    });

    const result = validateLlmOutput(raw, sampleInput);
    expect(result.status).toBe('invalid');
    expect(result.errors.some((e) => e.includes('Phương án ngoài danh sách cho phép'))).toBe(true);
  });

  it('ca 5 (action trong danh sách nhưng khác phương án chính): từ chối', () => {
    const raw = JSON.stringify({
      explanation: 'Lô L26101802 còn 8 ngày, tồn dư 251 đơn vị.',
      action: 'CONSIDER_PROMOTION',
      numbers: { ton_du_uoc_tinh: 251, so_ngay_con_lai: 8 },
    });

    const result = validateLlmOutput(raw, sampleInput);
    expect(result.status).toBe('invalid');
    expect(result.errors.some((e) => e.includes('Phương án'))).toBe(true);
  });

  it('ca 6 (số trong numbers sai hoặc khóa lạ): từ chối với lỗi "Số liệu không khớp"', () => {
    const mismatchVal = validateLlmOutput(
      JSON.stringify({
        explanation: 'Lô L26101802 còn 8 ngày, tồn dư 251 đơn vị.',
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 250 },
      }),
      sampleInput,
    );
    expect(mismatchVal.status).toBe('invalid');
    expect(mismatchVal.errors.some((e) => e.includes('Số liệu không khớp'))).toBe(true);

    const unknownKey = validateLlmOutput(
      JSON.stringify({
        explanation: 'Lô L26101802 còn 8 ngày, tồn dư 251 đơn vị.',
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 251, muc_giam_gia: 10 },
      }),
      sampleInput,
    );
    expect(unknownKey.status).toBe('invalid');
    expect(unknownKey.errors.some((e) => e.includes('Số liệu không khớp'))).toBe(true);
  });

  it('ca 7 (văn bản có số bịa): bắt được "260 lốc", "260lốc" và "15%"', () => {
    const hallucinatedQty = validateLlmOutput(
      JSON.stringify({
        explanation: 'Cần liên hệ đại lý đẩy gấp 260 lốc trước hạn 30/11/2026.',
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 251 },
      }),
      sampleInput,
    );
    expect(hallucinatedQty.status).toBe('invalid');
    expect(
      hallucinatedQty.errors.some((e) => e.includes('Có số liệu không có trong dữ liệu nguồn')),
    ).toBe(true);

    const hallucinatedDiscount = validateLlmOutput(
      JSON.stringify({
        explanation: 'Đề xuất giảm giá 15% để đẩy 251 đơn vị còn 8 ngày.',
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 251, so_ngay_con_lai: 8 },
      }),
      sampleInput,
    );
    expect(hallucinatedDiscount.status).toBe('invalid');
    expect(
      hallucinatedDiscount.errors.some((e) =>
        e.includes('Có số liệu không có trong dữ liệu nguồn'),
      ),
    ).toBe(true);
  });

  it('ca 8 (văn bản định dạng vi-VN 1.294, thập phân 12,5 và ngày 30/11/2026): hợp lệ', () => {
    const largeInput: LlmExplanationInput = {
      ...sampleInput,
      ton_luc_phan_tich: 1294,
      nhu_cau_phan_bo_duoc: 12.5,
      tieu_thu_uoc_tinh: 12.5,
      ton_du_uoc_tinh: 1281.5,
      luong_de_xuat: 1281.5,
    };

    const raw = JSON.stringify({
      explanation:
        'Lô L26101802 của SP002 có tồn 1.294 đơn vị, nhu cầu phân bổ được 12,5 đơn vị trước hạn 30/11/2026 (còn 8 ngày). Tồn dư ước tính 1.281,5 đơn vị cần liên hệ đại lý đẩy hàng.',
      action: 'CONTACT_AGENCY',
      numbers: {
        ton_luc_phan_tich: 1294,
        nhu_cau_phan_bo_duoc: 12.5,
        tieu_thu_uoc_tinh: 12.5,
        ton_du_uoc_tinh: 1281.5,
        luong_de_xuat: 1281.5,
        so_ngay_con_lai: 8,
      },
    });

    const result = validateLlmOutput(raw, largeInput);
    expect(result.status).toBe('valid');
    expect(result.errors).toEqual([]);
  });

  it('ca 9 (ngày sai trong văn bản dù thành phần số trùng): từ chối "08/11/2026" khi HSD là 30/11/2026', () => {
    const raw = JSON.stringify({
      explanation: 'Lô L26101802 hết hạn ngày 08/11/2026, tồn dư 251 đơn vị.',
      action: 'CONTACT_AGENCY',
      numbers: { ton_du_uoc_tinh: 251 },
    });

    const result = validateLlmOutput(raw, sampleInput);
    expect(result.status).toBe('invalid');
    expect(result.errors.some((e) => e.includes('Có số liệu không có trong dữ liệu nguồn'))).toBe(
      true,
    );
  });

  it('ca 10 (văn bản rỗng hoặc vượt quá 1500 ký tự): từ chối', () => {
    const emptyText = validateLlmOutput(
      JSON.stringify({
        explanation: '   ',
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 251 },
      }),
      sampleInput,
    );
    expect(emptyText.status).toBe('invalid');

    const tooLong = validateLlmOutput(
      JSON.stringify({
        explanation: 'a'.repeat(1501),
        action: 'CONTACT_AGENCY',
        numbers: { ton_du_uoc_tinh: 251 },
      }),
      sampleInput,
    );
    expect(tooLong.status).toBe('invalid');
  });

  it('ca 11 (lô hết hạn so_ngay_con_lai âm): chấp nhận văn bản viết "quá 22 ngày"', () => {
    const expiredInput: LlmExplanationInput = {
      ma_lo: 'L26091802',
      san_pham: 'SP002',
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
    };

    const raw = JSON.stringify({
      explanation:
        'Lô L26091802 của SP002 đã quá hạn 22 ngày kể từ 01/11/2026 và còn tồn 313 đơn vị. Cần loại bỏ và lập biên bản huỷ toàn bộ 313 đơn vị.',
      action: 'DISPOSE',
      numbers: {
        ton_luc_phan_tich: 313,
        nhu_cau_phan_bo_duoc: 0,
        ton_du_uoc_tinh: 313,
        luong_de_xuat: 313,
        so_ngay_con_lai: -22,
      },
    });

    const result = validateLlmOutput(raw, expiredInput);
    expect(result.status).toBe('valid');
  });
});
