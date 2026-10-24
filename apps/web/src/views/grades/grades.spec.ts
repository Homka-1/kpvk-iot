import type {
  GradeImportPreviewDto,
  GradeOptionsDto,
  GroupGradesDto,
  StudentGradesDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import GradesPanel from './GradesPanel.vue';
import ImportGradesDialog from './ImportGradesDialog.vue';
import StudentGrades from './StudentGrades.vue';

const first = { id: 'p1', academicYear: '2025/2026', semester: 1, label: '2025/2026, 1 семестр' };
const second = { id: 'p2', academicYear: '2025/2026', semester: 2, label: '2025/2026, 2 семестр' };
const math = { id: 'd1', name: 'Математика' };
const it_ = { id: 'd2', name: 'Информатика' };
const group = { id: 'g1', name: 'ПО-21' };

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

describe('Академическая успешность в профиле студента', () => {
  it('FR-074: без оценок — «Нет данных», а не ноль', async () => {
    mockApi({ '/students/s1/grades': { semesters: [] } satisfies StudentGradesDto });
    const { wrapper } = await mountWithApp(StudentGrades, { props: { studentId: 's1' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Нет данных');
    expect(wrapper.text()).toContain('Оценки за семестр ещё не загружены');
  });

  it('средние по семестрам и сравнение последнего семестра с предыдущим', async () => {
    const grades: StudentGradesDto = {
      semesters: [
        {
          period: second,
          groups: [group],
          disciplines: [{ discipline: math, scores: [88], mean: 88 }],
          overall: 88,
        },
        {
          period: first,
          groups: [group],
          disciplines: [
            { discipline: it_, scores: [60], mean: 60 },
            { discipline: math, scores: [70, 90], mean: 80 },
          ],
          overall: 70,
        },
      ],
    };
    mockApi({ '/students/s1/grades': grades });
    const { wrapper } = await mountWithApp(StudentGrades, { props: { studentId: 's1' } });
    await flushPromises();
    expect(wrapper.text()).toContain('оценки: 70; 90');
    const rows = wrapper.findAll('.student-grades__table tbody tr').map((row) => row.text());
    // Информатики во 2 семестре нет — изменение не считается.
    expect(rows).toEqual([
      expect.stringMatching(/Информатика\s*Нет данных\s*60\s*Нет данных/),
      expect.stringMatching(/Математика\s*88\s*80\s*\+8/),
    ]);
    expect(wrapper.find('.student-grades__table tfoot').text()).toMatch(/88\s*70\s*\+18/);
  });
});

describe('Успеваемость группы', () => {
  const options: GradeOptionsDto = { periods: [second, first], groups: [group] };

  it('нет загруженных оценок — пояснение и кнопка импорта для преподавателя', async () => {
    mockApi({ '/grades/options': { periods: [], groups: [group] } satisfies GradeOptionsDto });
    const { wrapper } = await mountWithApp(GradesPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Оценки ещё не загружены');
    expect(wrapper.text()).toContain('Импорт оценок');
  });

  it('общий балл студентов и средний по дисциплинам; пропуск — «Нет данных»', async () => {
    const data: GroupGradesDto = {
      group,
      period: second,
      comparePeriod: null,
      overall: 80,
      compareOverall: null,
      delta: null,
      disciplines: [{ discipline: math, mean: 80, students: 1, compareMean: null, delta: null }],
      students: [
        {
          student: { id: 's1', fullName: 'Альфин Пётр' },
          overall: 80,
          disciplineCount: 1,
          compareOverall: null,
          delta: null,
        },
        {
          student: { id: 's2', fullName: 'Бетова Анна' },
          overall: null,
          disciplineCount: 0,
          compareOverall: null,
          delta: null,
        },
      ],
    };
    const fetchMock = mockApi({ '/grades/options': options, '/grades/group': data });
    const { wrapper } = await mountWithApp(GradesPanel, { user: testUser(['admin']) });
    await flushPromises();
    const query = String(fetchMock.mock.calls.find(([url]) => String(url).includes('/group'))![0]);
    expect(query).toContain('groupId=g1');
    expect(query).toContain('periodId=p2');
    expect(wrapper.text()).toContain('ПО-21: 2025/2026, 2 семестр');
    expect(wrapper.text()).toMatch(/Бетова Анна\s*Нет данных/);
    expect(wrapper.find('a[href*="/students/s1"]').exists()).toBe(true);
  });

  it('студент не видит кнопок импорта (нет права grades.manage)', async () => {
    mockApi({ '/grades/options': { periods: [], groups: [] } satisfies GradeOptionsDto });
    const { wrapper } = await mountWithApp(GradesPanel, { user: testUser(['researcher']) });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Импорт оценок');
  });
});

describe('Импорт оценок', () => {
  it('NFR-006: повторная загрузка тех же оценок — предупреждение и импорт недоступен', async () => {
    const preview: GradeImportPreviewDto = {
      rows: [
        {
          line: 2,
          studentName: 'Альфин Пётр',
          groupName: 'ПО-21',
          academicYear: '2025/2026',
          semester: '1',
          disciplineName: 'Математика',
          score: '85,5',
          resolved: {
            student: { id: 's1', fullName: 'Альфин Пётр' },
            group,
            period: { academicYear: '2025/2026', semester: 1, label: first.label },
            discipline: math,
            score: 85.5,
          },
          errors: [],
        },
      ],
      validCount: 1,
      invalidCount: 0,
      fileErrors: [],
      alreadyImported: { fileName: 'оценки.csv', createdAt: '2026-10-24T10:00:00.000Z' },
    };
    mockApi({ 'POST /grades/import/preview': preview });
    const { wrapper } = await mountWithApp(ImportGradesDialog, {
      props: { visible: true },
      attachTo: document.body,
    });
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('#grades-import-file')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['ФИО'], 'оценки.csv', { type: 'text/csv' })],
    });
    input.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.body.textContent).toContain('Эти оценки уже загружены');
    expect(document.body.textContent).toContain('85,5');
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Импортировать: 1'),
    )!;
    expect(button.disabled).toBe(true);
    wrapper.unmount();
  });
});
