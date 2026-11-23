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
