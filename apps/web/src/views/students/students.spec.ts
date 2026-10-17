import type { GroupDto, StudentPageDto, StudentSummaryDto } from '@iot/shared';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import { profileBadge } from './labels';
import StudentCard from './StudentCard.vue';
import StudentsView from './StudentsView.vue';

const group: GroupDto = {
  id: 'g1',
  name: 'ПО-21',
  course: 2,
  specialty: 'Программное обеспечение',
  archivedAt: null,
  studentCount: 1,
};

function student(overrides: Partial<StudentSummaryDto> = {}): StudentSummaryDto {
  return {
    id: 's1',
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
    ...overrides,
  };
}

/** Ответы API по пути запроса. */
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
  vi.useRealTimers();
});

describe('StudentCard', () => {
  it('п. 4.2, FR-005: поля без данных подписаны «Нет данных», а не нулями', () => {
    const wrapper = mount(StudentCard, {
      props: { student: student() },
      global: { plugins: [PrimeVue] },
    });
    const text = wrapper.text();
    expect(text).toContain('Петров Иван');
    expect(text).toContain('Код участника: S-ABC234');
    expect(text).toContain('ПО-21 · 2 курс · Программное обеспечение');
    expect(text).toContain('Нет ИОТ');
    expect(text.match(/Нет данных/g)).toHaveLength(5);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('п. 6.1: статусы сопровождения, профиля и ИОТ — текстом', () => {
    const wrapper = mount(StudentCard, {
      props: {
        student: student({
          supportStatus: 'NEEDS_ATTENTION',
          motivationProfile: { status: 'CONFIRMED', level: 'MEDIUM', proposedLevel: 'LOW' },
          currentTrajectory: {
            id: 't1',
            status: 'ACTIVE',
            disciplineName: 'Математика',
            progress: 40,
          },
          completedAssignments: 0,
        }),
      },
      global: { plugins: [PrimeVue] },
    });
    const text = wrapper.text();
    expect(text).toContain('Требует внимания');
    expect(text).toContain('Средний уровень');
    expect(text).toContain('Математика');
    expect(text).toContain('Активна');
    expect(text).toContain('40 %');
  });

  it('п. 4.5: профиль без уровня — «Требуется дополнительная диагностика»', () => {
    expect(
      profileBadge({ status: 'NEEDS_MORE_DIAGNOSTICS', level: null, proposedLevel: null }).label,
    ).toBe('Требуется дополнительная диагностика');
    // Предложение системы — не утверждённый уровень (решает преподаватель).
    expect(profileBadge({ status: 'PROPOSED', level: null, proposedLevel: 'HIGH' }).label).toBe(
      'Ждёт решения: высокий уровень',
    );
  });
});

describe('StudentsView', () => {
  it('FR-006, FR-007: показывает карточки студентов и кнопки добавления и импорта', async () => {
    const page: StudentPageDto = { items: [student()], total: 1, page: 1, pageSize: 20 };
    mockApi({ '/students': page });
    const { wrapper } = await mountWithApp(StudentsView, { path: '/students' });
    await flushPromises();
    expect(wrapper.text()).toContain('Найдено студентов: 1');
    expect(wrapper.text()).toContain('Петров Иван');
    expect(wrapper.text()).toContain('Импорт');
    expect(wrapper.text()).toContain('Добавить студента');
  });

  it('FR-002, FR-005: без закреплённых групп — пояснение, а не пустой список', async () => {
    mockApi({ '/students': { items: [], total: 0, page: 1, pageSize: 20 } });
    const { wrapper } = await mountWithApp(StudentsView, { path: '/students' });
    await flushPromises();
    expect(wrapper.text()).toContain('Нет доступных групп');
  });

  it('FR-007: поиск передаётся в запрос', async () => {
    vi.useFakeTimers();
    const fetchMock = mockApi({ '/students': { items: [], total: 0, page: 1, pageSize: 20 } });
    const { wrapper } = await mountWithApp(StudentsView, {
      path: '/students',
      user: testUser(['teacher']),
    });
    await wrapper.find('input[aria-label="Поиск студентов"]').setValue('Петров');
    await vi.advanceTimersByTimeAsync(400);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('search=%D0%9F%D0%B5%D1%82%D1%80%D0%BE%D0%B2'))).toBe(
      true,
    );
  });
});
