const numberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

export function formatNumberVi(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return numberFormatter.format(num);
}

export function formatIntegerVi(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return integerFormatter.format(value);
}

export function formatIsoDateDdMm(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) {
    return isoDate;
  }
  return `${parts[2]}/${parts[1]}`;
}

export function formatIsoDateVi(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return '—';
  }
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) {
    return isoDate;
  }
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeVi(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) {
    return '—';
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
