// Непараметрические критерии для анализа педагогического эксперимента (этап 29): Вилкоксона для
// парных данных, Манна — Уитни для независимых групп, ранговая корреляция Спирмена, p-значения и
// размеры эффекта. Правила совпадают с R (wilcox.test, cor.test) и SciPy, чтобы исследователь мог
// сверить результат во внешнем пакете: точное распределение при n < 50 без совпадений и нулей,
// иначе нормальное приближение с поправкой на непрерывность и на совпадающие ранги.

/** Наименьшее число наблюдений, при котором критерий рассчитывается. */
export const STATISTICAL_TEST_MIN_N = 5;
/** Уровень значимости для подписей «значимо / не значимо». */
export const SIGNIFICANCE_LEVEL = 0.05;
/** Точное распределение статистики считается до этого размера выборки (как в R). */
const EXACT_LIMIT = 50;

export type PValueMethod = 'exact' | 'normal' | 't';

export const P_VALUE_METHOD_LABELS: Record<PValueMethod, string> = {
  exact: 'точное распределение',
  normal: 'нормальное приближение',
  t: 't-распределение',
};

/** Сила эффекта по Дж. Коэну для r и ρ: 0,1 — малый, 0,3 — средний, 0,5 — большой. */
export type EffectMagnitude = 'negligible' | 'small' | 'medium' | 'large';

export const EFFECT_MAGNITUDE_LABELS: Record<EffectMagnitude, string> = {
  negligible: 'пренебрежимо малый',
  small: 'малый',
  medium: 'средний',
  large: 'большой',
};

export function effectMagnitude(value: number): EffectMagnitude {
  const size = Math.abs(value);
  if (size < 0.1) return 'negligible';
  if (size < 0.3) return 'small';
  if (size < 0.5) return 'medium';
  return 'large';
}

/**
 * Результат критерия. Если критерий не рассчитан (мало наблюдений, нет разброса), числовые поля
 * null, а `note` объясняет причину. `effectSize` — r = |Z|/√N для критериев Вилкоксона и
 * Манна — Уитни, ρ — для корреляции Спирмена.
 */
export interface StatisticalTestResult {
  /** Наблюдений в расчёте (для Вилкоксона — пар с ненулевой разностью). */
  n: number;
  statistic: number | null;
  z: number | null;
  p: number | null;
  method: PValueMethod | null;
  effectSize: number | null;
  effectMagnitude: EffectMagnitude | null;
  note: string | null;
}

const PRECISION = 1e6;
const round6 = (value: number) => Math.round(value * PRECISION) / PRECISION;

function notComputed(n: number, note: string): StatisticalTestResult {
  return {
    n,
    statistic: null,
    z: null,
    p: null,
    method: null,
    effectSize: null,
    effectMagnitude: null,
    note,
  };
}

const tooFew = (n: number) =>
  notComputed(
    n,
    `Недостаточно наблюдений: ${n}, нужно не менее ${STATISTICAL_TEST_MIN_N}. Критерий не рассчитывается.`,
  );

const present = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Средние ранги (совпадающим значениям — среднее их мест) и размеры групп совпадений. */
export function averageRanks(values: readonly number[]): { ranks: number[]; ties: number[] } {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  const ties: number[] = [];
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.value === order[start]!.value) end += 1;
    const rank = (start + end) / 2 + 1;
    for (let position = start; position <= end; position += 1) ranks[order[position]!.index] = rank;
    if (end > start) ties.push(end - start + 1);
    start = end + 1;
  }
  return { ranks, ties };
}

const tieSum = (ties: readonly number[]) => ties.reduce((sum, t) => sum + t ** 3 - t, 0);

// ── Распределения ──

/** Дополнительная функция ошибок (Numerical Recipes, erfcc): относительная погрешность < 1,2·10⁻⁷. */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Функция стандартного нормального распределения. */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Двустороннее p-значение для Z. */
const twoSidedNormal = (z: number) => Math.min(1, 2 * normalCdf(-Math.abs(z)));

/** Логарифм гамма-функции (приближение Ланцоша). */
function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of c) {
    y += 1;
    series += coefficient / y;
  }
  return -tmp + Math.log((2.5066282746310007 * series) / x);
}

