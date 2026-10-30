import { describe, expect, it } from 'vitest';
import {
  buildResearchAnalysis,
  buildResearchAnalysisSheets,
  dynamicsShare,
  researchCorrelations,
} from './research-analysis.js';
import {
  buildResearchData,
  buildResearchOutcomes,
  RESEARCH_GRADES_KEY,
  type ResearchDataDto,
  type ResearchDataInput,
  type ResearchMeasurementDto,
} from './research.js';
import { comparabilityKey } from './diagnostic-results.js';
import type { ScaleResultDto } from './diagnostic-sessions.js';

// 6 участников ЭГ и 6 КГ; методика мотивации (две шкалы) и методика саморегуляции (одна шкала).
const score = (code: string, rawScore: number): ScaleResultDto => ({
  scaleId: code,
  code,
  name: code,
  rawScore,
  missingAnswers: 0,
  level: null,
});

const participants = Array.from({ length: 12 }, (_, index) => ({
  studentId: `s${index + 1}`,
  code: `R${String(index + 1).padStart(3, '0')}`,
  group: index < 6 ? ('EXPERIMENTAL' as const) : ('CONTROL' as const),
  excluded: false,
}));

const measurement = (
  id: string,
  type: 'PRIMARY' | 'REPEATED',
  questionnaireId: string,
  versionId: string,
  direction: string,
): ResearchMeasurementDto => ({
  id,
  title: `${questionnaireId} ${type === 'PRIMARY' ? 'до' : 'после'}`,
  measurementType: type,
  questionnaire: {
    questionnaireId,
    versionId,
    versionNumber: versionId.endsWith('2') ? 2 : 1,
    title: questionnaireId === 'q1' ? 'Мотивация учения' : 'Стиль саморегуляции',
    isDemo: false,
  },
  direction: { code: direction, name: direction },
  startsOn: type === 'PRIMARY' ? '2025-09-01' : '2026-05-01',
  endsOn: type === 'PRIMARY' ? '2025-09-30' : '2026-05-31',
  createdAt: '2025-09-01T00:00:00Z',
});

// ЭГ растёт на 3–8, КГ — от −1 до +1 (у одного без изменений).
const egGrowth = [3, 4, 5, 6, 7, 8];
const cgGrowth = [-1, 0, 1, 1, -1, 1];
const growth = (index: number) => (index < 6 ? egGrowth[index]! : cgGrowth[index - 6]!);

function input(overrides: Partial<ResearchDataInput> = {}): ResearchDataInput {
  const sessions = participants.flatMap((participant, index) => [
    {
      studentId: participant.studentId,
      versionId: 'v1',
      measurementType: 'PRIMARY' as const,
      completedAt: '2025-09-10T06:00:00Z',
      scores: [score('INT', 10 + index), score('ACH', 20)],
    },
    {
      studentId: participant.studentId,
      versionId: 'v2',
      measurementType: 'REPEATED' as const,
      completedAt: '2026-05-10T06:00:00Z',
      scores: [score('INT', 10 + index + growth(index)), score('ACH', 21)],
    },
    {
      studentId: participant.studentId,
      versionId: 'sr1',
      measurementType: 'PRIMARY' as const,
      completedAt: '2025-09-12T06:00:00Z',
      scores: [score('PL', 5)],
    },
  ]);
  return {
    participants,
    measurements: [
      measurement('m1', 'PRIMARY', 'q1', 'v1', 'LEARNING_MOTIVATION'),
      measurement('m2', 'REPEATED', 'q1', 'v2', 'LEARNING_MOTIVATION'),
      measurement('m3', 'PRIMARY', 'q2', 'sr1', 'SELF_REGULATION'),
    ],
    versionScales: new Map([
      [
        'v1',
        [
          { code: 'INT', name: 'Интерес', aggregation: 'SUM' as const },
          { code: 'ACH', name: 'Достижения', aggregation: 'SUM' as const },
        ],
      ],
      [
        'v2',
        [
          { code: 'INT', name: 'Интерес', aggregation: 'SUM' as const },
          { code: 'ACH', name: 'Достижения', aggregation: 'MEAN' as const },
        ],
      ],
      ['sr1', [{ code: 'PL', name: 'Планирование', aggregation: 'SUM' as const }]],
    ]),
    sessions,
    approved: new Set([comparabilityKey('v1', 'v2')]),
    ...overrides,
  };
}

function data(overrides: Partial<ResearchDataInput> = {}): ResearchDataDto {
  return {
    ...buildResearchData(input(overrides)),
    outcomes: buildResearchOutcomes({
      participants,
      periods: [],
      gradesBefore: null,
      gradesAfter: null,
      grades: [],
      observationsBefore: null,
      observationsAfter: null,
      criteria: [],
      ratings: [],
    }),
  };
}

