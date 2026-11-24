import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { type LlmExplanationInput } from '../types';
import {
  buildLlmInputRows,
  formatLlmActionLabel,
  formatLlmRemainingDays,
  LLM_INPUT_FIELD_ORDER,
} from './llm-input-format';
import { LlmInputPanel } from './LlmInputPanel';

function makeLlmInput(overrides: Partial<LlmExplanationInput> = {}): LlmExplanationInput {
  return {
    ma_lo: 'L26101802',
    san_pham: 'SP002',
    han_su_dung: '2026-11-30',
    so_ngay_con_lai: 8,
    ton_luc_phan_tich: 1392,
    nhu_cau_phan_bo_duoc: 141,
    tieu_thu_uoc_tinh: 141,
    ton_du_uoc_tinh: 1251,
    muc_rui_ro: 'high',
    phuong_an: 'CONTACT_AGENCY',
    luong_de_xuat: 1251,
    allowed_actions: ['CONTACT_AGENCY', 'CONSIDER_PROMOTION', 'RETURN_TO_SUPPLIER'],
    ...overrides,
  };
}

describe('llm-input-format (T-023 — ánh xạ nhãn và định dạng thuần)', () => {
  it('AC1: dựng đủ 12 trường theo đúng thứ tự với nhãn tiếng Việt và định dạng chuẩn', () => {
    const rows = buildLlmInputRows(makeLlmInput());

    expect(rows.map((r) => r.key)).toEqual([...LLM_INPUT_FIELD_ORDER]);
    expect(rows.map((r) => r.label)).toEqual([
      'Mã lô',
      'Sản phẩm',
      'Hạn sử dụng',
      'Số ngày còn lại',
      'Tồn lúc phân tích',
      'Nhu cầu phân bổ được',
      'Tiêu thụ ước tính',
      'Tồn dư ước tính',
      'Mức rủi ro',
      'Phương án đề xuất',
      'Lượng đề xuất',
      'Phương án được phép',
    ]);

    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get('ma_lo')).toMatchObject({ kind: 'text', text: 'L26101802' });
    expect(byKey.get('san_pham')).toMatchObject({ kind: 'text', text: 'SP002' });
    expect(byKey.get('han_su_dung')).toMatchObject({ kind: 'text', text: '30/11/2026' });
    expect(byKey.get('so_ngay_con_lai')).toMatchObject({ kind: 'text', text: '8 ngày' });
    expect(byKey.get('ton_luc_phan_tich')).toMatchObject({ kind: 'text', text: '1.392' });
    expect(byKey.get('nhu_cau_phan_bo_duoc')).toMatchObject({ kind: 'text', text: '141' });
    expect(byKey.get('tieu_thu_uoc_tinh')).toMatchObject({ kind: 'text', text: '141' });
    expect(byKey.get('ton_du_uoc_tinh')).toMatchObject({ kind: 'text', text: '1.251' });
    expect(byKey.get('muc_rui_ro')).toMatchObject({ kind: 'risk', level: 'high' });
    expect(byKey.get('phuong_an')).toMatchObject({ kind: 'text', text: 'Liên hệ đại lý' });
    expect(byKey.get('luong_de_xuat')).toMatchObject({ kind: 'text', text: '1.251' });
    expect(byKey.get('allowed_actions')).toMatchObject({
      kind: 'actions',
      labels: ['Liên hệ đại lý', 'Cân nhắc khuyến mãi', 'Trả nhà cung cấp'],
    });
  });

  it('AC1: định dạng số ngày âm thành "Quá N ngày" và ánh xạ đủ 5 mã phương án', () => {
    expect(formatLlmRemainingDays(-5)).toBe('Quá 5 ngày');
    expect(formatLlmRemainingDays(0)).toBe('0 ngày');
    expect(formatLlmRemainingDays(14)).toBe('14 ngày');

    expect(formatLlmActionLabel('DISPOSE')).toBe('Hủy hàng');
    expect(formatLlmActionLabel('RETURN_TO_SUPPLIER')).toBe('Trả nhà cung cấp');
    expect(formatLlmActionLabel('PRIORITIZE_FEFO')).toBe('Ưu tiên xuất FEFO');
    expect(formatLlmActionLabel('CONTACT_AGENCY')).toBe('Liên hệ đại lý');
    expect(formatLlmActionLabel('CONSIDER_PROMOTION')).toBe('Cân nhắc khuyến mãi');
  });

  it('AC2: trường lạ giữ tên khóa gốc + stringify object/array; mã phương án lạ giữ mã gốc; null/rỗng trả mảng rỗng', () => {
    expect(formatLlmActionLabel('CUSTOM_ACTION')).toBe('CUSTOM_ACTION');
    expect(buildLlmInputRows(null)).toEqual([]);
    expect(buildLlmInputRows(undefined)).toEqual([]);
    expect(buildLlmInputRows({})).toEqual([]);

    const rows = buildLlmInputRows({
      ma_lo: 'L01',
      phuong_an: 'UNKNOWN_PLAN',
      allowed_actions: ['DISPOSE', 'EXTRA_PLAN'],
      extra_text: 'ghi chú thêm',
      extra_obj: { a: 1 },
      extra_arr: [1, 2],
    });

    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get('phuong_an')).toMatchObject({ kind: 'text', text: 'UNKNOWN_PLAN' });
    expect(byKey.get('allowed_actions')).toMatchObject({
      kind: 'actions',
      labels: ['Hủy hàng', 'EXTRA_PLAN'],
    });
    expect(byKey.get('extra_text')).toMatchObject({
      label: 'extra_text',
      kind: 'text',
      text: 'ghi chú thêm',
    });
    expect(byKey.get('extra_obj')).toMatchObject({
      label: 'extra_obj',
      kind: 'text',
      text: '{"a":1}',
    });
    expect(byKey.get('extra_arr')).toMatchObject({
      label: 'extra_arr',
      kind: 'text',
      text: '[1,2]',
    });
  });
});

