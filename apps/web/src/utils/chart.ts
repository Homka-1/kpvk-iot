/**
 * Общие настройки графиков Chart.js: цвета берутся из дизайн-токенов `--iot-chart-*`
 * (Chart.js рисует на canvas и не понимает CSS-переменные), анимация отключается при
 * `prefers-reduced-motion`.
 */
export function chartColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#163259';
}

const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Короткая функциональная анимация или никакой. */
export const chartAnimation = reducedMotion ? (false as const) : { duration: 200 };

/** Цвет токена с прозрачностью (заливка столбца «до» при обводке цветом серии). */
export function chartColorAlpha(token: string, alpha: number): string {
  const color = chartColor(token);
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
