import { describe, expect, it } from 'vitest';
import {
  combineMethodologyLevels,
  DEFAULT_MOTIVATION_STRATEGIES,
  defaultStudentSummary,
  type MethodologyScaleInput,
  methodologyLevel,
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

// Эталонные наборы правила этапа 24 (решения заказчика от 2026-10-23).
const mean = (role: MethodologyScaleInput['role'], rawScore: number | null, name = 'Шкала') =>
  ({ name, role, aggregation: 'MEAN', rawScore, maxScore: 5 }) as MethodologyScaleInput;
const sum = (role: MethodologyScaleInput['role'], rawScore: number | null, maxScore: number) =>
  ({ name: 'Шкала', role, aggregation: 'SUM', rawScore, maxScore }) as MethodologyScaleInput;

describe('FR-027: уровень методики по внутренним шкалам', () => {
  it('Реан — среднее внутренних шкал: ≥ 4,0 высокий, 3,0–3,9 средний, < 3,0 низкий', () => {
    expect(methodologyLevel([mean('INTRINSIC', 4.2), mean('INTRINSIC', 3.8)])).toMatchObject({
      method: 'INTRINSIC_MEAN',
      intrinsic: 4,
      level: 'HIGH',
    });
    expect(methodologyLevel([mean('INTRINSIC', 3.9), mean('INTRINSIC', 3.9)]).level).toBe('MEDIUM');
    expect(methodologyLevel([mean('INTRINSIC', 3), mean('INTRINSIC', 3)]).level).toBe('MEDIUM');
    expect(methodologyLevel([mean('INTRINSIC', 2.9), mean('INTRINSIC', 3)])).toMatchObject({
      intrinsic: 3,
      level: 'MEDIUM',
    });
    expect(methodologyLevel([mean('INTRINSIC', 2.9)]).level).toBe('LOW');
  });

  it('среднее внутренних шкал округляется до 0,1 перед сравнением с порогом', () => {
    // (4,0 + 3,9) / 2 = 3,95 → 4,0 — высокий
    expect(methodologyLevel([mean('INTRINSIC', 4), mean('INTRINSIC', 3.9)])).toMatchObject({
      intrinsic: 4,
      level: 'HIGH',
    });
  });

  it('Ильина — процент от максимума внутренних шкал: ≥ 67 высокий, 34–66 средний, < 34 низкий', () => {
    expect(methodologyLevel([sum('INTRINSIC', 20, 30)])).toMatchObject({
      method: 'INTRINSIC_PERCENT',
      intrinsic: 67,
      level: 'HIGH',
    });
    expect(methodologyLevel([sum('INTRINSIC', 19.5, 30)])).toMatchObject({
      intrinsic: 65,
      level: 'MEDIUM',
    });
    // две шкалы: (10 + 7) / (30 + 20) = 34 %
    expect(methodologyLevel([sum('INTRINSIC', 10, 30), sum('INTRINSIC', 7, 20)])).toMatchObject({
      intrinsic: 34,
      level: 'MEDIUM',
    });
    expect(methodologyLevel([sum('INTRINSIC', 9.9, 30)])).toMatchObject({
      intrinsic: 33,
      level: 'LOW',
    });
  });

  it('внешние шкалы уровень не повышают; при их преобладании — предупреждение', () => {
    const result = methodologyLevel([
      mean('INTRINSIC', 2.5),
      mean('EXTRINSIC', 4.8),
      mean('REFERENCE', 5),
    ]);
    expect(result).toMatchObject({
      intrinsic: 2.5,
      extrinsic: 4.8,
      level: 'LOW',
      extrinsicPrevails: true,
    });
    expect(methodologyLevel([mean('INTRINSIC', 4), mean('EXTRINSIC', 3)]).extrinsicPrevails).toBe(
      false,
    );
    // Ильина: внешняя шкала в процентах от своего максимума
    expect(methodologyLevel([sum('INTRINSIC', 10, 30), sum('EXTRINSIC', 9, 10)])).toMatchObject({
      intrinsic: 33,
      extrinsic: 90,
      level: 'LOW',
      extrinsicPrevails: true,
    });
  });

  it('справочные шкалы не участвуют в расчёте', () => {
    expect(methodologyLevel([mean('INTRINSIC', 3.2), mean('REFERENCE', 1)])).toMatchObject({
      intrinsic: 3.2,
      extrinsic: null,
      level: 'MEDIUM',
    });
  });

  it('FR-074: пропуск по внутренней шкале — уровень не определяется, нуль не подставляется', () => {
    const result = methodologyLevel([mean('INTRINSIC', 4.5), mean('INTRINSIC', null, 'Познание')]);
    expect(result).toMatchObject({ intrinsic: null, level: null, extrinsicPrevails: false });
    expect(result.reason).toContain('Познание');
    expect(methodologyLevel([mean('EXTRINSIC', 4)]).reason).toContain('нет шкал внутренней');
  });

  it('смешанные способы расчёта шкал — процент от максимума', () => {
    expect(methodologyLevel([mean('INTRINSIC', 4), sum('EXTRINSIC', 3, 10)])).toMatchObject({
      method: 'INTRINSIC_PERCENT',
      intrinsic: 80,
      extrinsic: 30,
      level: 'HIGH',
    });
  });
});

describe('FR-027: сведение уровней двух методик', () => {
  it('совпали — этот уровень', () => {
    expect(combineMethodologyLevels(['MEDIUM', 'MEDIUM'])).toMatchObject({
      level: 'MEDIUM',
      outcome: 'MATCH',
      reason: null,
    });
  });

  it('разница в одну ступень — более низкий уровень', () => {
    expect(combineMethodologyLevels(['HIGH', 'MEDIUM'])).toMatchObject({
      level: 'MEDIUM',
      outcome: 'ONE_STEP_LOWER',
    });
    expect(combineMethodologyLevels(['LOW', 'MEDIUM']).level).toBe('LOW');
  });

  it('высокий и низкий — требуется дополнительная диагностика', () => {
    const result = combineMethodologyLevels(['HIGH', 'LOW']);
    expect(result).toMatchObject({ level: null, outcome: 'CONFLICT' });
    expect(result.reason).toContain('Требуется дополнительная диагностика');
  });

  it('пройдена одна методика — недостаточно данных', () => {
    for (const levels of [['HIGH'], ['LOW', null]] as const) {
      const result = combineMethodologyLevels(levels);
      expect(result).toMatchObject({ level: null, outcome: 'SINGLE_METHODOLOGY' });
      expect(result.reason).toContain('Недостаточно данных');
    }
  });

  it('нет уровня ни по одной методике — нет данных', () => {
    expect(combineMethodologyLevels([null, null])).toMatchObject({
      level: null,
      outcome: 'NO_DATA',
      counts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    });
  });
});
