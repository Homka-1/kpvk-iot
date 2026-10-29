import {
  answersIssues,
  type MotivationLevel,
  type QuestionContent,
  type QuestionnaireContent,
  type ScaleContent,
  toDiagnosticForm,
} from '@iot/shared';
import { answersForLevel, generateAnswers, intrinsicLevel, levelFor } from './demo-answers.js';
import { seededRandom } from './demo-random.js';

const likert = (key: string): QuestionContent => ({
  key,
  text: key,
  type: 'LIKERT',
  isRequired: true,
  minValue: 1,
  maxValue: 5,
  minLabel: null,
  maxLabel: null,
  options: [],
});

const yesNo = (key: string): QuestionContent => ({
  key,
  text: key,
  type: 'SINGLE_CHOICE',
  isRequired: true,
  minValue: null,
  maxValue: null,
  minLabel: null,
  maxLabel: null,
  options: [
    { key: `${key}-yes`, text: 'Да', value: 1 },
    { key: `${key}-no`, text: 'Нет', value: 0 },
  ],
});

function scale(
  key: string,
  role: ScaleContent['motivationRole'],
  aggregation: ScaleContent['aggregation'],
  keys: ScaleContent['keys'],
): ScaleContent {
  return {
    key,
    code: key,
    name: key,
    description: null,
    aggregation,
    motivationRole: role,
    keys,
    rules: [],
  };
}

const base = {
  title: 'Тест',
  author: null,
  purpose: null,
  instruction: null,
  ageRestrictions: null,
  source: null,
  termsOfUse: null,
  allowDraft: true,
  changeNote: null,
};

/** Как Реан — Якунин (Бадмаева): Лайкерт 1–5, средние по шкалам, есть обратные пункты. */
const meanContent: QuestionnaireContent = {
  ...base,
  questions: Array.from({ length: 15 }, (_, index) => likert(`q${index}`)),
  scales: [
    scale(
      'in1',
      'INTRINSIC',
      'MEAN',
      [0, 1, 2, 3, 4].map((i) => ({
        questionKey: `q${i}`,
        optionKey: null,
        points: null,
        isReverse: i === 4,
        weight: 1,
      })),
    ),
    scale(
      'in2',
      'INTRINSIC',
      'MEAN',
      [5, 6, 7, 8, 9].map((i) => ({
        questionKey: `q${i}`,
        optionKey: null,
        points: null,
        isReverse: false,
        weight: 1,
      })),
    ),
    scale(
      'ex',
      'EXTRINSIC',
      'MEAN',
      [10, 11, 12, 13, 14].map((i) => ({
        questionKey: `q${i}`,
        optionKey: null,
        points: null,
        isReverse: false,
        weight: 1,
      })),
    ),
  ],
};

/** Как Ильина: «да/нет», баллы за ключевой ответ, процент от максимума суммы. */
const percentContent: QuestionnaireContent = {
  ...base,
  questions: Array.from({ length: 20 }, (_, index) => yesNo(`y${index}`)),
  scales: [
    scale(
      'in',
      'INTRINSIC',
      'SUM',
      Array.from({ length: 12 }, (_, i) => ({
        questionKey: `y${i}`,
        optionKey: i % 3 === 0 ? `y${i}-no` : `y${i}-yes`,
        points: 1,
        isReverse: false,
        weight: 1,
      })),
    ),
    scale(
      'ex',
      'EXTRINSIC',
      'SUM',
      Array.from({ length: 8 }, (_, i) => ({
        questionKey: `y${i + 12}`,
        optionKey: `y${i + 12}-yes`,
        points: 1,
        isReverse: false,
        weight: 1,
      })),
    ),
  ],
};

describe('Генератор ответов демо-активности', () => {
  it('ответы полны и допустимы для формы методики', () => {
    const random = seededRandom(1);
    for (const content of [meanContent, percentContent]) {
      const answers = generateAnswers(
        content,
        { INTRINSIC: 0.5, EXTRINSIC: 0.5, REFERENCE: 0.5 },
        random,
      );
      expect(answersIssues(toDiagnosticForm(content).questions, answers, true)).toEqual({});
    }
  });

  it('уровень следует склонности к внутренней мотивации', () => {
    const random = seededRandom(2);
    const high = generateAnswers(
      meanContent,
      { INTRINSIC: 0.95, EXTRINSIC: 0.5, REFERENCE: 0.5 },
      random,
    );
    const low = generateAnswers(
      meanContent,
      { INTRINSIC: 0.05, EXTRINSIC: 0.5, REFERENCE: 0.5 },
      random,
    );
    expect(intrinsicLevel(meanContent, high)).toBe('HIGH');
    expect(intrinsicLevel(meanContent, low)).toBe('LOW');
  });

  it.each(['HIGH', 'MEDIUM', 'LOW'] as MotivationLevel[])(
    'FR-027: подбор ответов даёт целевой уровень %s по правилу этапа 24 для обоих форматов шкал',
    (target) => {
      const random = seededRandom(target.length);
      for (const content of [meanContent, percentContent]) {
        for (let i = 0; i < 20; i += 1) {
          const disposition = { INTRINSIC: random(), EXTRINSIC: random(), REFERENCE: random() };
          const answers = answersForLevel(content, disposition, target, random);
          expect(intrinsicLevel(content, answers)).toBe(target);
        }
      }
    },
  );

  it('методика без внутренних шкал не участвует в подборе уровня', () => {
    const reference = {
      ...meanContent,
      scales: meanContent.scales.map((item) => ({ ...item, motivationRole: 'REFERENCE' as const })),
    };
    expect(
      intrinsicLevel(
        reference,
        generateAnswers(reference, { INTRINSIC: 1, EXTRINSIC: 0, REFERENCE: 1 }, seededRandom(3)),
      ),
    ).toBeNull();
  });

  it('пороги склонности для уровня', () => {
    expect([levelFor(0.9), levelFor(0.5), levelFor(0.2)]).toEqual(['HIGH', 'MEDIUM', 'LOW']);
  });
});
