import {
  DEFAULT_MOTIVATION_STRATEGIES,
  type MotivationProfileDto,
  type ProfileBasisItemDto,
  type ProfileDistributionDto,
  type StudentMotivationDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import MotivationProfilesView from './MotivationProfilesView.vue';
import StudentMotivationTab from './StudentMotivationTab.vue';

const item = (overrides: Partial<ProfileBasisItemDto> = {}): ProfileBasisItemDto => ({
  sessionId: 's1',
  questionnaire: {
    questionnaireId: 'q1',
    versionId: 'v1',
    versionNumber: 1,
    title: 'ДЕМО — не для исследования: Учебная мотивация',
    isDemo: true,
  },
  measurementType: 'PRIMARY',
  completedAt: '2026-10-01T10:00:00.000Z',
  scaleCode: 'COGNITIVE',
  scaleName: 'Познавательный интерес',
  rawScore: 4,
  levelLabel: 'Низкий',
  description: 'Интерес выражен слабо.',
  studentText: 'Попробуйте задания по вашим увлечениям.',
  motivationLevel: 'LOW',
  ...overrides,
});

const proposed: MotivationProfileDto = {
  id: 'p1',
  studentId: 'st1',
  status: 'PROPOSED',
  proposedLevel: 'LOW',
  level: null,
  basis: {
    minScales: 1,
    items: [
      item(),
      item({
        scaleCode: 'ACHIEVEMENT',
        scaleName: 'Мотивация достижения',
        rawScore: null,
        levelLabel: null,
        description: null,
        studentText: null,
        motivationLevel: null,
      }),
    ],
    counts: { HIGH: 0, MEDIUM: 0, LOW: 1 },
    reason: null,
  },
  correctionReason: null,
  studentSummary: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: '2026-10-02T10:00:00.000Z',
};

const state = (current: MotivationProfileDto | null, lastDecided = null): StudentMotivationDto => ({
  current,
  lastDecided,
  history: current
    ? [
        {
          id: 'h1',
          profileId: current.id,
          status: 'PROPOSED',
          fromLevel: null,
          toLevel: 'LOW',
          reason: null,
          changedBy: { id: 'u1', fullName: 'Иванова Анна Сергеевна' },
          at: current.createdAt,
        },
      ]
    : [],
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

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('StudentMotivationTab', () => {
  it('AT-03, FR-028: предложение системы с основаниями, пропуск — «Нет данных»', async () => {
    mockApi({
      'GET /students/st1/motivation-profile': state(proposed),
      'GET /motivation-strategies': DEFAULT_MOTIVATION_STRATEGIES,
    });
    const { wrapper } = await mountWithApp(StudentMotivationTab, {
      props: { studentId: 'st1', archived: false },
      attachTo: document.body,
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Ждёт решения: низкий уровень');
    expect(text).toContain('Система предлагает');
    expect(text).toContain('Познавательный интерес');
    expect(text).toContain('Нет данных');
    expect(text).not.toMatch(/\b0\b/);
    // Карточки стратегий (FR-030) — тексты п. 4.5 ТЗ.
    expect(text).toContain('Создание ситуации успеха');
    expect(text).toContain('Подтвердить или скорректировать');
    // FR-031: ИОТ — только после утверждения профиля.
    expect(text).not.toContain('Сформировать ИОТ');
    wrapper.unmount();
  });

  it('AT-04, FR-029: корректировка без причины не отправляется', async () => {
    const fetchMock = mockApi({
      'GET /students/st1/motivation-profile': state(proposed),
      'GET /motivation-strategies': DEFAULT_MOTIVATION_STRATEGIES,
    });
    const { wrapper } = await mountWithApp(StudentMotivationTab, {
      props: { studentId: 'st1', archived: false },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Подтвердить или скорректировать'))!
      .trigger('click');
    await flushPromises();
    const summary = document.querySelector<HTMLTextAreaElement>('#decision-summary')!;
    // Пояснение для студента заполнено по тексту правила интерпретации (FR-016).
    expect(summary.value).toBe('Попробуйте задания по вашим увлечениям.');
    document.querySelector<HTMLInputElement>('#decision-MEDIUM')!.click();
    await flushPromises();
    expect(document.body.textContent).toContain('Причина корректировки');
    document.querySelector<HTMLFormElement>('.p-dialog form')!.requestSubmit();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Укажите причину корректировки'),
    );
    expect(document.body.textContent).toContain('Укажите причину корректировки');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/decision'))).toBe(false);
    wrapper.unmount();
  });

  it('п. 4.5: недостаточно данных — пояснение и без решения', async () => {
    const needs: MotivationProfileDto = {
      ...proposed,
      status: 'NEEDS_MORE_DIAGNOSTICS',
      proposedLevel: null,
      basis: {
        minScales: 1,
        items: [],
        counts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        reason: 'Нет завершённой диагностики с правилами интерпретации для мотивационного профиля.',
      },
    };
    mockApi({
      'GET /students/st1/motivation-profile': state(needs),
      'GET /motivation-strategies': DEFAULT_MOTIVATION_STRATEGIES,
    });
    const { wrapper } = await mountWithApp(StudentMotivationTab, {
      props: { studentId: 'st1', archived: false },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Требуется дополнительная диагностика');
    expect(wrapper.text()).toContain('Уровень не присваивается');
    expect(wrapper.text()).not.toContain('Подтвердить или скорректировать');
  });

  it('FR-031: утверждённый профиль — переход к ИОТ и выделенная карточка', async () => {
    const confirmed: MotivationProfileDto = {
      ...proposed,
      status: 'CONFIRMED',
      level: 'LOW',
      studentSummary: 'Ставьте небольшие цели.',
      decidedAt: '2026-10-03T10:00:00.000Z',
      decidedBy: { id: 'u1', fullName: 'Иванова Анна Сергеевна' },
    };
    mockApi({
      'GET /students/st1/motivation-profile': { ...state(confirmed), lastDecided: confirmed },
      'GET /motivation-strategies': DEFAULT_MOTIVATION_STRATEGIES,
    });
    const { wrapper } = await mountWithApp(StudentMotivationTab, {
      props: { studentId: 'st1', archived: false },
    });
    await flushPromises();
    const link = wrapper.findAll('a').find((a) => a.text().includes('Сформировать ИОТ'))!;
    expect(link.attributes('href')).toBe('/trajectories?studentId=st1');
    expect(wrapper.text()).toContain('профиль студента');
    expect(wrapper.text()).toContain('Ставьте небольшие цели.');
  });
});

describe('MotivationProfilesView', () => {
  it('FR-030: три карточки стратегий и распределение со ссылками на список', async () => {
    const distribution: ProfileDistributionDto = {
      total: 5,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 0,
      PROPOSED: 1,
      NEEDS_MORE_DIAGNOSTICS: 1,
      NONE: 0,
    };
    mockApi({
      'GET /motivation-profiles/distribution': distribution,
      'GET /motivation-strategies': DEFAULT_MOTIVATION_STRATEGIES,
    });
    const { wrapper } = await mountWithApp(MotivationProfilesView, {
      path: '/motivation-profiles',
      user: testUser(['teacher']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Высокий уровень');
    expect(text).toContain('Проекты повышенной сложности');
    expect(text).toContain('Студентов с профилем: 2');
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
    expect(hrefs).toContain('/students?profile=MEDIUM');
    expect(hrefs).toContain('/students?profile=PROPOSED');
  });
});
