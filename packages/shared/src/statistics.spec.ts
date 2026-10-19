import { describe, expect, it } from 'vitest';
import {
  buildMotivationAnalytics,
  buildResearchAggregateTable,
  buildResearchData,
  buildResearchRawTable,
  comparabilityKey,
  compareGroups,
  descriptiveStats,
  quantile,
  researchCode,
  type ResearchMeasurementDto,
  type ResearchSessionInput,
  type ScaleResultDto,
} from './index.js';

const score = (code: string, rawScore: number | null): ScaleResultDto => ({
  scaleId: code,
  code,
  name: code === 'INT' ? 'Интерес' : 'Достижения',
  rawScore,
  missingAnswers: rawScore === null ? 1 : 0,
  level: null,
});

describe('описательные статистики', () => {
  it('FR-069: эталонный набор — n, среднее, медиана, SD (n − 1), квартили, min/max', () => {
    // Эталон: R — mean, median, sd, quantile(type = 7); Excel — QUARTILE.INC.
    expect(descriptiveStats([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({
      n: 8,
      missing: 0,
      mean: 5,
      median: 4.5,
      sd: 2.138,
      min: 2,
      q1: 4,
      q3: 5.5,
      max: 9,
    });
    expect(descriptiveStats([4, 1, 3, 2])).toMatchObject({
      median: 2.5,
      q1: 1.75,
      q3: 3.25,
      sd: 1.291,
    });
  });

  it('FR-073, FR-074: пропуски не заменяются нулями и считаются отдельно', () => {
    expect(descriptiveStats([10, null, 20, undefined])).toMatchObject({
      n: 2,
      missing: 2,
      mean: 15,
      min: 10,
      max: 20,
    });
    const empty = descriptiveStats([null, null]);
    expect(empty).toEqual({
      n: 0,
      missing: 2,
      mean: null,
      median: null,
      sd: null,
      min: null,
      q1: null,
      q3: null,
      max: null,
    });
    expect(descriptiveStats([7])).toMatchObject({ n: 1, mean: 7, sd: null, q1: 7, q3: 7 });
    expect(quantile([], 0.5)).toBeNull();
  });

  it('FR-070: сравнение групп — общий итог и строки групп по названию', () => {
    const b = { id: 'b', name: 'ИС-22', course: 2, specialty: 'ИС' };
    const a = { id: 'a', name: 'ИС-21', course: 2, specialty: 'ИС' };
    const result = compareGroups(
      [
        { group: b, value: 10 },
        { group: a, value: 50 },
        { group: a, value: null },
        { group: null, value: 30 },
      ],
      (item) => item.group,
      (item) => item.value,
    );
    expect(result.total).toMatchObject({ n: 3, missing: 1, mean: 30 });
    expect(result.groups.map((row) => [row.group.name, row.stats.n, row.stats.missing])).toEqual([
      ['ИС-21', 1, 1],
      ['ИС-22', 1, 0],
    ]);
  });
});

describe('аналитика мотивации', () => {
  it('п. 4.10: до и после сопровождения — разность у студентов с обоими замерами', () => {
    const scales = [
      { code: 'INT', name: 'Интерес' },
      { code: 'ACH', name: 'Достижения' },
    ];
    const result = buildMotivationAnalytics(scales, [
      {
        studentId: 's1',
        measurementType: 'PRIMARY',
        completedAt: '2026-09-10T10:00:00Z',
        scores: [score('INT', 10), score('ACH', 5)],
      },
      {
        studentId: 's1',
        measurementType: 'REPEATED',
        completedAt: '2026-12-10T10:00:00Z',
        scores: [score('INT', 14), score('ACH', null)],
      },
      {
        studentId: 's2',
        measurementType: 'PRIMARY',
        completedAt: '2026-09-11T10:00:00Z',
        scores: [score('INT', 12), score('ACH', 6)],
      },
      // Повторный раньше первичного не считается «после».
      {
        studentId: 's3',
        measurementType: 'REPEATED',
        completedAt: '2026-09-01T10:00:00Z',
        scores: [score('INT', 1), score('ACH', 1)],
      },
      {
        studentId: 's3',
        measurementType: 'PRIMARY',
        completedAt: '2026-09-12T10:00:00Z',
        scores: [score('INT', 8), score('ACH', 4)],
      },
    ]);
    const interest = result[0]!;
    expect(
      interest.measurements.map((item) => [item.measurementType, item.stats.n, item.stats.mean]),
    ).toEqual([
      ['PRIMARY', 3, 10],
      ['REPEATED', 1, 14],
    ]);
    expect(interest.change).toMatchObject({ n: 1, missing: 2, mean: 4 });
    // Нет балла в повторном замере — пропуск, а не изменение на −5.
    expect(result[1]!.change).toMatchObject({ n: 0, missing: 3, mean: null });
  });

  it('FR-074: без повторных замеров изменение не рассчитывается', () => {
    const result = buildMotivationAnalytics(
      [{ code: 'INT', name: 'Интерес' }],
      [
        {
          studentId: 's1',
          measurementType: 'PRIMARY',
          completedAt: '2026-09-10T10:00:00Z',
          scores: [score('INT', 10)],
        },
      ],
    );
    expect(result[0]!.change).toBeNull();
  });
});

describe('данные исследования', () => {
  const version = (id: string, versionNumber: number) => ({
    questionnaireId: 'q1',
    versionId: id,
    versionNumber,
    title: 'Учебная мотивация',
    isDemo: true,
  });
  const measurement = (
    id: string,
    measurementType: ResearchMeasurementDto['measurementType'],
    versionId: string,
    versionNumber: number,
    startsOn: string,
    endsOn: string,
  ): ResearchMeasurementDto => ({
    id,
    title: id === 'm1' ? 'Входной замер' : 'Итоговый замер',
    measurementType,
    questionnaire: version(versionId, versionNumber),
    startsOn,
    endsOn,
    createdAt: '2026-09-01T00:00:00Z',
  });
  const scales = [
    { code: 'INT', name: 'Интерес' },
    { code: 'ACH', name: 'Достижения' },
  ];
  const session = (
    studentId: string,
    versionId: string,
    measurementType: ResearchSessionInput['measurementType'],
    completedAt: string,
    int: number | null,
    ach: number | null,
  ): ResearchSessionInput => ({
    studentId,
    versionId,
    measurementType,
    completedAt,
    scores: [score('INT', int), score('ACH', ach)],
  });
  const participants = [
    { studentId: 's1', code: 'R001', group: 'EXPERIMENTAL' as const, excluded: false },
    { studentId: 's2', code: 'R002', group: 'EXPERIMENTAL' as const, excluded: false },
    { studentId: 's3', code: 'R003', group: 'CONTROL' as const, excluded: false },
    { studentId: 's4', code: 'R004', group: 'CONTROL' as const, excluded: true },
  ];
  const sessions = [
    session('s1', 'v1', 'PRIMARY', '2026-09-10T08:00:00Z', 10, 5),
    session('s1', 'v1', 'REPEATED', '2026-12-10T08:00:00Z', 16, 7),
    session('s2', 'v1', 'PRIMARY', '2026-09-11T08:00:00Z', 12, null),
    session('s2', 'v1', 'REPEATED', '2026-12-11T08:00:00Z', 14, 6),
    session('s3', 'v1', 'PRIMARY', '2026-09-12T08:00:00Z', 11, 4),
    // Вне периода замера — не относится к нему.
    session('s3', 'v1', 'REPEATED', '2027-02-01T08:00:00Z', 11, 4),
    session('s4', 'v1', 'PRIMARY', '2026-09-12T08:00:00Z', 1, 1),
  ];

  it('UC-07, FR-073: полные и неполные наблюдения, исключённые не входят', () => {
    const data = buildResearchData({
      participants,
      measurements: [
        measurement('m2', 'REPEATED', 'v1', 1, '2026-12-01', '2026-12-31'),
        measurement('m1', 'PRIMARY', 'v1', 1, '2026-09-01', '2026-09-30'),
      ],
      versionScales: new Map([['v1', scales]]),
      sessions,
      approved: new Set(),
    });
    expect(data.measurements.map((item) => item.id)).toEqual(['m1', 'm2']);
    expect(data.excludedParticipants).toBe(1);
    expect(data.observations).toEqual([
      { group: 'EXPERIMENTAL', participants: 2, complete: 1, incomplete: 1 },
      { group: 'CONTROL', participants: 1, complete: 0, incomplete: 1 },
    ]);
    const primaryInterestEg = data.stats.find(
      (row) =>
        row.measurementId === 'm1' && row.scaleKey === 'q1:INT' && row.group === 'EXPERIMENTAL',
    )!;
    expect(primaryInterestEg.stats).toMatchObject({ n: 2, mean: 11 });
    const repeatedCg = data.stats.find(
      (row) => row.measurementId === 'm2' && row.scaleKey === 'q1:INT' && row.group === 'CONTROL',
    )!;
    expect(repeatedCg.stats).toMatchObject({ n: 0, missing: 1, mean: null });
    const change = data.changes[0]!;
    expect(change).toMatchObject({
      comparable: true,
      fromMeasurementId: 'm1',
      toMeasurementId: 'm2',
    });
    expect(
      change.rows.find((row) => row.scaleKey === 'q1:INT' && row.group === 'EXPERIMENTAL')!.stats,
    ).toMatchObject({ n: 2, mean: 4 });
    expect(
      change.rows.find((row) => row.scaleKey === 'q1:ACH' && row.group === 'EXPERIMENTAL')!.stats,
    ).toMatchObject({ n: 1, missing: 1, mean: 2 });
  });

  it('FR-072: изменение по несопоставимым версиям не рассчитывается до утверждения', () => {
    const input = {
      participants,
      measurements: [
        measurement('m1', 'PRIMARY', 'v1', 1, '2026-09-01', '2026-09-30'),
        measurement('m2', 'REPEATED', 'v2', 2, '2026-12-01', '2026-12-31'),
      ],
      versionScales: new Map([
        ['v1', scales],
        ['v2', scales],
      ]),
      sessions: sessions.map((item) =>
        item.measurementType === 'REPEATED' ? { ...item, versionId: 'v2' } : item,
      ),
      approved: new Set<string>(),
    };
    const blocked = buildResearchData(input).changes[0]!;
    expect(blocked.comparable).toBe(false);
    expect(blocked.rows).toEqual([]);
    expect(blocked.reason).toContain('не утверждена как сопоставимая');
    const approved = buildResearchData({
      ...input,
      approved: new Set([comparabilityKey('v1', 'v2')]),
    });
    expect(approved.changes[0]!.comparable).toBe(true);
  });

  it('FR-075: выгрузка — коды и группы, пропуск — пустая ячейка, без ФИО', () => {
    const data = buildResearchData({
      participants,
      measurements: [
        measurement('m1', 'PRIMARY', 'v1', 1, '2026-09-01', '2026-09-30'),
        measurement('m2', 'REPEATED', 'v1', 1, '2026-12-01', '2026-12-31'),
      ],
      versionScales: new Map([['v1', scales]]),
      sessions,
      approved: new Set(),
      scaleKeys: ['q1:INT'],
    });
    const raw = buildResearchRawTable(data);
    expect(raw.header.slice(0, 3)).toEqual(['Код участника', 'Группа исследования', 'Наблюдение']);
    expect(raw.header).toHaveLength(3 + 2 * 3);
    expect(raw.rows.map((row) => row.slice(0, 3))).toEqual([
      ['R001', 'ЭГ', 'полное'],
      ['R002', 'ЭГ', 'полное'],
      ['R003', 'КГ', 'неполное'],
    ]);
    expect(raw.rows[2]!.slice(6)).toEqual([null, null, null]);
    const aggregate = buildResearchAggregateTable(data);
    expect(aggregate.header).toContain('Стандартное отклонение');
    // 2 замера × 1 шкала × 2 группы + изменение × 2 группы.
    expect(aggregate.rows).toHaveLength(6);
    expect(aggregate.rows[4]![0]).toBe('Изменение (последний − первый замер)');
    expect(researchCode(7)).toBe('R007');
  });
});
