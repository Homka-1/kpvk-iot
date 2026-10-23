import { describe, expect, it } from 'vitest';
import {
  lessonJournalStatus,
  normalizePersonName,
  observationCriteriaSchema,
  parseScheduleDate,
  parseScheduleTime,
  personNameKeys,
  summarizeCriteria,
} from './lessons.js';

describe('Расписание занятий: разбор файла', () => {
  it.each([
    ['01.09.2025', '2025-09-01'],
    ['1.9.2025', '2025-09-01'],
    ['01/09/2025', '2025-09-01'],
    ['01-09-25', '2025-09-01'],
    ['2025-09-01', '2025-09-01'],
    [' 15.02.2026 ', '2026-02-15'],
  ])('дата %s → %s', (input, expected) => {
    expect(parseScheduleDate(input)).toBe(expected);
  });

  it.each(['31.02.2026', '2026-13-01', '01.09', 'завтра', ''])(
    'неверная дата «%s» → null',
    (input) => {
      expect(parseScheduleDate(input)).toBeNull();
    },
  );

  it.each([
    ['8:30', '08:30'],
    ['08.30', '08:30'],
    ['08:30–10:00', '08:30'],
    ['13:05 - 14:35', '13:05'],
  ])('время %s → %s', (input, expected) => {
    expect(parseScheduleTime(input)).toBe(expected);
  });

  it.each(['24:00', '8:60', '830', 'утро'])('неверное время «%s» → null', (input) => {
    expect(parseScheduleTime(input)).toBeNull();
  });

  it('ФИО преподавателя: полностью, с инициалами, «ё» и регистр не важны', () => {
    const keys = personNameKeys({
      lastName: 'Семёнова',
      firstName: 'Анна',
      middleName: 'Петровна',
    });
    for (const written of [
      'Семенова Анна Петровна',
      'Семёнова А.П.',
      'семенова а. п.',
      'Семенова',
    ]) {
      expect(keys).toContain(normalizePersonName(written));
    }
    expect(keys).not.toContain(normalizePersonName('Семенова Б.П.'));
  });
});

describe('Журнал наблюдений на занятии', () => {
  it('FR-074: средняя только по оценкам; «Не наблюдалось» и пропуски не дают нулей', () => {
    const summary = summarizeCriteria(
      ['a', 'b', 'c'],
      [
        { criterionId: 'a', score: 4 },
        { criterionId: 'a', score: 5 },
        { criterionId: 'a', score: null },
        { criterionId: 'a', score: 4 },
        { criterionId: 'b', score: null },
      ],
    );
    expect(summary).toEqual([
      { criterionId: 'a', mean: 4.3, rated: 3, notObserved: 1 },
      { criterionId: 'b', mean: null, rated: 0, notObserved: 1 },
      { criterionId: 'c', mean: null, rated: 0, notObserved: 0 },
    ]);
  });

  it('заполненность журнала', () => {
    expect(lessonJournalStatus(0, 20)).toBe('EMPTY');
    expect(lessonJournalStatus(5, 20)).toBe('PARTIAL');
    expect(lessonJournalStatus(20, 20)).toBe('COMPLETE');
    expect(lessonJournalStatus(0, 0)).toBe('EMPTY');
  });

  it('список критериев: хотя бы один действующий, без повторов названий', () => {
    expect(
      observationCriteriaSchema.safeParse([{ name: 'Активность', archived: true }]).success,
    ).toBe(false);
    expect(
      observationCriteriaSchema.safeParse([
        { name: 'Активность', archived: false },
        { name: 'активность ', archived: true },
      ]).success,
    ).toBe(false);
    expect(
      observationCriteriaSchema.safeParse([
        { name: 'Активность', archived: false },
        { name: 'Инициативность', archived: true },
      ]).success,
    ).toBe(true);
  });
});
