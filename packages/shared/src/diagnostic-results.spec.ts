import { describe, expect, it } from 'vitest';
import {
  buildDiagnosticComparisons,
  buildDiagnosticExportTable,
  comparabilityKey,
  type ComparisonSessionInput,
  versionsComparable,
} from './diagnostic-results.js';
import type { ScaleResultDto } from './diagnostic-sessions.js';

const score = (code: string, rawScore: number | null, missingAnswers = 0): ScaleResultDto => ({
  scaleId: `s-${code}`,
  code,
  name: code === 'interest' ? 'Интерес' : 'Достижение',
  rawScore,
  missingAnswers,
  level: rawScore === null ? null : { code: 'mid', label: 'Средний' },
});

const session = (
  id: string,
  versionId: string,
  versionNumber: number,
  measurementType: ComparisonSessionInput['measurementType'],
  completedAt: string,
  scores: ScaleResultDto[],
  questionnaireId = 'q1',
): ComparisonSessionInput => ({
  id,
  questionnaire: { questionnaireId, versionId, versionNumber, title: 'Методика', isDemo: true },
  measurementType,
  source: 'ONLINE',
  completedAt,
  scores,
});

describe('сравнение замеров', () => {
  it('UC-06: сопоставимость — та же версия или утверждённая пара, без учёта порядка', () => {
    const approved = new Set([comparabilityKey('v2', 'v1')]);
    expect(comparabilityKey('v1', 'v2')).toBe(comparabilityKey('v2', 'v1'));
    expect(versionsComparable('v1', 'v1', new Set())).toBe(true);
    expect(versionsComparable('v1', 'v2', approved)).toBe(true);
    expect(versionsComparable('v1', 'v3', approved)).toBe(false);
  });

  it('FR-024, FR-015: первичный и повторный замер одной версии, изменение по шкалам', () => {
    const [comparison] = buildDiagnosticComparisons(
      [
        session('b', 'v1', 1, 'REPEATED', '2026-12-01T00:00:00Z', [
          score('interest', 18.5),
          score('achievement', 12),
        ]),
        session('a', 'v1', 1, 'PRIMARY', '2026-09-01T00:00:00Z', [
          score('interest', 12.2),
          score('achievement', 14),
        ]),
      ],
      new Set(),
    );
    expect(comparison!.measurements.map((item) => item.sessionId)).toEqual(['a', 'b']);
    expect(comparison!.scales.map((scale) => scale.code)).toEqual(['interest', 'achievement']);
    expect(comparison!.changes).toEqual({ interest: 6.3, achievement: -2 });
    expect(comparison!.excluded).toEqual([]);
  });

  it('FR-074: пропуск не превращается в ноль; один замер — изменения нет', () => {
    const [two] = buildDiagnosticComparisons(
      [
        session('a', 'v1', 1, 'PRIMARY', '2026-09-01T00:00:00Z', [score('interest', null, 2)]),
        session('b', 'v1', 1, 'REPEATED', '2026-12-01T00:00:00Z', [score('interest', 10)]),
      ],
      new Set(),
    );
    expect(two!.measurements[0]!.values.interest).toMatchObject({
      rawScore: null,
      missingAnswers: 2,
    });
    expect(two!.changes.interest).toBeNull();
    const [one] = buildDiagnosticComparisons(
      [session('a', 'v1', 1, 'PRIMARY', '2026-09-01T00:00:00Z', [score('interest', 10)])],
      new Set(),
    );
    expect(one!.changes.interest).toBeNull();
  });

  it('UC-06: несопоставимая версия исключается с причиной; после утверждения — входит', () => {
    const sessions = [
      session('a', 'v1', 1, 'PRIMARY', '2026-09-01T00:00:00Z', [score('interest', 10)]),
      session('b', 'v2', 2, 'REPEATED', '2026-12-01T00:00:00Z', [score('achievement', 7)]),
    ];
    const [without] = buildDiagnosticComparisons(sessions, new Set());
    expect(without!.measurements).toHaveLength(1);
    expect(without!.excluded).toEqual([
      expect.objectContaining({
        sessionId: 'b',
        reason: 'Версия 2 не утверждена как сопоставимая с версией 1',
      }),
    ]);
    const [withPair] = buildDiagnosticComparisons(
      sessions,
      new Set([comparabilityKey('v1', 'v2')]),
    );
    expect(withPair!.measurements).toHaveLength(2);
    // Шкалы «interest» нет в версии 2: null — шкалы нет, а не ноль.
    expect(withPair!.measurements[1]!.values.interest).toBeNull();
    expect(withPair!.changes.interest).toBeNull();
  });

  it('UC-06: базовый — самый ранний первичный; замеры до него не сравниваются', () => {
    const [comparison] = buildDiagnosticComparisons(
      [
        session('x', 'v1', 1, 'INTERMEDIATE', '2026-08-01T00:00:00Z', [score('interest', 5)]),
        session('a', 'v1', 1, 'PRIMARY', '2026-09-01T00:00:00Z', [score('interest', 10)]),
        session('b', 'v1', 1, 'REPEATED', '2026-12-01T00:00:00Z', [score('interest', 11)]),
      ],
      new Set(),
    );
    expect(comparison!.measurements.map((item) => item.sessionId)).toEqual(['a', 'b']);
    expect(comparison!.excluded).toEqual([
      expect.objectContaining({ sessionId: 'x', reason: 'Проведён раньше первичного замера' }),
    ]);
  });

  it('FR-024: сравнения по методикам отдельно, сначала методика с последним замером', () => {
    const list = buildDiagnosticComparisons(
      [
        session('a', 'v1', 1, 'PRIMARY', '2026-09-01T00:00:00Z', [score('interest', 1)], 'q1'),
        session('c', 'w1', 1, 'PRIMARY', '2026-10-01T00:00:00Z', [score('interest', 1)], 'q2'),
      ],
      new Set(),
    );
    expect(list.map((item) => item.questionnaireId)).toEqual(['q2', 'q1']);
  });
});

