import { expect, test } from '@playwright/test';
import type {
  AssignmentReviewDto,
  AssignmentWorkDto,
  FileDto,
  ReviewQueueItemDto,
  StudentAssignmentDto,
  SubmissionDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const student = fakeUser(['student']);
const teacher = fakeUser(['teacher']);
const TASK_ID = '00000000-0000-7000-8000-000000000e01';

const row: StudentAssignmentDto = {
  id: TASK_ID,
  status: 'IN_PROGRESS',
  dueAt: '2030-09-20T18:59:59.000Z',
  assignedAt: '2026-09-01T10:00:00.000Z',
  assignment: {
    id: 'a1',
    title: 'Линейные уравнения',
    typeName: 'Практическая работа',
    difficulty: 'BASIC',
    topic: 'Уравнения',
  },
  discipline: { id: 'd1', name: 'Математика' },
  trajectory: { id: 't1', stage: { id: 's0', title: 'Адаптационный', sortOrder: 0 } },
  choiceGroup: null,
  assignedBy: { id: teacher.id, fullName: 'Иванова Анна' },
  result: null,
};

const work: AssignmentWorkDto = {
  ...row,
  goal: 'Научиться решать линейные уравнения',
  instruction: 'Решите уравнения 1–10 из сборника.',
  submissionFormats: ['TEXT', 'FILE'],
  maxScore: 7.5,
  criteria: [
    { id: 'k1', title: 'Верность решения', description: null, maxScore: 5 },
    { id: 'k2', title: 'Оформление', description: null, maxScore: 2.5 },
  ],
  attachments: [],
  completedAt: null,
  submissions: [],
};

const file: FileDto = {
  id: '00000000-0000-7000-8000-000000000e02',
  originalName: 'reshenie.txt',
  mimeType: 'text/plain',
  sizeBytes: 120,
};

const attempt: SubmissionDto = {
  id: '00000000-0000-7000-8000-000000000e03',
  attemptNumber: 1,
  text: 'x = 2',
  url: null,
  files: [file],
  submittedAt: '2026-09-10T10:00:00.000Z',
  late: false,
  assessment: null,
};

test('UC-04, FR-050: студент прикрепляет ответ и отправляет задание на проверку', async ({
  page,
}) => {
  await mockSession(page, student);
  await page.route(`**/api/cabinet/assignments/${TASK_ID}`, (route) =>
    route.fulfill({ json: work }),
  );
  await page.route('**/api/cabinet/files', (route) => route.fulfill({ status: 201, json: file }));
  const posts: { body: Record<string, unknown>; key?: string }[] = [];
  await page.route(`**/api/cabinet/assignments/${TASK_ID}/submissions`, (route) => {
    posts.push({
      body: route.request().postDataJSON() as Record<string, unknown>,
      key: route.request().headers()['idempotency-key'],
    });
    return route.fulfill({
      status: 201,
      json: { ...work, status: 'SUBMITTED', submissions: [attempt] },
    });
  });

  await page.goto(`/student/assignments/${TASK_ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Линейные уравнения');
  await page.getByLabel('Ответ текстом').fill('x = 2');
  await page.getByTestId('file-input').setInputFiles({
    name: 'reshenie.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('x = 2'),
  });
  await expect(page.getByText('reshenie.txt')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Отправить на проверку' }).click();

  await expect(page.getByText('Ответ отправлен и ждёт проверки')).toBeVisible();
  await expect(page.getByText('Попытка 1')).toBeVisible();
  await expect(page.getByRole('button', { name: /Скачать: reshenie\.txt/ })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]!.key).toBeTruthy();
  expect(posts[0]!.body).toEqual({ text: 'x = 2', url: null, fileIds: [file.id] });
  await expectNoHorizontalScroll(page);
});

test('AT-07, FR-052: преподаватель находит ответ в очереди и принимает по критериям', async ({
  page,
}) => {
  await mockSession(page, teacher);
  await mockDirectoryApi(page);
  const student = { id: 'st1', fullName: 'Петров Иван Сергеевич', group: null };
  const queued: ReviewQueueItemDto = {
    ...row,
    status: 'SUBMITTED',
    student,
    attemptNumber: 1,
    submittedAt: attempt.submittedAt,
    late: false,
  };
  const review: AssignmentReviewDto = {
    ...work,
    status: 'SUBMITTED',
    student,
    submissions: [attempt],
  };
  await page.route(/\/api\/student-assignments\/review(\?.*)?$/, (route) =>
    route.fulfill({ json: [queued] }),
  );
  await page.route(`**/api/student-assignments/${TASK_ID}`, (route) =>
    route.fulfill({ json: review }),
  );
  const posts: Record<string, unknown>[] = [];
  await page.route(`**/api/student-assignments/${TASK_ID}/assessments`, (route) => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    const accepted: AssignmentReviewDto = {
      ...review,
      status: 'COMPLETED',
      completedAt: '2026-09-11T10:00:00.000Z',
      submissions: [
        {
          ...attempt,
          assessment: {
            id: 'as1',
            decision: 'ACCEPTED',
            score: 7,
            maxScore: 7.5,
            comment: 'Хорошо',
            criterionScores: [
              {
                criterionId: 'k1',
                title: 'Верность решения',
                maxScore: 5,
                score: 5,
                comment: null,
              },
              { criterionId: 'k2', title: 'Оформление', maxScore: 2.5, score: 2, comment: null },
            ],
            assessor: { id: teacher.id, fullName: 'Иванова Анна' },
            createdAt: '2026-09-11T10:00:00.000Z',
          },
        },
      ],
    };
    return route.fulfill({ status: 201, json: accepted });
  });

  await page.goto('/assignments?tab=review');
  await page.getByRole('link', { name: /Линейные уравнения/ }).click();
  await expect(page).toHaveURL(`/assignments/review/${TASK_ID}`);
  await expect(page.getByRole('heading', { name: 'Проверка попытки 1' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByLabel('Верность решения (0–5)').fill('5');
  await page.getByLabel('Оформление (0–2,5)').fill('2');
  await page.getByLabel('Комментарий для студента (необязательно)').fill('Хорошо');
  await page.getByRole('button', { name: 'Принять' }).click();

  await expect(page.getByText('Балл: 7 из 7,5')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Проверка попытки 1' })).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    submissionId: attempt.id,
    decision: 'ACCEPTED',
    comment: 'Хорошо',
    criterionScores: [
      { criterionId: 'k1', score: 5 },
      { criterionId: 'k2', score: 2 },
    ],
  });
  await expectNoHorizontalScroll(page);
});
