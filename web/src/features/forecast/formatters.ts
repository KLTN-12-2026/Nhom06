import { formatDateTime, formatDateVi } from '@/lib/format';

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
  return formatDateVi(isoDate);
}

export function formatDateTimeVi(isoTimestamp: string | null | undefined): string {
  return formatDateTime(isoTimestamp);
}
