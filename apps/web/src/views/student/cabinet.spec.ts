import {
  type CabinetAssignmentDetailDto,
  type CabinetAssignmentsDto,
  type CabinetStageDto,
  type CabinetTrajectoryDto,
  STANDARD_TRAJECTORY_STAGES,
  type StudentAssignmentDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import MyAssignmentsView from './MyAssignmentsView.vue';
import MyAssignmentView from './MyAssignmentView.vue';
import MyTrajectoryView from './MyTrajectoryView.vue';

const student = testUser(['student']);

const task = (overrides: Partial<StudentAssignmentDto> = {}): StudentAssignmentDto => ({
  id: 'ta1',
  status: 'ASSIGNED',
  dueAt: '2026-09-20T18:59:59.000Z',
  assignedAt: '2026-09-01T10:00:00.000Z',
  assignment: {
    id: 'a1',
    title: 'Линейные уравнения',
    typeName: 'Практическая работа',
    difficulty: 'BASIC',
    topic: 'Уравнения',
  },
  discipline: { id: 'd1', name: 'Математика' },
  trajectory: { id: 't1', stage: { id: 's0', title: 'Адаптационный', sortOrder: 0 } },
  choiceGroup: null,
  assignedBy: { id: 'u1', fullName: 'Иванова Анна' },
  ...overrides,
});

const stage = (index: number, overrides: Partial<CabinetStageDto> = {}): CabinetStageDto => ({
  id: `s${index}`,
  sortOrder: index,
  title: STANDARD_TRAJECTORY_STAGES[index]!.title,
  goal: STANDARD_TRAJECTORY_STAGES[index]!.goal,
  description: null,
  plannedResults: null,
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
  checkpoints: [],
  materials: [],
  assignments: [],
  ...overrides,
});

const trajectory: CabinetTrajectoryDto = {
  id: 't1',
  status: 'ACTIVE',
  version: 1,
  discipline: { id: 'd1', name: 'Математика' },
  teacher: { id: 'u1', fullName: 'Иванова Анна' },
  goals: 'Освоить линейные уравнения',
  plannedResults: null,
  supportMethods: 'Еженедельная консультация',
  startDate: '2026-09-01',
  plannedEndDate: '2027-01-31',
  currentStageId: 's0',
  approvedAt: '2026-09-01T10:00:00.000Z',
  stages: STANDARD_TRAJECTORY_STAGES.map((_, index) =>
    stage(
      index,
      index === 0
        ? {
            materials: [
              {
                id: 'm1',
                title: 'Памятка',
                kind: 'TEXT',
                archived: false,
                description: null,
                file: null,
                url: null,
                body: 'Правило переноса',
              },
            ],
            assignments: [
              {
                id: 'ta1',
                assignment: {
                  id: 'a1',
                  title: 'Линейные уравнения',
                  typeName: 'Практическая работа',
                  difficulty: 'BASIC',
                  archived: false,
                },
                dueAt: '2026-09-20T18:59:59.000Z',
                status: 'ASSIGNED',
              },
            ],
          }
        : {},
    ),
  ),
  proposals: [],
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
  document.body.innerHTML = '';
});

describe('кабинет студента: траектория и задания', () => {
  it('FR-040, FR-041: «Моя траектория» — цель, текущий этап, карта и ссылка на задание', async () => {
    mockApi({ 'GET /cabinet/trajectories': [trajectory] });
    const { wrapper } = await mountWithApp(MyTrajectoryView, {
      path: '/student/trajectory',
      user: student,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Освоить линейные уравнения');
    expect(wrapper.text()).toContain('Этап 1. Адаптационный');
    expect(wrapper.findAll('.stage-map__item')).toHaveLength(5);
    const link = wrapper.find('a[href="/student/assignments/ta1"]');
    expect(link.text()).toBe('Линейные уравнения');
    expect(wrapper.text()).toContain('Памятка');
    expect(wrapper.text()).toContain('Предложить изменение');
  });

  it('FR-005: без утверждённой ИОТ — пояснение, а не пустая карта', async () => {
    mockApi({ 'GET /cabinet/trajectories': [] });
    const { wrapper } = await mountWithApp(MyTrajectoryView, {
      path: '/student/trajectory',
      user: student,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Траектория пока не назначена');
    expect(wrapper.find('.stage-map').exists()).toBe(false);
  });

  it('FR-054: студент выбирает задание из набора; без выбора — подсказка', async () => {
    const options = [
      task({
        id: 'o1',
        status: 'OFFERED',
        trajectory: null,
        choiceGroup: { id: 'g1', title: 'Задача на выбор', requiredCount: 1, chosenAt: null },
      }),
      task({
        id: 'o2',
        status: 'OFFERED',
        trajectory: null,
        assignment: { ...task().assignment, id: 'a2', title: 'Неравенства' },
        choiceGroup: { id: 'g1', title: 'Задача на выбор', requiredCount: 1, chosenAt: null },
      }),
    ];
    const before: CabinetAssignmentsDto = {
      choices: [
        {
          id: 'g1',
          title: 'Задача на выбор',
          requiredCount: 1,
          discipline: { id: 'd1', name: 'Математика' },
          options,
        },
      ],
      items: [task()],
    };
    const after: CabinetAssignmentsDto = {
      choices: [],
      items: [task(), { ...options[1]!, status: 'ASSIGNED' }],
    };
    const fetchMock = mockApi({
      'GET /cabinet/assignments': before,
      'POST /cabinet/assignment-choices/g1/choose': after,
    });
    const { wrapper } = await mountWithApp(MyAssignmentsView, {
      path: '/student/assignments',
      user: student,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Задача на выбор');
    expect(wrapper.text()).toContain('выберите заданий: 1 из 2');

    const confirm = wrapper.findAll('button').find((item) => item.text() === 'Подтвердить выбор')!;
    await confirm.trigger('click');
    expect(wrapper.text()).toContain('Выберите заданий: 1');

    await wrapper.find('#option-o2').setValue(true);
    await confirm.trigger('click');
    await flushPromises();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/choose'))!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ optionIds: ['o2'] });
    expect(wrapper.text()).toContain('Выбор сохранён');
    expect(wrapper.text()).not.toContain('Подтвердить выбор');
  });

  it('AT-06: карточка задания — инструкция, критерии, ресурсы и формат сдачи', async () => {
    const detail: CabinetAssignmentDetailDto = {
      ...task(),
      goal: 'Научиться решать уравнения',
      instruction: 'Решите уравнения 1–10',
      submissionFormats: ['TEXT', 'FILE'],
      maxScore: 5,
      criteria: [{ id: 'c1', title: 'Верность', description: null, maxScore: 5 }],
      attachments: [{ id: 'f1', title: 'Справка', file: null, url: 'https://example.org' }],
    };
    mockApi({ 'GET /cabinet/assignments/ta1': detail });
    const { wrapper } = await mountWithApp(MyAssignmentView, {
      path: '/student/assignments/ta1',
      user: student,
    });
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe('Линейные уравнения');
    expect(wrapper.text()).toContain('Решите уравнения 1–10');
    expect(wrapper.text()).toContain('Верность');
    expect(wrapper.text()).toContain('Текст, Файл');
    expect(wrapper.text()).toContain('1. Адаптационный');
    expect(wrapper.find('a[href="https://example.org"]').attributes('rel')).toContain('noopener');
  });
});
