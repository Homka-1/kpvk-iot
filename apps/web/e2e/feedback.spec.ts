import { expect, test } from '@playwright/test';
import type {
  CabinetFeedbackDto,
  ConsultationDto,
  FeedbackDto,
  NotificationsDto,
  ReflectionDto,
} from '@iot/shared';
import {
  expectNoHorizontalScroll,
  fakeUser,
  mockDirectoryApi,
  mockSession,
} from './support/session';

const teacher = fakeUser(['teacher']);
const studentUser = fakeUser(['student'], { lastName: 'Петров', firstName: 'Иван' });
const STUDENT_ID = '00000000-0000-7000-8000-00000000e001';
const student = { id: STUDENT_ID, fullName: 'Петров Иван Сергеевич', groupName: 'ПО-21' };
const teacherRef = { id: teacher.id, fullName: 'Иванова Анна' };

const pad = (value: number) => String(value).padStart(2, '0');
/** Завтрашняя дата так, как её вводит пользователь: «дд/мм/гггг». */
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const question: FeedbackDto = {
  id: '00000000-0000-7000-8000-00000000e101',
  kind: 'QUESTION',
  visibility: 'STUDENT_VISIBLE',
  body: 'Как оформить вывод в лабораторной?',
  dueDate: null,
  resolvedAt: null,
  createdAt: '2026-10-18T09:00:00.000Z',
  student,
  author: { id: 'su1', fullName: 'Петров Иван Сергеевич' },
  fromStudent: true,
  trajectory: { id: 't1', disciplineName: 'Физика' },
  stage: { id: 'st1', title: 'Адаптационный', sortOrder: 0 },
  assignment: null,
  replies: [],
};

const requested: ConsultationDto = {
  id: '00000000-0000-7000-8000-00000000e201',
  status: 'REQUESTED',
  topic: 'Подготовка к контрольной',
  scheduledAt: null,
  heldAt: null,
  summary: null,
  internalNote: null,
  teacher: null,
  requestedByStudent: true,
  student,
  trajectory: { id: 't1', disciplineName: 'Физика' },
  createdAt: '2026-10-18T10:00:00.000Z',
};

