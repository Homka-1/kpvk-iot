import type {
  CabinetAssignmentsDto,
  CabinetDiagnosticDto,
  CabinetTrajectoryDto,
  DashboardDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mountWithApp, testUser } from '@/testing/mount';
import MyAchievementsView from '@/views/student/MyAchievementsView.vue';
import StudentHomeView from '@/views/student/StudentHomeView.vue';
import TeacherDashboardView from './TeacherDashboardView.vue';

// Chart.js в jsdom не рисует (нет canvas): графики заменяются заглушками с теми же данными.
vi.mock('vue-chartjs', () => {
  const stub = (name: string) => ({
    name,
    props: ['data', 'options'],
    setup(props: { data: { datasets: { data: number[] }[] } }) {
      return () =>
        h('canvas', {
          'data-chart': name,
          'data-series': JSON.stringify(props.data.datasets.map((set) => set.data)),
        });
    },
  });
  return { Bar: stub('Bar'), Doughnut: stub('Doughnut') };
});

function mockApi(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
      .split('?')[0]!
      .replace(/^\/api/, '');
    const body = responses[path];
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
  document.body.innerHTML = '';
});

const profiles = {
  total: 0,
  HIGH: 0,
  MEDIUM: 0,
  LOW: 0,
  PROPOSED: 0,
  NEEDS_MORE_DIAGNOSTICS: 0,
  NONE: 0,
};

const empty: DashboardDto = {
  period: { from: '2026-09-01', to: null },
  cards: {
    students: null,
    activeTrajectories: null,
    averageProgress: null,
    toReview: null,
    overdueAssignments: null,
    needsAttention: null,
  },
  stages: [],
  profiles,
  recentAssignments: [],
  activity: [],
  upcoming: [],
};

const filled: DashboardDto = {
  period: { from: '2026-09-01', to: null },
  cards: {
    students: 24,
    activeTrajectories: 18,
    averageProgress: 62,
    toReview: 7,
    overdueAssignments: 3,
    needsAttention: 4,
  },
  stages: [
    { position: 1, counts: { NOT_STARTED: 0, IN_PROGRESS: 2, COMPLETED: 16 } },
    { position: 2, counts: { NOT_STARTED: 16, IN_PROGRESS: 2, COMPLETED: 0 } },
  ],
  profiles: { ...profiles, total: 24, HIGH: 5, MEDIUM: 10, LOW: 3, NONE: 6 },
  recentAssignments: [
    {
      id: 'ta1',
      title: 'Эссе о мотивации',
      status: 'SUBMITTED',
      assignedAt: '2026-10-15T09:00:00Z',
      dueAt: '2026-10-20T20:59:59Z',
      student: { id: 'st1', fullName: 'Петров Иван' },
      discipline: 'Математика',
    },
  ],
  activity: [
    {
      kind: 'SUBMISSION',
      at: '2026-10-18T09:00:00Z',
      student: { id: 'st1', fullName: 'Петров Иван' },
      title: 'Эссе о мотивации',
      reviewId: 'ta1',
      open: false,
    },
    {
      kind: 'DIFFICULTY_REPORT',
      at: '2026-10-17T09:00:00Z',
      student: { id: 'st2', fullName: 'Сидорова Мария' },
      title: 'Не понимаю задачу 3',
      reviewId: null,
      open: true,
    },
  ],
  upcoming: [
    {
      kind: 'CHECKPOINT',
      id: 'cp1',
      date: '2026-11-12',
      title: 'Контрольная работа',
      stageTitle: 'Основной',
      trajectoryId: 't1',
      student: { id: 'st1', fullName: 'Петров Иван' },
      discipline: 'Математика',
    },
  ],
};

const settle = async () => {
  await flushPromises();
  await flushPromises();
};

