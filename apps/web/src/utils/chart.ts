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
