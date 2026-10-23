import { describe, expect, it } from 'vitest';
import {
  DEMO_MARK,
  emptyQuestionnaireContent,
  type InterpretationRuleContent,
  publishIssues,
  type QuestionContent,
  type QuestionnaireContent,
  scaleScoreRange,
  scoreQuestionnaire,
  structuralIssues,
} from './diagnostics.js';

function question(key: string, overrides: Partial<QuestionContent> = {}): QuestionContent {
  return {
    key,
    text: `Вопрос ${key}`,
    type: 'LIKERT',
    isRequired: true,
    minValue: 1,
    maxValue: 5,
    minLabel: null,
    maxLabel: null,
    options: [],
    ...overrides,
  };
}

function rule(
  key: string,
  minScore: number | null,
  maxScore: number | null,
  levelCode: string,
  levelLabel: string,
): InterpretationRuleContent {
  return {
    key,
    minScore,
    maxScore,
    levelCode,
    levelLabel,
    motivationLevel: null,
    description: null,
    studentText: null,
  };
}

const choice = question('c', {
  type: 'SINGLE_CHOICE',
  minValue: null,
  maxValue: null,
  options: [
    { key: 'c1', text: 'Да', value: 2 },
    { key: 'c2', text: 'Нет', value: 0 },
  ],
});
const multi = question('m', {
  type: 'MULTIPLE_CHOICE',
  minValue: null,
  maxValue: null,
  options: [
    { key: 'm1', text: 'А', value: 1 },
    { key: 'm2', text: 'Б', value: 3 },
    { key: 'm3', text: 'В', value: 0.5 },
  ],
});

function content(): QuestionnaireContent {
  return {
    ...emptyQuestionnaireContent('Тестовая методика'),
    questions: [
      question('a'),
      question('b'),
      choice,
      multi,
      question('n', { type: 'NUMBER', minValue: 0, maxValue: null }),
    ],
    scales: [
      {
        key: 's1',
        code: 'S1',
        name: 'Первая',
        description: null,
        aggregation: 'SUM',
        motivationRole: 'REFERENCE',
        keys: [
          { questionKey: 'a', optionKey: null, points: null, isReverse: false, weight: 1 },
          { questionKey: 'b', optionKey: null, points: null, isReverse: true, weight: 1 },
          { questionKey: 'c', optionKey: null, points: null, isReverse: false, weight: 1 },
        ],
        rules: [
          rule('r1', null, 5, 'LOW', 'Низкий'),
          rule('r2', 6, 9, 'MID', 'Средний'),
          rule('r3', 10, null, 'HIGH', 'Высокий'),
        ],
      },
      {
        key: 's2',
        code: 'S2',
        name: 'Вторая',
        description: null,
        aggregation: 'SUM',
        motivationRole: 'REFERENCE',
        keys: [
          { questionKey: 'm', optionKey: 'm2', points: null, isReverse: false, weight: 1 },
          { questionKey: 'm', optionKey: 'm1', points: 4, isReverse: false, weight: 0.5 },
          { questionKey: 'n', optionKey: null, points: null, isReverse: false, weight: 0.1 },
        ],
        rules: [],
      },
    ],
  };
}

