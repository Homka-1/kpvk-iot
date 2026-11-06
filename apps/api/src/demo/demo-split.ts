import { type Random, shuffle } from './demo-random.js';

/** Сколько вариантов распределения перебирается в поисках самого ровного. */
const CANDIDATES = 2000;

/**
 * Распределение студентов на экспериментальную и контрольную группы одного уровня.
 * `metrics` — показатели на старте (баллы шкал первичного замера, балл входного контроля),
 * у студента показателя может не быть. Каждый показатель приводится к z-оценке; студенты
 * упорядочиваются по сумме z-оценок и разбиваются на соседние пары, в каждой паре один
 * попадает в ЭГ, другой — в КГ; в небольшой группе пар мало, поэтому перебираются также
 * случайные деления пополам. Из вариантов выбирается тот, где наибольшее расхождение
 * средних ЭГ и КГ по показателям минимально.
 * Возвращает идентификаторы студентов ЭГ; при нечётном числе лишний попадает в случайную группу.
 */
export function balancedSplit(
  random: Random,
  students: readonly { id: string }[],
  metrics: readonly Map<string, number>[],
): Set<string> {
  const ids = students.map((student) => student.id);
  const scales = metrics.map((metric) => standardize(ids, metric)).filter((z) => z.size > 0);
  const composite = (id: string) => scales.reduce((sum, z) => sum + (z.get(id) ?? 0), 0);
  const ordered = shuffle(random, ids).sort((a, b) => composite(b) - composite(a));
  const pairs: string[][] = [];
  for (let i = 0; i < ordered.length; i += 2) pairs.push(ordered.slice(i, i + 2));

  let best = new Set<string>();
  let bestGap = Infinity;
  for (let attempt = 0; attempt < CANDIDATES; attempt += 1) {
    const candidate = new Set(
      attempt % 2 === 0
        ? pairs
            .map((pair) => shuffle(random, pair))
            .filter((pair) => pair.length > 1 || random() < 0.5)
            .map((pair) => pair[0]!)
        : shuffle(random, ids).slice(
            0,
            Math.floor(ids.length / 2) + (random() < 0.5 ? 0 : ids.length % 2),
          ),
    );
    const gap = Math.max(0, ...scales.map((z) => meanGap(z, candidate)));
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

/** z-оценки показателя среди студентов, у которых он есть; без разброса — пустая карта. */
function standardize(ids: readonly string[], metric: Map<string, number>): Map<string, number> {
  const values = ids.filter((id) => metric.has(id)).map((id) => metric.get(id)!);
  if (values.length < 2) return new Map();
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  if (sd === 0) return new Map();
  return new Map(
    ids.filter((id) => metric.has(id)).map((id) => [id, (metric.get(id)! - mean) / sd]),
  );
}

/** Модуль разности средних z-оценок ЭГ и КГ; если в одной из групп данных нет — 0. */
function meanGap(z: Map<string, number>, experimental: Set<string>): number {
  let [sumE, countE, sumC, countC] = [0, 0, 0, 0];
  for (const [id, value] of z) {
    if (experimental.has(id)) [sumE, countE] = [sumE + value, countE + 1];
    else [sumC, countC] = [sumC + value, countC + 1];
  }
  return countE && countC ? Math.abs(sumE / countE - sumC / countC) : 0;
}
