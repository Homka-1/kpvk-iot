import type { AssignmentReviewDto, StudentAssignmentDto } from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp } from '@/testing/mount';
import AssignmentReviewView from './AssignmentReviewView.vue';
import { assignmentBadge, assignmentMeta, overdueBadge, scoreText } from './status';
import StudentAssignmentsTab from './StudentAssignmentsTab.vue';

const item = (overrides: Partial<StudentAssignmentDto> = {}): StudentAssignmentDto => ({
  id: 'ta1',
  status: 'ASSIGNED',
  dueAt: null,
  assignedAt: '2026-09-01T10:00:00.000Z',
  assignment: {
    id: 'a1',
    title: 'Линейные уравнения',
    typeName: 'Практическая работа',
    difficulty: 'BASIC',
    topic: null,
  },
  discipline: { id: 'd1', name: 'Математика' },
  trajectory: null,
  choiceGroup: null,
  assignedBy: { id: 'u1', fullName: 'Иванова Анна' },
  result: null,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('задания студента', () => {
  it('п. 6.1: статус задания — текст и значок, не только цвет', () => {
    expect(assignmentBadge('OFFERED')).toMatchObject({
      label: 'Предложено на выбор',
      icon: 'pi pi-list',
    });
    expect(assignmentBadge('COMPLETED').tone).toBe('success');
  });

  it('этап ИОТ указывается в описании задания', () => {
    expect(
      assignmentMeta(
        item({ trajectory: { id: 't1', stage: { id: 's1', title: 'Проектная', sortOrder: 3 } } }),
      ),
    ).toBe('Практическая работа · сложность: базовый · этап 4 «Проектная»');
  });

  it('FR-048: вкладка «Задания» профиля; отменить можно только не начатое задание вне ИОТ', async () => {
    const rows = [
      item(),
      item({
        id: 'ta2',
        assignment: { ...item().assignment, id: 'a2', title: 'Из маршрута' },
        trajectory: { id: 't1', stage: { id: 's0', title: 'Адаптационный', sortOrder: 0 } },
      }),
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const isCancel = String(input).includes('/cancel');
      return new Response(isCancel ? null : JSON.stringify(rows), {
        status: isCancel ? 204 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountWithApp(StudentAssignmentsTab, {
      props: { studentId: 'st1' },
      attachTo: document.body,
    });
    await flushPromises();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/student-assignments?studentId=st1');
    const cards = wrapper.findAll('.student-tasks__item');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('вне маршрута');
    expect(cards[0]!.find('button').text()).toBe('Отменить');
    expect(cards[1]!.find('button').exists()).toBe(false);

    await cards[0]!.find('button').trigger('click');
    await flushPromises();
    const reason = document.body.querySelector<HTMLTextAreaElement>('#action-reason')!;
    reason.value = 'Назначено по ошибке';
    reason.dispatchEvent(new Event('input'));
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flushPromises();
    const cancel = fetchMock.mock.calls.find(([url]) => String(url).includes('/cancel'))!;
    expect(String(cancel[0])).toBe('/api/student-assignments/ta1/cancel');
    expect(JSON.parse(String(cancel[1]!.body))).toEqual({ reason: 'Назначено по ошибке' });
    wrapper.unmount();
  });

  it('FR-053: просрочка — отдельный бейдж с текстом; балл — «из максимума»', () => {
    expect(overdueBadge({ status: 'ASSIGNED', dueAt: '2020-01-01T00:00:00.000Z' })).toMatchObject({
      label: 'Просрочено',
      icon: 'pi pi-exclamation-triangle',
    });
    expect(overdueBadge({ status: 'SUBMITTED', dueAt: '2020-01-01T00:00:00.000Z' })).toBeNull();
    expect(scoreText({ score: 7, maxScore: 7.5 })).toBe('7 из 7,5');
    expect(scoreText({ score: null, maxScore: null })).toBeNull();
  });

  it('AT-07, FR-052: преподаватель принимает ответ с баллами по каждому критерию', async () => {
    const review: AssignmentReviewDto = {
      ...item({ status: 'SUBMITTED' }),
      student: { id: 'st1', fullName: 'Петров Иван', group: null },
      goal: null,
      instruction: 'Решите уравнения',
      submissionFormats: ['TEXT'],
      maxScore: 7.5,
      criteria: [
        { id: 'c1', title: 'Верность', description: null, maxScore: 5 },
        { id: 'c2', title: 'Оформление', description: null, maxScore: 2.5 },
      ],
      attachments: [],
      completedAt: null,
      submissions: [
        {
          id: 'sub1',
          attemptNumber: 1,
          text: 'x = 2',
          url: null,
          files: [],
          submittedAt: '2026-09-10T10:00:00.000Z',
          late: false,
          assessment: null,
        },
      ],
    };
    const posted: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') posted.push(init);
        return new Response(JSON.stringify(review), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const { wrapper } = await mountWithApp(AssignmentReviewView, {
      path: '/assignments/review/ta1',
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Петров Иван');
    expect(wrapper.text()).toContain('Проверка попытки 1');

    // Без баллов не отправляется: сервер не вызывается, ошибка у поля.
    await wrapper.find('form.review__form').trigger('submit');
    await flushPromises();
    expect(posted).toHaveLength(0);
    expect(wrapper.text()).toContain('Поставьте балл по критерию');

    for (const [index, value] of [
      [0, '5'],
      [1, '2'],
    ] as const) {
      const input = wrapper.find(`#review-score-${index}`);
      await input.setValue(value);
      await input.trigger('blur');
    }
    await wrapper.find('form.review__form').trigger('submit');
    await flushPromises();
    expect(posted).toHaveLength(1);
    expect(JSON.parse(String(posted[0]!.body))).toMatchObject({
      submissionId: 'sub1',
      decision: 'ACCEPTED',
      criterionScores: [
        { criterionId: 'c1', score: 5 },
        { criterionId: 'c2', score: 2 },
      ],
    });
  });
});
