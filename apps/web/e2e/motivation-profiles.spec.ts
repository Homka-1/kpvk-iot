import { expect, test } from '@playwright/test';
import type {
  GroupDto,
  MotivationProfileDto,
  StudentMotivationDto,
  StudentProfileDto,
} from '@iot/shared';
import { expectNoHorizontalScroll, fakeUser, mockSession } from './support/session';

const teacher = fakeUser(['teacher']);
const STUDENT_ID = '00000000-0000-7000-8000-000000000d01';
const PROFILE_ID = '00000000-0000-7000-8000-000000000d02';

const group: GroupDto = {
  id: '00000000-0000-7000-8000-000000000d03',
  name: 'ПО-21',
  course: 2,
  specialty: 'Программное обеспечение',
  archivedAt: null,
  studentCount: 1,
};

const proposal: MotivationProfileDto = {
  id: PROFILE_ID,
  studentId: STUDENT_ID,
  status: 'PROPOSED',
  proposedLevel: 'LOW',
  level: null,
  basis: {
    minScales: 1,
    items: [
      {
        sessionId: 's1',
        questionnaire: {
          questionnaireId: 'q1',
          versionId: 'v1',
          versionNumber: 1,
          title: 'ДЕМО — не для исследования: Учебная мотивация',
          isDemo: true,
        },
        measurementType: 'PRIMARY',
        completedAt: '2026-10-01T10:00:00.000Z',
        scaleCode: 'COGNITIVE',
        scaleName: 'Познавательный интерес',
        rawScore: 4,
        levelLabel: 'Низкий',
        description: 'Познавательный интерес выражен слабо.',
        studentText: 'Попробуйте задания, связанные с вашими увлечениями.',
        motivationLevel: 'LOW',
      },
    ],
    counts: { HIGH: 0, MEDIUM: 0, LOW: 1 },
    reason: null,
  },
  correctionReason: null,
  studentSummary: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: '2026-10-02T10:00:00.000Z',
};

test.describe('UC-02: формирование мотивационного профиля', () => {
  test('AT-03, AT-04, FR-028, FR-029, NFR-004: предложение, основания и корректировка с причиной', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    const profile: StudentProfileDto = {
      id: STUDENT_ID,
      participantCode: 'S-0001',
      lastName: 'Петров',
      firstName: 'Иван',
      middleName: null,
      login: 's-0001',
      group,
      supportStatus: 'STANDARD',
      archivedAt: null,
      motivationProfile: { status: 'PROPOSED', level: null, proposedLevel: 'LOW' },
      currentTrajectory: null,
      averageScore: null,
      completedAssignments: null,
      lastActivityAt: null,
      archiveReason: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      enrollments: [],
      interests: null,
      disciplines: [],
    };
    let state: StudentMotivationDto = {
      current: proposal,
      lastDecided: null,
      history: [
        {
          id: 'h1',
          profileId: PROFILE_ID,
          status: 'PROPOSED',
          fromLevel: null,
          toLevel: 'LOW',
          reason: null,
          changedBy: { id: teacher.id, fullName: 'Иванова Анна Сергеевна' },
          at: proposal.createdAt,
        },
      ],
    };
    let decision: Record<string, unknown> | null = null;
    await page.route(`**/api/students/${STUDENT_ID}/profile`, (route) =>
      route.fulfill({ json: profile }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/observations`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/motivation-profile`, (route) =>
      route.fulfill({ json: state }),
    );
    await page.route(`**/api/motivation-profiles/${PROFILE_ID}/decision`, async (route) => {
      decision = route.request().postDataJSON() as Record<string, unknown>;
      const decided: MotivationProfileDto = {
        ...proposal,
        status: 'CORRECTED',
        level: 'MEDIUM',
        correctionReason: String(decision.reason),
        studentSummary: String(decision.studentSummary),
        decidedBy: { id: teacher.id, fullName: 'Иванова Анна Сергеевна' },
        decidedAt: '2026-10-03T10:00:00.000Z',
      };
      state = {
        current: decided,
        lastDecided: decided,
        history: [
          {
            id: 'h2',
            profileId: PROFILE_ID,
            status: 'CORRECTED',
            fromLevel: 'LOW',
            toLevel: 'MEDIUM',
            reason: decided.correctionReason,
            changedBy: decided.decidedBy,
            at: decided.decidedAt!,
          },
          ...state.history,
        ],
      };
      profile.motivationProfile = { status: 'CORRECTED', level: 'MEDIUM', proposedLevel: 'LOW' };
      await route.fulfill({ json: decided });
    });

    await page.goto(`/students/${STUDENT_ID}?tab=motivation`);
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('Система предлагает')).toBeVisible();
    await expect(
      panel.getByRole('cell', { name: 'Познавательный интерес', exact: true }),
    ).toBeVisible();
    await expect(panel.getByText('Создание ситуации успеха')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Сформировать ИОТ' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await panel.getByRole('button', { name: 'Подтвердить или скорректировать' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Средний уровень', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Скорректировать' }).click();
    await expect(dialog.getByText('Укажите причину корректировки')).toBeVisible();
    expect(decision).toBeNull();

    await dialog.getByLabel('Причина корректировки').fill('Активен на практических занятиях');
    await dialog.getByRole('button', { name: 'Скорректировать' }).click();
    await expect(dialog).toBeHidden();
    expect(decision).toMatchObject({
      level: 'MEDIUM',
      reason: 'Активен на практических занятиях',
      studentSummary: 'Попробуйте задания, связанные с вашими увлечениями.',
    });

    await expect(panel.getByText('Скорректирован преподавателем').first()).toBeVisible();
    await expect(panel.getByText('Причина: Активен на практических занятиях')).toBeVisible();
    // FR-031: после утверждения — переход к проектированию ИОТ.
    await expect(panel.getByRole('link', { name: 'Сформировать ИОТ' })).toBeVisible();
    await expect(page.locator('.profile__facts').getByText('Средний уровень')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('FR-030, NFR-004: раздел показывает три карточки и ведёт к отфильтрованному списку', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    await page.route(/\/api\/motivation-profiles\/distribution(\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          total: 4,
          HIGH: 1,
          MEDIUM: 1,
          LOW: 1,
          PROPOSED: 1,
          NEEDS_MORE_DIAGNOSTICS: 0,
          NONE: 0,
        },
      }),
    );
    await page.route(/\/api\/students(\?.*)?$/, (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }),
    );
    await page.goto('/motivation-profiles');
    for (const title of ['Высокий уровень', 'Средний уровень', 'Низкий уровень']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
    const request = page.waitForRequest((req) => req.url().includes('/api/students?'));
    await page.getByRole('link', { name: /Ожидает решения преподавателя/ }).click();
    await expect(page).toHaveURL(/\/students\?profile=PROPOSED/);
    expect((await request).url()).toContain('profile=PROPOSED');
  });
});
