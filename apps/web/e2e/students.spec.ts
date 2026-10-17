import { expect, test } from '@playwright/test';
import type {
  DisciplineDto,
  GroupDto,
  StudentImportPreviewDto,
  StudentImportResultDto,
  StudentSummaryDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const group: GroupDto = {
  id: '00000000-0000-7000-8000-0000000000a1',
  name: 'ПО-21',
  course: 2,
  specialty: 'Программное обеспечение',
  archivedAt: null,
  studentCount: 2,
};
const discipline: DisciplineDto = {
  id: '00000000-0000-7000-8000-0000000000d1',
  name: 'Математика',
  code: 'ООД-05',
  description: null,
  archivedAt: null,
  groups: [{ id: group.id, name: group.name }],
  teachers: [{ id: '00000000-0000-7000-8000-000000000001', fullName: 'Иванова Анна' }],
};

function student(index: number, overrides: Partial<StudentSummaryDto> = {}): StudentSummaryDto {
  return {
    id: `00000000-0000-7000-8000-00000000010${index}`,
    participantCode: `S-ABCD2${index}`,
    lastName: index === 1 ? 'Петров' : 'Сидорова',
    firstName: index === 1 ? 'Иван' : 'Анна',
    middleName: null,
    login: `s-abcd2${index}`,
    group,
    supportStatus: 'STANDARD',
    archivedAt: null,
    motivationProfile: null,
    currentTrajectory: null,
    averageScore: null,
    completedAssignments: null,
    lastActivityAt: null,
    ...overrides,
  };
}

test.describe('раздел «Студенты»', () => {
  test('п. 4.2, FR-005, NFR-004: карточки студентов с «Нет данных» вместо нулей', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    await mockDirectoryApi(page, {
      groups: [group],
      disciplines: [discipline],
      students: [student(1), student(2, { supportStatus: 'NEEDS_ATTENTION' })],
    });
    await page.goto('/students');
    await expect(page.getByText('Найдено студентов: 2')).toBeVisible();
    const card = page.locator('article').filter({ hasText: 'Петров Иван' });
    await expect(card.getByText('Код участника: S-ABCD21')).toBeVisible();
    await expect(card.getByText('Нет данных')).toHaveCount(5);
    await expect(page.getByText('Требует внимания')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить студента' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('FR-006: импорт — предпросмотр с ошибками, импорт корректных строк, пароли один раз', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    await mockDirectoryApi(page, { groups: [group], disciplines: [discipline] });
    const preview: StudentImportPreviewDto = {
      rows: [
        {
          line: 2,
          lastName: 'Ким',
          firstName: 'Алина',
          middleName: null,
          groupName: 'ПО-21',
          participantCode: null,
          login: null,
          errors: [],
        },
        {
          line: 3,
          lastName: '',
          firstName: 'Без фамилии',
          middleName: null,
          groupName: 'ПО-99',
          participantCode: null,
          login: null,
          errors: [
            'Не указано: фамилия',
            'Группа «ПО-99» не найдена среди ваших действующих групп',
          ],
        },
      ],
      validCount: 1,
      invalidCount: 1,
      fileErrors: [],
    };
    let importBody: unknown;
    let idempotencyKey: string | null = null;
    await page.route('**/api/students/import/preview', (route) => route.fulfill({ json: preview }));
    await page.route('**/api/students/import', (route) => {
      importBody = route.request().postDataJSON();
      idempotencyKey = route.request().headers()['idempotency-key'] ?? null;
      const result: StudentImportResultDto = {
        replayed: false,
        created: [
          {
            student: {
              ...student(3, { lastName: 'Ким', firstName: 'Алина' }),
              archiveReason: null,
              createdAt: new Date().toISOString(),
              enrollments: [],
            },
            login: 's-abcd23',
            temporaryPassword: 'Xk7mPq2rTz9w',
          },
        ],
      };
      return route.fulfill({ status: 201, json: result });
    });

    await page.goto('/students');
    await page.getByRole('button', { name: 'Импорт', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Импорт студентов' });
    await expect(dialog.getByText('«Фамилия» — обязательно')).toBeVisible();
    await dialog.getByLabel('Файл со списком студентов').setInputFiles({
      name: 'students.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Фамилия;Имя;Группа\nКим;Алина;ПО-21\n;Без фамилии;ПО-99\n'),
    });
    await expect(dialog.getByText('Не указано: фамилия')).toBeVisible();
    await expect(
      dialog.getByText('Группа «ПО-99» не найдена среди ваших действующих групп'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Импортировать: 1' }).click();

    await expect(dialog.getByText('Добавлено студентов: 1')).toBeVisible();
    await expect(dialog.getByText('Xk7mPq2rTz9w')).toBeVisible();
    expect(idempotencyKey).toBeTruthy();
    expect(importBody).toEqual({
      rows: [
        {
          line: 2,
          lastName: 'Ким',
          firstName: 'Алина',
          middleName: null,
          groupName: 'ПО-21',
          participantCode: null,
          login: null,
        },
      ],
    });
    await expectNoHorizontalScroll(page);
  });

  test('FR-002: преподаватель без групп видит пояснение', async ({ page }) => {
    await mockSession(page, fakeUser(['teacher']));
    await mockDirectoryApi(page);
    await page.goto('/students');
    await expect(page.getByText('Нет доступных групп')).toBeVisible();
  });
});

test.describe('раздел «Дисциплины»', () => {
  test('п. 2.1: администратор видит дисциплины, учебные группы и закрепления', async ({ page }) => {
    await mockSession(page, fakeUser(['admin']));
    await mockDirectoryApi(page, { groups: [group], disciplines: [discipline] });
    await page.goto('/disciplines');
    await expect(page.getByRole('tab', { name: 'Дисциплины' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Математика' })).toBeVisible();
    await page.getByRole('tab', { name: 'Учебные группы' }).click();
    await expect(page.getByRole('cell', { name: 'ПО-21', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Закрепление преподавателей' }).click();
    await expect(page.getByText('Новое закрепление')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('FR-002: преподаватель видит только свои дисциплины, без вкладок управления', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    await mockDirectoryApi(page, { groups: [group], disciplines: [discipline] });
    await page.goto('/disciplines');
    await expect(page.getByRole('heading', { name: 'Математика' })).toBeVisible();
    await expect(page.getByText('ПО-21')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить дисциплину' })).toHaveCount(0);
  });
});