test('FR-063–FR-065, FR-067, FR-068: преподаватель отвечает на вопрос и проводит консультацию', async ({
  page,
}) => {
  await mockSession(page, teacher);
  await mockDirectoryApi(page);
  let notifications: NotificationsDto = {
    unread: 1,
    items: [
      {
        id: 'n1',
        type: 'feedback.created',
        title: 'Студент задал вопрос',
        body: 'Петров Иван Сергеевич',
        link: '/feedback',
        readAt: null,
        createdAt: '2026-10-18T09:00:00.000Z',
      },
    ],
  };
  let thread = question;
  let consultation = requested;
  const posted: Record<string, unknown> = {};
  await page.route('**/api/notifications', (route) => route.fulfill({ json: notifications }));
  await page.route('**/api/notifications/n1/read', (route) => {
    notifications = {
      unread: 0,
      items: [{ ...notifications.items[0]!, readAt: '2026-10-18T09:05:00.000Z' }],
    };
    return route.fulfill({ json: notifications.items[0] });
  });
  await page.route(/\/api\/feedback(\?.*)?$/, (route) => {
    const source = new URL(route.request().url()).searchParams.get('source');
    const open = new URL(route.request().url()).searchParams.get('open') === 'true';
    if (source !== 'student') return route.fulfill({ json: [] });
    return route.fulfill({ json: open && thread.resolvedAt ? [] : [thread] });
  });
  await page.route(`**/api/feedback/${question.id}/replies`, (route) => {
    posted.reply = route.request().postDataJSON();
    const body = posted.reply as { body: string; visibility: 'INTERNAL' | 'STUDENT_VISIBLE' };
    thread = {
      ...thread,
      replies: [
        {
          id: 'r1',
          body: body.body,
          visibility: body.visibility,
          author: teacherRef,
          fromStudent: false,
          createdAt: '2026-10-18T09:10:00.000Z',
        },
      ],
    };
    return route.fulfill({ status: 201, json: thread });
  });
  await page.route(`**/api/feedback/${question.id}/resolve`, (route) => {
    thread = { ...thread, resolvedAt: '2026-10-18T09:15:00.000Z' };
    return route.fulfill({ json: thread });
  });
  await page.route(/\/api\/consultations(\?.*)?$/, (route) =>
    route.fulfill({ json: [consultation] }),
  );
  await page.route(`**/api/consultations/${requested.id}/schedule`, (route) => {
    posted.schedule = route.request().postDataJSON();
    consultation = {
      ...consultation,
      status: 'SCHEDULED',
      scheduledAt: (posted.schedule as { scheduledAt: string }).scheduledAt,
      teacher: teacherRef,
    };
    return route.fulfill({ json: consultation });
  });
  await page.route(`**/api/consultations/${requested.id}/held`, (route) => {
    posted.held = route.request().postDataJSON();
    const body = posted.held as { heldAt: string; summary: string; internalNote: string };
    consultation = { ...consultation, status: 'HELD', ...body };
    return route.fulfill({ json: consultation });
  });

  // Бейдж в шапке и переход по уведомлению (FR-065).
  await page.goto('/');
  const bell = page.getByRole('button', { name: 'Уведомления: непрочитанных 1' });
  await expect(bell).toBeVisible();
  await bell.click();
  await page.getByRole('button', { name: /Студент задал вопрос/ }).click();
  await expect(page).toHaveURL('/feedback');
  await expect(page.getByRole('button', { name: 'Уведомления', exact: true })).toBeVisible();

  // Обращение студента с привязкой (FR-064), внутренний ответ (FR-068).
  const card = page.getByRole('article', { name: 'Вопрос' });
  await expect(card).toContainText('Как оформить вывод в лабораторной?');
  await expect(card).toContainText('ИОТ: Физика · этап 1. Адаптационный');
  await expect(card).toContainText('Ждёт ответа');
  await card.getByRole('button', { name: 'Ответить' }).click();
  await card.getByLabel('Ответ').fill('Обсудим на консультации — у студента тревожность');
  await card.getByText('Внутренняя заметка — студент её не увидит').click();
  await card.getByRole('button', { name: 'Отправить' }).click();
  await expect(card).toContainText('Видно только преподавателям');
  expect(posted.reply).toMatchObject({ visibility: 'INTERNAL' });
  await expectNoHorizontalScroll(page);
  await card.getByRole('button', { name: 'Отметить рассмотренным' }).click();
  await expect(page.getByText('Нет обращений, ждущих ответа')).toBeVisible();

  // Консультация: запрос → время → проведена с итогом и внутренней заметкой (FR-067).
  await page.getByRole('tab', { name: 'Консультации' }).click();
  await expect(page).toHaveURL('/feedback?tab=consultations');
  const meeting = page.getByRole('article', { name: 'Консультация' });
  await expect(meeting).toContainText('Запрос студента');
  await meeting.getByRole('button', { name: 'Назначить время' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Дата').fill(tomorrow());
  await dialog.getByLabel('Время').fill('9:3');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toContainText('Укажите время в формате чч:мм');
  await dialog.getByLabel('Время').fill('14:30');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(meeting).toContainText('Назначена');
  expect(new Date((posted.schedule as { scheduledAt: string }).scheduledAt).getHours()).toBe(14);

  await meeting.getByRole('button', { name: 'Отметить проведённой' }).click();
  await dialog.getByLabel('Итог для студента (необязательно)').fill('Составили план повторения');
  await dialog.getByLabel('Внутренняя заметка (необязательно)').fill('Нужна поддержка');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(meeting).toContainText('Проведена');
  await expect(meeting).toContainText('Составили план повторения');
  await expect(meeting).toContainText('Нужна поддержка');
  await expectNoHorizontalScroll(page);
});

test('FR-066, п. 4.9: студент заполняет рефлексию после контрольной точки и задаёт вопрос', async ({
  page,
}) => {
  await mockSession(page, studentUser);
  const recommendation: FeedbackDto = {
    ...question,
    id: 'rec',
    kind: 'RECOMMENDATION',
    body: 'Повторите параграф 3 перед лабораторной',
    author: teacherRef,
    fromStudent: false,
  };
  let data: CabinetFeedbackDto = {
    feedback: [recommendation],
    consultations: [],
    reflections: [],
    pendingReflections: [
      {
        checkpointId: 'cp1',
        title: 'Входной тест',
        dueDate: '2026-10-15',
        status: 'PASSED',
        stage: { id: 'st1', title: 'Адаптационный', sortOrder: 0 },
        trajectory: { id: 't1', disciplineName: 'Физика' },
      },
    ],
    trajectories: [
      {
        id: 't1',
        disciplineName: 'Физика',
        status: 'ACTIVE',
        stages: [{ id: 'st1', title: 'Адаптационный', sortOrder: 0 }],
      },
    ],
  };
  const posted: Record<string, unknown> = {};
  await page.route(/\/api\/cabinet\/feedback$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: data });
    posted.question = route.request().postDataJSON();
    const created: FeedbackDto = {
      ...question,
      id: 'q2',
      body: (posted.question as { body: string }).body,
    };
    return route.fulfill({ status: 201, json: created });
  });
  await page.route('**/api/cabinet/feedback/reflections', (route) => {
    posted.reflection = route.request().postDataJSON();
    const saved: ReflectionDto = {
      id: 'rf1',
      trajectory: { id: 't1', disciplineName: 'Физика' },
      stage: { id: 'st1', title: 'Адаптационный', sortOrder: 0 },
      checkpoint: { id: 'cp1', title: 'Входной тест' },
      selfAssessment: 4,
      achievements: 'Решил все задачи',
      difficulties: null,
      nextSteps: null,
      createdAt: '2026-10-18T12:00:00.000Z',
      student,
    };
    data = { ...data, pendingReflections: [], reflections: [saved] };
    return route.fulfill({ status: 201, json: saved });
  });

  await page.goto('/student/feedback');
  await expect(page.getByText('Повторите параграф 3 перед лабораторной')).toBeVisible();
  await expect(page.getByText('Рефлексия: «Входной тест»')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Заполнить рефлексию' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Отправить' }).click();
  await expect(dialog).toContainText('Поставьте самооценку или ответьте хотя бы на один вопрос');
  await dialog.getByRole('button', { name: '4', exact: true }).click();
  await dialog.getByLabel('Что получилось?').fill('Решил все задачи');
  await dialog.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Спасибо! Рефлексия отправлена преподавателю.')).toBeVisible();
  expect(posted.reflection).toMatchObject({
    checkpointId: 'cp1',
    selfAssessment: 4,
    achievements: 'Решил все задачи',
  });
  await expect(page.getByRole('article', { name: 'Рефлексия' })).toContainText('4 из 5');

  await page.getByRole('button', { name: 'Задать вопрос' }).click();
  await dialog.getByLabel('Ваш вопрос').fill('Можно сдать отчёт в пятницу?');
  await dialog.getByRole('button', { name: 'Отправить' }).click();
  await expect(
    page.getByText('Обращение отправлено. Преподаватель получил уведомление.'),
  ).toBeVisible();
  expect(posted.question).toMatchObject({ kind: 'QUESTION', trajectoryId: 't1' });
  await expect(page.getByText('Можно сдать отчёт в пятницу?')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
