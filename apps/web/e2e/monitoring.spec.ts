import { expect, type Page, test } from '@playwright/test';
import {
  type MonitoringDetailDto,
  type MonitoringDto,
  type MonitoringRowDto,
  STANDARD_TRAJECTORY_STAGES,
  type TrajectoryDto,
  type TrajectoryVersionDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const teacher = fakeUser(['teacher']);
const TRAJECTORY_ID = '00000000-0000-7000-8000-00000000f001';
const STUDENT_ID = '00000000-0000-7000-8000-00000000f002';

const row = (percent: number, completed: number): MonitoringRowDto => ({
  trajectoryId: TRAJECTORY_ID,
  status: 'ACTIVE',
  version: 1,
  student: {
    id: STUDENT_ID,
    fullName: 'Петров Иван Сергеевич',
    participantCode: 'S-AAAAAA',
    group: { id: 'g1', name: 'ПО-21', course: 2, specialty: 'Программное обеспечение' },
    supportStatus: 'STANDARD',
  },
  discipline: { id: 'd1', name: 'Математика' },
  progress: {
    total: 2,
    completed,
    submitted: 0,
    returned: 0,
    inProgress: 0,
    notStarted: 2 - completed,
    overdue: 1,
    percent,
  },
  stages: { total: 5, completed: 0 },
  checkpoints: { total: 5, passed: 0, missed: 1 },
  averageScore: completed ? 80 : null,
  scoredCount: completed,
  activity: {
    submissions: completed,
    lastSubmissionAt: completed ? '2026-10-19T09:00:00.000Z' : null,
  },
  helpRequests: 0,
  corrections: 0,
  diagnostics: { completed: 0, lastCompletedAt: null, lastMeasurementType: null },
});

const overview = (percent: number, completed: number): MonitoringDto => ({
  period: { from: null, to: null },
  summary: {
    trajectories: 1,
    averageProgress: percent,
    overdueAssignments: 1,
    missedCheckpoints: 1,
    needsSupport: 0,
    needsCorrection: 0,
  },
  rows: [row(percent, completed)],
  warnings: [
    {
      kind: 'OVERDUE_ASSIGNMENT',
      trajectoryId: TRAJECTORY_ID,
      student: { id: STUDENT_ID, fullName: 'Петров Иван Сергеевич' },
      discipline: 'Математика',
      stageTitle: 'Адаптационный',
      title: 'Конспект темы',
      dueAt: '2026-10-17T18:59:59.000Z',
    },
  ],
  dynamics: [
    { weekStart: '2026-10-12', completedAssignments: 0, submissions: 0, averageScore: null },
    {
      weekStart: '2026-10-19',
      completedAssignments: completed,
      submissions: completed,
      averageScore: completed ? 80 : null,
    },
  ],
  truncated: false,
});

const months = ['09', '10', '11', '12', '01'];
const active: TrajectoryDto = {
  id: TRAJECTORY_ID,
  status: 'ACTIVE',
  version: 1,
  student: {
    id: STUDENT_ID,
    fullName: 'Петров Иван Сергеевич',
    participantCode: 'S-AAAAAA',
    group: { id: 'g1', name: 'ПО-21', course: 2, specialty: 'Программное обеспечение' },
  },
  discipline: { id: 'd1', name: 'Математика' },
  teacher: { id: teacher.id, fullName: 'Иванова Анна' },
  template: null,
  motivationProfile: null,
  goals: 'Освоить решение уравнений',
  plannedResults: null,
  supportMethods: 'Консультации раз в неделю',
  startDate: '2026-09-01',
  plannedEndDate: '2027-01-31',
  currentStageId: 'stage-0',
  approvedBy: { id: teacher.id, fullName: 'Иванова Анна' },
  approvedAt: '2026-09-01T10:00:00.000Z',
  completedAt: null,
  finalAssessment: null,
  archivedAt: null,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  stages: STANDARD_TRAJECTORY_STAGES.map((stage, index) => {
    const year = index === 4 ? '2027' : '2026';
    return {
      id: `stage-${index}`,
      sortOrder: index,
      title: stage.title,
      goal: stage.goal,
      description: null,
      plannedResults: null,
      recommendedDifficulty: null,
      startDate: `${year}-${months[index]}-01`,
      endDate: `${year}-${months[index]}-28`,
      status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      checkpoints: [
        {
          id: `cp-${index}`,
          title: `Контрольная точка ${index + 1}`,
          description: null,
          dueDate: `${year}-${months[index]}-28`,
          status: 'PENDING',
        },
      ],
      materials: [],
      assignments: [],
    };
  }),
  versions: [
    {
      versionNumber: 1,
      status: 'ACTIVE',
      reason: null,
      createdBy: { id: teacher.id, fullName: 'Иванова Анна' },
      createdAt: '2026-09-01T10:00:00.000Z',
    },
  ],
  proposals: [],
};

const detail: MonitoringDetailDto = {
  period: { from: null, to: null },
  row: row(50, 1),
  stages: active.stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    status: stage.status,
    startDate: stage.startDate,
    endDate: stage.endDate,
    progress: row(50, 1).progress,
    checkpoints: stage.checkpoints.map((point) => ({ ...point, missed: false })),
  })),
  warnings: [],
  results: [
    {
      recordedAt: '2026-10-19T09:00:00.000Z',
      title: 'Линейные уравнения',
      score: 8,
      maxScore: 10,
      percent: 80,
    },
  ],
  dynamics: overview(50, 1).dynamics,
  versions: active.versions,
};