describe('главная панель преподавателя', () => {
  it('FR-005: пустая база — «Нет данных» и пояснения вместо нулей и пустых графиков', async () => {
    mockApi({ '/dashboard': empty });
    const { wrapper } = await mountWithApp(TeacherDashboardView);
    await settle();
    const cards = wrapper.findAll('.metric-card');
    expect(cards).toHaveLength(6);
    expect(cards.every((card) => card.text().includes('Нет данных'))).toBe(true);
    const text = wrapper.text();
    expect(text).toContain('Активных ИОТ пока нет');
    expect(text).toContain('Студентов нет');
    expect(text).toContain('За период задания не назначались');
    expect(text).toContain('Ближайших контрольных точек и консультаций нет');
    expect(wrapper.find('canvas').exists()).toBe(false);
  });

  it('FR-003, FR-004: показатели ведут к отфильтрованным спискам, период уходит в запрос', async () => {
    const fetchMock = mockApi({ '/dashboard': filled });
    const { wrapper } = await mountWithApp(TeacherDashboardView);
    await settle();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('period=ACADEMIC_YEAR');

    const link = (label: string) =>
      wrapper
        .findAll('a.metric-card')
        .find((card) => card.text().includes(label))!
        .attributes('href');
    expect(link('Студентов,')).toBe('/students?attention=1');
    expect(link('Активных ИОТ')).toBe('/monitoring?from=2026-09-01&status=ACTIVE');
    expect(link('Средний %')).toBe('/monitoring?from=2026-09-01');
    expect(link('на проверке')).toBe('/assignments?tab=review');
    expect(wrapper.text()).toMatch(/62\s%/);

    // Диаграммы получают данные сервера; легенда профилей ведёт к списку студентов.
    const series = wrapper
      .findAll('canvas')
      .map((canvas) => [canvas.attributes('data-chart'), canvas.attributes('data-series')]);
    expect(series).toEqual([
      [
        'Bar',
        JSON.stringify([
          [16, 0],
          [2, 2],
          [0, 16],
        ]),
      ],
      ['Doughnut', JSON.stringify([[5, 10, 3, 0, 0, 6]])],
    ]);
    expect(wrapper.find('a[href="/students?profile=HIGH"]').text()).toContain('Высокий');

    // Ответ на проверке ведёт к проверке, нерассмотренное обращение отмечено текстом.
    expect(wrapper.find('a[href="/assignments/review/ta1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Не рассмотрено');
    expect(wrapper.find('a[href="/monitoring/t1"]').text()).toContain('12.11.2026');
  });

  it('администратор видит ссылки на свои разделы, а не показатели', async () => {
    const fetchMock = mockApi({});
    const { wrapper } = await mountWithApp(TeacherDashboardView, { user: testUser(['admin']) });
    await settle();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/dashboard'),
      expect.anything(),
    );
    expect(wrapper.text()).toContain('Панель показателей ведут преподаватели');
    expect(wrapper.find('a[href="/admin"]').exists()).toBe(true);
    expect(wrapper.find('.metric-card').exists()).toBe(false);
  });
});

const trajectory: CabinetTrajectoryDto = {
  id: 't1',
  status: 'ACTIVE',
  version: 1,
  discipline: { id: 'd1', name: 'Математика' },
  teacher: { id: 'u1', fullName: 'Иванова Анна Сергеевна' },
  goals: 'Освоить алгебру',
  plannedResults: null,
  supportMethods: null,
  startDate: null,
  plannedEndDate: null,
  currentStageId: 's2',
  approvedAt: '2026-09-10T00:00:00Z',
  completedAt: null,
  finalAssessment: null,
  stages: [
    {
      id: 's1',
      sortOrder: 0,
      title: 'Адаптационный',
      goal: 'Познакомиться с курсом',
      description: null,
      plannedResults: null,
      recommendedDifficulty: null,
      startDate: null,
      endDate: null,
      status: 'COMPLETED',
      checkpoints: [
        { id: 'k1', title: 'Входной тест', description: null, dueDate: null, status: 'PASSED' },
      ],
      materials: [],
      assignments: [],
    },
    {
      id: 's2',
      sortOrder: 1,
      title: 'Основной',
      goal: 'Научиться планировать решение задач',
      description: null,
      plannedResults: null,
      recommendedDifficulty: null,
      startDate: null,
      endDate: null,
      status: 'IN_PROGRESS',
      checkpoints: [],
      materials: [],
      assignments: [],
    },
  ],
  proposals: [],
};

