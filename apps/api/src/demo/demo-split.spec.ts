import { seededRandom } from './demo-random.js';
import { balancedSplit } from './demo-split.js';

const students = Array.from({ length: 40 }, (_, index) => ({ id: `s${index}` }));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Показатели на старте, как в демо: балл входного контроля и шесть шкал первичного замера;
 * у части студентов балла шкалы нет.
 */
function metrics(seed: number): Map<string, number>[] {
  const random = seededRandom(seed);
  const entry = new Map(students.map(({ id }) => [id, Math.round(60 + 40 * random())]));
  const scales = Array.from(
    { length: 6 },
    (_, scale) =>
      new Map(
        students
          .filter((_, index) => scale > 0 || index % 10 !== 0)
          .map(({ id }) => [id, Math.round(1 + 12 * random())]),
      ),
  );
  return [entry, ...scales];
}

/** Разность средних ЭГ и КГ в долях стандартного отклонения показателя. */
function gap(metric: Map<string, number>, experimental: Set<string>): number {
  const values = [...metric.values()];
  const sd = Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
  const group = (inEg: boolean) =>
    mean([...metric].filter(([id]) => experimental.has(id) === inEg).map(([, value]) => value));
  return Math.abs(group(true) - group(false)) / sd;
}

describe('balancedSplit (демо): распределение ЭГ и КГ одного уровня', () => {
  it('огр. 4: группы поровну, средние по каждому показателю расходятся меньше чем на 0,25 SD', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const data = metrics(seed);
      const experimental = balancedSplit(seededRandom(seed * 7), students, data);
      expect(experimental.size).toBe(20);
      for (const metric of data) expect(gap(metric, experimental)).toBeLessThan(0.25);
    }
  });

  it('нечётное число студентов — лишний попадает в одну из групп', () => {
    const experimental = balancedSplit(seededRandom(3), students.slice(0, 39), metrics(3));
    expect([19, 20]).toContain(experimental.size);
  });

  it('одинаковый генератор — одинаковое распределение', () => {
    const data = metrics(5);
    expect([...balancedSplit(seededRandom(5), students, data)]).toEqual([
      ...balancedSplit(seededRandom(5), students, data),
    ]);
  });
});
