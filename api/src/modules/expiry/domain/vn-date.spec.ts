import {
  diffCalendarDays,
  formatDateOnly,
  getVnTodayDateString,
  parseIsoDateStrict,
} from './vn-date';

describe('vn-date — tính ngày theo múi giờ Asia/Ho_Chi_Minh (AC1)', () => {
  it('thời điểm 23:30 UTC ngày 23/11/2026 phải là ngày 2026-11-24 ở Việt Nam (+07:00)', () => {
    const instant = new Date('2026-11-23T23:30:00.000Z');
    expect(getVnTodayDateString(instant)).toBe('2026-11-24');
  });

  it('thời điểm 16:59:59 UTC là cuối ngày 23, còn 17:00:00 UTC là sang ngày 24 ở VN', () => {
    expect(getVnTodayDateString(new Date('2026-11-23T16:59:59.000Z'))).toBe('2026-11-23');
    expect(getVnTodayDateString(new Date('2026-11-23T17:00:00.000Z'))).toBe('2026-11-24');
  });

  it('parseIsoDateStrict chấp nhận ngày hợp lệ và từ chối ngày lịch không tồn tại', () => {
    const parsed = parseIsoDateStrict('2026-11-24');
    expect(formatDateOnly(parsed)).toBe('2026-11-24');

    expect(() => parseIsoDateStrict('2026-02-30')).toThrow();
    expect(() => parseIsoDateStrict('24-11-2026')).toThrow();
    expect(() => parseIsoDateStrict('2026-13-01')).toThrow();
  });

  it('diffCalendarDays tính chính xác số ngày còn lại gồm âm, 0, dương và năm nhuận', () => {
    expect(diffCalendarDays('2026-11-23', '2026-11-24')).toBe(-1);
    expect(diffCalendarDays('2026-11-24', '2026-11-24')).toBe(0);
    expect(diffCalendarDays('2026-12-01', '2026-11-24')).toBe(7);
    expect(diffCalendarDays('2024-03-01', '2024-02-28')).toBe(2); // 2024 là năm nhuận
  });
});
