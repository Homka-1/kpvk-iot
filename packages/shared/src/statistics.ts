// Описательные статистики (ТЗ, п. 4.10; FR-069, FR-073, FR-074). Чистые функции: одни и те же
// правила считают аналитику на сервере, выгрузку для исследования и проверяются на эталонных наборах.

/** Знаков после запятой в рассчитанных статистиках (баллы методик хранятся с точностью 0,001). */
export const STATISTICS_PRECISION = 3;

/**
 * Описательные статистики набора наблюдений. `missing` — наблюдения без значения: они не входят
 * в расчёт и не заменяются нулями (FR-073, FR-074). Нет ни одного значения — все показатели null;
 * стандартное отклонение — выборочное (n − 1), при одном значении null.
 */
export interface DescriptiveStats {
  n: number;
  missing: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  q1: number | null;
  q3: number | null;
  max: number | null;
}

const round = (value: number) => {
  const factor = 10 ** STATISTICS_PRECISION;
  return Math.round(value * factor) / factor;
};

/**
 * Квантиль упорядоченного набора с линейной интерполяцией между соседними значениями
 * (тип 7 по Hyndman и Fan: так считают QUARTILE.INC в Excel и quantile() в R по умолчанию).
 */
export function quantile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower]!;
  return lowerValue + (sorted[upper]! - lowerValue) * (position - lower);
}

/** Описательные статистики: n, пропуски, среднее, медиана, SD, минимум, квартили, максимум. */
export function descriptiveStats(values: readonly (number | null | undefined)[]): DescriptiveStats {
  const present = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const missing = values.length - present.length;
  const n = present.length;
  if (n === 0) {
    return {
      n,
      missing,
      mean: null,
      median: null,
      sd: null,
      min: null,
      q1: null,
      q3: null,
      max: null,
    };
  }
  const sorted = [...present].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / n;
  const variance =
    n > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : null;
  return {
    n,
    missing,
    mean: round(mean),
    median: round(quantile(sorted, 0.5)!),
    sd: variance === null ? null : round(Math.sqrt(variance)),
    min: sorted[0]!,
    q1: round(quantile(sorted, 0.25)!),
    q3: round(quantile(sorted, 0.75)!),
    max: sorted[n - 1]!,
  };
}

/** Названия статистик для таблиц и выгрузки, в порядке колонок. */
export const DESCRIPTIVE_STATS_COLUMNS: readonly { key: keyof DescriptiveStats; label: string }[] =
  [
    { key: 'n', label: 'n' },
    { key: 'missing', label: 'Пропуски' },
    { key: 'mean', label: 'Среднее' },
    { key: 'median', label: 'Медиана' },
    { key: 'sd', label: 'Стандартное отклонение' },
    { key: 'min', label: 'Минимум' },
    { key: 'q1', label: 'Нижний квартиль' },
    { key: 'q3', label: 'Верхний квартиль' },
    { key: 'max', label: 'Максимум' },
  ];
