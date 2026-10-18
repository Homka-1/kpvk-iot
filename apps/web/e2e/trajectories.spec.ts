import { expect, type Page, test } from '@playwright/test';
import {
  STANDARD_TRAJECTORY_STAGES,
  type LibraryAssignmentDto,
  type TrajectoryContent,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
} from '@iot/shared';
import { expectNoHorizontalScroll, fakeUser, mockSession } from './support/session';

const teacher = fakeUser(['teacher']);
const STUDENT_ID = '00000000-0000-7000-8000-000000000e01';
const TRAJECTORY_ID = '00000000-0000-7000-8000-000000000e02';
const DISCIPLINE = { id: '00000000-0000-7000-8000-000000000e03', name: 'Математика' };

const libraryAssignment: LibraryAssignmentDto = {
  id: '00000000-0000-7000-8000-000000000e04',
  title: 'Линейные уравнения',
  discipline: DISCIPLINE,
  topic: 'Уравнения',
  goal: null,
  difficulty: 'BASIC',
  type: { id: 'type', code: 'practical', name: 'Практическая работа', isSystem: true },
  instruction: null,
  submissionFormats: ['TEXT'],
  maxScore: 5,
  criteria: [],
  attachments: [],
  archivedAt: null,
  createdBy: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

const student = {
  id: STUDENT_ID,
  fullName: 'Петров Иван',
  participantCode: 'S-0001',
  group: { id: 'g', name: 'ПО-21', course: 2, specialty: 'Программное обеспечение' },
};

const options: TrajectoryOptionsDto = {
  student,
  profile: { id: 'p', level: 'MEDIUM', decidedAt: '2026-10-01T10:00:00.000Z' },
  disciplines: [{ ...DISCIPLINE, currentTrajectoryId: null }],
  templates: [
    {
      id: 'std',
      title: 'Пятиэтапный маршрут (стандартный)',
      description: 'Стандартная пятиэтапная модель.',
      motivationLevel: null,
      isStandard: true,
      stages: [...STANDARD_TRAJECTORY_STAGES],
    },
    {
      id: 'medium',
      title: 'Пятиэтапный маршрут — средний уровень мотивации',
      description: 'Акцент сопровождения: развитие самостоятельности.',
      motivationLevel: 'MEDIUM',
      isStandard: false,
      stages: [...STANDARD_TRAJECTORY_STAGES],
    },
  ],
  suggestedTemplateId: 'medium',
  blockedReason: null,
};

/** Имитация API ИОТ: черновик из шаблона, сохранение как на сервере, утверждение. */
async function mockTrajectoryApi(page: Page) {
  let revision = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 18, 10, 0, revision++)).toISOString();
  let state: TrajectoryDto = {
    id: TRAJECTORY_ID,
    status: 'DRAFT',
    version: 0,
    student,
    discipline: DISCIPLINE,
    teacher: { id: teacher.id, fullName: 'Иванова Анна' },
    template: { id: 'medium', title: options.templates[1]!.title },
    motivationProfile: options.profile,
    goals: null,
    plannedResults: null,
    supportMethods: 'Развитие самостоятельности\nПредоставление выбора',
    startDate: null,
    plannedEndDate: null,
    currentStageId: null,
    approvedBy: null,
    approvedAt: null,
    completedAt: null,
    finalAssessment: null,
    archivedAt: null,
    createdAt: stamp(),
    updatedAt: stamp(),
    stages: STANDARD_TRAJECTORY_STAGES.map((stage, index) => ({
      id: `stage-${index}`,
      sortOrder: index,
      title: stage.title,
      goal: stage.goal,
      description: null,
      plannedResults: null,
      startDate: null,
      endDate: null,
      status: 'NOT_STARTED',
      checkpoints: [],
      materials: [],
      assignments: [],
    })),
    versions: [],
    proposals: [],
  };
  const requests: { approve: unknown; create: unknown } = { approve: null, create: null };

  function save(body: TrajectoryContent & { updatedAt: string }): TrajectoryDto {
    expect(body.updatedAt).toBe(state.updatedAt);
    state = {
      ...state,
      goals: body.goals ?? null,
      plannedResults: body.plannedResults ?? null,
      supportMethods: body.supportMethods ?? null,
      startDate: body.startDate ?? null,
      plannedEndDate: body.plannedEndDate ?? null,
      updatedAt: stamp(),
      stages: body.stages.map((stage, index) => ({
        id: stage.id ?? `stage-new-${index}`,
        sortOrder: index,
        title: stage.title,
        goal: stage.goal ?? null,
        description: stage.description ?? null,
        plannedResults: stage.plannedResults ?? null,
        startDate: stage.startDate ?? null,
        endDate: stage.endDate ?? null,
        status: 'NOT_STARTED',
        checkpoints: stage.checkpoints.map((checkpoint, item) => ({
          id: checkpoint.id ?? `cp-${index}-${item}`,
          title: checkpoint.title,
          description: checkpoint.description ?? null,
          dueDate: checkpoint.dueDate ?? null,
          status: 'PENDING',
        })),
        materials: [],
        assignments: stage.assignments.map((assignment, item) => ({
          id: assignment.id ?? `ta-${index}-${item}`,
          assignment: {
            id: libraryAssignment.id,
            title: libraryAssignment.title,
            typeName: libraryAssignment.type.name,
            difficulty: libraryAssignment.difficulty,
            archived: false,
          },
          dueAt: assignment.dueAt ?? null,
          status: 'ASSIGNED',
        })),
      })),
    };
    return state;
  }

  await page.route(`**/api/students/${STUDENT_ID}/trajectory-options`, (route) =>
    route.fulfill({ json: options }),
  );
  await page.route(/\/api\/trajectories$/, (route) => {
    requests.create = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: state });
  });
  await page.route(`**/api/trajectories/${TRAJECTORY_ID}`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ json: save(route.request().postDataJSON()) })
      : route.fulfill({ json: state }),
  );
  await page.route(`**/api/trajectories/${TRAJECTORY_ID}/approve`, (route) => {
    requests.approve = route.request().postDataJSON();
    state = {
      ...state,
      status: 'ACTIVE',
      version: 1,
      currentStageId: state.stages[0]!.id,
      approvedBy: state.teacher,
      approvedAt: '2026-10-18T11:00:00.000Z',
      updatedAt: stamp(),
      stages: state.stages.map((stage, index) =>
        index === 0 ? { ...stage, status: 'IN_PROGRESS' } : stage,
      ),
      versions: [
        {
          versionNumber: 1,
          status: 'ACTIVE',
          reason: null,
          createdBy: state.teacher,
          createdAt: '2026-10-18T11:00:00.000Z',
        },
      ],
    };
    return route.fulfill({ json: state });
  });
  await page.route(/\/api\/library-assignments(\?.*)?$/, (route) =>
    route.fulfill({ json: [libraryAssignment] }),
  );
  return requests;
}

