import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOTIVATION_STRATEGIES,
  defaultStudentSummary,
  motivationStrategiesSchema,
  profileDecisionSchema,
  type ProfileBasisItemDto,
  proposeMotivationLevel,
} from './motivation-profiles.js';
import type { MotivationLevel } from './enums.js';

const items = (...levels: (MotivationLevel | null)[]) =>
  levels.map((motivationLevel) => ({ motivationLevel }));

describe('proposeMotivationLevel', () => {
  it('FR-027: уровень, на который указало большинство шкал', () => {
    expect(proposeMotivationLevel(items('HIGH', 'HIGH', 'LOW'), 1)).toEqual({
      level: 'HIGH',
      counts: { HIGH: 2, MEDIUM: 0, LOW: 1 },
      reason: null,
    });
    expect(proposeMotivationLevel(items('MEDIUM'), 1).level).toBe('MEDIUM');
  });

  it('п. 4.5: нет данных — уровень не предлагается, пропуски не считаются нулями', () => {
    const empty = proposeMotivationLevel([], 1);
    expect(empty.level).toBeNull();
    expect(empty.reason).toMatch(/Нет завершённой диагностики/);
    // Шкалы без уровня (балл не рассчитан) в подсчёт не входят.
    const missing = proposeMotivationLevel(items(null, null), 1);
    expect(missing.level).toBeNull();
    expect(missing.counts).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0 });
  });

  it('п. 4.5: шкал меньше минимума — «Требуется дополнительная диагностика»', () => {
    const result = proposeMotivationLevel(items('LOW', null), 2);
    expect(result.level).toBeNull();
    expect(result.reason).toBe('Уровень определён по 1 из минимально необходимых 2 шкал.');
    expect(proposeMotivationLevel(items('LOW', 'LOW'), 2).level).toBe('LOW');
  });

  it('п. 4.5: равенство голосов — уровень не присваивается произвольно', () => {
    const result = proposeMotivationLevel(items('HIGH', 'LOW'), 1);
    expect(result.level).toBeNull();
    expect(result.reason).toBe(
      'Показатели шкал расходятся: высокий уровень — 1, низкий уровень — 1.',
    );
    expect(proposeMotivationLevel(items('HIGH', 'LOW', 'MEDIUM', 'MEDIUM'), 1).level).toBe(
      'MEDIUM',
    );
  });
});

describe('profileDecisionSchema', () => {
  it('FR-029: подтверждение без причины, корректировка — только с причиной', () => {
    const schema = profileDecisionSchema('LOW');
    expect(schema.safeParse({ level: 'LOW' }).success).toBe(true);
    const corrected = schema.safeParse({ level: 'MEDIUM', reason: '  ' });
    expect(corrected.success).toBe(false);
    expect(corrected.error?.issues[0]?.path).toEqual(['reason']);
    expect(schema.safeParse({ level: 'MEDIUM', reason: 'Наблюдения' }).success).toBe(true);
  });
});

describe('стратегии и пояснение для студента', () => {
  it('FR-030: стратегии по умолчанию — формулировки п. 4.5 ТЗ, проходят проверку', () => {
    expect(motivationStrategiesSchema.safeParse(DEFAULT_MOTIVATION_STRATEGIES).success).toBe(true);
    expect(DEFAULT_MOTIVATION_STRATEGIES.LOW).toContain('Создание ситуации успеха');
    expect(
      motivationStrategiesSchema.safeParse({ ...DEFAULT_MOTIVATION_STRATEGIES, HIGH: [] }).success,
    ).toBe(false);
  });

  it('FR-016: пояснение по умолчанию — тексты шкал-оснований без повторов', () => {
    const base = { studentText: 'Ставьте цели.', motivationLevel: 'LOW' } as ProfileBasisItemDto;
    expect(
      defaultStudentSummary([
        base,
        { ...base },
        { ...base, studentText: 'Не входит.', motivationLevel: null },
        { ...base, studentText: 'Отмечайте успехи.' },
      ]),
    ).toBe('Ставьте цели.\nОтмечайте успехи.');
  });
});
