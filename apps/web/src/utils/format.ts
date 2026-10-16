const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** Число в русской записи: пробел между разрядами, запятая в дроби. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}
