import { Prisma } from '@prisma/client';
import { LlmExplanationInput } from '../domain/llm-guard';
import {
  buildLlmDisplayContext,
  formatActionVi,
  formatDateVi,
  formatDaysRemainingVi,
  formatNumberViExact,
  formatQuantityWithUnitVi,
  formatRiskLevelVi,
} from './format-vi';
import { PROMPT_VERSION } from './llm-provider.interface';
import { buildLlmMessages, LLM_SYSTEM_PROMPT_V2 } from './prompt';

describe('format-vi & prompt v2 (T-030 AC1)', () => {
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

  it('định dạng đúng nhãn mức rủi ro và nhãn phương án tiếng Việt', () => {
    expect(formatRiskLevelVi('critical')).toBe('Hết hạn');
    expect(formatRiskLevelVi('high')).toBe('Nguy cấp');
    expect(formatRiskLevelVi('medium')).toBe('Trung bình');
    expect(formatRiskLevelVi('low')).toBe('Thấp');

    expect(formatActionVi('DISPOSE')).toBe('Loại bỏ và lập biên bản huỷ');
    expect(formatActionVi('CONTACT_AGENCY')).toBe('Liên hệ đại lý đẩy hàng');
    expect(formatActionVi('PRIORITIZE_FEFO')).toBe('Ưu tiên xuất theo FEFO');
    expect(formatActionVi('RETURN_TO_SUPPLIER')).toBe('Trả nhà cung cấp');
    expect(formatActionVi('CONSIDER_PROMOTION')).toBe('Cân nhắc khuyến mãi');
  });

  it('định dạng số vi-VN chính xác không làm tròn khác giá trị gốc (giữ tối đa 3 số lẻ)', () => {
    expect(formatNumberViExact(52.37)).toBe('52,37');
    expect(formatNumberViExact(1294)).toBe('1.294');
    expect(formatNumberViExact(1281.5)).toBe('1.281,5');
    expect(formatNumberViExact(new Prisma.Decimal('1281.125'))).toBe('1.281,125');
    expect(formatNumberViExact(new Prisma.Decimal('1294.000'))).toBe('1.294');
    expect(formatNumberViExact(0)).toBe('0');
    expect(formatQuantityWithUnitVi(52.37, 'thùng')).toBe('52,37 thùng');
    expect(formatQuantityWithUnitVi(1294, 'thùng')).toBe('1.294 thùng');
  });

  it('định dạng ngày dd/MM/yyyy và số ngày còn/quá hạn', () => {
    expect(formatDateVi('2026-12-04')).toBe('04/12/2026');
    expect(formatDaysRemainingVi(8)).toBe('còn 8 ngày');
    expect(formatDaysRemainingVi(-53)).toBe('quá 53 ngày');
    expect(formatDaysRemainingVi(0)).toBe('còn 0 ngày');
  });

  it('buildLlmDisplayContext & buildLlmMessages (prompt v2) đính kèm khối hien_thi mà không sửa input gốc', () => {
    expect(PROMPT_VERSION).toBe('v2');

    const snapshotBefore = JSON.stringify(sampleInput);
    const display = buildLlmDisplayContext(sampleInput);
    expect(display).toEqual({
      ten_san_pham: 'Sữa chua uống TH true YOGURT 180ml lốc 4',
      don_vi_tinh: 'thùng',
      han_su_dung: '04/12/2026',
      trang_thai_han: 'còn 8 ngày',
      ton_luc_phan_tich: '1.294 thùng',
      nhu_cau_phan_bo_duoc: '52,37 thùng',
      tieu_thu_uoc_tinh: '52,37 thùng',
      ton_du_uoc_tinh: '1.241,63 thùng',
      luong_de_xuat: '1.241,63 thùng',
      muc_rui_ro: 'Nguy cấp',
      phuong_an: 'Liên hệ đại lý đẩy hàng',
      phuong_an_duoc_phep: [
        'Liên hệ đại lý đẩy hàng',
        'Cân nhắc khuyến mãi',
        'Trả nhà cung cấp',
      ],
    });

    const messages = buildLlmMessages(sampleInput);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: LLM_SYSTEM_PROMPT_V2 });
    expect(messages[0].content).toContain('hien_thi');
    expect(messages[0].content).toContain('ten_san_pham');
    expect(messages[0].content).toContain('KHÔNG viết mã tiếng Anh');

    const jsonStart = messages[1].content.indexOf('{');
    const parsedUserPayload = JSON.parse(messages[1].content.slice(jsonStart)) as Record<
      string,
      unknown
    >;
    expect(parsedUserPayload.hien_thi).toEqual(display);
    expect(parsedUserPayload.ten_san_pham).toBe(sampleInput.ten_san_pham);
    expect(parsedUserPayload.don_vi_tinh).toBe(sampleInput.don_vi_tinh);

    // Input gốc (được lưu vào inputSnapshot) không bị gắn thêm hien_thi
    expect(JSON.stringify(sampleInput)).toBe(snapshotBefore);
    expect('hien_thi' in sampleInput).toBe(false);
  });
});
