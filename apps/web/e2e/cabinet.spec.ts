import { expect, test } from '@playwright/test';
import {
  type AssignTasksResultDto,
  type AssignmentWorkDto,
  type CabinetAssignmentsDto,
  type CabinetTrajectoryDto,
  type GroupDto,
  type LibraryAssignmentDto,
  STANDARD_TRAJECTORY_STAGES,
  type StudentAssignmentDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const student = fakeUser(['student']);
const teacher = fakeUser(['teacher']);
const DISCIPLINE = { id: '00000000-0000-7000-8000-000000000f01', name: 'Математика' };
const TRAJECTORY_ID = '00000000-0000-7000-8000-000000000f02';
const TASK_ID = '00000000-0000-7000-8000-000000000f03';

const task: StudentAssignmentDto = {
  id: TASK_ID,
  status: 'ASSIGNED',
  dueAt: '2026-09-20T18:59:59.000Z',
  assignedAt: '2026-09-01T10:00:00.000Z',
  assignment: {
    id: 'a1',
    title: 'Линейные уравнения',
    typeName: 'Практическая работа',
    difficulty: 'BASIC',
    topic: 'Уравнения',
  },
  discipline: DISCIPLINE,
  trajectory: { id: TRAJECTORY_ID, stage: { id: 's0', title: 'Адаптационный', sortOrder: 0 } },
  choiceGroup: null,
  assignedBy: { id: teacher.id, fullName: 'Иванова Анна' },
  result: null,
};

const trajectory: CabinetTrajectoryDto = {
  id: TRAJECTORY_ID,
  status: 'ACTIVE',
  version: 1,
  discipline: DISCIPLINE,
  teacher: { id: teacher.id, fullName: 'Иванова Анна' },
  goals: 'Освоить линейные уравнения и применять их в профессиональных задачах',
  plannedResults: 'Решает уравнения самостоятельно',
  supportMethods: 'Еженедельная консультация',
  startDate: '2026-09-01',
  plannedEndDate: '2027-01-31',
  currentStageId: 's0',
  approvedAt: '2026-09-01T10:00:00.000Z',
  stages: STANDARD_TRAJECTORY_STAGES.map((stage, index) => ({
    id: `s${index}`,
    sortOrder: index,
    title: stage.title,
    goal: stage.goal,
    description: null,
    plannedResults: null,
    startDate: `2026-${String(9 + Math.min(index, 3)).padStart(2, '0')}-01`,
    endDate: `2026-${String(9 + Math.min(index, 3)).padStart(2, '0')}-28`,
    status: index === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
    checkpoints: [
      {
        id: `c${index}`,
        title: `Контрольная точка ${index + 1}`,
        description: null,
        dueDate: '2026-09-28',
        status: 'PENDING',
      },
    ],
    materials:
      index === 0
        ? [
            {
              id: 'm1',
              title: 'Памятка по уравнениям',
              kind: 'TEXT',
              archived: false,
              description: null,
              file: null,
              url: null,
              body: 'Перенос слагаемого меняет знак.',
            },
          ]
        : [],
    assignments:
      index === 0
        ? [
            {
              id: TASK_ID,
              assignment: {
                id: 'a1',
                title: 'Линейные уравнения',
                typeName: 'Практическая работа',
                difficulty: 'BASIC',
                archived: false,
              },
              dueAt: task.dueAt,
              status: 'ASSIGNED',
            },
          ]
        : [],
  })),
  proposals: [],
};

const detail: AssignmentWorkDto = {
  ...task,
  goal: 'Научиться решать линейные уравнения',
  instruction: 'Решите уравнения 1–10 из сборника.',
  submissionFormats: ['TEXT', 'FILE'],
  maxScore: 5,
  criteria: [{ id: 'k1', title: 'Верность решения', description: null, maxScore: 5 }],
  attachments: [],
  completedAt: null,
  submissions: [],
};

test.describe('AT-06: кабинет студента — траектория и задания', () => {
  test('FR-040, FR-041: студент видит утверждённую ИОТ, этапы и свои задания', async ({ page }) => {
    await mockSession(page, student);
    await page.route('**/api/cabinet/trajectories', (route) =>
      route.fulfill({ json: [trajectory] }),
    );
    const assignments: CabinetAssignmentsDto = { choices: [], items: [task] };
    await page.route('**/api/cabinet/assignments', (route) => route.fulfill({ json: assignments }));
    await page.route(`**/api/cabinet/assignments/${TASK_ID}`, (route) =>
      route.fulfill({ json: detail }),
    );
    const proposals: { body: Record<string, unknown>; key?: string }[] = [];
    await page.route(`**/api/cabinet/trajectories/${TRAJECTORY_ID}/proposals`, (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      proposals.push({ body, key: route.request().headers()['idempotency-key'] });
      return route.fulfill({
        status: 201,
        json: {
          id: 'p1',
          stage: null,
          body: body.body,
          author: { id: student.id, fullName: 'Иванова Анна' },
          createdAt: '2026-10-18T10:00:00.000Z',
        },
      });
    });

    await page.goto('/student/trajectory');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Моя траектория');
    await expect(page.getByText(trajectory.goals!)).toBeVisible();
    const stages = page.getByRole('list', { name: 'Этапы маршрута' }).getByRole('listitem');
    await expect(stages).toHaveCount(5);
    await expect(stages.first()).toContainText('Текущий этап');
    await expectNoHorizontalScroll(page);

    // Содержание этапа: материал открывается, задание ведёт в карточку.
    const details = page.getByRole('region', { name: 'Содержание этапа 1' });
    await details.getByRole('button', { name: 'Памятка по уравнениям' }).click();
    await expect(page.getByRole('dialog', { name: 'Памятка по уравнениям' })).toContainText(
      'Перенос слагаемого меняет знак.',
    );
    await page.keyboard.press('Escape');

    // Предложение изменения маршрута (п. 2.3).
    await page.getByRole('button', { name: 'Предложить изменение' }).click();
    const dialog = page.getByRole('dialog', { name: 'Предложить изменение маршрута' });
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect(dialog.getByText('Опишите, что вы предлагаете изменить')).toBeVisible();
    await dialog.getByLabel('Что изменить и почему').fill('Хочу проект по веб-разработке');
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByText('Предложение отправлено преподавателю.')).toBeVisible();
    await expect(page.getByText('Хочу проект по веб-разработке')).toBeVisible();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.key).toBeTruthy();
    expect(proposals[0]!.body).toEqual({ body: 'Хочу проект по веб-разработке', stageId: null });

    await details.getByRole('link', { name: 'Линейные уравнения' }).click();
    await expect(page).toHaveURL(`/student/assignments/${TASK_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Линейные уравнения');
    await expect(page.getByText('Решите уравнения 1–10 из сборника.')).toBeVisible();
    await expect(page.getByText('Верность решения')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'Мои задания' }).first().click();
    await expect(page).toHaveURL('/student/assignments');
    await expect(page.getByRole('heading', { name: 'Текущие' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Линейные уравнения/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('FR-048: назначение заданий преподавателем', () => {
  const group: GroupDto = {
    id: '00000000-0000-7000-8000-000000000f04',
    name: 'ПО-21',
    course: 2,
    specialty: 'Программное обеспечение',
    archivedAt: null,
    studentCount: 2,
  };
  const library: LibraryAssignmentDto = {
    id: '00000000-0000-7000-8000-000000000f05',
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

  test('задание назначается группе со сроком; результат показан с пропущенными', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    await mockDirectoryApi(page, { groups: [group] });
    await page.route('**/api/assignment-types', (route) => route.fulfill({ json: [] }));
    await page.route(/\/api\/library-assignments(\?.*)?$/, (route) =>
      route.fulfill({ json: [library] }),
    );
    const posts: { body: Record<string, unknown>; key?: string }[] = [];
    await page.route('**/api/student-assignments', (route) => {
      posts.push({
        body: route.request().postDataJSON() as Record<string, unknown>,
        key: route.request().headers()['idempotency-key'],
      });
      const result: AssignTasksResultDto = {
        assigned: [{ id: 'st1', fullName: 'Петров Иван' }],
        skipped: [
          { student: { id: 'st2', fullName: 'Сидорова Анна' }, reason: 'Задание уже назначено' },
        ],
      };
      return route.fulfill({ status: 201, json: result });
    });

    await page.goto('/assignments');
    await page.getByRole('button', { name: 'Назначить' }).click();
    const dialog = page.getByRole('dialog', { name: 'Назначить: Линейные уравнения' });
    await dialog.getByRole('combobox', { name: 'Группа' }).click();
    await page.getByRole('option', { name: 'ПО-21' }).click();
    await dialog.getByLabel('Срок сдачи (необязательно)').fill('20/11/2026');
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Назначить' }).click();

    await expect(dialog.getByText('Назначено студентам: 1.')).toBeVisible();
    await expect(dialog.getByText('Сидорова Анна — Задание уже назначено')).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toBeTruthy();
    expect(posts[0]!.body).toMatchObject({
      assignmentIds: [library.id],
      groupId: group.id,
      choice: null,
    });
    const due = new Date(posts[0]!.body.dueAt as string);
    expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours()]).toEqual([
      2026, 10, 20, 23,
    ]);
  });
});
