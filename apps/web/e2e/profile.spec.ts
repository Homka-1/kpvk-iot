import { expect, test } from '@playwright/test';
import type {
  ObservationDto,
  OwnProfileDto,
  StudentProfileDto,
  StudentSummaryDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const teacher = fakeUser(['teacher']);
const STUDENT_ID = '00000000-0000-7000-8000-000000000101';
const group = {
  id: '00000000-0000-7000-8000-0000000000a1',
  name: 'ПО-21',
  course: 2,
  specialty: 'Программное обеспечение',
};
const disciplines = [
  {
    id: '00000000-0000-7000-8000-0000000000d1',
    name: 'Математика',
    teachers: [{ id: teacher.id, fullName: 'Иванова Анна' }],
  },
];

const summary: StudentSummaryDto = {
  id: STUDENT_ID,
  participantCode: 'S-ABCD21',
  lastName: 'Петров',
  firstName: 'Иван',
  middleName: 'Сергеевич',
  login: 's-abcd21',
  group,
  supportStatus: 'STANDARD',
  archivedAt: null,
  motivationProfile: null,
  currentTrajectory: null,
  hasCompletedTrajectory: false,
  averageScore: null,
  completedAssignments: null,
  lastActivityAt: null,
};

const profile: StudentProfileDto = {
  ...summary,
  archiveReason: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  enrollments: [
    {
      id: 'e1',
      group: { id: group.id, name: group.name },
      startsAt: '2026-09-01T08:00:00.000Z',
      endsAt: null,
      reason: null,
    },
  ],
  interests: 'Робототехника',
  disciplines,
};

test.describe('профиль студента', () => {
  test('FR-009, FR-014, NFR-004: из списка в профиль, вкладки, добавление наблюдения', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    await mockDirectoryApi(page, { students: [summary] });
    await page.route(`**/api/students/${STUDENT_ID}/profile`, (route) =>
      route.fulfill({ json: profile }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/history`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/diagnostics`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/diagnostics/comparison`, (route) =>
      route.fulfill({ json: [] }),
    );
    const observations: ObservationDto[] = [];
    let idempotencyKey: string | undefined;
    await page.route(`**/api/students/${STUDENT_ID}/observations`, async (route) => {
      if (route.request().method() === 'POST') {
        idempotencyKey = route.request().headers()['idempotency-key'];
        const body = route.request().postDataJSON() as Pick<
          ObservationDto,
          'observedAt' | 'text' | 'visibility'
        >;
        observations.unshift({
          id: 'o1',
          ...body,
          discipline: null,
          author: { id: teacher.id, fullName: 'Иванова Анна' },
          createdAt: '2026-10-10T08:00:00.000Z',
          updatedAt: '2026-10-10T08:00:00.000Z',
          canEdit: true,
        });
        return route.fulfill({ status: 201, json: observations[0] });
      }
      return route.fulfill({ json: observations });
    });

    await page.goto('/students');
    await page.getByRole('link', { name: 'Петров Иван Сергеевич' }).click();
    await expect(page).toHaveURL(`/students/${STUDENT_ID}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Петров Иван Сергеевич' }),
    ).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(7);
    await expect(page.getByText('Робототехника')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('tab', { name: 'Диагностика' }).click();
    await expect(page.getByText('Диагностика ещё не проводилась')).toBeVisible();

    await page.getByRole('button', { name: 'Добавить наблюдение' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новое педагогическое наблюдение' });
    await dialog.getByLabel('Наблюдение').fill('Уверенно решает задачи у доски');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog).toBeHidden();
    expect(idempotencyKey).toBeTruthy();
    await expect(page.getByRole('tab', { name: 'Сопровождение' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Уверенно решает задачи у доски')).toBeVisible();
    await expect(page.getByText('Видно только преподавателям')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('«Мой профиль» студента', () => {
  test('п. 2.3, FR-016, NFR-004: свои данные и отзывы преподавателя', async ({ page }) => {
    await mockSession(page, fakeUser(['student'], { lastName: 'Петров', firstName: 'Иван' }));
    const own: OwnProfileDto = {
      participantCode: 'S-ABCD21',
      lastName: 'Петров',
      firstName: 'Иван',
      middleName: null,
      motivationProfile: null,
      group,
      disciplines,
      interests: null,
      observations: [
        {
          id: 'o2',
          observedAt: '2026-10-10',
          text: 'Хороший прогресс, продолжайте',
          discipline: null,
          author: { id: teacher.id, fullName: 'Иванова Анна' },
        },
      ],
    };
    await page.route('**/api/cabinet/profile', (route) => route.fulfill({ json: own }));
    await page.goto('/student/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Мой профиль' })).toBeVisible();
    await expect(page.getByText('Код участника')).toBeVisible();
    await expect(page.getByText('Математика')).toBeVisible();
    await expect(page.getByText('Хороший прогресс, продолжайте')).toBeVisible();
    await expect(page.getByLabel('Чем вы интересуетесь')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