/** Цепная дробь для неполной бета-функции (Numerical Recipes, betacf). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return h;
}

/** Регуляризованная неполная бета-функция I_x(a, b). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Двустороннее p-значение t-распределения Стьюдента с df степенями свободы. */
function twoSidedT(t: number, df: number): number {
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Двустороннее точное p-значение по распределению целочисленной статистики. */
function twoSidedExact(counts: readonly number[], statistic: number): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  let lower = 0;
  let upper = 0;
  counts.forEach((count, index) => {
    if (index <= statistic) lower += count;
    if (index >= statistic) upper += count;
  });
  return Math.min(1, (2 * Math.min(lower, upper)) / total);
}

// ── Критерии ──

/**
 * Критерий знаковых рангов Вилкоксона для парных измерений «до» и «после». Пары без одного из
 * значений не входят; нулевые разности отбрасываются (как в R и SciPy). Статистика T — меньшая из
 * сумм рангов положительных и отрицательных разностей (как в таблицах критических значений и
 * SciPy; V в R — сумма положительных). Z — без поправки на непрерывность, r = |Z|/√n.
 */
export function wilcoxonSignedRank(
  pairs: readonly { before: number | null; after: number | null }[],
): StatisticalTestResult & { pairs: number; zeros: number } {
  const differences = pairs
    .filter((pair) => present(pair.before) && present(pair.after))
    .map((pair) => pair.after! - pair.before!);
  const nonZero = differences.filter((difference) => difference !== 0);
  const zeros = differences.length - nonZero.length;
  const n = nonZero.length;
  const extra = { pairs: differences.length, zeros };
  if (n < STATISTICAL_TEST_MIN_N) return { ...tooFew(n), ...extra };

  const { ranks, ties } = averageRanks(nonZero.map(Math.abs));
  const positive = nonZero.reduce(
    (sum, difference, index) => (difference > 0 ? sum + ranks[index]! : sum),
    0,
  );
  const mean = (n * (n + 1)) / 4;
  const sd = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieSum(ties) / 48);
  const z = (positive - mean) / sd;
  const exact = n < EXACT_LIMIT && ties.length === 0 && zeros === 0;
  let p: number;
  if (exact) {
    // Число подмножеств {1…n} с заданной суммой — распределение V без совпадений.
    const max = (n * (n + 1)) / 2;
    const counts = new Array<number>(max + 1).fill(0);
    counts[0] = 1;
    for (let rank = 1; rank <= n; rank += 1) {
      for (let sum = max; sum >= rank; sum -= 1) counts[sum]! += counts[sum - rank]!;
    }
    p = twoSidedExact(counts, positive);
  } else {
    const correction = positive > mean ? 0.5 : positive < mean ? -0.5 : 0;
    p = twoSidedNormal((positive - mean - correction) / sd);
  }
  const effect = Math.abs(z) / Math.sqrt(n);
  return {
    n,
    statistic: Math.min(positive, (n * (n + 1)) / 2 - positive),
    z: round6(z),
    p,
    method: exact ? 'exact' : 'normal',
    effectSize: round6(effect),
    effectMagnitude: effectMagnitude(effect),
    note: null,
    ...extra,
  };
}

/**
 * Критерий Манна — Уитни для двух независимых групп. Статистика U — меньшее из U₁ и U₂ (как в
 * таблицах критических значений); p-значение не зависит от выбора. Z — без поправки на
 * непрерывность, r = |Z|/√(n₁ + n₂).
 */
