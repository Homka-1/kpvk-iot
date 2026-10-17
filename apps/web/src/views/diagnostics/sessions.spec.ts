import type {
  CabinetDiagnosticDto,
  CabinetDiagnosticSessionDto,
  DiagnosticForm,
  StudentDiagnosticDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import DiagnosticRunView from '@/views/student/DiagnosticRunView.vue';
import MyDiagnosticsView from '@/views/student/MyDiagnosticsView.vue';
import StudentDiagnosticsTab from '@/views/students/StudentDiagnosticsTab.vue';
import { formatAnswer, formatDuration, periodText } from './sessions';

const SESSION_ID = '01900000-0000-7000-8000-0000000000a1';
const STUDENT_ID = '01900000-0000-7000-8000-0000000000a2';
const student = testUser(['student']);

const form: DiagnosticForm = {
  title: 'ДЕМО — не для исследования: Учебная мотивация',
  instruction: 'Отметьте, насколько утверждение подходит вам.',
  allowDraft: true,
  questions: [
    {
      key: 'q1',
      text: 'Мне интересно учиться',
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
      text: 'Почему вы выбрали специальность?',
      type: 'SINGLE_CHOICE',
      isRequired: true,
      minValue: null,
      maxValue: null,
      minLabel: null,
      maxLabel: null,
      options: [
        { key: 'o1', text: 'Интересна профессия' },
        { key: 'o2', text: 'Случайно' },
      ],
    },
  ],
};

const base: CabinetDiagnosticDto = {
  id: SESSION_ID,
  title: form.title,
  isDemo: true,
  status: 'IN_PROGRESS',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2099-10-01T00:00:00.000Z',
  completedAt: null,
  results: [],
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

describe('форматирование результатов', () => {
  it('FR-019: конец периода не включительно — показывается последний день', () => {
    expect(periodText('2026-10-10T00:00:00', '2026-10-18T00:00:00')).toBe(
      '10.10.2026 — 17.10.2026',
    );
    expect(periodText(null, null)).toBe('Без срока');
  });

  it('FR-023, FR-074: время прохождения и ответы; пропуск — не ноль', () => {
    expect(formatDuration(125)).toBe('2 мин 5 с');
    expect(formatDuration(null)).toBe('Нет данных');
    expect(formatAnswer(form.questions[1]!, 'o1')).toBe('Интересна профессия');
    expect(formatAnswer(form.questions[0]!, undefined)).toBe('Нет ответа');
  });
});

describe('прохождение диагностики студентом', () => {
  it('UC-01: черновик восстанавливается, без ответа на обязательный вопрос завершить нельзя', async () => {
    const session: CabinetDiagnosticSessionDto = { ...base, form, draft: { q1: 4 } };
    const fetchMock = mockApi({ [`GET /cabinet/diagnostics/${SESSION_ID}`]: session });
    const { wrapper } = await mountWithApp(DiagnosticRunView, {
      path: `/student/diagnostics/${SESSION_ID}`,
      user: student,
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(form.title);
    expect(wrapper.text()).toContain(form.instruction);
    expect(wrapper.text()).toContain('Отвечено: 1 из 2');
    expect((wrapper.find('#run-q1-4').element as HTMLInputElement).checked).toBe(true);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Ответьте на этот вопрос');
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
    expect(calls.some((call) => call.includes('/complete'))).toBe(false);
    wrapper.unmount();
  });

  it('FR-013: пройденную диагностику нельзя пройти повторно — только результат', async () => {
    const session: CabinetDiagnosticSessionDto = {
      ...base,
      status: 'COMPLETED',
      completedAt: '2026-10-15T10:00:00.000Z',
      results: [{ scale: 'Познавательная мотивация', text: 'Вам интересно учиться.' }],
      form,
      draft: null,
    };
    mockApi({ [`GET /cabinet/diagnostics/${SESSION_ID}`]: session });
    const { wrapper } = await mountWithApp(DiagnosticRunView, {
      path: `/student/diagnostics/${SESSION_ID}`,
      user: student,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Диагностика пройдена');
    expect(wrapper.text()).toContain('Вам интересно учиться.');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('FR-016: в списке студента — понятная интерпретация, без баллов', async () => {
    mockApi({
      'GET /cabinet/diagnostics': [
        base,
        {
          ...base,
          id: 'done',
          status: 'COMPLETED',
          completedAt: '2026-10-15T10:00:00.000Z',
          results: [{ scale: 'Познавательная мотивация', text: 'Вам интересно учиться.' }],
        },
      ],
    });
    const { wrapper } = await mountWithApp(MyDiagnosticsView, {
      path: '/student/diagnostics',
      user: student,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Нужно пройти');
    expect(wrapper.text()).toContain('Пройдено');
    expect(wrapper.text()).toContain('Вам интересно учиться.');
    expect(wrapper.find(`a[href="/student/diagnostics/${SESSION_ID}"]`).exists()).toBe(true);
  });
});

describe('вкладка «Диагностика» профиля', () => {
  const result: StudentDiagnosticDto = {
    id: SESSION_ID,
    questionnaire: {
      questionnaireId: 'q',
      versionId: 'v',
      versionNumber: 2,
      title: 'Учебная мотивация',
      isDemo: false,
    },
    measurementType: 'PRIMARY',
    status: 'COMPLETED',
    source: 'PAPER',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2026-10-08T00:00:00.000Z',
    startedAt: null,
    completedAt: '2026-10-05T12:00:00.000Z',
    durationSeconds: null,
    revision: 2,
    scores: [
      {
        scaleId: 's1',
        code: 'COGNITIVE',
        name: 'Познавательная',
        rawScore: 12,
        missingAnswers: 0,
        level: { code: 'HIGH', label: 'Высокий' },
      },
      {
        scaleId: 's2',
        code: 'ACHIEVEMENT',
        name: 'Достижения',
        rawScore: null,
        missingAnswers: 1,
        level: null,
      },
    ],
  };

  it('FR-023, FR-074: версия, способ, баллы; пропуск — «Нет данных»; ответы — по праву', async () => {
    mockApi({
      [`GET /students/${STUDENT_ID}/diagnostics`]: [result],
      [`GET /students/${STUDENT_ID}/diagnostics/comparison`]: [],
    });
    const { wrapper } = await mountWithApp(StudentDiagnosticsTab, {
      props: { studentId: STUDENT_ID },
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Учебная мотивация');
    expect(text).toContain('Бумажный бланк');
    expect(text).toContain('Высокий');
    expect(text).toContain('Нет данных');
    expect(text).toContain('без ответа: 1');
    expect(text).toContain('ревизия 2');
    expect(wrapper.findAll('button').some((item) => item.text() === 'Ответы и ревизии')).toBe(true);
  });

  it('п. 2.1: без разрешения на ответы кнопки просмотра ответов нет', async () => {
    mockApi({
      [`GET /students/${STUDENT_ID}/diagnostics`]: [result],
      [`GET /students/${STUDENT_ID}/diagnostics/comparison`]: [],
    });
    const user = testUser(['teacher']);
    user.permissions = user.permissions.filter((item) => item !== 'diagnostics.answers.read');
    const { wrapper } = await mountWithApp(StudentDiagnosticsTab, {
      props: { studentId: STUDENT_ID },
      user,
    });
    await flushPromises();
    expect(wrapper.findAll('button').some((item) => item.text() === 'Ответы и ревизии')).toBe(
      false,
    );
  });
});
