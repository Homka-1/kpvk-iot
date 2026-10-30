import type {
  ObservationDto,
  OwnProfileDto,
  StudentHistoryItemDto,
  StudentProfileDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import MyProfileView from '@/views/student/MyProfileView.vue';
import StudentCard from './StudentCard.vue';
import StudentProfileView from './StudentProfileView.vue';
import SupportStatusBadge from './SupportStatusBadge.vue';

const STUDENT_ID = '01900000-0000-7000-8000-000000000010';
const teacher = testUser(['teacher']);
const group = { id: 'g1', name: 'ПО-21', course: 2, specialty: 'Программное обеспечение' };

const profile: StudentProfileDto = {
  id: STUDENT_ID,
  participantCode: 'S-ABC234',
  lastName: 'Петров',
  firstName: 'Иван',
  middleName: null,
  login: 's-abc234',
  group,
  supportStatus: 'STANDARD',
  archivedAt: null,
  motivationProfile: null,
  currentTrajectory: null,
  averageScore: null,
  completedAssignments: null,
  lastActivityAt: null,
  archiveReason: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  enrollments: [
    {
      id: 'e1',
      group: { id: 'g1', name: 'ПО-21' },
      startsAt: '2026-09-01T08:00:00.000Z',
      endsAt: null,
      reason: null,
    },
  ],
  interests: null,
  disciplines: [
    { id: 'd1', name: 'Математика', teachers: [{ id: teacher.id, fullName: 'Иванова Анна' }] },
  ],
};

const observation = (overrides: Partial<ObservationDto>): ObservationDto => ({
  id: 'o1',
  observedAt: '2026-10-10',
  text: 'Служебная заметка',
  visibility: 'INTERNAL',
  discipline: null,
  author: { id: teacher.id, fullName: 'Иванова Анна' },
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
  canEdit: true,
  ...overrides,
});

/** Ответы API по пути и методу запроса; возвращает мок fetch. */
function mockApi(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
      .split('?')[0]!
      .replace(/^\/api/, '');
    const body = responses[`${init?.method ?? 'GET'} ${path}`] ?? responses[path];
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

describe('StudentCard', () => {
  it('FR-009: имя в карточке списка ведёт в профиль студента', async () => {
    const { wrapper } = await mountWithApp(StudentCard, {
      props: { student: profile, to: `/students/${STUDENT_ID}` },
    });
    expect(wrapper.find('a.student-card__name').attributes('href')).toBe(`/students/${STUDENT_ID}`);
  });
});

describe('SupportStatusBadge', () => {
  it('FR-060: отметка «Требует внимания» открывает основание и ссылки на вкладки профиля', async () => {
    mockApi({
      [`/students/${STUDENT_ID}/support-status`]: {
        supportStatus: 'NEEDS_ATTENTION',
        lastChange: {
          at: '2026-10-20T08:00:00.000Z',
          actor: { id: teacher.id, fullName: 'Иванова Анна' },
          reason: 'Не сдал два задания подряд',
        },
        openDifficulties: 2,
      },
    });
    const { wrapper } = await mountWithApp(SupportStatusBadge, {
      props: { studentId: STUDENT_ID, status: 'NEEDS_ATTENTION', interactive: true },
      attachTo: document.body,
    });
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click');
    await flushPromises();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Не сдал два задания подряд');
    expect(text).toContain('Иванова Анна');
    expect(text).toContain('Нерассмотренных сообщений о затруднениях: 2');
    const links = [...document.body.querySelectorAll('.support-details a')].map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toEqual([
      `/students/${STUDENT_ID}?tab=support`,
      `/students/${STUDENT_ID}?tab=history`,
    ]);
    wrapper.unmount();
  });

  it('FR-060: обычное сопровождение — простая плашка без пояснения', async () => {
    const { wrapper } = await mountWithApp(SupportStatusBadge, {
      props: { studentId: STUDENT_ID, status: 'STANDARD', interactive: true },
    });
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('Обычное сопровождение');
  });
});

describe('StudentProfileView', () => {
  async function mountProfile(
    observations: ObservationDto[] = [],
    history: StudentHistoryItemDto[] = [],
    user = teacher,
  ) {
    mockApi({
      [`/students/${STUDENT_ID}/profile`]: profile,
      [`/students/${STUDENT_ID}/observations`]: observations,
      [`/students/${STUDENT_ID}/history`]: history,
      [`/students/${STUDENT_ID}/diagnostics`]: [],
      [`/students/${STUDENT_ID}/diagnostics/comparison`]: [],
      '/student-assignments': [],
    });
    const result = await mountWithApp(StudentProfileView, {
      path: `/students/${STUDENT_ID}`,
      user,
      attachTo: document.body,
    });
    await flushPromises();
    return result;
  }

  async function openTab(
    wrapper: Awaited<ReturnType<typeof mountProfile>>['wrapper'],
    name: string,
  ) {
    const tab = wrapper.findAll('[role="tab"]').find((item) => item.text() === name);
    await tab!.trigger('click');
    await flushPromises();
  }

  it('FR-060: ссылка «?tab=» на открытой странице профиля переключает вкладку', async () => {
    const { wrapper, router } = await mountProfile();
    const selected = () => wrapper.get('[role="tab"][aria-selected="true"]').text();
    expect(selected()).toBe('Общие сведения');
    await router.push(`/students/${STUDENT_ID}?tab=history`);
    await flushPromises();
    expect(selected()).toBe('История');
    await openTab(wrapper, 'Сопровождение');
    expect(router.currentRoute.value.query.tab).toBe('support');
    await router.push(`/students/${STUDENT_ID}?tab=history`);
    await flushPromises();
    expect(selected()).toBe('История');
    wrapper.unmount();
  });

  it('п. 4.3, FR-009: верхняя карточка и семь вкладок профиля', async () => {
    const { wrapper } = await mountProfile();
    expect(wrapper.find('h1').text()).toBe('Петров Иван');
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Общие сведения',
      'Диагностика',
      'Мотивационный профиль',
      'Моя ИОТ',
      'Задания',
      'Сопровождение',
      'История',
    ]);
    const text = wrapper.text();
    expect(text).toContain('Группа ПО-21 · 2 курс · Программное обеспечение');
    expect(text).toContain('Математика');
    expect(text).toContain('Иванова Анна');
    expect(text).toContain('Студент пока не указал интересы');
    expect(text).toContain('Нет ИОТ');
    expect(text).toContain('Добавить наблюдение');
    wrapper.unmount();
  });

  it('FR-005: вкладки без данных показывают пояснение', async () => {
    const { wrapper } = await mountProfile();
    await openTab(wrapper, 'Диагностика');
    expect(wrapper.text()).toContain('Диагностика ещё не проводилась');
    await openTab(wrapper, 'Задания');
    expect(wrapper.text()).toContain('Заданий пока нет');
    wrapper.unmount();
  });

  it('FR-014, FR-016: наблюдения с датой, автором и пометкой видимости', async () => {
    const { wrapper } = await mountProfile([
      observation({}),
      observation({
        id: 'o2',
        text: 'Открыто студенту',
        visibility: 'STUDENT_VISIBLE',
        canEdit: false,
      }),
    ]);
    await openTab(wrapper, 'Сопровождение');
    const text = wrapper.text();
    expect(text).toContain('10.10.2026 · Иванова Анна');
    expect(text).toContain('Видно только преподавателям');
    expect(text).toContain('Видно студенту');
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Изменить')).toHaveLength(1);
    wrapper.unmount();
  });

  it('история загружается при открытии вкладки', async () => {
    const { wrapper } = await mountProfile(
      [],
      [
        {
          id: 'h1',
          at: '2026-10-11T09:00:00.000Z',
          action: 'student.transferred',
          label: 'Перевод в другую группу',
          actor: { id: teacher.id, fullName: 'Иванова Анна' },
          reason: 'По заявлению',
        },
      ],
    );
    await openTab(wrapper, 'История');
    expect(wrapper.text()).toContain('Перевод в другую группу');
    expect(wrapper.text()).toContain('Причина: По заявлению');
    wrapper.unmount();
  });
});

