import type {
  ControlOptionsDto,
  ControlSheetDto,
  ControlWorkDto,
  ControlWorkListDto,
  StudentControlResultsDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import ControlSheet from './ControlSheet.vue';
import ControlWorksPanel from './ControlWorksPanel.vue';
import StudentControlResults from './StudentControlResults.vue';

const web = { id: 'd1', name: 'Веб-дизайн' };
const eg = { id: 'g1', name: 'ПО-9 ЭГ' };

type Handler = (init?: RequestInit) => unknown;

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

const work: ControlWorkDto = {
  id: 'w1',
  discipline: web,
  topic: 'Создание веб-страниц',
  kind: 'ENTRY',
  criteria: 'Структура — 50; оформление — 50',
  groups: [{ group: eg, date: '2025-10-20', scored: 1, mean: 62.5 }],
  author: null,
  createdAt: '2025-10-01T10:00:00.000Z',
  canEdit: true,
};

describe('Контрольные работы', () => {
  const options: ControlOptionsDto = { groups: [eg], disciplines: [web], pairs: null };

  it('нет работ — пояснение и кнопка «Новая работа» для преподавателя', async () => {
    mockApi({ '/control-works/options': options, '/control-works': { items: [] } });
    const { wrapper } = await mountWithApp(ControlWorksPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Контрольных работ нет');
    expect(wrapper.text()).toContain('Новая работа');
  });

  it('список: вид контроля, тема, группы со средним баллом; без баллов — «Нет данных»', async () => {
    const list: ControlWorkListDto = {
      items: [
        {
          ...work,
          groups: [
            ...work.groups,
            { group: { id: 'g2', name: 'ПО-9 КГ' }, date: '2025-10-21', scored: 0, mean: null },
          ],
        },
      ],
    };
    mockApi({ '/control-works/options': options, '/control-works': list });
    const { wrapper } = await mountWithApp(ControlWorksPanel, { user: testUser(['researcher']) });
    await flushPromises();
    expect(wrapper.text()).toContain('Входной контроль');
    expect(wrapper.text()).toContain('Создание веб-страниц');
    expect(wrapper.text()).toMatch(/ПО-9 ЭГ, 20\.10\.2025 · средний балл:\s*62,5/);
    expect(wrapper.text()).toMatch(/ПО-9 КГ, 21\.10\.2025 · средний балл:\s*Нет данных/);
    expect(wrapper.text()).not.toContain('Новая работа');
  });

  it('FR-074: ведомость — отметка вместо балла, пустой балл не становится нулём', async () => {
    const sheet: ControlSheetDto = {
      work,
      group: eg,
      date: '2025-10-20',
      canEdit: true,
      rows: [
        { student: { id: 's1', fullName: 'Альфин Пётр' }, score: 62.5, mark: null },
        { student: { id: 's2', fullName: 'Бетова Анна' }, score: null, mark: 'ABSENT' },
        { student: { id: 's3', fullName: 'Гаммин Олег' }, score: null, mark: null },
      ],
    };
    let sent: unknown = null;
    mockApi({
      'GET /control-works/w1/groups/g1/results': sheet,
      'PUT /control-works/w1/groups/g1/results': (init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return sheet;
      },
    });
    const { wrapper } = await mountWithApp(ControlSheet, { props: { work, groupId: 'g1' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Заполнено: 2 из 3');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(sent).toEqual({
      entries: [
        { studentId: 's1', score: 62.5, mark: null },
        { studentId: 's2', score: null, mark: 'ABSENT' },
        { studentId: 's3', score: null, mark: null },
      ],
    });
    expect(wrapper.text()).toContain('Ведомость сохранена');
  });
});

describe('Результаты контрольных работ студента', () => {
  it('входной → итоговый по дисциплине, отметки подписаны, пропуск — «Нет данных»', async () => {
    const results: StudentControlResultsDto = {
      results: [
        {
          work: { id: 'w1', topic: 'Создание веб-страниц', kind: 'ENTRY', discipline: web },
          date: '2025-10-20',
          score: 40,
          mark: null,
        },
        {
          work: { id: 'w2', topic: 'Вёрстка', kind: 'CURRENT', discipline: web },
          date: '2025-12-10',
          score: null,
          mark: 'EXEMPT',
        },
        {
          work: { id: 'w3', topic: 'Итоговый проект', kind: 'FINAL', discipline: web },
          date: '2026-04-28',
          score: 72.5,
          mark: null,
        },
      ],
      progress: [{ discipline: web, entry: 40, final: 72.5, delta: 32.5 }],
    };
    mockApi({ '/cabinet/control-results': results });
    const { wrapper } = await mountWithApp(StudentControlResults, {
      props: { source: '/cabinet/control-results' },
    });
    await flushPromises();
    expect(wrapper.text()).toMatch(/Веб-дизайн\s*40\s*72,5\s*\+32,5/);
    expect(wrapper.text()).toContain('Освобождён');
    expect(wrapper.text()).not.toMatch(/Вёрстка[^О]*\b0\b/);
  });

  it('нет результатов — «Нет данных»', async () => {
    mockApi({ '/students/s1/control-results': { results: [], progress: [] } });
    const { wrapper } = await mountWithApp(StudentControlResults, {
      props: { source: '/students/s1/control-results' },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Результатов контрольных работ пока нет');
  });
});
