const viNumberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 3,
});

export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '0';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return String(value);
  }
  return viNumberFormatter.format(parsed);
}

export function formatShelfLife(days: number | null | undefined): string {
  if (days === null || days === undefined) {
    return '—';
  }
  return `${viNumberFormatter.format(days)} ngày`;
}

const vnIsoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getVnTodayIso(now: Date = new Date()): string {
  return vnIsoDateFormatter.format(now);
}

/**
 * Định dạng chuỗi YYYY-MM-DD sang dd/MM/yyyy không bị lệch múi giờ trình duyệt.
 */
export function formatDateVi(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return '—';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}