describe('LlmInputPanel (T-023 AC1–AC3)', () => {
  it('AC1: thu gọn mặc định; khi mở hiện bảng 2 cột đủ 12 nhãn tiếng Việt, định dạng ngày/số/badge/phương án', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LlmInputPanel
        llmInput={makeLlmInput({
          so_ngay_con_lai: -3,
          muc_rui_ro: 'critical',
          phuong_an: 'DISPOSE',
          allowed_actions: ['DISPOSE', 'RETURN_TO_SUPPLIER'],
        })}
      />,
    );

    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);

    await user.click(screen.getByText('Dữ liệu AI đã dùng để giải thích'));
    expect(details?.hasAttribute('open')).toBe(true);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Trường' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Giá trị' })).toBeInTheDocument();

    const rows = within(table).getAllByRole('row');
    // 1 hàng header + 12 hàng dữ liệu
    expect(rows).toHaveLength(13);

    expect(within(table).getByText('Mã lô')).toBeInTheDocument();
    expect(within(table).getByText('L26101802')).toBeInTheDocument();
    expect(within(table).getByText('Hạn sử dụng')).toBeInTheDocument();
    expect(within(table).getByText('30/11/2026')).toBeInTheDocument();
    expect(within(table).getByText('Số ngày còn lại')).toBeInTheDocument();
    expect(within(table).getByText('Quá 3 ngày')).toBeInTheDocument();
    expect(within(table).getByText('Tồn lúc phân tích')).toBeInTheDocument();
    expect(within(table).getByText('1.392')).toBeInTheDocument();
    expect(within(table).getByText('Mức rủi ro')).toBeInTheDocument();
    expect(within(table).getByText('Hết hạn')).toBeInTheDocument();
    expect(within(table).getByText('Phương án đề xuất')).toBeInTheDocument();
    expect(within(table).getByText('Phương án được phép')).toBeInTheDocument();
    expect(within(table).getAllByText('Hủy hàng')).toHaveLength(2);
    expect(within(table).getByText('Trả nhà cung cấp')).toBeInTheDocument();
  });

  it('AC2: xử lý an toàn trường lạ, giá trị lạ và trạng thái llmInput null hoặc rỗng', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LlmInputPanel llmInput={null} />);

    await user.click(screen.getByText('Dữ liệu AI đã dùng để giải thích'));
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    rerender(<LlmInputPanel llmInput={{}} />);
    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();

    rerender(
      <LlmInputPanel
        llmInput={{
          ...makeLlmInput(),
          phuong_an: 'BRAND_NEW_ACTION' as LlmExplanationInput['phuong_an'],
          muc_rui_ro: 'unknown_level' as LlmExplanationInput['muc_rui_ro'],
          custom_flag: true,
          extra_meta: { source: 'v2' },
        }}
      />,
    );

    expect(screen.getByText('BRAND_NEW_ACTION')).toBeInTheDocument();
    expect(screen.getByText('unknown_level')).toBeInTheDocument();
    expect(screen.getByText('custom_flag')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('extra_meta')).toBeInTheDocument();
    expect(screen.getByText('{"source":"v2"}')).toBeInTheDocument();
  });

  it('AC3: nút "Xem dạng JSON" bật khối <pre> JSON gốc và đổi thành "Ẩn dạng JSON", bấm lại ẩn đi', async () => {
    const user = userEvent.setup();
    render(<LlmInputPanel llmInput={makeLlmInput()} />);

    await user.click(screen.getByText('Dữ liệu AI đã dùng để giải thích'));

    const toggleBtn = screen.getByRole('button', { name: 'Xem dạng JSON' });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"ton_du_uoc_tinh": 1251/)).not.toBeInTheDocument();

    await user.click(toggleBtn);
    expect(screen.getByRole('button', { name: 'Ẩn dạng JSON' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/"ton_du_uoc_tinh": 1251/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ẩn dạng JSON' }));
    expect(screen.getByRole('button', { name: 'Xem dạng JSON' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(/"ton_du_uoc_tinh": 1251/)).not.toBeInTheDocument();
  });
});
