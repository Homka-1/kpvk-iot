import type {
  CabinetFeedbackDto,
  ConsultationDto,
  FeedbackDto,
  NotificationsDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeaderActions from '@/components/layout/HeaderActions.vue';
import { mountWithApp, testUser } from '@/testing/mount';
import MyFeedbackView from '@/views/student/MyFeedbackView.vue';
import ConsultationCard from './ConsultationCard.vue';
import { bindingText, toIsoDateTime } from './content';
import FeedbackThread from './FeedbackThread.vue';

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

const student = { id: 's1', fullName: 'Петров Иван', groupName: 'ПО-21' };
const teacher = { id: 'u1', fullName: 'Иванова Анна Сергеевна' };

const question: FeedbackDto = {
  id: 'f1',
  kind: 'QUESTION',
  visibility: 'STUDENT_VISIBLE',
  body: 'Как оформить вывод?',
  dueDate: null,
  resolvedAt: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  student,
  author: { id: 'su1', fullName: 'Петров Иван' },
  fromStudent: true,
  trajectory: { id: 't1', disciplineName: 'Физика' },
  stage: { id: 'st1', title: 'Адаптационный', sortOrder: 0 },
  assignment: { id: 'a1', title: 'Лабораторная 1' },
  replies: [
    {
      id: 'r1',
      body: 'Студент тревожится — поговорить',
      visibility: 'INTERNAL',
      author: teacher,
      fromStudent: false,
      createdAt: '2026-10-10T10:00:00.000Z',
    },
  ],
};

describe('Обратная связь', () => {
  it('FR-064: привязка к ИОТ, этапу и заданию одной строкой', () => {
    expect(bindingText(question)).toBe(
      'ИОТ: Физика · этап 1. Адаптационный · задание «Лабораторная 1»',
    );
    expect(bindingText({ trajectory: null, stage: null, assignment: null })).toBe(
      'Студент в целом',
    );
  });

  it('время консультации: только чч:мм и реальная дата', () => {
    expect(toIsoDateTime('2026-10-20', '14:30')).toBe(
      new Date('2026-10-20T14:30:00').toISOString(),
    );
    expect(toIsoDateTime('2026-10-20', '25:00')).toBeNull();
    expect(toIsoDateTime('', '10:00')).toBeNull();
  });

  it('FR-068: преподаватель видит внутренний ответ с пометкой и может отметить обращение', async () => {
    const { wrapper } = await mountWithApp(FeedbackThread, {
      props: { item: question, mode: 'staff', showStudent: true },
    });
    const text = wrapper.text();
    expect(text).toContain('Вопрос');
    expect(text).toContain('Ждёт ответа');
    expect(text).toContain('Видно только преподавателям');
    expect(text).toContain('задание «Лабораторная 1»');
    expect(wrapper.find('a[href="/students/s1?tab=support"]').exists()).toBe(true);
    expect(text).toContain('Отметить рассмотренным');
  });

  it('студент видит свой вопрос как «Вы», без кнопки «рассмотрено»', async () => {
    const { wrapper } = await mountWithApp(FeedbackThread, {
      props: { item: { ...question, replies: [] }, mode: 'student' },
      user: testUser(['student']),
    });
    expect(wrapper.text()).toContain('Вы');
    expect(wrapper.text()).not.toContain('Отметить рассмотренным');
    expect(wrapper.text()).not.toContain('Видно только преподавателям');
  });

  it('FR-067, FR-068: внутренняя заметка консультации видна только в режиме преподавателя', async () => {
    const held: ConsultationDto = {
      id: 'c1',
      status: 'HELD',
      topic: 'Разбор ошибок',
      scheduledAt: '2026-10-11T10:00:00.000Z',
      heldAt: '2026-10-11T10:30:00.000Z',
      summary: 'Составили план',
      internalNote: 'Нужна поддержка',
      teacher,
      requestedByStudent: true,
      student,
      trajectory: null,
      createdAt: '2026-10-09T10:00:00.000Z',
    };
    const staff = await mountWithApp(ConsultationCard, { props: { item: held, mode: 'staff' } });
    expect(staff.wrapper.text()).toContain('Нужна поддержка');
    expect(staff.wrapper.text()).toContain('Проведена');
    const own = await mountWithApp(ConsultationCard, { props: { item: held, mode: 'student' } });
    expect(own.wrapper.text()).toContain('Составили план');
    expect(own.wrapper.text()).not.toContain('Нужна поддержка');
  });

  it('FR-065: бейдж показывает число непрочитанных уведомлений', async () => {
    const data: NotificationsDto = {
      unread: 3,
      items: [
        {
          id: 'n1',
          type: 'feedback.created',
          title: 'Студент задал вопрос',
          body: 'Петров Иван',
          link: '/feedback',
          readAt: null,
          createdAt: '2026-10-10T09:00:00.000Z',
        },
      ],
    };
    mockApi({ 'GET /notifications': data });
    const { wrapper } = await mountWithApp(HeaderActions);
    await flushPromises();
    const bell = wrapper.find('button[title="Уведомления"]');
    expect(bell.attributes('aria-label')).toBe('Уведомления: непрочитанных 3');
    expect(bell.text()).toContain('3');
    wrapper.unmount();
  });

  it('FR-066: студент видит точки, после которых нужна рефлексия, и запрос самооценки', async () => {
    const data: CabinetFeedbackDto = {
      feedback: [
        {
          ...question,
          id: 'req',
          kind: 'SELF_ASSESSMENT_REQUEST',
          body: 'Оцените первый этап',
          author: teacher,
          fromStudent: false,
          replies: [],
        },
      ],
      consultations: [],
      reflections: [],
      pendingReflections: [
        {
          checkpointId: 'cp1',
          title: 'Входной тест',
          dueDate: '2026-10-05',
          status: 'PASSED',
          stage: { id: 'st1', title: 'Адаптационный', sortOrder: 0 },
          trajectory: { id: 't1', disciplineName: 'Физика' },
        },
      ],
      trajectories: [{ id: 't1', disciplineName: 'Физика', status: 'ACTIVE', stages: [] }],
    };
    mockApi({ 'GET /cabinet/feedback': data });
    const { wrapper } = await mountWithApp(MyFeedbackView, {
      path: '/student/feedback',
      user: testUser(['student']),
    });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('Рефлексия: «Входной тест»');
    expect(text).toContain('Точка пройдена');
    expect(text).toContain('Оцените первый этап');
    expect(text).toContain('Задать вопрос');
    expect(text).toContain('Запросить консультацию');
    expect(wrapper.find('button[aria-haspopup="true"]').attributes('disabled')).toBeUndefined();
  });
});