const snapshot = (trajectory: TrajectoryDto) => {
  const copy: Partial<TrajectoryDto> = { ...trajectory };
  delete copy.versions;
  delete copy.proposals;
  return copy as TrajectoryVersionDto['snapshot'];
};

async function mockMonitoringApi(page: Page) {
  const state = { percent: 0, completed: 0, queries: [] as string[] };
  await page.route(/\/api\/monitoring(\?.*)?$/, (route) => {
    state.queries.push(new URL(route.request().url()).search);
    return route.fulfill({ json: overview(state.percent, state.completed) });
  });
  return state;
}

test('AT-08, FR-056, FR-057: мониторинг показывает изменение прогресса', async ({ page }) => {
  await mockSession(page, teacher);
  await mockDirectoryApi(page);
  const state = await mockMonitoringApi(page);
  await page.goto('/monitoring');

  const card = page.getByRole('article', { name: 'Петров Иван Сергеевич, Математика' });
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(card).toContainText('выполнено 0 из 2, просрочено 1');
  await expect(card).toContainText('Нет данных: оценок нет');
  await expect(page.getByText('Просрочено задание')).toBeVisible();
  await expect(page.getByText('Нет данных: за период нет оценённых заданий.')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Задание принято — новые данные приходят при смене периода (FR-057).
  state.percent = 50;
  state.completed = 1;
  await page.getByLabel('Период с').fill('01/09/2026');
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await expect(card).toContainText('выполнено 1 из 2');
  await expect(card).toContainText('80 % (оценок: 1)');
  expect(state.queries.at(-1)).toContain('from=2026-09-01');
  await expectNoHorizontalScroll(page);
});

test('UC-05, AT-09, FR-061: из мониторинга — корректировка ИОТ новой версией с причиной', async ({
  page,
}) => {
  await mockSession(page, teacher);
  await mockDirectoryApi(page);
  await mockMonitoringApi(page);
  let current = active;
  let corrected: Record<string, unknown> | null = null;
  const versions = new Map<number, TrajectoryVersionDto>([
    [1, { ...active.versions[0]!, snapshot: snapshot(active) }],
  ]);
  await page.route(`**/api/monitoring/trajectories/${TRAJECTORY_ID}*`, (route) =>
    route.fulfill({ json: detail }),
  );
  await page.route(`**/api/students/${STUDENT_ID}/diagnostics/comparison`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(`**/api/trajectories/${TRAJECTORY_ID}`, (route) =>
    route.fulfill({ json: current }),
  );
  await page.route(`**/api/trajectories/${TRAJECTORY_ID}/corrections`, (route) => {
    corrected = route.request().postDataJSON() as Record<string, unknown>;
    const version = {
      versionNumber: 2,
      status: 'ACTIVE' as const,
      reason: String(corrected.reason),
      createdBy: { id: teacher.id, fullName: 'Иванова Анна' },
      createdAt: '2026-10-19T10:00:00.000Z',
    };
    current = {
      ...active,
      version: 2,
      supportMethods: String(corrected.supportMethods),
      updatedAt: '2026-10-19T10:00:00.000Z',
      versions: [version, ...active.versions],
    };
    versions.set(2, { ...version, snapshot: snapshot(current) });
    return route.fulfill({ json: current });
  });
  await page.route(new RegExp(`/api/trajectories/${TRAJECTORY_ID}/versions/(\\d+)$`), (route) => {
    const number = Number(/versions\/(\d+)$/.exec(route.request().url())![1]);
    return route.fulfill({ json: versions.get(number) });
  });

  await page.goto('/monitoring');
  await page.getByRole('link', { name: 'Подробнее и корректировка' }).click();
  await expect(
    page.getByRole('heading', { name: 'Петров Иван Сергеевич · Математика' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Психолого-педагогическая диагностика' }),
  ).toBeVisible();
  await expect(page.getByText('Нет данных: студент ещё не проходил диагностику.')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Корректировать ИОТ' }).click();
  await expect(page.getByText('Корректировка версии 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить черновик' })).toHaveCount(0);
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Далее' }).click();
  }
  await page.getByLabel('Способы сопровождения').fill('Консультации два раза в неделю');
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page.getByText('Изменения новой версии 2')).toBeVisible();
  await expect(
    page.getByText('Консультации раз в неделю → Консультации два раза в неделю'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Подтвердить новую версию' }).click();
  await expect(page.getByText('Укажите причину корректировки')).toBeVisible();
  await page.getByLabel('Причина корректировки').fill('Студенту нужна дополнительная поддержка');
  await page.getByRole('button', { name: 'Подтвердить новую версию' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();

  await expect(page.getByText('Утверждена версия 2: прежняя версия сохранена')).toBeVisible();
  expect(corrected).toMatchObject({
    updatedAt: active.updatedAt,
    reason: 'Студенту нужна дополнительная поддержка',
    supportMethods: 'Консультации два раза в неделю',
  });
  const history = page.getByRole('region', { name: 'История версий' });
  await expect(history).toContainText('Версия 2');
  await expect(history).toContainText('причина: Студенту нужна дополнительная поддержка');
  await expect(history).toContainText('Версия 1');

  await page.getByRole('button', { name: 'Открыть версию 2' }).click();
  const dialog = page.getByRole('dialog', { name: 'Версия 2' });
  await expect(dialog.getByText('Изменения относительно версии 1')).toBeVisible();
  await expect(dialog.getByText('Способы сопровождения', { exact: false }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
