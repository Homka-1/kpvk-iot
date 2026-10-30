import { describe, expect, it } from 'vitest';
import {
  averageRanks,
  formatPValue,
  mannWhitneyU,
  normalCdf,
  spearmanCorrelation,
  wilcoxonSignedRank,
} from './statistical-tests.js';

// Эталоны — SciPy 1.18 (scipy.stats.wilcoxon, mannwhitneyu, spearmanr) с поправкой на
// непрерывность, как в R по умолчанию; примеры наборов — из справки R (wilcox.test).
const pairs = (before: number[], after: number[]) =>
  before.map((value, index) => ({ before: value, after: after[index]! }));

describe('этап 29: непараметрические критерии', () => {
  it('средние ранги при совпадениях', () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual({ ranks: [1, 2.5, 2.5, 4], ties: [2] });
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
  });

  it('Вилкоксон: точное распределение без совпадений (пример R)', () => {
    const result = wilcoxonSignedRank(
      pairs(
        [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29],
        [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3],
      ),
    );
    expect(result).toMatchObject({ n: 9, statistic: 5, method: 'exact', pairs: 9, zeros: 0 });
    expect(result.p).toBeCloseTo(0.0390625, 6);
  });

  it('Вилкоксон: нули отбрасываются, совпадения — нормальное приближение', () => {
    const result = wilcoxonSignedRank(
      pairs(
        [10, 12, 15, 11, 14, 13, 9, 16, 12, 10, 15, 14],
        [12, 15, 15, 13, 13, 17, 11, 18, 15, 12, 16, 17],
      ),
    );
    expect(result).toMatchObject({ n: 11, pairs: 12, zeros: 1, statistic: 1.5, method: 'normal' });
    expect(result.p).toBeCloseTo(0.005256, 5);
    expect(result.z).toBeCloseTo(2.83594, 4);
    expect(result.effectSize).toBeCloseTo(2.83594 / Math.sqrt(11), 4);
    expect(result.effectMagnitude).toBe('large');
  });

  it('Вилкоксон: пропуски не ноль, мало пар — критерий не считается', () => {
    const result = wilcoxonSignedRank([
      { before: 1, after: 2 },
      { before: null, after: 3 },
      { before: 2, after: 5 },
    ]);
    expect(result.p).toBeNull();
    expect(result.pairs).toBe(2);
    expect(result.note).toMatch(/Недостаточно наблюдений/);
  });

  it('Манн — Уитни: точное распределение (пример R)', () => {
    const result = mannWhitneyU(
      [0.8, 0.83, 1.89, 1.04, 1.45, 1.38, 1.91, 1.64, 0.73, 1.46],
      [1.15, 0.88, 0.9, 0.74, 1.21],
    );
    expect(result).toMatchObject({ n1: 10, n2: 5, statistic: 15, method: 'exact' });
    expect(result.p).toBeCloseTo(0.254412, 5);
  });

  it('Манн — Уитни: 20 × 20 без совпадений — точное', () => {
    const first = [9, 23, 17, 28, 0, 7, 6, 22, 15, 16, 3, 29, 20, 19, 27, 39, 1, 11, 36, 26];
    const second = Array.from({ length: 40 }, (_, index) => index).filter(
      (value) => !first.includes(value),
    );
    const result = mannWhitneyU(first, second);
    expect(result).toMatchObject({ statistic: 164, method: 'exact' });
    expect(result.p).toBeCloseTo(0.340785, 5);
  });

  it('Манн — Уитни: совпадения — нормальное приближение; пропуски не входят', () => {
    const result = mannWhitneyU(
      [3, 5, 4, 6, 2, 5, 7, 4, 3, 6, 5, 4, 8, 6, 5, 3, 4, 7, 6, 5, null],
      [1, 2, 0, 3, 2, 1, 4, 2, 0, 1, 3, 2, 1, 2, 3, 0, 1, 2, 4, 1],
    );
    expect(result).toMatchObject({ n1: 20, n2: 20, statistic: 400 - 377.5, method: 'normal' });
    expect(result.p).toBeCloseTo(1.3483e-6, 9);
    expect(result.effectMagnitude).toBe('large');
  });

  it('Спирмен: без совпадений и с совпадениями', () => {
    const plain = spearmanCorrelation(
      [2, 4, 5, 7, 1, 3, 8, 6, 9, 10].map((x, index) => ({
        x,
        y: [1, 3, 6, 5, 2, 4, 9, 8, 7, 10][index],
      })),
    );
    expect(plain.statistic).toBeCloseTo(0.890909, 5);
    expect(plain.p).toBeCloseTo(0.000542, 5);
    const tied = spearmanCorrelation(
      [1, 2, 2, 3, 4, 5, 5, 6].map((x, index) => ({ x, y: [2, 1, 3, 3, 5, 4, 6, 6][index] })),
    );
    expect(tied.statistic).toBeCloseTo(0.890244, 5);
    expect(tied.p).toBeCloseTo(0.003039, 5);
  });

  it('Спирмен: нет разброса — не считается; формат p', () => {
    const flat = spearmanCorrelation([1, 2, 3, 4, 5].map((x) => ({ x, y: 3 })));
    expect(flat.p).toBeNull();
    expect(flat.note).toMatch(/совпадают/);
    expect(formatPValue(null)).toBe('—');
    expect(formatPValue(0.0004)).toBe('< 0,001');
    expect(formatPValue(0.04567)).toBe('0,046');
  });
});
