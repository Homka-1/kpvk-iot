import { expect, type Page, test } from '@playwright/test';
import type {
  CabinetDiagnosticDto,
  CabinetDiagnosticSessionDto,
  DiagnosticAssignmentDetailDto,
  DiagnosticForm,
  GroupDto,
  QuestionnaireSummaryDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  isMobile,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const teacher = fakeUser(['teacher']);
const student = fakeUser(['student'], { id: '00000000-0000-7000-8000-0000000000b9' });
const Q_ID = '00000000-0000-7000-8000-0000000000b1';
const A_ID = '00000000-0000-7000-8000-0000000000b2';
const S_ID = '00000000-0000-7000-8000-0000000000b3';
const TITLE = 'ДЕМО — не для исследования: Учебная мотивация (пример)';

const group: GroupDto = {
  id: '00000000-0000-7000-8000-0000000000b4',
  name: 'ПО-21',
  course: 2,
  specialty: 'Программное обеспечение',
  archivedAt: null,
  studentCount: 2,
};

const questionnaire: QuestionnaireSummaryDto = {
  id: Q_ID,
  title: TITLE,
  status: 'ACTIVE',
  isDemo: true,
  direction: null,
  published: { id: 'v1', versionNumber: 1, status: 'PUBLISHED' },
  draft: null,
  questionCount: 2,
  archivedAt: null,
  updatedAt: '2026-10-17T08:00:00.000Z',
};

const form: DiagnosticForm = {
  title: TITLE,
  instruction: 'Прочитайте утверждения и отметьте, насколько каждое подходит вам.',
  allowDraft: true,
  questions: [
    {
      key: 'q1',
      text: 'Мне интересно узнавать новое на занятиях.',
      type: 'LIKERT',
      isRequired: true,
      minValue: 1,
      maxValue: 5,
      minLabel: 'Не согласен',
      maxLabel: 'Согласен',
      options: [],
    },
    {
      key: 'q2',
      text: 'Почему вы выбрали свою специальность?',
      type: 'SINGLE_CHOICE',
      isRequired: true,
      minValue: null,
      maxValue: null,
      minLabel: null,
      maxLabel: null,
      options: [
        { key: 'o1', text: 'Мне интересна эта профессия' },
        { key: 'o2', text: 'Выбор был случайным' },
      ],
    },
  ],
};

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

test.describe('UC-01: первичная диагностика', () => {
  test('FR-018, FR-019, NFR-006: преподаватель назначает методику группе', async ({ page }) => {
    await mockSession(page, teacher);
    await mockDirectoryApi(page, { groups: [group] });
    await page.route(/\/api\/questionnaires(\?.*)?$/, (route) =>
      route.fulfill({ json: [questionnaire] }),
    );
    const posts: { body: Record<string, unknown>; key?: string }[] = [];
    const detail = (): DiagnosticAssignmentDetailDto => ({
      id: A_ID,
      questionnaire: {
        questionnaireId: Q_ID,
        versionId: 'v1',
        versionNumber: 1,
        title: TITLE,
        isDemo: true,
      },
      target: { kind: 'group', group },
      measurementType: 'PRIMARY',
      startsAt: posts[0]!.body.startsAt as string,
      endsAt: posts[0]!.body.endsAt as string,
      cancelledAt: null,
      state: 'ACTIVE',
      assignedBy: { id: teacher.id, fullName: 'Иванова Анна' },
      createdAt: '2026-10-17T08:00:00.000Z',
      counts: { total: 1, ASSIGNED: 1, IN_PROGRESS: 0, COMPLETED: 0, EXPIRED: 0, CANCELLED: 0 },
      sessions: [
        {
          id: S_ID,
          student: {
            id: 'st1',
            fullName: 'Петров Иван',
            participantCode: 'S-0001',
            group: { id: group.id, name: group.name },
          },
          status: 'ASSIGNED',
          source: 'ONLINE',
          startedAt: null,
          completedAt: null,
          durationSeconds: null,
        },
      ],
    });
    await page.route(/\/api\/diagnostic-assignments$/, async (route) => {
      if (route.request().method() === 'POST') {
        posts.push({
          body: route.request().postDataJSON() as Record<string, unknown>,
          key: route.request().headers()['idempotency-key'],
        });
        return route.fulfill({ status: 201, json: detail() });
      }
      return route.fulfill({ json: posts.length ? [detail()] : [] });
    });
    await page.route(`**/api/diagnostic-assignments/${A_ID}`, (route) =>
      route.fulfill({ json: detail() }),
    );

    await page.goto('/diagnostics');
    await openTab(page, 'Назначения');
    await expect(page.getByText('Назначений пока нет')).toBeVisible();
    await page.getByRole('button', { name: 'Назначить диагностику' }).click();
    const dialog = page.getByRole('dialog', { name: 'Назначение диагностики' });
    await dialog.getByRole('combobox', { name: 'Методика' }).click();
    await page.getByRole('option', { name: TITLE }).click();
    await dialog.getByRole('combobox', { name: 'Группа' }).click();
    await page.getByRole('option', { name: 'ПО-21' }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Назначить' }).click();

    const details = page.getByRole('dialog', { name: 'Прохождения диагностики' });
    await expect(details.getByText('Петров Иван')).toBeVisible();
    await expect(details.getByText('Назначена')).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toBeTruthy();
    expect(posts[0]!.body).toMatchObject({ questionnaireId: Q_ID, groupId: group.id });
    const { startsAt, endsAt } = posts[0]!.body as { startsAt: string; endsAt: string };
    // Период по умолчанию — неделя, конец периода не включительно (следующие сутки после даты окончания).
    expect(new Date(endsAt).getTime() - new Date(startsAt).getTime()).toBeGreaterThanOrEqual(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  test('UC-01, AT-02: студент проходит методику, черновик сохраняется, результат виден', async ({
    page,
  }) => {
    await mockSession(page, student);
    const state: { status: CabinetDiagnosticDto['status']; draft: Record<string, unknown> | null } =
      { status: 'ASSIGNED', draft: null };
    const drafts: unknown[] = [];
    const completes: { body: unknown; key?: string }[] = [];
    const session = (): CabinetDiagnosticSessionDto => ({
      id: S_ID,
      title: TITLE,
      isDemo: true,
      status: state.status,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2099-01-01T00:00:00.000Z',
      completedAt: state.status === 'COMPLETED' ? '2026-10-17T10:00:00.000Z' : null,
      results:
        state.status === 'COMPLETED'
          ? [{ scale: 'Познавательная мотивация', text: 'Вам интересно учиться.' }]
          : [],
      form,
      draft: state.draft as CabinetDiagnosticSessionDto['draft'],
    });
    /** Строка списка «Мои диагностики» — без формы и черновика. */
    const summary = (): CabinetDiagnosticDto => {
      const full: Partial<CabinetDiagnosticSessionDto> = session();
      delete full.form;
      delete full.draft;
      return full as CabinetDiagnosticDto;
    };
    await page.route(/\/api\/cabinet\/diagnostics$/, (route) => {
      return route.fulfill({ json: [summary()] });
    });
    await page.route(`**/api/cabinet/diagnostics/${S_ID}`, (route) =>
      route.fulfill({ json: session() }),
    );
    await page.route(`**/api/cabinet/diagnostics/${S_ID}/start`, (route) => {
      state.status = 'IN_PROGRESS';
      return route.fulfill({ json: session() });
    });
    await page.route(`**/api/cabinet/diagnostics/${S_ID}/draft`, (route) => {
      state.draft = route.request().postDataJSON().answers as Record<string, unknown>;
      drafts.push(state.draft);
      return route.fulfill({ json: { savedAt: new Date().toISOString() } });
    });
    await page.route(`**/api/cabinet/diagnostics/${S_ID}/complete`, (route) => {
      completes.push({
        body: route.request().postDataJSON(),
        key: route.request().headers()['idempotency-key'],
      });
      state.status = 'COMPLETED';
      state.draft = null;
      return route.fulfill({ status: 201, json: summary() });
    });

    await page.goto('/student/diagnostics');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Диагностика');
    await page.getByRole('link', { name: TITLE }).click();
    await expect(page).toHaveURL(`/student/diagnostics/${S_ID}`);
    await expect(page.getByText(form.instruction!)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Начать' }).click();

    await page.getByLabel('4', { exact: true }).check();
    await expect(page.getByText(/Черновик сохранён/)).toBeVisible();
    expect(drafts.at(-1)).toEqual({ q1: 4 });

    // Обрыв связи: после перезагрузки страницы ответы восстанавливаются из черновика.
    await page.reload();
    await expect(page.getByLabel('4', { exact: true })).toBeChecked();

    await page.getByRole('button', { name: 'Завершить' }).click();
    await expect(page.getByText('Ответьте на этот вопрос')).toBeVisible();
    expect(completes).toHaveLength(0);

    await page.getByLabel('Мне интересна эта профессия').check();
    await page.getByRole('button', { name: 'Завершить' }).click();
    const confirm = page.getByRole('dialog', { name: 'Завершение диагностики' });
    await confirm.getByRole('button', { name: 'Завершить' }).click();
    await expect(page.getByText('Диагностика пройдена')).toBeVisible();
    await expect(page.getByText('Вам интересно учиться.')).toBeVisible();
    expect(completes).toHaveLength(1);
    expect(completes[0]!.key).toBeTruthy();
    expect(completes[0]!.body).toEqual({ answers: { q1: 4, q2: 'o1' } });
    if (isMobile(page)) await expectNoHorizontalScroll(page);
  });
});