const assignments: CabinetAssignmentsDto = {
  choices: [],
  items: [
    {
      id: 'a1',
      status: 'ASSIGNED',
      dueAt: '2026-11-12T20:59:59Z',
      assignedAt: '2026-10-01T00:00:00Z',
      assignment: { id: 'x', title: 'Эссе', typeName: 'Эссе', difficulty: 'BASIC', topic: null },
      discipline: { id: 'd1', name: 'Математика' },
      trajectory: null,
      choiceGroup: null,
      assignedBy: null,
      result: null,
    },
  ],
};

const diagnostics: CabinetDiagnosticDto[] = [];

describe('главная студента', () => {
  it('п. 6.5: цель, что выполнить, достижения и помощь', async () => {
    mockApi({
      '/cabinet/trajectories': [trajectory],
      '/cabinet/assignments': assignments,
      '/cabinet/diagnostics': diagnostics,
    });
    const { wrapper } = await mountWithApp(StudentHomeView, {
      path: '/student',
      user: testUser(['student']),
    });
    await settle();
    const text = wrapper.text();
    expect(text).toContain('Моя текущая цель');
    expect(text).toContain('Математика · этап 2 из 2 «Основной»');
    expect(text).toContain('Научиться планировать решение задач');
    expect(wrapper.find('a[href="/student/assignments/a1"]').text()).toContain('Задание: Эссе');
    expect(text).toContain('Назначено');
    expect(text).toContain('Пройдено этапов: 1');
    expect(text).toContain('Пройдено контрольных точек: 1');
    expect(text).toContain('Ваш преподаватель: Иванова Анна Сергеевна');
    expect(text).toContain('Задать вопрос');
    expect(text).toContain('Запросить консультацию');
  });

  it('без траектории — пояснение, а не пустые показатели', async () => {
    mockApi({
      '/cabinet/trajectories': [],
      '/cabinet/assignments': { choices: [], items: [] },
      '/cabinet/diagnostics': [],
    });
    const { wrapper } = await mountWithApp(StudentHomeView, {
      path: '/student',
      user: testUser(['student']),
    });
    await settle();
    const text = wrapper.text();
    expect(text).toContain('Траектория пока не назначена');
    expect(text).toContain('Сейчас нет заданий и диагностик к выполнению');
    expect(text).toContain('Достижений пока нет');
  });

  it('«Мои достижения»: пройденные этапы и точки; пусто — пояснение', async () => {
    mockApi({
      '/cabinet/trajectories': [trajectory],
      '/cabinet/assignments': assignments,
      '/cabinet/diagnostics': diagnostics,
    });
    const { wrapper } = await mountWithApp(MyAchievementsView, {
      path: '/student/achievements',
      user: testUser(['student']),
    });
    await settle();
    expect(wrapper.text()).toContain('Этап «Адаптационный» пройден');
    expect(wrapper.text()).toContain('Контрольная точка «Входной тест» пройдена');
    expect(wrapper.text()).toContain('Выполненных заданий пока нет');

    mockApi({
      '/cabinet/trajectories': [],
      '/cabinet/assignments': { choices: [], items: [] },
      '/cabinet/diagnostics': [],
    });
    const second = await mountWithApp(MyAchievementsView, {
      path: '/student/achievements',
      user: testUser(['student']),
    });
    await settle();
    expect(second.wrapper.text()).toContain('Достижений пока нет');
  });
});
