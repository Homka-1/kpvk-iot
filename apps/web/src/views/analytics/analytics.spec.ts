import {
  type AnalyticsDto,
  type ComparabilityQuestionnaireDto,
  descriptiveStats,
  type ResearchDataDto,
  type ResearchParticipantDto,
  type ResearchProjectDetailDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mountWithApp, testUser } from '@/testing/mount';
import AnalyticsView from './AnalyticsView.vue';
import ResearchProjectView from './ResearchProjectView.vue';
import StatsTable from './StatsTable.vue';

// Chart.js в jsdom не рисует (нет canvas): графики заменяются заглушками.
vi.mock('vue-chartjs', () => {
  const stub = (name: string) => ({
    name,
    props: ['data', 'options'],
    setup: () => () => h('canvas'),
  });
  return { Bar: stub('Bar'), Line: stub('Line'), Doughnut: stub('Doughnut') };
});

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

const called = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([input]) => String(input).split('?')[0]);

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const empty = descriptiveStats([]);
const group = { id: 'g1', name: 'ИС-21', course: 2, specialty: 'ИС' };
const distribution = {
  total: 2,
  HIGH: 1,
  MEDIUM: 0,
  LOW: 0,
  PROPOSED: 0,
  NEEDS_MORE_DIAGNOSTICS: 0,
  NONE: 1,
};

const analytics: AnalyticsDto = {
  period: { from: '2026-09-01', to: null },
  trajectories: {
    statuses: { ACTIVE: 2 },
    progress: {
      total: descriptiveStats([50, 75]),
      groups: [{ group, stats: descriptiveStats([50, 75]) }],
    },
    stagesCompleted: { total: descriptiveStats([20, 40]), groups: [] },
  },
  academic: { averageScore: { total: descriptiveStats([null, null]), groups: [] } },
  activity: {
    submissions: { total: descriptiveStats([3, 1]), groups: [] },
    helpRequests: { total: descriptiveStats([0, 0]), groups: [] },
  },
  dynamics: [],
  profiles: { total: distribution, groups: [{ group, distribution }] },
  assignments: [],
  motivation: {
    options: [
      {
        versionId: 'v1',
        questionnaireId: 'q1',
        title: 'Учебная мотивация',
        versionNumber: 1,
        isDemo: true,
      },
    ],
    selected: {
      versionId: 'v1',
      questionnaireId: 'q1',
      title: 'Учебная мотивация',
      versionNumber: 1,
      isDemo: true,
      comparableVersions: [],
    },
    completed: 3,
    incomplete: 2,
    scales: [
      {
        code: 'INT',
        name: 'Интерес',
        measurements: [{ measurementType: 'PRIMARY', stats: descriptiveStats([10, 12, 14]) }],
        change: null,
      },
    ],
  },
  truncated: false,
};

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

describe('описательные статистики в интерфейсе', () => {
  it('FR-069, FR-074: «Нет данных» вместо нулей; SD при одном значении — прочерк', async () => {
    const { wrapper } = await mountWithApp(StatsTable, {
      props: {
        caption: 'Тест',
        unit: '%',
        rows: [
          { key: 'a', label: 'ИС-21', stats: descriptiveStats([12.5, 20]) },
          { key: 'b', label: 'ИС-22', stats: descriptiveStats([null, null]) },
          { key: 'c', label: 'ИС-23', stats: descriptiveStats([7]) },
        ],
      },
    });
    const rows = wrapper.findAll('tbody tr').map((row) => row.text());
    expect(rows[0]).toContain('16,25%');
    expect(rows[1]).toContain('Нет данных');
    expect(rows[1]).not.toContain('0%');
    expect(wrapper.findAll('tbody tr')[2]!.find('[title]').text()).toBe('—');
  });
});

