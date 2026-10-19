import { expect, test } from '@playwright/test';
import type {
  ComparabilityQuestionnaireDto,
  DiagnosticAssignmentDetailDto,
  DiagnosticComparisonDto,
  GroupDto,
  QuestionnaireDetailDto,
  QuestionnaireSummaryDto,
  StudentDiagnosticDto,
  StudentProfileDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const teacher = fakeUser(['teacher']);
const researcher = fakeUser(['researcher'], { lastName: 'Сидорова', firstName: 'Мария' });
const STUDENT_ID = '00000000-0000-7000-8000-000000000c01';
const Q_ID = '00000000-0000-7000-8000-000000000c02';
const V1 = '00000000-0000-7000-8000-000000000c03';
const V2 = '00000000-0000-7000-8000-000000000c04';
const A_ID = '00000000-0000-7000-8000-000000000c05';
const TITLE = 'ДЕМО — не для исследования: Учебная мотивация';

const group: GroupDto = {
  id: '00000000-0000-7000-8000-000000000c06',
  name: 'ПО-21',
  course: 2,
  specialty: 'Программное обеспечение',
  archivedAt: null,
  studentCount: 1,
};

const label = (versionId: string, versionNumber: number) => ({
  questionnaireId: Q_ID,
  versionId,
  versionNumber,
  title: TITLE,
  isDemo: true,
});

const scale = (code: string, name: string, rawScore: number | null, missingAnswers = 0) => ({
  scaleId: code,
  code,
  name,
  rawScore,
  missingAnswers,
  level: rawScore === null ? null : { code: 'mid', label: 'Средний' },
});

test.describe('UC-06: повторная диагностика', () => {
  test('AT-10, FR-015, FR-024, NFR-004: профиль показывает повторный замер рядом с первичным', async ({
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
      motivationProfile: null,
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
    const session = (
      id: string,
      measurementType: StudentDiagnosticDto['measurementType'],
      completedAt: string,
      scores: StudentDiagnosticDto['scores'],
    ): StudentDiagnosticDto => ({
      id,
      questionnaire: label(V1, 1),
      measurementType,
      status: 'COMPLETED',
      source: 'ONLINE',
      startsAt: null,
      endsAt: null,
      startedAt: null,
      completedAt,
      durationSeconds: 300,
      revision: 1,
      scores,
    });
    const primaryScores = [
      scale('INTEREST', 'Интерес', 12),
      scale('ACHIEVEMENT', 'Достижения', null, 2),
    ];
    const repeatedScores = [
      scale('INTEREST', 'Интерес', 15.5),
      scale('ACHIEVEMENT', 'Достижения', 9),
    ];
    const comparison: DiagnosticComparisonDto = {
      questionnaireId: Q_ID,
      title: TITLE,
      isDemo: true,
      scales: [
        { code: 'INTEREST', name: 'Интерес' },
        { code: 'ACHIEVEMENT', name: 'Достижения' },
      ],
      measurements: [
        {
          sessionId: 's1',
          measurementType: 'PRIMARY',
          source: 'ONLINE',
          versionId: V1,
          versionNumber: 1,
          completedAt: '2026-09-10T10:00:00.000Z',
          values: { INTEREST: primaryScores[0]!, ACHIEVEMENT: primaryScores[1]! },
        },
        {
          sessionId: 's2',
          measurementType: 'REPEATED',
          source: 'ONLINE',
          versionId: V1,
          versionNumber: 1,
          completedAt: '2026-12-10T10:00:00.000Z',
          values: { INTEREST: repeatedScores[0]!, ACHIEVEMENT: repeatedScores[1]! },
        },
      ],
      changes: { INTEREST: 3.5, ACHIEVEMENT: null },
      excluded: [],
    };
    await page.route(`**/api/students/${STUDENT_ID}/profile`, (route) =>
      route.fulfill({ json: profile }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/observations`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/history`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/diagnostics`, (route) =>
      route.fulfill({
        json: [
          session('s2', 'REPEATED', '2026-12-10T10:00:00.000Z', repeatedScores),
          session('s1', 'PRIMARY', '2026-09-10T10:00:00.000Z', primaryScores),
        ],
      }),
    );
    await page.route(`**/api/students/${STUDENT_ID}/diagnostics/comparison`, (route) =>
      route.fulfill({ json: [comparison] }),
    );

    await page.goto(`/students/${STUDENT_ID}`);
    await page.getByRole('tab', { name: 'Диагностика' }).click();
    await expect(page.getByRole('heading', { name: 'Динамика и сравнение замеров' })).toBeVisible();
    const table = page.getByRole('table', { name: `Баллы по замерам: ${TITLE}` });
    await expect(table.getByRole('columnheader', { name: /Первичный/ })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: /Повторный/ })).toBeVisible();
    const interest = table.getByRole('row', { name: /Интерес/ });
    await expect(interest).toContainText('12');
    await expect(interest).toContainText('15,5');
    await expect(interest).toContainText('+3,5');
    const achievement = table.getByRole('row', { name: /Достижения/ });
    await expect(achievement).toContainText('Нет данных');
    await expect(page.getByRole('img', { name: /График динамики баллов/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('UC-06, NFR-006: преподаватель назначает повторный замер по прежней версии', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    await mockDirectoryApi(page, { groups: [group] });
    const summary: QuestionnaireSummaryDto = {
      id: Q_ID,
      title: TITLE,
      status: 'ACTIVE',
      isDemo: true,
      direction: null,
      published: { id: V2, versionNumber: 2, status: 'PUBLISHED' },
      draft: null,
      questionCount: 2,
      archivedAt: null,
      updatedAt: '2026-10-17T08:00:00.000Z',
    };
    const detail: QuestionnaireDetailDto = {
      id: Q_ID,
      status: 'ACTIVE',
      isDemo: true,
      direction: null,
      copiedFrom: null,
      archivedAt: null,
      versions: [
        {
          id: V2,
          versionNumber: 2,
          status: 'PUBLISHED',
          title: TITLE,
          changeNote: null,
          createdAt: '2026-10-10T08:00:00.000Z',
          publishedAt: '2026-10-11T08:00:00.000Z',
        },
        {
          id: V1,
          versionNumber: 1,
          status: 'RETIRED',
          title: TITLE,
          changeNote: null,
          createdAt: '2026-09-01T08:00:00.000Z',
          publishedAt: '2026-09-01T09:00:00.000Z',
        },
      ],
      comparabilities: [{ versionAId: V1, versionBId: V2 }],
    };
    await page.route(/\/api\/questionnaires(\?.*)?$/, (route) =>
      route.fulfill({ json: [summary] }),
    );
    await page.route(`**/api/questionnaires/${Q_ID}`, (route) => route.fulfill({ json: detail }));
    const posts: { body: Record<string, unknown>; key?: string }[] = [];
    const assignment = (): DiagnosticAssignmentDetailDto => ({
      id: A_ID,
      questionnaire: label(V1, 1),
      target: { kind: 'group', group },
      measurementType: 'REPEATED',
      startsAt: '2026-10-18T00:00:00.000Z',
      endsAt: '2026-10-26T00:00:00.000Z',
      cancelledAt: null,
      state: 'ACTIVE',
      assignedBy: { id: teacher.id, fullName: 'Иванова Анна' },
      createdAt: '2026-10-18T08:00:00.000Z',
      counts: { total: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0, EXPIRED: 0, CANCELLED: 0 },
      sessions: [],
    });
    await page.route(/\/api\/diagnostic-assignments$/, (route) => {
      if (route.request().method() === 'POST') {
        posts.push({
          body: route.request().postDataJSON() as Record<string, unknown>,
          key: route.request().headers()['idempotency-key'],
        });
        return route.fulfill({ status: 201, json: assignment() });
      }
      return route.fulfill({ json: posts.length ? [assignment()] : [] });
    });
    await page.route(`**/api/diagnostic-assignments/${A_ID}`, (route) =>
      route.fulfill({ json: assignment() }),
    );

    await page.goto('/diagnostics');
    await page.getByRole('tab', { name: 'Назначения' }).click();
    await page.getByRole('button', { name: 'Назначить диагностику' }).click();
    const dialog = page.getByRole('dialog', { name: 'Назначение диагностики' });
    await dialog.getByRole('combobox', { name: 'Методика' }).click();
    await page.getByRole('option', { name: TITLE }).click();
    await dialog.getByRole('combobox', { name: 'Замер' }).click();
    await page.getByRole('option', { name: 'Повторный' }).click();
    const version = dialog.getByRole('combobox', { name: 'Версия методики' });
    await expect(version).toHaveText('Версия 2 · действующая · сопоставима с 1');
    await version.click();
    await page.getByRole('option', { name: 'Версия 1 · сопоставима с 2' }).click();
    await dialog.getByRole('combobox', { name: 'Группа' }).click();
    await page.getByRole('option', { name: 'ПО-21' }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Назначить' }).click();

    await expect(page.getByRole('dialog', { name: 'Прохождения диагностики' })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toBeTruthy();
    expect(posts[0]!.body).toMatchObject({
      questionnaireId: Q_ID,
      measurementType: 'REPEATED',
      versionId: V1,
      groupId: group.id,
    });
  });

  test('UC-06, FR-025: исследователь утверждает сопоставимость и выгружает обезличенные данные', async ({
    page,
  }) => {
    await mockSession(page, researcher);
    const state: ComparabilityQuestionnaireDto = {
      id: Q_ID,
      title: TITLE,
      isDemo: true,
      versions: [
        { id: V2, versionNumber: 2, title: TITLE, status: 'PUBLISHED', publishedAt: null },
        { id: V1, versionNumber: 1, title: TITLE, status: 'RETIRED', publishedAt: null },
      ],
      comparabilities: [],
    };
    const approvals: unknown[] = [];
    await page.route(/\/api\/questionnaire-comparabilities$/, (route) => {
      if (route.request().method() === 'POST') {
        approvals.push(route.request().postDataJSON());
        state.comparabilities = [
          {
            id: 'c1',
            versionA: { id: V1, versionNumber: 1 },
            versionB: { id: V2, versionNumber: 2 },
            note: 'Ключи не менялись',
            approvedAt: '2026-10-18T08:00:00.000Z',
            approvedBy: { id: researcher.id, fullName: 'Сидорова Мария' },
          },
        ];
        return route.fulfill({ status: 201, json: state });
      }
      return route.fulfill({ json: [state] });
    });
    const exports: URL[] = [];
    await page.route(/\/api\/diagnostic-results\/export\?.*/, (route) => {
      exports.push(new URL(route.request().url()));
      return route.fulfill({
        body: '﻿Код участника;Группа\r\nS-0001;ПО-21',
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="diagnostics-2026-10-18.csv"',
        },
      });
    });

    await page.goto('/analytics');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аналитика');
    // С этапа 17 выгрузка и сопоставимость — на отдельной вкладке раздела.
    await page.getByRole('tab', { name: 'Диагностика: выгрузка и сопоставимость' }).click();
    await expect(page.getByText('Сопоставимых пар версий нет.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Первая версия' }).click();
    await page.getByRole('option', { name: 'Версия 1' }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    await page.getByRole('combobox', { name: 'Вторая версия' }).click();
    await page.getByRole('option', { name: 'Версия 2 (действующая)' }).click();
    await page.getByLabel('Обоснование').fill('Ключи не менялись');
    await page.getByRole('button', { name: 'Утвердить сопоставимость' }).click();
    await expect(page.getByText('Версии 1 и 2 сопоставимы')).toBeVisible();
    expect(approvals).toEqual([{ versionAId: V1, versionBId: V2, note: 'Ключи не менялись' }]);

    await page.getByLabel('CSV (UTF-8, разделитель «;»)').check();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Выгрузить' }).click();
    expect((await download).suggestedFilename()).toBe('diagnostics-2026-10-18.csv');
    await expect(page.getByText('Файл сформирован.')).toBeVisible();
    expect(exports[0]!.searchParams.get('questionnaireId')).toBe(Q_ID);
    expect(exports[0]!.searchParams.get('format')).toBe('csv');
    expect(exports[0]!.searchParams.has('measurementType')).toBe(false);
    await expectNoHorizontalScroll(page);
  });
});
