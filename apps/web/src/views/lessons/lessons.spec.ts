import type {
  LessonDto,
  LessonJournalDto,
  LessonJournalInput,
  LessonListDto,
  ObservationCriterionDto,
  StudentLessonJournalDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import LessonJournalView from './LessonJournalView.vue';
import LessonsPanel from './LessonsPanel.vue';
import ObservationCriteriaSettings from './ObservationCriteriaSettings.vue';
import StudentLessonJournal from './StudentLessonJournal.vue';

const LESSON_ID = '01900000-0000-7000-8000-000000000501';
const criteria: ObservationCriterionDto[] = [
  { id: 'c1', name: 'Активность на занятии', archived: false },
  { id: 'c2', name: 'Самостоятельность', archived: false },
];

const lesson: LessonDto = {
  id: LESSON_ID,
  date: '2026-10-20',
  startTime: '08:30',
  group: { id: 'g1', name: 'ПО-21' },
  discipline: { id: 'd1', name: 'Информатика' },
  teacher: { id: 't1', fullName: 'Иванова Анна Сергеевна' },
  journal: { status: 'PARTIAL', done: 1, total: 2 },
  canObserve: true,
  canDelete: false,
};

const journal: LessonJournalDto = {
  lesson,
  criteria,
  students: [
    {
      student: { id: 's1', fullName: 'Петров Иван' },
      absent: false,
      ratings: { c1: 5, c2: null },
    },
    { student: { id: 's2', fullName: 'Сидорова Анна' }, absent: null, ratings: {} },
  ],
};

type Handler = (init?: RequestInit) => unknown;

/** Ответы API по «МЕТОД путь» или пути; функция получает запрос (для проверки тела). */
function mockApi(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
      .split('?')[0]!
      .replace(/^\/api/, '');
    const entry = responses[`${init?.method ?? 'GET'} ${path}`] ?? responses[path];
    const body = typeof entry === 'function' ? (entry as Handler)(init) : entry;
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

describe('Занятия', () => {
  it('статус журнала — текстом и значком, ссылка на журнал', async () => {
    const list: LessonListDto = { items: [lesson], truncated: false };
    mockApi({ '/lessons': list, '/lessons/options': null });
    const { wrapper } = await mountWithApp(LessonsPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('20.10.2026, 08:30');
    expect(wrapper.text()).toContain('Журнал заполнен частично: 1 из 2');
    expect(wrapper.find('a[href$="/disciplines/lessons/' + LESSON_ID + '"]').exists()).toBe(true);
  });

  it('FR-005: пустой список — пояснение, а не пустая таблица', async () => {
    mockApi({ '/lessons': { items: [], truncated: false }, '/lessons/options': null });
    const { wrapper } = await mountWithApp(LessonsPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Занятий нет');
  });
});

describe('Журнал занятия', () => {
  async function mountJournal() {
    let saved: LessonJournalInput | null = null;
    mockApi({
      [`GET /lessons/${LESSON_ID}/journal`]: journal,
      [`PUT /lessons/${LESSON_ID}/journal`]: (init?: RequestInit) => {
        saved = JSON.parse(String(init?.body)) as LessonJournalInput;
        return journal;
      },
    });
    const { wrapper } = await mountWithApp(LessonJournalView, {
      path: `/disciplines/lessons/${LESSON_ID}`,
    });
    await flushPromises();
    return { wrapper, saved: () => saved };
  }

  it('FR-014: все студенты группы, критерии, «Не наблюдалось» отличается от пустой клетки', async () => {
    const { wrapper } = await mountJournal();
    expect(wrapper.text()).toContain('Петров Иван');
    expect(wrapper.text()).toContain('Сидорова Анна');
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual(
      expect.arrayContaining(['Активность на занятии', 'Самостоятельность', 'Отсутствовал']),
    );
    expect(wrapper.text()).toContain('Не наблюдалось');
    expect(wrapper.text()).toContain('Заполнено: 1 из 2');
  });

  it('FR-074: неотмеченный студент не отправляется; отсутствующий — без оценок', async () => {
    const { wrapper, saved } = await mountJournal();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(saved()).toEqual({
      entries: [
        {
          studentId: 's1',
          absent: false,
          ratings: [
            { criterionId: 'c1', score: 5 },
            { criterionId: 'c2', score: null },
          ],
        },
      ],
    });

    await wrapper.find('#absent-s2').setValue(true);
    await wrapper.find('#absent-s1').setValue(true);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(saved()!.entries).toEqual([
      { studentId: 's1', absent: true, ratings: [] },
      { studentId: 's2', absent: true, ratings: [] },
    ]);
  });

  it('кнопка заполняет пустые клетки отметкой «Не наблюдалось»', async () => {
    const { wrapper, saved } = await mountJournal();
    const fill = wrapper.findAll('button').find((button) => button.text().includes('Пустые'))!;
    await fill.trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(saved()!.entries[1]).toEqual({
      studentId: 's2',
      absent: false,
      ratings: [
        { criterionId: 'c1', score: null },
        { criterionId: 'c2', score: null },
      ],
    });
  });
});

describe('Наблюдения на занятиях в профиле', () => {
  it('FR-074: средняя без нулей, «нет данных» для критерия без оценок, отсутствие — текстом', async () => {
    const data: StudentLessonJournalDto = {
      criteria,
      records: [
        {
          lessonId: 'l1',
          date: '2026-10-20',
          startTime: '08:30',
          discipline: { id: 'd1', name: 'Информатика' },
          teacher: { id: 't1', fullName: 'Иванова Анна' },
          absent: false,
          ratings: { c1: 4 },
        },
        {
          lessonId: 'l2',
          date: '2026-10-13',
          startTime: '08:30',
          discipline: { id: 'd1', name: 'Информатика' },
          teacher: { id: 't1', fullName: 'Иванова Анна' },
          absent: true,
          ratings: {},
        },
      ],
      summary: [
        { criterionId: 'c1', mean: 4, rated: 1, notObserved: 0 },
        { criterionId: 'c2', mean: null, rated: 0, notObserved: 0 },
      ],
      lessons: 2,
      absences: 1,
    };
    mockApi({ '/students/s1/lesson-journal': data });
    const { wrapper } = await mountWithApp(StudentLessonJournal, { props: { studentId: 's1' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Занятий в журналах: 2, из них пропущено: 1');
    expect(wrapper.text()).toContain('Нет данных');
    expect(wrapper.text()).toContain('Отсутствовал');
    expect(wrapper.text()).not.toMatch(/Самостоятельность\s*0/);
  });
});

describe('Критерии наблюдения в настройках', () => {
  it('порядок, архив и новый критерий уходят одним списком', async () => {
    const A = '01900000-0000-7000-8000-0000000000c1';
    const B = '01900000-0000-7000-8000-0000000000c2';
    const stored: ObservationCriterionDto[] = [
      { id: A, name: 'Активность на занятии', archived: false },
      { id: B, name: 'Самостоятельность', archived: false },
    ];
    let sent: unknown = null;
    mockApi({
      'GET /observation-criteria': stored,
      'PUT /observation-criteria': (init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return stored;
      },
    });
    const { wrapper } = await mountWithApp(ObservationCriteriaSettings, {
      user: testUser(['admin']),
    });
    await flushPromises();
    const archive = wrapper.findAll('button').find((button) => button.text() === 'В архив')!;
    await archive.trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Добавить'))!
      .trigger('click');
    const inputs = wrapper.findAll('input');
    await inputs[inputs.length - 1]!.setValue('Работа в паре');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(sent).toEqual({
      items: [
        { id: A, name: 'Активность на занятии', archived: true },
        { id: B, name: 'Самостоятельность', archived: false },
        { name: 'Работа в паре', archived: false },
      ],
    });
  });
});