describe('движок расчёта методик', () => {
  it('FR-020, FR-021: прямые и обратные ключи, значение варианта, несколько шкал', () => {
    const [s1, s2] = scoreQuestionnaire(content(), {
      a: 4,
      b: 2,
      c: 'c1',
      m: ['m1', 'm2'],
      n: 7,
    });
    // a = 4, b обратный: 1 + 5 − 2 = 4, c = 2 → 10
    expect(s1).toMatchObject({ code: 'S1', rawScore: 10, missingAnswers: 0 });
    expect(s1!.rule?.levelCode).toBe('HIGH');
    // m2 выбран: 3; m1 выбран: 4 × 0,5 = 2; n: 7 × 0,1 = 0,7 → 5,7 без двоичной погрешности
    expect(s2).toMatchObject({ code: 'S2', rawScore: 5.7, rule: null });
  });

  it('FR-021: невыбранный вариант даёт 0, пустой список выбора — ответ, а не пропуск', () => {
    const [, s2] = scoreQuestionnaire(content(), { m: [], n: 0 });
    expect(s2).toMatchObject({ rawScore: 0, missingAnswers: 0 });
  });

  it('FR-074: пропуск ответа — балл шкалы не рассчитывается, а не равен нулю', () => {
    const [s1] = scoreQuestionnaire(content(), { a: 4, c: 'c2' });
    expect(s1).toMatchObject({ rawScore: null, missingAnswers: 1, rule: null });
  });

  it('недопустимый ответ считается пропуском', () => {
    const [s1, s2] = scoreQuestionnaire(content(), {
      a: 9,
      b: 1,
      c: 'нет-такого',
      m: ['m1'],
      n: -1,
    });
    expect(s1).toMatchObject({ rawScore: null, missingAnswers: 2 });
    expect(s2).toMatchObject({ rawScore: null, missingAnswers: 1 });
  });

  it('балл вне всех диапазонов — уровень не определён', () => {
    const data = content();
    data.scales[0]!.rules = data.scales[0]!.rules.slice(0, 1);
    const [s1] = scoreQuestionnaire(data, { a: 5, b: 1, c: 'c1' });
    expect(s1).toMatchObject({ rawScore: 12, rule: null });
  });

  it('FR-021: обратное кодирование одного варианта — по крайним значениям вариантов', () => {
    const data = content();
    data.scales[0]!.keys = [
      { questionKey: 'c', optionKey: null, points: null, isReverse: true, weight: 1 },
    ];
    expect(scoreQuestionnaire(data, { c: 'c1' })[0]!.rawScore).toBe(0);
    expect(scoreQuestionnaire(data, { c: 'c2' })[0]!.rawScore).toBe(2);
  });

  it('FR-021: среднее по пунктам шкалы округляется до 0,1', () => {
    const data = content();
    for (const scale of data.scales) scale.aggregation = 'MEAN';
    const [s1, s2] = scoreQuestionnaire(data, { a: 4, b: 2, c: 'c1', m: ['m1', 'm2'], n: 7 });
    // 10 / 3 вопроса = 3,33… → 3,3
    expect(s1).toMatchObject({ rawScore: 3.3, missingAnswers: 0 });
    // два ключа на варианты вопроса m — один пункт: 5,7 / 2 = 2,85 → 2,9
    expect(s2).toMatchObject({ rawScore: 2.9 });
    // 2 / 3 = 0,67 → 0,7; 12 / 3 = 4
    expect(scaleScoreRange(data, data.scales[0]!)).toEqual({ min: 0.7, max: 4 });
  });

  it('FR-074: пропуск ответа при среднем — балл не рассчитывается', () => {
    const data = content();
    data.scales[0]!.aggregation = 'MEAN';
    expect(scoreQuestionnaire(data, { a: 4, c: 'c2' })[0]).toMatchObject({
      rawScore: null,
      missingAnswers: 1,
    });
  });

  it('диапазон шкалы: ключи на разные варианты одного вопроса с одним ответом не складываются', () => {
    const data = content();
    // как у Ильиной: «да» — 3,6, «не знаю» — 1,2; выбирается один вариант, максимум 3,6
    data.scales[0]!.keys = [
      { questionKey: 'c', optionKey: 'c1', points: 3.6, isReverse: false, weight: 1 },
      { questionKey: 'c', optionKey: 'c2', points: 1.2, isReverse: false, weight: 1 },
    ];
    expect(scaleScoreRange(data, data.scales[0]!)).toEqual({ min: 1.2, max: 3.6 });
  });

  it('диапазон баллов шкалы по ключам', () => {
    const data = content();
    expect(scaleScoreRange(data, data.scales[0]!)).toEqual({ min: 2, max: 12 });
    // у числового вопроса нет максимума — диапазон не определён
    expect(scaleScoreRange(data, data.scales[1]!)).toBeNull();
  });
});

describe('проверки содержимого методики', () => {
  it('корректная методика публикуется без замечаний', () => {
    expect(publishIssues(content(), false)).toEqual([]);
  });

  it('ссылки ключей на несуществующие вопросы и варианты, повтор кода шкалы', () => {
    const data = content();
    data.scales[0]!.keys.push({
      questionKey: 'нет',
      optionKey: null,
      points: null,
      isReverse: false,
      weight: 1,
    });
    data.scales[1]!.keys.push({
      questionKey: 'm',
      optionKey: 'c1',
      points: null,
      isReverse: false,
      weight: 1,
    });
    data.scales[1]!.code = 's1';
    const paths = structuralIssues(data).map((issue) => issue.path);
    expect(paths).toEqual([
      'scales.0.keys.3.questionKey',
      'scales.1.code',
      'scales.1.keys.3.optionKey',
    ]);
  });

  it('пересекающиеся диапазоны, повтор ключа, обратный ключ без границ, ключ на текст', () => {
    const data = content();
    data.scales[0]!.rules[1]!.minScore = 5;
    data.questions.push(question('t', { type: 'SHORT_TEXT', minValue: null, maxValue: null }));
    data.scales[1]!.keys.push(
      { questionKey: 'n', optionKey: null, points: null, isReverse: true, weight: 1 },
      { questionKey: 't', optionKey: null, points: null, isReverse: false, weight: 1 },
    );
    const messages = publishIssues(data, false).map((issue) => issue.message);
    expect(messages).toContain('Шкала Первая: диапазоны уровней «Низкий» и «Средний» пересекаются');
    expect(messages).toContain('Шкала Вторая, ключ 4: ключ для этого вопроса уже задан');
    expect(messages).toContain(
      'Шкала Вторая, ключ 4: для обратного кодирования у вопроса должны быть заданы минимум и максимум',
    );
    expect(messages).toContain(
      'Шкала Вторая, ключ 5: текстовый ответ не участвует в подсчёте баллов',
    );
  });

  it('огр. 1: демо-методика обязана нести пометку в названии и источнике', () => {
    const data = content();
    expect(publishIssues(data, true).map((issue) => issue.path)).toEqual(['title', 'source']);
    data.title = `${DEMO_MARK}: тест`;
    data.source = DEMO_MARK;
    expect(publishIssues(data, true)).toEqual([]);
  });

  it('пустая методика и некорректная шкала Лайкерта', () => {
    const data = emptyQuestionnaireContent('');
    data.questions.push(question('q', { minValue: 1, maxValue: 1 }));
    const paths = publishIssues(data, false).map((issue) => issue.path);
    expect(paths).toEqual(['title', 'scales', 'questions.0.maxValue']);
  });
});
