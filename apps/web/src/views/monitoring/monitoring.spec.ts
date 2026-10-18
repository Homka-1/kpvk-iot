import {
  type MonitoringDto,
  type MonitoringRowDto,
  STANDARD_TRAJECTORY_STAGES,
  type TrajectoryDto,
  type TrajectoryStageDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp } from '@/testing/mount';
import TrajectoryEditor from '@/views/trajectories/TrajectoryEditor.vue';
import MonitoringView from './MonitoringView.vue';

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
  document.body.innerHTML = '';
});

const row: MonitoringRowDto = {
  trajectoryId: 't1',
  status: 'NEEDS_CORRECTION',
  version: 2,
  student: {
    id: 'st1',
    fullName: 'Петров Иван',
    participantCode: 'S-AAAAAA',
    group: { id: 'g1', name: 'ПО-21', course: 2, specialty: 'ПО' },
    supportStatus: 'ADDITIONAL_SUPPORT',
  },
  discipline: { id: 'd1', name: 'Математика' },
  progress: {
    total: 0,
    completed: 0,
    submitted: 0,
    returned: 0,
    inProgress: 0,
    notStarted: 0,
    overdue: 0,
    percent: null,
  },
  stages: { total: 5, completed: 0 },
  checkpoints: { total: 5, passed: 1, missed: 1 },
  averageScore: null,
  scoredCount: 0,
  activity: { submissions: 0, lastSubmissionAt: null },
  helpRequests: 0,
  corrections: 1,
  diagnostics: { completed: 0, lastCompletedAt: null, lastMeasurementType: null },
};

const overview: MonitoringDto = {
  period: { from: null, to: null },
  summary: {
    trajectories: 1,
    averageProgress: null,
    overdueAssignments: 0,
    missedCheckpoints: 1,
    needsSupport: 1,
    needsCorrection: 1,
  },
  rows: [row],
  warnings: [
    {
      kind: 'MISSED_CHECKPOINT',
      trajectoryId: 't1',
      student: { id: 'st1', fullName: 'Петров Иван' },
      discipline: 'Математика',
      stageTitle: 'Адаптационный',
      title: 'Входной тест',
      dueAt: '2026-10-10',
    },
  ],
  dynamics: [
    { weekStart: '2026-10-12', completedAssignments: 0, submissions: 0, averageScore: null },
  ],
  truncated: false,
};

describe('мониторинг', () => {
  it('FR-056, FR-058, FR-062, FR-005: сводка, предупреждения и «Нет данных» вместо нулей', async () => {
    mockApi({ 'GET /monitoring': overview });
    const { wrapper } = await mountWithApp(MonitoringView);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Пропущена контрольная точка');
    expect(text).toContain('этап «Адаптационный» · Входной тест · срок 10.10.2026');
    expect(text).toContain('Требует корректировки');
    expect(text).toContain('Нужно дополнительное сопровождение');
    expect(text).toContain('Прогресс выполнения ИОТ');
    expect(text).toContain('Нет данных: заданий нет');
    expect(text).toContain('Нет данных: оценок нет');
    expect(text).toContain('пройдено 1 из 5, пропущено 1');
    // Средний прогресс без заданий — «Нет данных», а не 0 %.
    const progressCard = wrapper
      .findAll('.metric-card')
      .find((card) => card.text().includes('Средний прогресс'))!;
    expect(progressCard.text()).toContain('Нет данных');
    expect(text).toContain('За период ответы не отправлялись');
    expect(wrapper.find('a[href="/monitoring/t1"]').exists()).toBe(true);
  });
});

const stage = (index: number, overrides: Partial<TrajectoryStageDto> = {}): TrajectoryStageDto => ({
  id: `s${index}`,
  sortOrder: index,
  title: STANDARD_TRAJECTORY_STAGES[index]!.title,
  goal: 'Цель',
  description: null,
  plannedResults: null,
  startDate: `2026-0${index + 1}-01`,
  endDate: `2026-0${index + 1}-28`,
  status: 'IN_PROGRESS',
  checkpoints: [
    {
      id: `c${index}`,
      title: `КТ ${index + 1}`,
      description: null,
      dueDate: `2026-0${index + 1}-28`,
      status: index === 0 ? 'PASSED' : 'PENDING',
    },
  ],
  materials: [],
  assignments: [],
  ...overrides,
});

const active: TrajectoryDto = {
  id: 't1',
  status: 'ACTIVE',
  version: 1,
  student: { id: 'st1', fullName: 'Петров Иван', participantCode: 'S-AAAAAA', group: null },
  discipline: { id: 'd1', name: 'Математика' },
  teacher: null,
  template: null,
  motivationProfile: null,
  goals: 'Освоить тему',
  plannedResults: null,
  supportMethods: 'Консультации',
  startDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  currentStageId: 's0',
  approvedBy: null,
  approvedAt: '2026-01-01T10:00:00.000Z',
  completedAt: null,
  finalAssessment: null,
  archivedAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  stages: [0, 1, 2, 3, 4].map((index) =>
    stage(
      index,
      index === 0
        ? {
            assignments: [
              {
                id: 'a1',
                assignment: {
                  id: 'lib1',
                  title: 'Выполненное задание',
                  typeName: 'Практическая работа',
                  difficulty: 'BASIC',
                  archived: false,
                },
                dueAt: '2026-01-20T18:59:59.000Z',
                status: 'COMPLETED',
              },
            ],
          }
        : {},
    ),
  ),
  versions: [],
  proposals: [],
};

describe('корректировка ИОТ', () => {
  it('UC-05, FR-043: выполненное задание и отмеченную точку убрать нельзя; без изменений — нечего утверждать', async () => {
    mockApi({});
    const { wrapper } = await mountWithApp(TrajectoryEditor, {
      props: { trajectory: active, mode: 'correction' },
    });
    expect(wrapper.text()).not.toContain('Сохранить черновик');
    const button = (label: string) => wrapper.find(`button[aria-label="${label}"]`);
    const step = (title: string) =>
      wrapper
        .findAll('button')
        .find((item) => item.text().includes(title))!
        .trigger('click');
    await step('3. Этапы');
    await flushPromises();
    expect(button('Удалить этап 1').attributes('disabled')).toBeDefined();
    expect(button('Удалить этап 2').attributes('disabled')).toBeUndefined();
    await step('4. Задания и материалы');
    await flushPromises();
    expect(button('Убрать задание «Выполненное задание»').attributes('disabled')).toBeDefined();
    await step('5. Сроки и контрольные точки');
    await flushPromises();
    expect(button('Удалить контрольную точку «КТ 1»').attributes('disabled')).toBeDefined();
    expect(button('Удалить контрольную точку «КТ 2»').attributes('disabled')).toBeUndefined();

    await step('7. Предпросмотр');
    await flushPromises();
    expect(wrapper.text()).toContain('Изменения новой версии 2');
    expect(wrapper.text()).toContain('Изменений нет');
    const confirm = wrapper
      .findAll('button')
      .find((item) => item.text() === 'Подтвердить новую версию')!;
    expect(confirm.attributes('disabled')).toBeDefined();

    await step('6. Сопровождение');
    await flushPromises();
    await wrapper.find('#t-support').setValue('Консультации два раза в неделю');
    await step('7. Предпросмотр');
    await flushPromises();
    expect(wrapper.text()).toContain('Способы сопровождения');
    expect(wrapper.text()).toContain('Консультации → Консультации два раза в неделю');
  });
});
