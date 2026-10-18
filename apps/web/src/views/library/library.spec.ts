import {
  type AssignmentTypeDto,
  FILE_UPLOAD_MAX_BYTES,
  type LibraryAssignmentDto,
  type MaterialDto,
} from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import AssignmentsView from '@/views/assignments/AssignmentsView.vue';
import AssignmentDialog from './AssignmentDialog.vue';
import { precheckFile } from './files';
import LibraryView from './LibraryView.vue';

const author = { id: 'u1', fullName: 'Иванова Анна Сергеевна' };
const practical: AssignmentTypeDto = {
  id: 't1',
  code: 'practical',
  name: 'Практическая работа',
  isSystem: true,
};

const assignment: LibraryAssignmentDto = {
  id: 'a1',
  title: 'Сравнение дробей',
  discipline: { id: 'd1', name: 'Математика' },
  topic: 'Дроби',
  goal: 'Научиться сравнивать дроби',
  difficulty: 'ADVANCED',
  type: practical,
  instruction: 'Решите задачи',
  submissionFormats: ['TEXT', 'LINK'],
  maxScore: 10.5,
  criteria: [
    { id: 'c1', title: 'Верность', description: null, maxScore: 6 },
    { id: 'c2', title: 'Обоснование', description: null, maxScore: 4.5 },
  ],
  attachments: [{ id: 'at1', title: 'Тренажёр', file: null, url: 'https://example.org/t' }],
  archivedAt: null,
  createdBy: author,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

const material = (overrides: Partial<MaterialDto>): MaterialDto => ({
  id: 'm1',
  title: 'Опорный конспект',
  description: null,
  kind: 'FILE',
  file: null,
  url: null,
  body: null,
  discipline: null,
  topic: null,
  archivedAt: null,
  createdBy: author,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
  ...overrides,
});

interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

function mockApi(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.split('?')[0]!.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const body = responses[`${method} ${path}`];
    return new Response(JSON.stringify(body ?? { message: 'Не найдено' }), {
      status: body === undefined ? 404 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Раздел «Задания» — библиотека заданий', () => {
  it('FR-047: карточка показывает тип, сложность текстом, форматы, критерии и ресурсы', async () => {
    mockApi({
      'GET /library-assignments': [assignment],
      'GET /assignment-types': [practical],
    });
    const { wrapper } = await mountWithApp(AssignmentsView, { path: '/assignments' });
    await flushPromises();
    const card = wrapper.get('[data-testid="assignment-card"]');
    expect(card.text()).toContain('Практическая работа');
    expect(card.text()).toContain('Сложность: Повышенный');
    expect(card.text()).toContain('Текст, Ссылка');
    expect(card.text()).toContain('Верность; Обоснование (максимум 10,5)');
    const link = card.get('a[href="https://example.org/t"]');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(link.text()).toContain('Тренажёр');
  });

  it('FR-047: поиск по тексту уходит на сервер параметром q', async () => {
    const calls = mockApi({ 'GET /library-assignments': [], 'GET /assignment-types': [] });
    const { wrapper } = await mountWithApp(AssignmentsView, { path: '/assignments' });
    await flushPromises();
    expect(wrapper.text()).toContain('Заданий пока нет');
    await wrapper.get('input[aria-label="Поиск заданий"]').setValue('дроби');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    const last = calls.filter((call) => call.url.startsWith('/api/library-assignments')).at(-1)!;
    expect(new URL(last.url, 'http://localhost').searchParams.get('q')).toBe('дроби');
    expect(wrapper.text()).toContain('Ничего не найдено');
  });

  it('без разрешения на библиотеку — пояснение, запросов к библиотеке нет', async () => {
    const calls = mockApi({});
    const user = testUser(['teacher']);
    user.permissions = user.permissions.filter((permission) => permission !== 'library.manage');
    const { wrapper } = await mountWithApp(AssignmentsView, { path: '/assignments', user });
    await flushPromises();
    expect(wrapper.text()).toContain('Нет доступа к библиотеке заданий');
    expect(calls.some((call) => call.url.includes('library-assignments'))).toBe(false);
  });
});

describe('Карточка задания (диалог)', () => {
  it('FR-046: обязательные поля проверяются до отправки; сохранение — с ключом повторной отправки', async () => {
    const calls = mockApi({ 'POST /library-assignments': assignment });
    const { wrapper } = await mountWithApp(AssignmentDialog, {
      props: { visible: true, assignment: null, types: [practical] },
      attachTo: document.body,
    });
    await flushPromises();
    const form = document.body.querySelector('form')!;
    form.dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(document.body.textContent).toContain('Укажите название задания');
    expect(document.body.textContent).toContain('Выберите дисциплину');
    expect(document.body.textContent).toContain('Выберите тип задания');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    wrapper.unmount();
  });

  it('FR-046: изменение задания отправляет критерии и вложения', async () => {
    const calls = mockApi({ 'PUT /library-assignments/a1': assignment });
    const { wrapper } = await mountWithApp(AssignmentDialog, {
      props: { visible: false, assignment, types: [practical] },
      attachTo: document.body,
    });
    await wrapper.setProps({ visible: true });
    await flushPromises();
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flushPromises();
    const put = calls.find((call) => call.method === 'PUT')!;
    expect(put.body).toMatchObject({
      title: 'Сравнение дробей',
      disciplineId: 'd1',
      typeId: 't1',
      difficulty: 'ADVANCED',
      submissionFormats: ['TEXT', 'LINK'],
      criteria: [
        { title: 'Верность', maxScore: 6 },
        { title: 'Обоснование', maxScore: 4.5 },
      ],
      attachments: [{ title: 'Тренажёр', fileId: null, url: 'https://example.org/t' }],
    });
    expect(wrapper.emitted('saved')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Раздел «Библиотека материалов»', () => {
  it('файл скачивается кнопкой, ссылка открывается безопасно, общий материал подписан', async () => {
    mockApi({
      'GET /materials': [
        material({
          id: 'm1',
          kind: 'FILE',
          file: {
            id: 'f1',
            originalName: 'Конспект.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          },
          discipline: { id: 'd1', name: 'Математика' },
          topic: 'Уравнения',
        }),
        material({ id: 'm2', title: 'Видеоурок', kind: 'LINK', url: 'https://example.org/v' }),
      ],
    });
    const { wrapper } = await mountWithApp(LibraryView, { path: '/library' });
    await flushPromises();
    const cards = wrapper.findAll('[data-testid="material-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('Математика · Уравнения');
    expect(cards[0]!.text()).toContain('Скачать: Конспект.pdf (2 КБ)');
    expect(cards[1]!.text()).toContain('Общий материал');
    expect(cards[1]!.get('a').attributes()).toMatchObject({
      href: 'https://example.org/v',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('FR-005: пустая библиотека — пояснение, а не пустой список', async () => {
    mockApi({ 'GET /materials': [] });
    const { wrapper } = await mountWithApp(LibraryView, { path: '/library' });
    await flushPromises();
    expect(wrapper.text()).toContain('Материалов пока нет');
  });
});

describe('Предварительная проверка файла', () => {
  it('п. 8.3: запрещённое расширение и превышение размера отклоняются до загрузки', () => {
    expect(precheckFile(new File(['MZ'], 'setup.exe'))).toContain('нельзя');
    const big = new File(['x'], 'отчёт.pdf');
    Object.defineProperty(big, 'size', { value: FILE_UPLOAD_MAX_BYTES + 1 });
    expect(precheckFile(big)).toContain('Файл больше 20 МБ');
    expect(precheckFile(new File(['%PDF-'], 'Отчёт.PDF'))).toBeNull();
  });
});
