import { expect, test } from '@playwright/test';
import type {
  AssignmentTypeDto,
  DisciplineDto,
  LibraryAssignmentDto,
  MaterialDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const teacher = fakeUser(['teacher']);
const author = { id: teacher.id, fullName: 'Иванова Анна Сергеевна' };
const discipline: DisciplineDto = {
  id: '00000000-0000-7000-8000-000000000e01',
  name: 'Математика',
  code: null,
  description: null,
  archivedAt: null,
  groups: [],
  teachers: [],
};
const practical: AssignmentTypeDto = {
  id: '00000000-0000-7000-8000-000000000e02',
  code: 'practical',
  name: 'Практическая работа',
  isSystem: true,
};

test.describe('Библиотека материалов и заданий', () => {
  test('FR-046, FR-047, NFR-004: создание задания с критерием и поиск в библиотеке', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    await mockDirectoryApi(page, { disciplines: [discipline] });
    const items: LibraryAssignmentDto[] = [];
    let created: Record<string, unknown> | null = null;
    await page.route('**/api/assignment-types', (route) => route.fulfill({ json: [practical] }));
    await page.route(/\/api\/library-assignments(\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        const dto: LibraryAssignmentDto = {
          id: '00000000-0000-7000-8000-000000000e03',
          title: String(created.title),
          discipline: { id: discipline.id, name: discipline.name },
          topic: null,
          goal: null,
          difficulty: 'BASIC',
          type: practical,
          instruction: null,
          submissionFormats: ['TEXT'],
          maxScore: 5,
          criteria: [{ id: 'c1', title: 'Верность решения', description: null, maxScore: 5 }],
          attachments: [],
          archivedAt: null,
          createdBy: author,
          createdAt: '2026-10-18T10:00:00.000Z',
          updatedAt: '2026-10-18T10:00:00.000Z',
        };
        items.push(dto);
        return route.fulfill({ status: 201, json: dto });
      }
      const q = new URL(route.request().url()).searchParams.get('q');
      return route.fulfill({
        json: q ? items.filter((item) => item.title.includes(q)) : items,
      });
    });

    await page.goto('/assignments');
    await expect(page.getByRole('heading', { name: 'Заданий пока нет' })).toBeVisible();
    await page.getByRole('button', { name: 'Создать задание' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новое задание' });
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog.getByText('Укажите название задания')).toBeVisible();

    await dialog.getByLabel('Название', { exact: true }).fill('Линейные уравнения');
    await dialog.getByRole('combobox', { name: 'Дисциплина' }).click();
    await page.getByRole('option', { name: 'Математика' }).click();
    await dialog.getByRole('combobox', { name: 'Тип задания' }).click();
    await page.getByRole('option', { name: 'Практическая работа' }).click();
    await dialog.getByRole('button', { name: 'Добавить критерий' }).click();
    await dialog.getByRole('textbox', { name: 'Критерий 1' }).fill('Верность решения');
    await dialog.getByLabel('Макс. балл').fill('5');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(
      dialog.getByText('Сумма максимальных баллов критериев должна быть 100, сейчас 5'),
    ).toBeVisible();
    await dialog.getByLabel('Макс. балл').fill('100');
    await dialog.getByLabel('Макс. балл').blur();
    await expect(dialog.getByText('Сумма баллов: 100 из 100')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog).toBeHidden();
    expect(created).toMatchObject({
      title: 'Линейные уравнения',
      disciplineId: discipline.id,
      typeId: practical.id,
      difficulty: 'BASIC',
      submissionFormats: ['TEXT'],
      criteria: [{ title: 'Верность решения', maxScore: 100 }],
    });

    const card = page.getByTestId('assignment-card');
    await expect(card).toContainText('Линейные уравнения');
    await expect(card).toContainText('Сложность: Базовый');
    await page.getByLabel('Поиск заданий').fill('Проценты');
    await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('п. 8.3, NFR-004: недопустимый файл отклоняется до загрузки, материал-ссылка открывается безопасно', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    await mockDirectoryApi(page, { disciplines: [discipline] });
    const link: MaterialDto = {
      id: '00000000-0000-7000-8000-000000000e04',
      title: 'Видеоурок по дробям',
      description: 'Короткое объяснение',
      kind: 'LINK',
      file: null,
      url: 'https://example.org/video',
      body: null,
      discipline: { id: discipline.id, name: discipline.name },
      topic: 'Дроби',
      archivedAt: null,
      createdBy: author,
      createdAt: '2026-10-18T10:00:00.000Z',
      updatedAt: '2026-10-18T10:00:00.000Z',
    };
    let uploads = 0;
    await page.route(/\/api\/materials(\?.*)?$/, (route) => route.fulfill({ json: [link] }));
    await page.route('**/api/files', (route) => {
      uploads += 1;
      return route.fulfill({ status: 500, json: { message: 'не должно вызываться' } });
    });

    await page.goto('/library');
    const card = page.getByTestId('material-card');
    await expect(card).toContainText('Математика · Дроби');
    await expect(card.getByRole('link', { name: 'https://example.org/video' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Добавить материал' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый материал' });
    await dialog.getByTestId('file-input').setInputFiles({
      name: 'setup.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });
    await expect(dialog.getByRole('alert')).toContainText('Этот тип файла загружать нельзя');
    expect(uploads).toBe(0);
    await expectNoHorizontalScroll(page);
  });
});