describe('раздел «Аналитика»', () => {
  it('FR-069, FR-070: преподаватель видит показатели по группам, без исследовательских вкладок', async () => {
    const fetchMock = mockApi({ 'GET /analytics': analytics });
    const { wrapper } = await mountWithApp(AnalyticsView, {
      path: '/analytics',
      user: testUser(['teacher']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Показатели');
    expect(text).not.toContain('Исследования');
    expect(text).toContain('Выполнение ИОТ');
    expect(text).toContain('Активна: 2');
    expect(text).toContain('Все группы');
    expect(text).toContain('Незавершённые прохождения не учитываются: 2');
    expect(text).toContain('Повторных замеров пока нет');
    // Академическая успешность без оценок — «Нет данных», не 0.
    expect(text).toContain('Нет данных');
    expect(called(fetchMock)).toEqual(['/api/analytics']);
  });

  it('UC-06, UC-07: исследователь видит исследования и выгрузку диагностики, без показателей групп', async () => {
    const fetchMock = mockApi({
      'GET /research-projects': [],
      'GET /questionnaire-comparabilities': [questionnaire],
    });
    const { wrapper } = await mountWithApp(AnalyticsView, {
      path: '/analytics',
      user: testUser(['researcher']),
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Показатели');
    expect(wrapper.text()).toContain('Новое исследование');
    expect(wrapper.text()).toContain('Исследований пока нет');
    const tab = wrapper
      .findAll('[role="tab"]')
      .find((item) => item.text().includes('Диагностика'))!;
    await tab.trigger('click');
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Выгрузка результатов диагностики');
    expect(text).toContain('Версии 1 и 2 сопоставимы');
    expect(called(fetchMock)).not.toContain('/api/analytics');
  });
});

describe('страница исследования', () => {
  const project: ResearchProjectDetailDto = {
    id: '0190a000-0000-7000-8000-000000000001',
    title: 'Эффективность ИОТ',
    description: null,
    status: 'ACTIVE',
    startsOn: '2026-09-01',
    endsOn: null,
    participants: { EXPERIMENTAL: 1, CONTROL: 1 },
    measurements: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    editable: true,
    measurementList: [
      {
        id: 'm1',
        title: 'Входной замер',
        measurementType: 'PRIMARY',
        questionnaire: {
          questionnaireId: 'q1',
          versionId: 'v1',
          versionNumber: 1,
          title: 'Учебная мотивация',
          isDemo: true,
        },
        direction: { code: 'LEARNING_MOTIVATION', name: 'Учебная мотивация' },
        startsOn: null,
        endsOn: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };
  const participants: ResearchParticipantDto[] = [
    {
      id: 'p1',
      code: 'R001',
      group: 'EXPERIMENTAL',
      academicGroup: 'ИС-21',
      includedAt: '2026-09-01T00:00:00.000Z',
      excludedAt: null,
      fullName: null,
    },
    {
      id: 'p2',
      code: 'R002',
      group: 'CONTROL',
      academicGroup: 'ИС-22',
      includedAt: '2026-09-01T00:00:00.000Z',
      excludedAt: null,
      fullName: null,
    },
  ];
  const data: ResearchDataDto = {
    measurements: project.measurementList,
    scales: [
      {
        key: 'q1:INT',
        questionnaireId: 'q1',
        questionnaireTitle: 'Учебная мотивация',
        code: 'INT',
        name: 'Интерес',
      },
    ],
    versionScales: {},
    observations: [
      { group: 'EXPERIMENTAL', participants: 1, complete: 1, incomplete: 0 },
      { group: 'CONTROL', participants: 1, complete: 0, incomplete: 1 },
    ],
    stats: [
      {
        measurementId: 'm1',
        scaleKey: 'q1:INT',
        group: 'EXPERIMENTAL',
        stats: descriptiveStats([12]),
      },
      { measurementId: 'm1', scaleKey: 'q1:INT', group: 'CONTROL', stats: empty },
    ],
    changes: [],
    excludedParticipants: 0,
    rows: [],
    outcomes: {
      periods: [
        { id: 'p2', academicYear: '2025/2026', semester: 2, label: '2025/2026, 2 семестр' },
        { id: 'p1', academicYear: '2025/2026', semester: 1, label: '2025/2026, 1 семестр' },
      ],
      gradesBefore: {
        id: 'p1',
        academicYear: '2025/2026',
        semester: 1,
        label: '2025/2026, 1 семестр',
      },
      gradesAfter: {
        id: 'p2',
        academicYear: '2025/2026',
        semester: 2,
        label: '2025/2026, 2 семестр',
      },
      observationsBefore: { from: null, to: '2026-08-31' },
      observationsAfter: { from: '2026-09-01', to: null },
      indicators: [
        { key: 'grades', name: 'Средний балл за семестр' },
        { key: 'observations', name: 'Наблюдения: средняя по критериям' },
      ],
      stats: [
        {
          indicatorKey: 'grades',
          group: 'EXPERIMENTAL',
          before: descriptiveStats([70]),
          after: descriptiveStats([80]),
          change: descriptiveStats([10]),
        },
        { indicatorKey: 'grades', group: 'CONTROL', before: empty, after: empty, change: empty },
        {
          indicatorKey: 'observations',
          group: 'EXPERIMENTAL',
          before: empty,
          after: empty,
          change: empty,
        },
        {
          indicatorKey: 'observations',
          group: 'CONTROL',
          before: empty,
          after: empty,
          change: empty,
        },
      ],
      values: {},
      controlSeries: [],
    },
  };

  it('этап 27: успеваемость и наблюдения «до/после»; значения по умолчанию без повторной загрузки', async () => {
    const fetchMock = mockApi({
      [`GET /research-projects/${project.id}`]: project,
      [`GET /research-projects/${project.id}/participants`]: participants,
      [`GET /research-projects/${project.id}/data`]: data,
      'GET /research-projects/candidate-groups': [],
    });
    const { wrapper } = await mountWithApp(ResearchProjectView, {
      path: `/analytics/research/${project.id}`,
      user: testUser(['researcher']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Средний балл за семестр');
    expect(text).toContain('До: 2025/2026, 1 семестр');
    expect(text).toContain('До: по 31.08.2026');
    expect(text).toContain('После: с 01.09.2026');
    expect(text).toContain('Изменение (после − до)');
    expect(text).toContain('Нет данных');
    expect(wrapper.find('#research-grades-before').exists()).toBe(true);
    expect(called(fetchMock).filter((path) => path?.endsWith('/data'))).toHaveLength(1);
    const exportLabels = wrapper.findAll('.research-data__radio label').map((item) => item.text());
    expect(exportLabels).toContain('Широкая таблица «до/после» (строка — участник)');
  });

  it('п. 2.4, FR-073, AT-11: коды без ФИО, полные и неполные наблюдения, экспорт', async () => {
    mockApi({
      [`GET /research-projects/${project.id}`]: project,
      [`GET /research-projects/${project.id}/participants`]: participants,
      [`GET /research-projects/${project.id}/data`]: data,
      'GET /research-projects/candidate-groups': [
        { id: 'g1', name: 'ИС-21', course: 2, specialty: 'ИС', students: 20 },
      ],
    });
    const { wrapper } = await mountWithApp(ResearchProjectView, {
      path: `/analytics/research/${project.id}`,
      user: testUser(['researcher']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Эффективность ИОТ');
    expect(text).toContain('R001');
    const headers = wrapper.findAll('.research-participants__table th').map((th) => th.text());
    expect(headers).not.toContain('Ф. И. О.');
    expect(text).toContain('Включить студентов группы');
    const observations = wrapper.findAll('.research-data__table tbody tr').map((row) => row.text());
    expect(observations[1]).toContain('Контрольная группа');
    expect(observations[1]).toMatch(/1\s*0\s*1/);
    expect(text).toContain('Нет данных');
    const buttons = wrapper.findAll('button').map((button) => button.text());
    expect(buttons).toEqual(expect.arrayContaining(['Экспортировать', 'Завершить исследование']));
    expect(buttons).not.toContain('Удалить');
  });

  it('п. 2.4: без права ведения — только просмотр, без включения групп и замеров', async () => {
    mockApi({
      [`GET /research-projects/${project.id}`]: project,
      [`GET /research-projects/${project.id}/participants`]: participants,
      [`GET /research-projects/${project.id}/data`]: data,
    });
    const viewer = testUser(['researcher'], {
      permissions: ['analytics.read', 'research.read'],
    });
    const { wrapper } = await mountWithApp(ResearchProjectView, {
      path: `/analytics/research/${project.id}`,
      user: viewer,
    });
    await flushPromises();
    const buttons = wrapper.findAll('button').map((button) => button.text());
    expect(buttons).not.toContain('Включить студентов группы');
    expect(buttons).not.toContain('Новый замер');
    expect(buttons).not.toContain('Экспортировать');
    expect(wrapper.text()).toContain('R002');
  });

  it('удаление: кнопка только у исследования в архиве; после подтверждения — DELETE и переход в аналитику', async () => {
    const archived = { ...project, status: 'ARCHIVED' as const, editable: false };
    const fetchMock = mockApi({
      [`GET /research-projects/${project.id}`]: archived,
      [`GET /research-projects/${project.id}/participants`]: participants,
      [`GET /research-projects/${project.id}/data`]: data,
      [`DELETE /research-projects/${project.id}`]: {},
    });
    const { wrapper, router } = await mountWithApp(ResearchProjectView, {
      path: `/analytics/research/${project.id}`,
      user: testUser(['researcher']),
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Удалить')!
      .trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Удалить исследование?');
    document.body.querySelector('[role="dialog"] form')!.dispatchEvent(new Event('submit'));
    await flushPromises();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')!;
    expect(String(call[0])).toBe(`/api/research-projects/${project.id}`);
    expect(router.currentRoute.value.path).toBe('/analytics');
    wrapper.unmount();
  });
});
