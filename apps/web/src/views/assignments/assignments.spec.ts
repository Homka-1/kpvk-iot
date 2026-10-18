import type { StudentAssignmentDto } from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp } from '@/testing/mount';
import { assignmentBadge, assignmentMeta } from './status';
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
});
