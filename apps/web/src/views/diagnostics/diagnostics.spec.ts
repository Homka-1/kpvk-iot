import type {
  QuestionnaireContent,
  QuestionnaireDetailDto,
  QuestionnaireVersionDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp } from '@/testing/mount';
import { changeQuestionType, newQuestion, removeOption, removeQuestion } from './content';
import QuestionnaireEditorView from './QuestionnaireEditorView.vue';

const Q_ID = '01900000-0000-7000-8000-0000000000f1';
const V1 = '01900000-0000-7000-8000-0000000000f2';
const V2 = '01900000-0000-7000-8000-0000000000f3';

function sampleContent(): QuestionnaireContent {
  return {
    title: 'Учебная мотивация',
    author: null,
    purpose: null,
    instruction: 'Ответьте на вопросы',
    ageRestrictions: null,
    source: null,
    termsOfUse: null,
    allowDraft: true,
    changeNote: null,
    questions: [
      {
        key: 'q1',
        text: 'Мне интересно',
        type: 'LIKERT',
        isRequired: true,
        minValue: 1,
        maxValue: 5,
        minLabel: null,
        maxLabel: null,
        options: [],
      },
      {
        key: 'q2',
        text: 'Почему выбрали специальность',
        type: 'SINGLE_CHOICE',
        isRequired: true,
        minValue: null,
        maxValue: null,
        minLabel: null,
        maxLabel: null,
        options: [
          { key: 'o1', text: 'Интересно', value: 2 },
          { key: 'o2', text: 'Случайно', value: 0 },
        ],
      },
    ],
    scales: [
      {
        key: 's1',
        code: 'COGNITIVE',
        name: 'Познавательная',
        description: null,
        aggregation: 'SUM',
        motivationRole: 'REFERENCE',
        keys: [
          { questionKey: 'q1', optionKey: null, points: null, isReverse: false, weight: 1 },
          { questionKey: 'q2', optionKey: 'o1', points: 1, isReverse: false, weight: 1 },
        ],
        rules: [],
      },
    ],
  };
}

function version(
  id: string,
  number: number,
  status: 'DRAFT' | 'PUBLISHED',
): QuestionnaireVersionDto {
  return {
    id,
    questionnaireId: Q_ID,
    versionNumber: number,
    status,
    title: 'Учебная мотивация',
    changeNote: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    publishedAt: status === 'PUBLISHED' ? '2026-10-02T08:00:00.000Z' : null,
    content: sampleContent(),
  };
}

function detail(versions: QuestionnaireVersionDto[]): QuestionnaireDetailDto {
  return {
    id: Q_ID,
    status: 'ACTIVE',
    isDemo: false,
    direction: null,
    copiedFrom: null,
    archivedAt: null,
    versions: versions.map(({ content: _content, questionnaireId: _q, ...info }) => info),
    comparabilities: [],
  };
}

