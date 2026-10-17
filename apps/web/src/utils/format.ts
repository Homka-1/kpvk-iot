const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** Число в русской записи: пробел между разрядами, запятая в дроби. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Дата и время в русском формате «16.10.2026, 14:05»; пустое значение — «—». */
export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTimeFormat.format(new Date(value)) : '—';
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Дата без времени «16.10.2026». Строка `YYYY-MM-DD` читается как местная дата, чтобы она
 * не сдвигалась на день из-за часового пояса; пустое значение — «—».
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  return dateFormat.format(date);
}