describe('MyProfileView', () => {
  const own: OwnProfileDto = {
    participantCode: 'S-ABC234',
    lastName: 'Петров',
    firstName: 'Иван',
    middleName: null,
    motivationProfile: null,
    group,
    disciplines: profile.disciplines,
    interests: null,
    observations: [
      {
        id: 'o2',
        observedAt: '2026-10-10',
        text: 'Хороший прогресс',
        discipline: { id: 'd1', name: 'Математика' },
        author: { id: teacher.id, fullName: 'Иванова Анна' },
      },
    ],
  };

  it('п. 2.3, FR-016: свои данные, дисциплины и открытые отзывы преподавателя', async () => {
    mockApi({ '/cabinet/profile': own });
    const { wrapper } = await mountWithApp(MyProfileView, {
      path: '/student/profile',
      user: testUser(['student']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Петров Иван');
    expect(text).toContain('ПО-21 · 2 курс');
    expect(text).toContain('Математика');
    expect(text).toContain('Хороший прогресс');
    expect(text).not.toContain('Видно только преподавателям');
  });

  it('п. 2.3: студент сохраняет свои интересы', async () => {
    const fetchMock = mockApi({
      'GET /cabinet/profile': own,
      'PATCH /cabinet/profile': { ...own, interests: 'Робототехника' },
    });
    const { wrapper } = await mountWithApp(MyProfileView, {
      path: '/student/profile',
      user: testUser(['student']),
    });
    await flushPromises();
    await wrapper.find('#my-interests').setValue('Робототехника');
    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Интересы сохранены'));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ interests: 'Робототехника' });
  });
});
