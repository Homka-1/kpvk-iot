import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type DashboardDto,
  type LibraryAssignmentDto,
  type MonitoringDto,
  type ReviewQueueItemDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentPageDto,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const pad = (value: number) => String(value).padStart(2, '0');
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const dueAt = (date: string) => new Date(`${date}T23:59:59`).toISOString();

describe('Главная панель преподавателя (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let groupId: string;
  let otherGroupId: string;
  let disciplineId: string;
  let task: LibraryAssignmentDto;
  let lateTask: LibraryAssignmentDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });
  const dashboard = async (query: Record<string, string> = {}, session = teacher) =>
    (
      await as(
        session,
        http()
          .get('/api/dashboard')
          .query({ groupId, ...query }),
      ).expect(200)
    ).body as DashboardDto;

  /** Студент с утверждённой ИОТ: в первом этапе текущее и просроченное задания. */
  async function studentWithTrajectory(lastName: string) {
    const created = (
      await as(teacher, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
        .expect(201)
    ).body as StudentCreatedDto;
    await prisma.user.update({
      where: { login: created.login },
      data: { mustChangePassword: false },
    });
    const session = await login(app, created.login, created.temporaryPassword!);
    const options = (
      await as(teacher, http().get(`/api/students/${created.student.id}/trajectory-options`))
    ).body as TrajectoryOptionsDto;
    const draft = (
      await as(teacher, http().post('/api/trajectories'))
        .set('Idempotency-Key', key())
        .send({
          studentId: created.student.id,
          disciplineId,
          templateId: options.templates.find((item) => item.isStandard)!.id,
        })
        .expect(201)
    ).body as TrajectoryDto;
    const saved = (
      await as(teacher, http().put(`/api/trajectories/${draft.id}`))
        .send({
          updatedAt: draft.updatedAt,
          goals: 'Освоить тему',
          supportMethods: 'Консультации',
          startDate: day(-10),
          plannedEndDate: day(60),
          stages: draft.stages.map((stage, index) => ({
            id: stage.id,
            title: stage.title,
            goal: stage.goal,
            startDate: day(index * 12 - 10),
            endDate: day(index * 12 + 1),
            checkpoints: [{ title: `Точка ${index + 1}`, dueDate: day(index * 12 + 1) }],
            materialIds: [],
            assignments:
              index === 0
                ? [
                    { assignmentId: task.id, dueAt: dueAt(day(1)) },
                    { assignmentId: lateTask.id, dueAt: dueAt(day(-1)) },
                  ]
                : [],
          })),
        })
        .expect(200)
    ).body as TrajectoryDto;
    const trajectory = (
      await as(teacher, http().post(`/api/trajectories/${draft.id}/approve`))
        .send({ updatedAt: saved.updatedAt })
        .expect(200)
    ).body as TrajectoryDto;
    return { student: created.student, session, trajectory };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    otherTeacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);
    const group = (name: string) =>
      as(admin, http().post('/api/groups'))
        .send({ name, course: 1, specialty: 'Информатика' })
        .expect(201)
        .then((response) => response.body.id as string);
    groupId = await group(`ГЛ-${tag}`);
    otherGroupId = await group(`ГЛ2-${tag}`);
    disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Химия ${tag}` })
        .expect(201)
    ).body.id as string;
    for (const id of [groupId, otherGroupId]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherUser.id, groupId: id, disciplineId })
        .expect(201);
    }
    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200)).body as {
      id: string;
    }[];
    const libraryTask = async (title: string) =>
      (
        await as(teacher, http().post('/api/library-assignments'))
          .set('Idempotency-Key', key())
          .send({
            title: `${title} ${tag}`,
            disciplineId,
            difficulty: 'BASIC',
            typeId: types[0]!.id,
            instruction: 'Выполните работу',
            submissionFormats: ['TEXT'],
            criteria: [],
            attachments: [],
          })
          .expect(201)
      ).body as LibraryAssignmentDto;
    task = await libraryTask('Опыт');
    lateTask = await libraryTask('Отчёт');
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-005: без студентов — «нет данных», а не нули', async () => {
    const empty = await dashboard({ groupId: otherGroupId });
    expect(empty.cards).toEqual({
      students: null,
      activeTrajectories: null,
      averageProgress: null,
      toReview: null,
      overdueAssignments: null,
      needsAttention: null,
    });
    expect(empty.stages).toEqual([]);
    expect(empty.profiles.total).toBe(0);
    expect(empty.recentAssignments).toEqual([]);
    expect(empty.activity).toEqual([]);
    expect(empty.upcoming).toEqual([]);
  });

  it('FR-001, FR-003: показатели совпадают с данными и с отфильтрованными списками, обновляются после изменений', async () => {
    const first = await studentWithTrajectory('Первый');
    await studentWithTrajectory('Второй');

    const before = await dashboard();
    expect(before.cards).toEqual({
      students: 2,
      activeTrajectories: 2,
      averageProgress: 0,
      toReview: 0,
      overdueAssignments: 2,
      needsAttention: 0,
    });
    expect(before.profiles).toMatchObject({ total: 2, NONE: 2 });
    // Пять этапов стандартного шаблона; у каждого номера — оба маршрута.
    expect(before.stages.map((bar) => bar.position)).toEqual([1, 2, 3, 4, 5]);
    for (const bar of before.stages) {
      expect(bar.counts.NOT_STARTED + bar.counts.IN_PROGRESS + bar.counts.COMPLETED).toBe(2);
    }
    expect(before.recentAssignments).toHaveLength(4);
    expect(before.upcoming.map((item) => item.kind)).toContain('CHECKPOINT');
    const dates = before.upcoming.map((item) => item.date.slice(0, 10));
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((date) => date >= day(0))).toBe(true);

    // Студент сдаёт ответ и сообщает о затруднении — панель отражает это при следующем запросе.
    const item = first.trajectory.stages[0]!.assignments[0]!;
    await as(first.session, http().post(`/api/cabinet/assignments/${item.id}/submissions`))
      .set('Idempotency-Key', key())
      .send({ text: 'Готово' })
      .expect(201);
    await as(first.session, http().post('/api/cabinet/feedback'))
      .set('Idempotency-Key', key())
      .send({ kind: 'DIFFICULTY_REPORT', body: 'Не получается опыт' })
      .expect(201);

    const after = await dashboard();
    expect(after.cards).toMatchObject({ toReview: 1, needsAttention: 1 });
    expect(after.activity.map((entry) => [entry.kind, entry.open])).toEqual([
      ['DIFFICULTY_REPORT', true],
      ['SUBMISSION', false],
    ]);
    expect(after.activity[1]).toMatchObject({ reviewId: item.id, title: task.title });

    // Карточка ведёт к списку с тем же числом (FR-003).
    const students = (
      await as(
        teacher,
        http().get('/api/students').query({ groupId, needsAttention: true }),
      ).expect(200)
    ).body as StudentPageDto;
    expect(students.total).toBe(after.cards.needsAttention);
    expect(students.items[0]!.id).toBe(first.student.id);
    const queue = (
      await as(teacher, http().get('/api/student-assignments/review').query({ groupId })).expect(
        200,
      )
    ).body as ReviewQueueItemDto[];
    expect(queue).toHaveLength(after.cards.toReview!);
    const active = (
      await as(
        teacher,
        http().get('/api/monitoring').query({ groupId, status: 'ACTIVE', from: after.period.from }),
      ).expect(200)
    ).body as MonitoringDto;
    expect(active.summary.trajectories).toBe(after.cards.activeTrajectories);
    expect(active.summary.overdueAssignments).toBe(after.cards.overdueAssignments);
    expect(active.summary.averageProgress).toBe(after.cards.averageProgress);
  });

  it('FR-004: группа, дисциплина и период', async () => {
    const byDiscipline = await dashboard({ disciplineId });
    expect(byDiscipline.cards.students).toBe(2);
    expect((await dashboard({ groupId: otherGroupId, disciplineId })).cards.students).toBeNull();

    const all = await dashboard({ period: 'ALL' });
    expect(all.period).toEqual({ from: null, to: null });
    expect(all.cards.activeTrajectories).toBe(2);
    const weeks = await dashboard({ period: 'WEEKS_4' });
    expect(weeks.period.from).toBe(day(-27));

    await as(teacher, http().get('/api/dashboard').query({ period: 'YEAR' })).expect(400);
  });

  it('FR-002: только студенты области пользователя; без прав на мониторинг — 403', async () => {
    const other = await dashboard({}, otherTeacher);
    expect(other.cards.students).toBeNull();
    expect(other.activity).toEqual([]);
    expect(other.upcoming).toEqual([]);

    for (const session of [admin, researcher]) {
      await as(session, http().get('/api/dashboard')).expect(403);
    }
  });
});