const MONTHS: [string, string][] = [
  ['2026-09-01', '2026-09-30'],
  ['2026-10-01', '2026-10-31'],
  ['2026-11-01', '2026-11-30'],
  ['2026-12-01', '2026-12-25'],
  ['2027-01-10', '2027-01-31'],
];

/** Дата так, как её вводит пользователь: «дд/мм/гггг». */
const typed = (iso: string) => iso.split('-').reverse().join('/');

test.describe('UC-03: создание и утверждение ИОТ', () => {
  test('AT-05, FR-034–FR-039, NFR-004: шаблон по профилю → цели → этапы → задания → сроки → предпросмотр → утверждение', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    const requests = await mockTrajectoryApi(page);
    const next = () => page.getByRole('button', { name: 'Далее' }).click();

    // ① Дисциплина и шаблон: предложен шаблон профиля (FR-035).
    await page.goto(`/trajectories/new?studentId=${STUDENT_ID}`);
    await expect(page.getByText('Предложено по профилю')).toBeVisible();
    await expect(page.getByLabel(options.templates[1]!.title)).toBeChecked();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Создать черновик и продолжить' }).click();
    await expect(page).toHaveURL(`/trajectories/${TRAJECTORY_ID}`);
    expect(requests.create).toMatchObject({ studentId: STUDENT_ID, templateId: 'medium' });

    // ② Цели и сроки.
    await page.getByLabel('Образовательные цели').fill('Освоить линейные уравнения');
    await page.getByLabel('Дата начала').fill('01/09/2026');
    await page.getByLabel('Планируемая дата завершения').fill('31/01/2027');
    await expect(page.getByLabel('Дата начала')).toHaveValue('01/09/2026');
    const saved = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().endsWith(TRAJECTORY_ID),
    );
    await next();
    // Пользователь вводит «дд/мм/гггг», в API уходит дата ISO.
    expect((await saved).postDataJSON()).toMatchObject({
      startDate: '2026-09-01',
      plannedEndDate: '2027-01-31',
    });

    // ③ Пять этапов из шаблона (п. 4.6).
    await expect(page.getByLabel('Название этапа 5')).toHaveValue('Профессиональное развитие');
    await expectNoHorizontalScroll(page);
    await next();

    // ④ Задание библиотеки в первый этап (FR-037).
    await page.getByRole('button', { name: 'Добавить задания' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Линейные уравнения').click();
    await dialog.getByRole('button', { name: 'Добавить (1)' }).click();
    await expect(dialog).toBeHidden();
    await next();

    // ⑤ Сроки этапов, контрольная точка, срок задания.
    for (const [index, [start, end]] of MONTHS.entries()) {
      await page.locator(`#s-stage-${index}-start`).fill(typed(start));
      await page.locator(`#s-stage-${index}-end`).fill(typed(end));
    }
    await page.getByRole('button', { name: 'Добавить контрольную точку' }).first().click();
    await page.getByLabel('Линейные уравнения').fill('20/09/2026');
    await next();

    // ⑥ Сопровождение заполнено по стратегии профиля.
    await expect(page.getByLabel('Способы сопровождения')).toHaveValue(
      /Развитие самостоятельности/,
    );
    await next();

    // ⑦ Предпросмотр: паспорт и карта пяти этапов (FR-038).
    await expect(page.getByText('Маршрут заполнен')).toBeVisible();
    await expect(page.locator('.stage-map__card')).toHaveCount(5);
    await expect(page.getByText('КТ: 30.09.2026')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // «Утвердить и назначить» (FR-039).
    await page.getByRole('button', { name: 'Утвердить и назначить' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Утвердить и назначить' }).click();
    await expect(page.getByText('ИОТ утверждена и назначена')).toBeVisible();
    expect(requests.approve).toMatchObject({ updatedAt: expect.any(String) });
    await expect(page.locator('.trajectory__heading').getByText('Активна')).toBeVisible();
    await expect(page.getByText('Текущий этап', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Версия 1', { exact: false }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
