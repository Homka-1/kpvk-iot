import {
  type StageAssignmentDto,
  STANDARD_TRAJECTORY_STAGES,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
  type TrajectoryStageDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import { dateFromDueAt, dueAtFromDate, toContent, toForm } from './content';
import StageMap from './StageMap.vue';
import TrajectoryEditor from './TrajectoryEditor.vue';
import TrajectoryNewView from './TrajectoryNewView.vue';

const stage = (index: number, overrides: Partial<TrajectoryStageDto> = {}): TrajectoryStageDto => ({
  id: `s${index}`,
  sortOrder: index,
  title: STANDARD_TRAJECTORY_STAGES[index]!.title,
  goal: STANDARD_TRAJECTORY_STAGES[index]!.goal,
  description: null,
  plannedResults: null,
  startDate: null,
  endDate: null,
  status: 'NOT_STARTED',
  checkpoints: [],
  materials: [],
  assignments: [],
  ...overrides,
});

const draft: TrajectoryDto = {
  id: 't1',
  status: 'DRAFT',
  version: 0,
  student: { id: 'st1', fullName: 'Петров Иван', participantCode: 'S-AAAAAA', group: null },
  discipline: { id: 'd1', name: 'Математика' },
  teacher: { id: 'u1', fullName: 'Иванова Анна Сергеевна' },
  template: { id: 'tpl', title: 'Пятиэтапный маршрут (стандартный)' },
  motivationProfile: null,
  goals: null,
  plannedResults: null,
  supportMethods: null,
  startDate: null,
  plannedEndDate: null,
  currentStageId: null,
  approvedBy: null,
  approvedAt: null,
  completedAt: null,
  finalAssessment: null,
  archivedAt: null,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
  stages: STANDARD_TRAJECTORY_STAGES.map((_, index) => stage(index)),
  versions: [],
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

describe('конструктор ИОТ', () => {
  it('срок задания — конец выбранного дня по местному времени, обратно — та же дата', () => {
    const iso = dueAtFromDate('2026-09-20')!;
    expect(new Date(iso).getHours()).toBe(23);
    expect(dateFromDueAt(iso)).toBe('2026-09-20');
    expect(dueAtFromDate('')).toBeNull();
  });

  it('FR-036: форма и обратно — пустые поля становятся null, порядок этапов сохраняется', () => {
    const content = toContent(toForm(draft));
    expect(content.goals).toBeNull();
    expect(content.stages.map((item) => item.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(content.stages[0]).toMatchObject({ materialIds: [], assignments: [], checkpoints: [] });
  });

  it('FR-035, UC-03: шаг 1 — предложенный по профилю шаблон выбран и помечен', async () => {
    const options: TrajectoryOptionsDto = {
      student: draft.student,
      profile: { id: 'p1', level: 'LOW', decidedAt: '2026-10-01T10:00:00.000Z' },
      disciplines: [{ id: 'd1', name: 'Математика', currentTrajectoryId: null }],
      templates: [
        {
          id: 'std',
          title: 'Пятиэтапный маршрут (стандартный)',
          description: 'Стандартная модель.',
          motivationLevel: null,
          isStandard: true,
          stages: [...STANDARD_TRAJECTORY_STAGES],
        },
        {
          id: 'low',
          title: 'Пятиэтапный маршрут — низкий уровень мотивации',
          description: 'Пошаговая работа.',
          motivationLevel: 'LOW',
          isStandard: false,
          stages: [...STANDARD_TRAJECTORY_STAGES],
        },
      ],
      suggestedTemplateId: 'low',
      blockedReason: null,
    };
    mockApi({ 'GET /students/st1/trajectory-options': options });
    const { wrapper } = await mountWithApp(TrajectoryNewView, {
      path: '/trajectories/new?studentId=st1',
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Низкий уровень');
    expect(wrapper.text()).toContain('Предложено по профилю');
    expect(wrapper.find<HTMLInputElement>('#template-low').element.checked).toBe(true);
    expect(wrapper.text()).toContain('Профиль не ограничивает сложность заданий');
  });

  it('огр. 4: студенту контрольной группы конструктор не открывается', async () => {
    mockApi({
      'GET /students/st1/trajectory-options': {
        student: draft.student,
        profile: null,
        disciplines: [],
        templates: [],
        suggestedTemplateId: null,
        blockedReason: 'Студент входит в контрольную группу исследования «Пилот»',
      },
    });
    const { wrapper } = await mountWithApp(TrajectoryNewView, {
      path: '/trajectories/new?studentId=st1',
    });
    await flushPromises();
    expect(wrapper.text()).toContain('контрольную группу');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('FR-038, FR-039: предпросмотр перечисляет незаполненное; без права — только согласование', async () => {
    mockApi({});
    const { wrapper } = await mountWithApp(TrajectoryEditor, {
      props: { trajectory: draft },
      user: testUser(['teacher'], {
        permissions: testUser(['teacher']).permissions.filter(
          (permission) => permission !== 'trajectories.approve',
        ),
      }),
    });
    const stepButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('7. Предпросмотр'))!;
    await stepButton.trigger('click');
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Перед утверждением заполните');
    expect(text).toContain('Укажите образовательные цели');
    expect(text).toContain('Этап 1: укажите дату начала');
    expect(text).not.toContain('Утвердить и назначить');
    expect(text).toContain('Отправить на согласование');
  });
});

describe('StageMap', () => {
  it('п. 6.4, FR-005: этап — цель, сроки, статус, «Нет данных» вместо 0 %, задания и КТ', async () => {
    const stages = [
      stage(0, {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        status: 'IN_PROGRESS',
        checkpoints: [
          {
            id: 'c1',
            title: 'Входной тест',
            description: null,
            dueDate: '2026-09-30',
            status: 'PENDING',
          },
        ],
      }),
      stage(1),
    ];
    const { wrapper } = await mountWithApp(StageMap, {
      props: { stages, currentStageId: 's0' },
    });
    const cards = wrapper.findAll('.stage-map__card');
    expect(cards).toHaveLength(2);
    const first = cards[0]!.text();
    expect(first).toContain('Адаптационный');
    expect(first).toContain('Текущий этап');
    expect(first).toContain('В работе');
    expect(first).toContain('01.09.2026 – 30.09.2026');
    expect(first).toContain('Нет данных');
    expect(first).toContain('Заданий: 0');
    expect(first).toContain('КТ: 30.09.2026');
    expect(cards[1]!.text()).toContain('Контрольная точка не задана');
    expect(cards[1]!.text()).toContain('Сроки не заданы');

    await cards[1]!.trigger('click');
    expect(wrapper.find('.stage-map__details').text()).toContain(
      'Этап 2 — Развитие учебной самостоятельности',
    );
  });

  it('FR-042, FR-055: выполнение этапа и маршрута — доля принятых заданий и статистика', async () => {
    const task = (id: string, status: StageAssignmentDto['status']): StageAssignmentDto => ({
      id,
      assignment: {
        id: `a${id}`,
        title: `Задание ${id}`,
        typeName: 'Практическая работа',
        difficulty: 'BASIC',
        archived: false,
      },
      dueAt: null,
      status,
    });
    const stages = [
      stage(0, { assignments: [task('1', 'COMPLETED'), task('2', 'SUBMITTED')] }),
      stage(1, { assignments: [task('3', 'ASSIGNED'), task('4', 'CANCELLED')] }),
    ];
    const { wrapper } = await mountWithApp(StageMap, { props: { stages, currentStageId: 's0' } });
    expect(wrapper.find('.stage-map__summary').text()).toContain('Выполнено заданий: 1 из 3');
    const cards = wrapper.findAll('.stage-map__card');
    expect(cards[0]!.text()).toContain('50 %');
    expect(cards[1]!.text()).toContain('0 %');
    const details = wrapper.find('.stage-map__details').text();
    expect(details).toContain('Выполнено 1 из 2 · на проверке: 1');
    expect(details).toContain('На проверке');

    // В предпросмотре черновика выполнение не считается.
    const preview = await mountWithApp(StageMap, { props: { stages, progress: false } });
    expect(preview.wrapper.find('.stage-map__summary').exists()).toBe(false);
    expect(preview.wrapper.findAll('.stage-map__card')[0]!.text()).toContain('Нет данных');
  });
});
