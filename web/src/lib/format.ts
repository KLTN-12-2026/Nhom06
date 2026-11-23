const viNumberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 3,
});

const viCurrencyFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 2,
});

const vnDateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const vnIsoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface TemporalPlainDateLike {
  year: number;
  month: number;
  day: number;
  add(duration: { days: number }): TemporalPlainDateLike;
  toString(): string;
}

interface TemporalNamespaceLike {
  PlainDate?: {
    from(value: string): TemporalPlainDateLike;
  };
}

function getNativeTemporal(): TemporalNamespaceLike | undefined {
  return (globalThis as { Temporal?: TemporalNamespaceLike }).Temporal;
}

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

export function formatCurrency(
  value: string | number | null | undefined,
  withSuffix = false,
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return String(value);
  }
  const formatted = viCurrencyFormatter.format(parsed);
  return withSuffix ? `${formatted} đ` : formatted;
}

/**
 * Định dạng tiền VNĐ rút gọn cho KPI Dashboard (vd: 103.000.000 → "103" + "triệu đ").
 */
export function formatVndCompact(value: string | number | null | undefined): {
  valueText: string;
  unitText: string;
} {
  if (value === null || value === undefined || value === '') {
    return { valueText: '0', unitText: 'đ' };
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return { valueText: String(value), unitText: 'đ' };
  }

  const abs = Math.abs(parsed);
  if (abs >= 1_000_000_000) {
    const billions = parsed / 1_000_000_000;
    return {
      valueText: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(billions),
      unitText: 'tỷ đ',
    };
  }
  if (abs >= 1_000_000) {
    const millions = parsed / 1_000_000;
    return {
      valueText: new Intl.NumberFormat('vi-VN', {
        maximumFractionDigits: abs >= 10_000_000 ? 0 : 1,
      }).format(millions),
      unitText: 'triệu đ',
    };
  }
  if (abs >= 1_000) {
    const thousands = parsed / 1_000;
    return {
      valueText: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(thousands),
      unitText: 'nghìn đ',
    };
  }
  return {
    valueText: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(parsed),
    unitText: 'đ',
  };
}

/**
 * Định dạng mốc tháng `YYYY-MM` sang nhãn ngắn `MM/YY` cho trục X biểu đồ 12 tháng.
 */
export function formatMonthShort(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) {
    return ym;
  }
  return `${match[2]}/${match[1].slice(2)}`;
}

export function getMonthStartIsoVn(isoDate?: string): string {
  const base = isoDate ?? getVnTodayIso();
  return `${base.slice(0, 7)}-01`;
}

export function formatShelfLife(days: number | null | undefined): string {
  if (days === null || days === undefined) {
    return '—';
  }
  return `${viNumberFormatter.format(days)} ngày`;
}

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

/**
 * Định dạng ngày nghiệp vụ YYYY-MM-DD → dd/MM/yyyy không qua Date cục bộ để tránh lệch múi giờ.
 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return '—';
  }
  const temporal = getNativeTemporal();
  if (temporal?.PlainDate) {
    try {
      const plain = temporal.PlainDate.from(isoDate.slice(0, 10));
      const dd = String(plain.day).padStart(2, '0');
      const mm = String(plain.month).padStart(2, '0');
      const yyyy = String(plain.year).padStart(4, '0');
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      // Rơi xuống parser thuần bên dưới
    }
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDateTime(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) {
    return '—';
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  const parts = vnDateTimeFormatter.formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const dd = byType.get('day') ?? '';
  const mm = byType.get('month') ?? '';
  const yyyy = byType.get('year') ?? '';
  const hh = byType.get('hour') ?? '';
  const min = byType.get('minute') ?? '';
  if (dd && mm && yyyy && hh && min) {
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
  return vnDateTimeFormatter.format(date);
}

/**
 * Định dạng mốc thời gian ISO (UTC) sang ngày `dd/MM/yyyy` theo đúng múi giờ Asia/Ho_Chi_Minh.
 */
export function formatTimestampDateVi(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) {
    return '—';
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return formatDateVi(isoTimestamp);
  }
  return formatDateVi(vnIsoDateFormatter.format(date));
}

export function formatRelativeTime(
  isoTimestamp: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!isoTimestamp) {
    return '—';
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  const diffSeconds = Math.floor((nowMs - date.getTime()) / 1000);
  if (diffSeconds < 60) {
    return 'vừa xong';
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} giờ trước`;
  }
  return formatDateTime(isoTimestamp);
}

export function getTodayIsoVn(now: Date = new Date()): string {
  return vnIsoDateFormatter.format(now);
}

/**
 * Cộng số ngày theo lịch (location-agnostic) cho chuỗi YYYY-MM-DD, ưu tiên Temporal.PlainDate
 * và fallback về số học lịch UTC khi trình duyệt/môi trường chưa hỗ trợ Temporal.
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  if (!Number.isFinite(days)) {
    return isoDate;
  }
  const temporal = getNativeTemporal();
  if (temporal?.PlainDate) {
    try {
      return temporal.PlainDate.from(isoDate).add({ days: Math.trunc(days) }).toString();
    } catch {
      // Rơi xuống fallback lịch UTC bên dưới
    }
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const utc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Math.trunc(days)),
  );
  const year = String(utc.getUTCFullYear()).padStart(4, '0');
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
