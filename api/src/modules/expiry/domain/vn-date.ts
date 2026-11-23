const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Lấy ngày hiện tại theo múi giờ nghiệp vụ Asia/Ho_Chi_Minh ở dạng YYYY-MM-DD.
 */
export function getVnTodayDateString(now: Date = new Date()): string {
  return vnDateFormatter.format(now);
}

/**
 * Parse chuỗi YYYY-MM-DD thành Date (UTC 00:00:00) tương thích cột `@db.Date` của Prisma.
 * Ném lỗi nếu định dạng hoặc ngày lịch không hợp lệ (vd: 2026-02-30).
 */
export function parseIsoDateStrict(dateStr: string): Date {
  const match = ISO_DATE_REGEX.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Ngày không đúng định dạng YYYY-MM-DD: ${dateStr}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Ngày lịch không hợp lệ: ${dateStr}`);
  }

  return parsed;
}

/**
 * Định dạng đối tượng Date từ cột `@db.Date` (UTC midnight) sang YYYY-MM-DD.
 */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Tính số ngày lịch còn lại: expiryDate - evaluationDate.
 * Âm = đã quá hạn, 0 = hết hạn đúng ngày đánh giá, dương = còn N ngày.
 */
export function diffCalendarDays(expiryDateStr: string, evaluationDateStr: string): number {
  const expiry = parseIsoDateStrict(expiryDateStr);
  const evaluation = parseIsoDateStrict(evaluationDateStr);
  return Math.round((expiry.getTime() - evaluation.getTime()) / MS_PER_DAY);
}