export function mannWhitneyU(
  first: readonly (number | null | undefined)[],
  second: readonly (number | null | undefined)[],
): StatisticalTestResult & { n1: number; n2: number } {
  const x = first.filter(present);
  const y = second.filter(present);
  const n1 = x.length;
  const n2 = y.length;
  const extra = { n1, n2 };
  if (Math.min(n1, n2) < STATISTICAL_TEST_MIN_N) {
    return {
      ...notComputed(
        n1 + n2,
        `Недостаточно наблюдений: ${n1} и ${n2}, нужно не менее ${STATISTICAL_TEST_MIN_N} в каждой группе. Критерий не рассчитывается.`,
      ),
      ...extra,
    };
  }
  const total = n1 + n2;
  const { ranks, ties } = averageRanks([...x, ...y]);
  const rankSum = ranks.slice(0, n1).reduce((sum, rank) => sum + rank, 0);
  const u1 = rankSum - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * n2) / 2;
  const sd = Math.sqrt(((n1 * n2) / 12) * (total + 1 - tieSum(ties) / (total * (total - 1))));
  if (sd === 0)
    return {
      ...notComputed(total, 'Все значения совпадают: критерий не рассчитывается.'),
      ...extra,
    };
  const z = (u1 - mean) / sd;
  const exact = n1 < EXACT_LIMIT && n2 < EXACT_LIMIT && ties.length === 0;
  let p: number;
  if (exact) {
    // previous[j][u] — число расстановок первых `placed` рангов, где j из первой группы и U₁ = u.
    // Очередной ранг из первой группы увеличивает U₁ на число уже размещённых рангов второй.
    const max = n1 * n2;
    let previous: number[][] = Array.from({ length: n1 + 1 }, () =>
      new Array<number>(max + 1).fill(0),
    );
    previous[0]![0] = 1;
    for (let placed = 0; placed < total; placed += 1) {
      const next: number[][] = Array.from({ length: n1 + 1 }, () =>
        new Array<number>(max + 1).fill(0),
      );
      for (let chosen = 0; chosen <= Math.min(n1, placed); chosen += 1) {
        const fromSecond = placed - chosen;
        if (fromSecond > n2) continue;
        const row = previous[chosen]!;
        for (let u = 0; u <= max; u += 1) {
          const count = row[u]!;
          if (count === 0) continue;
          if (chosen < n1) next[chosen + 1]![u + fromSecond]! += count;
          if (fromSecond < n2) next[chosen]![u]! += count;
        }
      }
      previous = next;
    }
    p = twoSidedExact(previous[n1]!, u1);
  } else {
    const correction = u1 > mean ? 0.5 : u1 < mean ? -0.5 : 0;
    p = twoSidedNormal((u1 - mean - correction) / sd);
  }
  const effect = Math.abs(z) / Math.sqrt(total);
  return {
    n: total,
    statistic: Math.min(u1, n1 * n2 - u1),
    z: round6(z),
    p,
    method: exact ? 'exact' : 'normal',
    effectSize: round6(effect),
    effectMagnitude: effectMagnitude(effect),
    note: null,
    ...extra,
  };
}

/**
 * Ранговая корреляция Спирмена: коэффициент Пирсона для средних рангов (совпадения учтены).
 * p-значение — по t-распределению с n − 2 степенями свободы (как scipy.stats.spearmanr).
 * Пары без одного из значений не входят.
 */
export function spearmanCorrelation(
  pairs: readonly { x: number | null | undefined; y: number | null | undefined }[],
): StatisticalTestResult {
  const complete = pairs.filter((pair) => present(pair.x) && present(pair.y));
  const n = complete.length;
  if (n < STATISTICAL_TEST_MIN_N) return tooFew(n);
  const rx = averageRanks(complete.map((pair) => pair.x!)).ranks;
  const ry = averageRanks(complete.map((pair) => pair.y!)).ranks;
  const mean = (n + 1) / 2;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = rx[index]! - mean;
    const dy = ry[index]! - mean;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) {
    return notComputed(
      n,
      'У одного из показателей все значения совпадают: корреляция не рассчитывается.',
    );
  }
  const rho = Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
  const df = n - 2;
  const p = Math.abs(rho) === 1 ? 0 : twoSidedT(rho * Math.sqrt(df / (1 - rho * rho)), df);
  return {
    n,
    statistic: round6(rho),
    z: null,
    p,
    method: 't',
    effectSize: round6(rho),
    effectMagnitude: effectMagnitude(rho),
    note: null,
  };
}

/** Различие статистически значимо на уровне 0,05. */
export const significant = (result: Pick<StatisticalTestResult, 'p'>) =>
  result.p !== null && result.p < SIGNIFICANCE_LEVEL;

/** p-значение для таблиц: «< 0,001» или три знака после запятой; не рассчитано — «—». */
export function formatPValue(p: number | null): string {
  if (p === null) return '—';
  if (p < 0.001) return '< 0,001';
  return p.toFixed(3).replace('.', ',');
}
