/** Источник случайных чисел в [0, 1): в тестах подменяется детерминированным. */
export type Random = () => number;

/** Детерминированный генератор (mulberry32) — для воспроизводимых тестов. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function between(random: Random, min: number, max: number): number {
  return min + (max - min) * random();
}

export function intBetween(random: Random, min: number, max: number): number {
  return Math.floor(between(random, min, max + 1));
}

export function chance(random: Random, probability: number): boolean {
  return random() < probability;
}

export function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/** Приблизительно нормальный шум со средним 0 и отклонением `sd`. */
export function noise(random: Random, sd: number): number {
  return (random() + random() + random() - 1.5) * 2 * sd;
}

export function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