describe('обезличенная выгрузка', () => {
  it('FR-025, FR-074: код участника, версия, пустые ячейки вместо нулей', () => {
    const table = buildDiagnosticExportTable([
      {
        participantCode: 'P-0001',
        groupName: 'ИС-21',
        questionnaireTitle: 'Методика',
        versionNumber: 1,
        measurementType: 'PRIMARY',
        source: 'ONLINE',
        completedAt: '2026-09-01T00:00:00.000Z',
        durationSeconds: 300,
        scores: [score('interest', null, 2)],
      },
      {
        participantCode: 'P-0002',
        groupName: null,
        questionnaireTitle: 'Методика',
        versionNumber: 2,
        measurementType: 'REPEATED',
        source: 'PAPER',
        completedAt: '2026-12-01T00:00:00.000Z',
        durationSeconds: null,
        scores: [score('achievement', 7)],
      },
    ]);
    expect(table.header.slice(0, 8)).toEqual([
      'Код участника',
      'Группа',
      'Методика',
      'Версия методики',
      'Замер',
      'Способ прохождения',
      'Дата прохождения',
      'Время прохождения, с',
    ]);
    expect(table.header.slice(8)).toEqual([
      'Интерес (interest): балл',
      'Интерес (interest): уровень',
      'Интерес (interest): без ответа',
      'Достижение (achievement): балл',
      'Достижение (achievement): уровень',
      'Достижение (achievement): без ответа',
    ]);
    expect(table.rows[0]).toEqual([
      'P-0001',
      'ИС-21',
      'Методика',
      1,
      'Первичный',
      expect.any(String),
      '2026-09-01T00:00:00.000Z',
      300,
      null,
      null,
      2,
      null,
      null,
      null,
    ]);
    expect(table.rows[1]!.slice(8)).toEqual([null, null, null, 7, 'Средний', 0]);
  });
});
