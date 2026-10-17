import { describe, expect, it } from 'vitest';
import {
  answeredOnly,
  answersIssues,
  assignmentFormSchema,
  assignmentState,
  toFormQuestion,
} from './diagnostic-sessions.js';
import type { FormQuestion, QuestionContent } from './diagnostics.js';

const likert: FormQuestion = {
  key: 'q1',
  text: 'Мне интересно учиться',
  type: 'LIKERT',
  isRequired: true,
  minValue: 1,
  maxValue: 5,
  minLabel: null,
  maxLabel: null,
  options: [],
};
const comment: FormQuestion = {
  ...likert,
  key: 'q2',
  type: 'SHORT_TEXT',
  isRequired: false,
  minValue: null,
  maxValue: null,
};

describe('проверка ответов при прохождении', () => {
  it('UC-01: черновик допускает пропуски, завершение — нет', () => {
    expect(answersIssues([likert, comment], {}, false)).toEqual({});
    expect(answersIssues([likert, comment], {}, true)).toEqual({
      'answers.q1': 'Ответьте на этот вопрос',
    });
    expect(answersIssues([likert, comment], { q1: 4 }, true)).toEqual({});
  });

  it('FR-013: недопустимые значения и чужие вопросы отклоняются', () => {
    expect(answersIssues([likert], { q1: 9, x: 1 }, false)).toEqual({
      'answers.q1': 'Значение вне шкалы',
      'answers.x': 'Такого вопроса нет в методике',
    });
  });

  it('FR-023: сохраняются только ответы, пустой текст — пропуск', () => {
    expect(answeredOnly([likert, comment], { q1: 3, q2: '  ' })).toEqual({ q1: 3 });
    expect(answeredOnly([likert, comment], { q1: null, q2: ' да ' })).toEqual({ q2: 'да' });
  });

  it('форма для студента не содержит значений вариантов', () => {
    const question: QuestionContent = {
      ...likert,
      type: 'SINGLE_CHOICE',
      options: [{ key: 'o1', text: 'Да', value: 3 }],
    };
    expect(toFormQuestion(question).options).toEqual([{ key: 'o1', text: 'Да' }]);
  });
});

describe('назначение диагностики', () => {
  it('FR-019: состояние по периоду', () => {
    const period = {
      startsAt: '2026-10-10T00:00:00Z',
      endsAt: '2026-10-20T00:00:00Z',
      cancelledAt: null,
    };
    expect(assignmentState(period, new Date('2026-10-09T00:00:00Z'))).toBe('PLANNED');
    expect(assignmentState(period, new Date('2026-10-15T00:00:00Z'))).toBe('ACTIVE');
    expect(assignmentState(period, new Date('2026-10-20T00:00:00Z'))).toBe('FINISHED');
    expect(
      assignmentState({ ...period, cancelledAt: '2026-10-11T00:00:00Z' }, new Date('2026-10-15')),
    ).toBe('CANCELLED');
  });

  it('FR-018: группа или студент обязательны, окончание не раньше начала', () => {
    const base = {
      questionnaireId: 'q',
      measurementType: 'PRIMARY' as const,
      versionId: null,
      targetKind: 'group' as const,
      groupId: null,
      studentId: null,
      startsOn: '2026-10-10',
      endsOn: '2026-10-01',
    };
    const result = assignmentFormSchema.safeParse(base);
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['groupId', 'endsOn']));
    expect(
      assignmentFormSchema.safeParse({ ...base, groupId: 'g', endsOn: '2026-10-10' }).success,
    ).toBe(true);
  });
});