/** Ответы API по «МЕТОД путь»; функция-значение получает тело запроса. */
function mockApi(responses: Record<string, unknown | ((body: unknown) => [number, unknown])>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
      .split('?')[0]!
      .replace(/^\/api/, '');
    const handler = responses[`${init?.method ?? 'GET'} ${path}`];
    const [status, body] =
      typeof handler === 'function'
        ? (handler as (body: unknown) => [number, unknown])(
            init?.body ? JSON.parse(String(init.body)) : undefined,
          )
        : handler === undefined
          ? [404, { message: 'Не найдено' }]
          : [200, handler];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('правка документа методики', () => {
  it('удаление вопроса и варианта убирает ссылающиеся на них ключи', () => {
    const content = sampleContent();
    removeOption(content, content.questions[1]!, 0);
    expect(content.scales[0]!.keys.map((key) => key.questionKey)).toEqual(['q1']);
    removeQuestion(content, 0);
    expect(content.scales[0]!.keys).toEqual([]);
  });

  it('смена типа вопроса: варианты и границы по умолчанию, ключи по вариантам убираются', () => {
    const content = sampleContent();
    changeQuestionType(content, content.questions[1]!, 'NUMBER');
    expect(content.questions[1]).toMatchObject({ options: [], minValue: null, maxValue: null });
    expect(content.scales[0]!.keys).toHaveLength(1);
    const choice = newQuestion('MULTIPLE_CHOICE');
    expect(choice.options).toHaveLength(2);
    expect(choice.key).toMatch(/^new-/);
    expect(newQuestion()).toMatchObject({ type: 'LIKERT', minValue: 1, maxValue: 5 });
  });
});

describe('QuestionnaireEditorView', () => {
  async function mountEditor() {
    const result = await mountWithApp(QuestionnaireEditorView, {
      path: `/diagnostics/questionnaires/${Q_ID}`,
      attachTo: document.body,
    });
    await flushPromises();
    return result;
  }

  const button = (wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'], label: string) =>
    wrapper.findAll('button').find((item) => item.text() === label);

  it('FR-026: опубликованная версия только для чтения, изменение — через новую версию', async () => {
    const v1 = version(V1, 1, 'PUBLISHED');
    mockApi({
      [`GET /questionnaires/${Q_ID}`]: detail([v1]),
      [`GET /questionnaires/${Q_ID}/versions/${V1}`]: v1,
      'GET /diagnostic-directions': [],
    });
    const { wrapper } = await mountEditor();
    expect(wrapper.find('h1').text()).toBe('Учебная мотивация');
    expect(wrapper.text()).toContain('Опубликована');
    expect(wrapper.text()).toContain('Опубликованная версия не изменяется');
    expect(wrapper.find('#passport-title').attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'Сохранить')).toBeUndefined();
    expect(button(wrapper, 'Создать новую версию')).toBeDefined();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Паспорт',
      'Вопросы (2)',
      'Шкалы и ключи (1)',
      'Интерпретация',
      'Версии (1)',
    ]);
    wrapper.unmount();
  });

  it('FR-017: черновик сохраняется целиком; замечания публикации показываются списком', async () => {
    const v1 = version(V1, 1, 'PUBLISHED');
    const v2 = version(V2, 2, 'DRAFT');
    let saved: QuestionnaireContent | undefined;
    mockApi({
      [`GET /questionnaires/${Q_ID}`]: detail([v2, v1]),
      [`GET /questionnaires/${Q_ID}/versions/${V2}`]: v2,
      [`PUT /questionnaires/${Q_ID}/versions/${V2}`]: (body: unknown) => {
        saved = body as QuestionnaireContent;
        return [200, { ...v2, content: saved }];
      },
      [`POST /questionnaires/${Q_ID}/versions/${V2}/publish`]: () => [
        400,
        {
          statusCode: 400,
          message: 'Версию нельзя опубликовать: исправьте замечания',
          fields: { 'scales.0.rules': 'Шкала Познавательная: диапазоны уровней пересекаются' },
        },
      ],
      'GET /diagnostic-directions': [],
    });
    const { wrapper } = await mountEditor();
    expect(wrapper.text()).toContain('Версия 2');
    expect(button(wrapper, 'Сохранить')!.attributes('disabled')).toBeDefined();

    await wrapper.find('#passport-title').setValue('Учебная мотивация, ред. 2');
    expect(wrapper.text()).toContain('Есть несохранённые изменения');
    await button(wrapper, 'Сохранить')!.trigger('click');
    await flushPromises();
    expect(saved).toMatchObject({
      title: 'Учебная мотивация, ред. 2',
      questions: expect.any(Array),
    });
    expect(saved!.scales[0]!.keys).toHaveLength(2);
    expect(wrapper.text()).toContain('Черновик сохранён');

    await button(wrapper, 'Опубликовать версию')!.trigger('click');
    await flushPromises();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('станет действующей и больше не изменится');
    (dialog.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(wrapper.text()).toContain('Версию нельзя опубликовать: исправьте замечания');
    expect(wrapper.text()).toContain('Шкала Познавательная: диапазоны уровней пересекаются');
    wrapper.unmount();
  });
});
