import type {
  ComparabilityQuestionnaireDto,
  DiagnosticComparisonDto,
  ScaleResultDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mountWithApp, testUser } from '@/testing/mount';
import AnalyticsView from '@/views/analytics/AnalyticsView.vue';
import DiagnosticComparison from './DiagnosticComparison.vue';

// Chart.js в jsdom не рисует (нет canvas): график заменяется заглушкой с теми же данными.
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    setup(props: { data: { datasets: { data: (number | null)[] }[] } }) {
      return () =>
        h('canvas', { 'data-series': JSON.stringify(props.data.datasets.map((d) => d.data)) });
    },
  },
}));

const score = (
  code: string,
  name: string,
  rawScore: number | null,
  missing = 0,
): ScaleResultDto => ({
  scaleId: code,
  code,
  name,
  rawScore,
  missingAnswers: missing,
  level: rawScore === null ? null : { code: 'mid', label: 'Средний' },
});

const comparison: DiagnosticComparisonDto = {
  questionnaireId: 'q1',
  title: 'ДЕМО — не для исследования: Учебная мотивация',
  isDemo: true,
  scales: [
    { code: 'INTEREST', name: 'Интерес' },
    { code: 'ACHIEVEMENT', name: 'Достижения' },
  ],
  measurements: [
    {
      sessionId: 's1',
      measurementType: 'PRIMARY',
      source: 'ONLINE',
      versionId: 'v1',
      versionNumber: 1,
      completedAt: '2026-09-10T10:00:00.000Z',
      values: {
        INTEREST: score('INTEREST', 'Интерес', 12),
        ACHIEVEMENT: score('ACHIEVEMENT', 'Достижения', null, 2),
      },
    },
    {
      sessionId: 's2',
      measurementType: 'REPEATED',
      source: 'PAPER',
      versionId: 'v1',
      versionNumber: 1,
      completedAt: '2026-12-10T10:00:00.000Z',
      values: {
        INTEREST: score('INTEREST', 'Интерес', 15.5),
        ACHIEVEMENT: score('ACHIEVEMENT', 'Достижения', 9),
      },
    },
  ],
  changes: { INTEREST: 3.5, ACHIEVEMENT: null },
  excluded: [
    {
      sessionId: 's3',
      measurementType: 'INTERMEDIATE',
      versionNumber: 2,
      completedAt: '2026-11-01T10:00:00.000Z',
      reason: 'Версия 2 не утверждена как сопоставимая с версией 1',
    },
  ],
};

function mockApi(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
      .split('?')[0]!
      .replace(/^\/api/, '');
    const body = responses[`${init?.method ?? 'GET'} ${path}`];
    return new Response(JSON.stringify(body ?? { message: 'Не найдено' }), {
      status: body === undefined ? 404 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('сравнение замеров', () => {
  it('AT-10, FR-024: повторный замер рядом с первичным, изменение со стрелкой и текстом', async () => {
    const { wrapper } = await mountWithApp(DiagnosticComparison, { props: { comparison } });
    const headers = wrapper.findAll('thead th').map((cell) => cell.text());
    expect(headers[1]).toContain('Первичный');
    expect(headers[1]).toContain('10.09.2026, версия 1');
    expect(headers[2]).toContain('Повторный');
    expect(headers[3]).toBe('Изменение');
    const rows = wrapper.findAll('tbody tr').map((row) => row.text());
    expect(rows[0]).toContain('+3,5');
    expect(wrapper.find('tbody tr .pi-arrow-up-right').exists()).toBe(true);
  });

  it('FR-074, FR-015: пропуск — «Нет данных», на графике — разрыв (null), не ноль', async () => {
    const { wrapper } = await mountWithApp(DiagnosticComparison, { props: { comparison } });
    const achievement = wrapper.findAll('tbody tr')[1]!.text();
    expect(achievement).toContain('Нет данных');
    expect(achievement).toContain('без ответа: 2');
    const series = JSON.parse(wrapper.find('canvas').attributes('data-series')!);
    expect(series).toEqual([
      [12, 15.5],
      [null, 9],
    ]);
  });

  it('UC-06: несопоставимый замер показан отдельно с причиной; один замер — без графика', async () => {
    const { wrapper } = await mountWithApp(DiagnosticComparison, { props: { comparison } });
    expect(wrapper.text()).toContain('Не входят в сравнение');
    expect(wrapper.text()).toContain('Версия 2 не утверждена как сопоставимая с версией 1');

    const single = await mountWithApp(DiagnosticComparison, {
      props: {
        comparison: {
          ...comparison,
          measurements: comparison.measurements.slice(0, 1),
          changes: {},
          excluded: [],
        },
      },
    });
    expect(single.wrapper.text()).toContain('Пока один замер');
    expect(single.wrapper.find('canvas').exists()).toBe(false);
  });
});

describe('раздел «Аналитика»', () => {
  const questionnaire: ComparabilityQuestionnaireDto = {
    id: 'q1',
    title: 'Учебная мотивация',
    isDemo: false,
    versions: [
      {
        id: 'v2',
        versionNumber: 2,
        title: 'Учебная мотивация',
        status: 'PUBLISHED',
        publishedAt: null,
      },
      {
        id: 'v1',
        versionNumber: 1,
        title: 'Учебная мотивация',
        status: 'RETIRED',
        publishedAt: null,
      },
    ],
    comparabilities: [
      {
        id: 'c1',
        versionA: { id: 'v1', versionNumber: 1 },
        versionB: { id: 'v2', versionNumber: 2 },
        note: 'Ключи не менялись',
        approvedAt: '2026-10-10T10:00:00.000Z',
        approvedBy: { id: 'u1', fullName: 'Петрова А. А.' },
      },
    ],
  };

  it('UC-06, FR-025: исследователь видит выгрузку и сопоставимость с кнопками управления', async () => {
    mockApi({ 'GET /questionnaire-comparabilities': [questionnaire] });
    const { wrapper } = await mountWithApp(AnalyticsView, {
      path: '/analytics',
      user: testUser(['researcher']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Выгрузка результатов диагностики');
    expect(text).toContain('Версии 1 и 2 сопоставимы');
    expect(text).toContain('Ключи не менялись');
    const labels = wrapper.findAll('button').map((button) => button.text());
    expect(labels).toEqual(
      expect.arrayContaining(['Выгрузить', 'Утвердить сопоставимость', 'Отозвать']),
    );
  });

  it('п. 2.4: преподаватель без исследовательских прав видит только пояснение', async () => {
    const fetchMock = mockApi({});
    const { wrapper } = await mountWithApp(AnalyticsView, {
      path: '/analytics',
      user: testUser(['teacher']),
    });
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('Выгрузка результатов');
    expect(wrapper.text()).toContain('в разработке');
  });
});