describe('этап 29: сводный анализ эксперимента', () => {
  it('разделы не смешиваются: мотивация, саморегуляция, академические, наблюдения', () => {
    const analysis = buildResearchAnalysis(data());
    expect(analysis.variables.map((variable) => [variable.key, variable.domain])).toEqual([
      ['q1:INT', 'motivation'],
      ['q1:ACH', 'motivation'],
      ['q2:PL', 'self_regulation'],
      [RESEARCH_GRADES_KEY, 'academic'],
      ['observations', 'observations'],
    ]);
  });

  it('проверки: сопоставимые версии и одинаковая шкала — пары, динамика и критерии', () => {
    const variable = buildResearchAnalysis(data()).variables[0]!;
    expect(variable.paired).toBe(true);
    expect(variable.checks.map((check) => [check.name, check.status])).toEqual([
      ['Замеры', 'ok'],
      ['Версия методики', 'ok'],
      ['Шкала', 'ok'],
      ['Парные измерения', 'ok'],
    ]);
    const [eg, cg] = variable.groups;
    expect(eg!.dynamics).toEqual({ pairs: 6, positive: 6, negative: 0, zero: 0 });
    expect(cg!.dynamics).toEqual({ pairs: 6, positive: 3, negative: 2, zero: 1 });
    expect(dynamicsShare(3, 6)).toBe(50);
    expect(eg!.change).toMatchObject({ n: 6, mean: 5.5, median: 5.5 });
    expect(eg!.wilcoxon).toMatchObject({ n: 6, statistic: 0, method: 'exact' });
    expect(eg!.wilcoxon!.p).toBeCloseTo(0.03125, 6);
    // КГ: нули отброшены, совпадения рангов — нормальное приближение.
    expect(cg!.wilcoxon).toMatchObject({ n: 5, zeros: 1, method: 'normal' });
    expect(variable.between.change).toMatchObject({ n1: 6, n2: 6 });
    expect(variable.between.change!.p).toBeLessThan(0.01);
    expect(variable.values.R001).toEqual({ before: 10, after: 13, change: 3 });
  });

  it('разный способ расчёта шкалы — сравнения нет', () => {
    const variable = buildResearchAnalysis(data()).variables[1]!;
    expect(variable.paired).toBe(false);
    expect(variable.checks.find((check) => check.name === 'Шкала')).toMatchObject({
      status: 'error',
    });
    expect(variable.groups[0]!.change).toBeNull();
    expect(variable.groups[0]!.wilcoxon).toBeNull();
    expect(variable.between.change).toBeNull();
    // Описательные «до» и «после» по-прежнему есть.
    expect(variable.groups[0]!.before).toMatchObject({ n: 6, mean: 20 });
  });

  it('FR-072: несопоставимые версии и один замер — изменение не считается', () => {
    const analysis = buildResearchAnalysis(data({ approved: new Set() }));
    const interest = analysis.variables[0]!;
    expect(interest.paired).toBe(false);
    expect(interest.checks.find((check) => check.name === 'Версия методики')!.status).toBe('error');
    expect(interest.values.R001!.change).toBeNull();
    const planning = analysis.variables[2]!;
    expect(planning.checks[0]).toMatchObject({ name: 'Замеры', status: 'error' });
    expect(planning.groups[0]!.after).toMatchObject({ n: 0, mean: null });
  });

  it('неполные пары исключаются попарно, мало пар — ошибка проверки', () => {
    const base = input();
    const sessions = base.sessions.filter(
      (session) =>
        !(session.measurementType === 'REPEATED' && ['s7', 's8'].includes(session.studentId)),
    );
    const variable = buildResearchAnalysis(data({ sessions })).variables[0]!;
    expect(variable.checks.at(-1)).toMatchObject({ name: 'Парные измерения', status: 'error' });
    expect(variable.groups[1]!.wilcoxon!.p).toBeNull();
    expect(variable.groups[1]!.change).toMatchObject({ n: 4, missing: 2 });
  });

  it('не выбраны семестры — ошибка проверки, без сравнения', () => {
    const grades = buildResearchAnalysis(data()).variables.find(
      (variable) => variable.key === RESEARCH_GRADES_KEY,
    )!;
    expect(grades.paired).toBe(false);
    expect(grades.checks[0]).toMatchObject({ name: 'Периоды', status: 'error' });
  });

  it('корреляции Спирмена по изменению — только сопоставимые показатели', () => {
    const analysis = buildResearchAnalysis(data());
    const change = researchCorrelations(analysis, 'change', null);
    expect(change.variables.map((variable) => variable.key)).toEqual(['q1:INT']);
    expect(change.cells).toHaveLength(0);
    const before = researchCorrelations(analysis, 'before', null, ['q1:INT', 'q1:ACH']);
    expect(before.cells).toHaveLength(1);
    expect(before.cells[0]!.result.note).toMatch(/совпадают/);
  });

  it('FR-075: таблицы для ВКР — только коды и ЭГ/КГ', () => {
    const sheets = buildResearchAnalysisSheets(data());
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Проверка данных',
      'Внутри групп',
      'ЭГ и КГ',
      'Корреляции',
      'Контрольные работы',
    ]);
    const within = sheets[1]!.table;
    expect(within.rows[0]!.slice(0, 4)).toEqual([
      'Мотивация',
      'Интерес (Мотивация учения, версии 1 → 2)',
      'ЭГ',
      6,
    ]);
    const growthIndex = within.header.indexOf('Рост, %');
    expect(within.rows[0]![growthIndex]).toBe(100);
    for (const sheet of sheets) expect(sheet.name.length).toBeLessThanOrEqual(31);
    expect(JSON.stringify(sheets)).not.toMatch(/s1"|studentId/);
  });
});
