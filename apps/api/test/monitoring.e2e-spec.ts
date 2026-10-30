import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type CabinetTrajectoryDto,
  type LibraryAssignmentDto,
  type MonitoringDetailDto,
  type MonitoringDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type SupportStatusDetailsDto,
  type TrajectoryContent,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
  type TrajectoryVersionDto,
} from '@iot/shared';
import request from 'supertest';
import { MonitoringAlertsService } from '../src/monitoring/monitoring-alerts.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const pad = (value: number) => String(value).padStart(2, '0');
/** Дата `YYYY-MM-DD` по местному времени со сдвигом от сегодняшнего дня. */
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
/** Конец дня по местному времени — так срок задания передаёт интерфейс. */
const dueAt = (date: string) => new Date(`${date}T23:59:59`).toISOString();

describe('Мониторинг и корректировка ИОТ (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let groupId: string;
  let disciplineId: string;
  let scored: LibraryAssignmentDto;
  let plain: LibraryAssignmentDto;
  let extra: LibraryAssignmentDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  const monitoring = async (query: Record<string, string> = {}, session = teacher) =>
    (
      await as(session, http().get('/api/monitoring'))
        .query({ groupId, ...query })
        .expect(200)
    ).body as MonitoringDto;
  const detail = async (id: string) =>
    (await as(teacher, http().get(`/api/monitoring/trajectories/${id}`)).expect(200))
      .body as MonitoringDetailDto;
  const getTrajectory = async (id: string) =>
    (await as(teacher, http().get(`/api/trajectories/${id}`)).expect(200)).body as TrajectoryDto;
  const action = (
    trajectory: TrajectoryDto,
    name: 'needs-correction' | 'corrections' | 'complete' | 'archive',
    body: Record<string, unknown> = {},
    session = teacher,
  ) =>
    as(session, http().post(`/api/trajectories/${trajectory.id}/${name}`)).send({
      updatedAt: trajectory.updatedAt,
      ...body,
    });

  /** Содержимое маршрута в том виде, в каком его отправляет конструктор. */
  const contentOf = (trajectory: TrajectoryDto): TrajectoryContent => ({
    goals: trajectory.goals,
    plannedResults: trajectory.plannedResults,
    supportMethods: trajectory.supportMethods,
    startDate: trajectory.startDate,
    plannedEndDate: trajectory.plannedEndDate,
    stages: trajectory.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      goal: stage.goal,
      description: stage.description,
      plannedResults: stage.plannedResults,
      startDate: stage.startDate,
      endDate: stage.endDate,
      checkpoints: stage.checkpoints.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        dueDate: item.dueDate,
      })),
      materialIds: stage.materials.map((item) => item.id),
      assignments: stage.assignments.map((item) => ({
        id: item.id,
        assignmentId: item.assignment.id,
        dueAt: item.dueAt,
      })),
    })),
  });

  /**
   * Студент с активной ИОТ: в первом этапе (идёт сейчас) — задание со сроком через 3 дня,
   * просроченное задание и контрольная точка, дата которой прошла.
   */
  async function activeTrajectory(lastName: string) {
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
    const standard = options.templates.find((item) => item.isStandard)!;
    const draft = (
      await as(teacher, http().post('/api/trajectories'))
        .set('Idempotency-Key', key())
        .send({ studentId: created.student.id, disciplineId, templateId: standard.id })
        .expect(201)
    ).body as TrajectoryDto;
    const bounds = [
      [-30, 5],
      [6, 20],
      [21, 35],
      [36, 50],
      [51, 65],
    ] as const;
    const saved = (
      await as(teacher, http().put(`/api/trajectories/${draft.id}`))
        .send({
          updatedAt: draft.updatedAt,
          goals: 'Освоить решение уравнений',
          supportMethods: 'Еженедельные консультации',
          startDate: day(-30),
          plannedEndDate: day(65),
          stages: draft.stages.map((stage, index) => ({
            id: stage.id,
            title: stage.title,
            goal: stage.goal,
            startDate: day(bounds[index]![0]),
            endDate: day(bounds[index]![1]),
            checkpoints: [
              {
                title: `Контрольная точка ${index + 1}`,
                dueDate: day(index === 0 ? -2 : bounds[index]![1]),
              },
            ],
            materialIds: [],
            assignments:
              index === 0
                ? [
                    { assignmentId: scored.id, dueAt: dueAt(day(3)) },
                    { assignmentId: plain.id, dueAt: dueAt(day(-1)) },
                  ]
                : [],
          })),
        })
        .expect(200)
    ).body as TrajectoryDto;
    const approved = (
      await as(teacher, http().post(`/api/trajectories/${draft.id}/approve`))
        .send({ updatedAt: saved.updatedAt })
        .expect(200)
    ).body as TrajectoryDto;
    const [scoredItem, plainItem] = approved.stages[0]!.assignments;
    return {
      student: created.student,
      session,
      trajectory: approved,
      scoredItem: scoredItem!,
      plainItem: plainItem!,
    };
  }

  async function submitAndAccept(session: LoggedIn, itemId: string, scores?: number[]) {
    const work = (
      await as(session, http().post(`/api/cabinet/assignments/${itemId}/submissions`))
        .set('Idempotency-Key', key())
        .send({ text: 'Готовое решение' })
        .expect(201)
    ).body as { submissions: { id: string }[] };
    await as(teacher, http().post(`/api/student-assignments/${itemId}/assessments`))
      .set('Idempotency-Key', key())
      .send({
        submissionId: work.submissions.at(-1)!.id,
        decision: 'ACCEPTED',
        criterionScores: scores
          ? scored.criteria.map((criterion, index) => ({
              criterionId: criterion.id,
              score: scores[index],
            }))
          : undefined,
      })
      .expect(201);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    otherTeacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);

    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `МОН-${tag}`, course: 2, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Алгебра ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);

    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200)).body as {
      id: string;
    }[];
    const task = async (title: string, criteria: object[]) =>
      (
        await as(teacher, http().post('/api/library-assignments'))
          .set('Idempotency-Key', key())
          .send({
            title: `${title} ${tag}`,
            disciplineId,
            difficulty: 'BASIC',
            typeId: types[0]!.id,
            instruction: 'Выполните задание',
            submissionFormats: ['TEXT'],
            criteria,
            attachments: [],
          })
          .expect(201)
      ).body as LibraryAssignmentDto;
    scored = await task('Уравнения', [
      { title: 'Верность', maxScore: 80 },
      { title: 'Оформление', maxScore: 20 },
    ]);
    plain = await task('Конспект', []);
    extra = await task('Дополнительная задача', []);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AT-08, FR-056, FR-058, FR-062: мониторинг отражает изменение прогресса', async () => {
    const { session, trajectory, scoredItem, plainItem, student } =
      await activeTrajectory('Прогресс');

    const before = await monitoring({ studentId: student.id });
    expect(before.rows).toHaveLength(1);
    const row = before.rows[0]!;
    expect(row).toMatchObject({
      trajectoryId: trajectory.id,
      status: 'ACTIVE',
      progress: { total: 2, completed: 0, overdue: 1, percent: 0 },
      stages: { total: 5, completed: 0 },
      checkpoints: { total: 5, passed: 0, missed: 1 },
      averageScore: null,
      activity: { submissions: 0, lastSubmissionAt: null },
      helpRequests: 0,
      corrections: 0,
      // Диагностика учитывается отдельно от учебной активности; пропуск — не ноль баллов.
      diagnostics: { completed: 0, lastCompletedAt: null, lastMeasurementType: null },
    });
    expect(before.warnings.map((item) => [item.kind, item.title])).toEqual([
      ['MISSED_CHECKPOINT', 'Контрольная точка 1'],
      ['OVERDUE_ASSIGNMENT', plain.title],
    ]);
    expect(before.summary).toMatchObject({
      trajectories: 1,
      averageProgress: 0,
      overdueAssignments: 1,
      missedCheckpoints: 1,
    });

    await submitAndAccept(session, scoredItem.id, [60, 20]);
    const after = await monitoring({ studentId: student.id });
    expect(after.rows[0]).toMatchObject({
      progress: { total: 2, completed: 1, percent: 50 },
      averageScore: 80,
      scoredCount: 1,
      activity: { submissions: 1 },
    });
    expect(after.rows[0]!.activity.lastSubmissionAt).not.toBeNull();
    const week = after.dynamics.at(-1)!;
    expect(week).toMatchObject({ completedAssignments: 1, submissions: 1, averageScore: 80 });
    expect(after.dynamics.slice(0, -1).every((point) => point.averageScore === null)).toBe(true);

    await submitAndAccept(session, plainItem.id);
    const done = await detail(trajectory.id);
    expect(done.row.progress).toMatchObject({ completed: 2, percent: 100, overdue: 0 });
    expect(done.stages[0]).toMatchObject({ status: 'COMPLETED', progress: { percent: 100 } });
    expect(done.stages[1]!.status).toBe('IN_PROGRESS');
    expect(done.stages[0]!.checkpoints[0]).toMatchObject({ status: 'PENDING', missed: true });
    expect(done.results.map((item) => item.percent)).toEqual([80]);
    expect(done.warnings.map((item) => item.kind)).toEqual(['MISSED_CHECKPOINT']);
  });

  it('FR-057, FR-002: фильтры по дисциплине, периоду и области преподавателя', async () => {
    const { student, trajectory } = await activeTrajectory('Фильтры');
    expect((await monitoring({ studentId: student.id })).rows).toHaveLength(1);
    expect((await monitoring({ q: `Фильтры${tag}` })).rows).toHaveLength(1);
    expect(
      (
        await monitoring({
          studentId: student.id,
          disciplineId: '0190a000-0000-7000-8000-000000000000',
        })
      ).rows,
    ).toHaveLength(0);
    // Маршрут начался 30 дней назад: период до его начала — пусто, пересекающийся — есть.
    expect(
      (await monitoring({ studentId: student.id, from: day(-90), to: day(-60) })).rows,
    ).toHaveLength(0);
    const period = await monitoring({ studentId: student.id, from: day(-40), to: day(0) });
    expect(period.rows).toHaveLength(1);
    expect(period.period).toEqual({ from: day(-40), to: day(0) });
    await as(teacher, http().get('/api/monitoring'))
      .query({ from: day(0), to: day(-1) })
      .expect(400);

    // Преподаватель без закреплений не видит чужих студентов; студент и исследователь — 403.
    expect((await monitoring({}, otherTeacher)).rows).toHaveLength(0);
    await as(otherTeacher, http().get(`/api/monitoring/trajectories/${trajectory.id}`)).expect(404);
    await as(researcher, http().get('/api/monitoring')).expect(403);
  });

  it('FR-058: фоновая задача отмечает пропущенные точки и уведомляет преподавателя один раз', async () => {
    const { trajectory, plainItem } = await activeTrajectory('Сроки');
    const alerts = app.get(MonitoringAlertsService);
    const first = await alerts.run();
    expect(first.missedCheckpoints).toBeGreaterThanOrEqual(1);
    const checkpointId = trajectory.stages[0]!.checkpoints[0]!.id;
    expect(
      (await prisma.trajectoryCheckpoint.findUniqueOrThrow({ where: { id: checkpointId } })).status,
    ).toBe('MISSED');
    const notifications = () =>
      prisma.notification.count({
        where: {
          OR: [
            { type: 'checkpoint.missed', entityId: checkpointId },
            { type: 'assignment.overdue', entityId: plainItem.id },
          ],
        },
      });
    expect(await notifications()).toBe(2);
    await alerts.run();
    expect(await notifications()).toBe(2);
    const row = (await monitoring({ studentId: trajectory.student.id })).rows[0]!;
    expect(row.checkpoints.missed).toBe(1);
  });

  it('FR-060: преподаватель отмечает необходимость дополнительного сопровождения', async () => {
    const { student } = await activeTrajectory('Сопровождение');
    const path = `/api/monitoring/students/${student.id}/support-status`;
    await as(teacher, http().put(path)).send({ supportStatus: 'ADDITIONAL_SUPPORT' }).expect(400);
    await as(otherTeacher, http().put(path))
      .send({ supportStatus: 'ADDITIONAL_SUPPORT', reason: 'Чужой студент' })
      .expect(404);
    const res = await as(teacher, http().put(path))
      .send({ supportStatus: 'ADDITIONAL_SUPPORT', reason: 'Пропущена контрольная точка' })
      .expect(200);
    expect(res.body).toEqual({ studentId: student.id, supportStatus: 'ADDITIONAL_SUPPORT' });
    const view = await monitoring({ studentId: student.id });
    expect(view.rows[0]!.student.supportStatus).toBe('ADDITIONAL_SUPPORT');
    expect(view.summary.needsSupport).toBe(1);
    const history = (
      await as(teacher, http().get(`/api/students/${student.id}/history`)).expect(200)
    ).body as StudentHistoryItemDto[];
    expect(history[0]).toMatchObject({
      label: 'Изменён статус сопровождения',
      reason: 'Пропущена контрольная точка',
    });
  });

  it('FR-060: пояснение к статусу сопровождения — основание отметки и открытые затруднения', async () => {
    const { student } = await activeTrajectory('Пояснение');
    const path = `/api/students/${student.id}/support-status`;
    const details = async () =>
      (await as(teacher, http().get(path)).expect(200)).body as SupportStatusDetailsDto;
    expect(await details()).toEqual({
      supportStatus: 'STANDARD',
      lastChange: null,
      openDifficulties: 0,
    });
    await as(otherTeacher, http().get(path)).expect(404);

    await as(teacher, http().put(`/api/monitoring/students/${student.id}/support-status`))
      .send({ supportStatus: 'NEEDS_ATTENTION', reason: 'Не сдал два задания подряд' })
      .expect(200);
    const { userId } = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    await prisma.feedback.createMany({
      data: [
        { studentId: student.id, authorId: userId!, kind: 'DIFFICULTY_REPORT', body: 'Не понял' },
        {
          studentId: student.id,
          authorId: userId!,
          kind: 'DIFFICULTY_REPORT',
          body: 'Уже разобрались',
          resolvedAt: new Date(),
        },
      ],
    });
    expect(await details()).toMatchObject({
      supportStatus: 'NEEDS_ATTENTION',
      lastChange: {
        actor: { fullName: expect.any(String) },
        reason: 'Не сдал два задания подряд',
      },
      openDifficulties: 1,
    });
  });

  it('AT-09, UC-05, FR-043, FR-061: корректировка создаёт новую версию, прежняя сохраняется', async () => {
    const { trajectory, session, scoredItem, plainItem, student } =
      await activeTrajectory('Корректировка');
    await submitAndAccept(session, scoredItem.id, [80, 20]);
    await app.get(MonitoringAlertsService).run();
    const original = (
      await as(teacher, http().get(`/api/trajectories/${trajectory.id}/versions/1`)).expect(200)
    ).body as TrajectoryVersionDto;

    // Мониторинг → отметка «Требует корректировки» с причиной.
    await action(trajectory, 'needs-correction').expect(400);
    const marked = (
      await action(trajectory, 'needs-correction', { reason: 'Просрочено задание' }).expect(200)
    ).body as TrajectoryDto;
    expect(marked.status).toBe('NEEDS_CORRECTION');
    expect((await monitoring({ studentId: student.id })).summary.needsCorrection).toBe(1);

    // Убрать выполненное задание нельзя — история выполнения сохраняется.
    const current = contentOf(await getTrajectory(trajectory.id));
    const withoutDone = structuredClone(current);
    withoutDone.stages[0]!.assignments = withoutDone.stages[0]!.assignments.filter(
      (item) => item.id !== scoredItem.id,
    );
    const locked = await action(marked, 'corrections', {
      ...withoutDone,
      reason: 'Убрать задание',
    }).expect(400);
    expect(locked.body.fields).toHaveProperty(['stages.0.assignments']);

    // Причина обязательна.
    await action(marked, 'corrections', { ...current }).expect(400);

    // Корректировка: перенос срока просроченного задания и контрольной точки, новое задание,
    // изменённый уровень поддержки и порядок этапов 4 и 5.
    const next = structuredClone(current);
    next.supportMethods = 'Консультации два раза в неделю';
    next.stages[0]!.assignments = next.stages[0]!.assignments.map((item) =>
      item.id === plainItem.id ? { ...item, dueAt: dueAt(day(4)) } : item,
    );
    next.stages[0]!.checkpoints[0]!.dueDate = day(5);
    next.stages[1]!.assignments.push({ assignmentId: extra.id, dueAt: dueAt(day(15)) });
    const [fourth, fifth] = [next.stages[3]!, next.stages[4]!];
    next.stages[3] = { ...fifth, startDate: fourth.startDate, endDate: fourth.endDate };
    next.stages[4] = { ...fourth, startDate: fifth.startDate, endDate: fifth.endDate };
    next.stages[3].checkpoints[0]!.dueDate = fourth.endDate;
    next.stages[4].checkpoints[0]!.dueDate = fifth.endDate;

    const corrected = (
      await action(marked, 'corrections', {
        ...next,
        reason: 'Студенту нужно больше времени',
      }).expect(200)
    ).body as TrajectoryDto;
    expect(corrected).toMatchObject({
      status: 'ACTIVE',
      version: 2,
      supportMethods: 'Консультации два раза в неделю',
    });
    expect(corrected.versions.map((item) => [item.versionNumber, item.reason])).toEqual([
      [2, 'Студенту нужно больше времени'],
      [1, null],
    ]);
    expect(corrected.stages[0]!.checkpoints[0]!.status).toBe('PENDING');
    expect(corrected.stages[1]!.assignments.map((item) => item.assignment.id)).toEqual([extra.id]);
    expect(corrected.stages[3]!.title).toBe(fifth.title);

    // Прежняя версия не изменилась, новая содержит изменения; выполненное задание на месте.
    const v1 = (
      await as(teacher, http().get(`/api/trajectories/${trajectory.id}/versions/1`)).expect(200)
    ).body as TrajectoryVersionDto;
    expect(v1).toEqual(original);
    const v2 = (
      await as(teacher, http().get(`/api/trajectories/${trajectory.id}/versions/2`)).expect(200)
    ).body as TrajectoryVersionDto;
    expect(v2.snapshot.supportMethods).toBe('Консультации два раза в неделю');
    expect(
      v2.snapshot.stages[0]!.assignments.find((item) => item.id === scoredItem.id)?.status,
    ).toBe('COMPLETED');
    await as(teacher, http().get(`/api/trajectories/${trajectory.id}/versions/3`)).expect(404);

    // Студент уведомлён; изменение в аудите; повтор устаревшей формы — 409, а не вторая версия.
    expect(
      await prisma.notification.count({
        where: { type: 'trajectory.corrected', entityId: trajectory.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'trajectory.corrected', entityId: trajectory.id },
        select: { reason: true },
      }),
    ).toEqual({ reason: 'Студенту нужно больше времени' });
    await action(marked, 'corrections', { ...next, reason: 'Повтор' }).expect(409);
    const row = (await monitoring({ studentId: student.id })).rows[0]!;
    expect(row).toMatchObject({ corrections: 1, status: 'ACTIVE', progress: { total: 3 } });
    expect(row.checkpoints.missed).toBe(0);

    // Корректировать может только преподаватель, который ведёт студента.
    await action(corrected, 'corrections', { ...next, reason: 'Чужой' }, otherTeacher).expect(404);
    await action(corrected, 'corrections', { ...next, reason: 'Без права' }, researcher).expect(
      403,
    );
  });

  it('FR-042: этап без заданий завершается отметкой его контрольных точек', async () => {
    const { trajectory, session, scoredItem, plainItem } = await activeTrajectory('Точки');
    await submitAndAccept(session, scoredItem.id, [80, 20]);
    await submitAndAccept(session, plainItem.id);
    const stage = (await getTrajectory(trajectory.id)).stages[1]!;
    const path = `/api/trajectories/${trajectory.id}/checkpoints/${stage.checkpoints[0]!.id}/status`;
    await as(teacher, http().post(path)).send({ status: 'DONE' }).expect(400);
    const marked = (await as(teacher, http().post(path)).send({ status: 'PASSED' }).expect(200))
      .body as TrajectoryDto;
    expect(marked.stages[1]!.status).toBe('COMPLETED');
    expect(marked.currentStageId).toBe(marked.stages[2]!.id);
    expect(marked.stages[2]!.status).toBe('IN_PROGRESS');
    const row = (await monitoring({ studentId: trajectory.student.id })).rows[0]!;
    expect(row.checkpoints.passed).toBe(1);
    expect(row.stages.completed).toBe(2);
  });

  it('FR-044: завершение маршрута с итоговой оценкой и перенос в архив', async () => {
    const { trajectory, session, scoredItem, plainItem, student } =
      await activeTrajectory('Завершение');
    await as(session, http().post(`/api/cabinet/assignments/${scoredItem.id}/submissions`))
      .set('Idempotency-Key', key())
      .send({ text: 'Решение' })
      .expect(201);
    await action(trajectory, 'complete').expect(400);
    const pending = await action(trajectory, 'complete', {
      finalAssessment: 'Цели достигнуты',
    }).expect(409);
    expect(pending.body.message).toContain('на проверке');
    expect((await getTrajectory(trajectory.id)).status).toBe('ACTIVE');

    await as(teacher, http().post(`/api/student-assignments/${scoredItem.id}/assessments`))
      .set('Idempotency-Key', key())
      .send({
        submissionId: (
          await prisma.submission.findFirstOrThrow({
            where: { trajectoryAssignmentId: scoredItem.id },
          })
        ).id,
        decision: 'ACCEPTED',
        criterionScores: scored.criteria.map((criterion) => ({
          criterionId: criterion.id,
          score: Number(criterion.maxScore),
        })),
      })
      .expect(201);
    const fresh = await getTrajectory(trajectory.id);
    const completed = (
      await action(fresh, 'complete', {
        finalAssessment: 'Цели в основном достигнуты: уравнения решает уверенно',
      }).expect(200)
    ).body as TrajectoryDto;
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      finalAssessment: 'Цели в основном достигнуты: уравнения решает уверенно',
    });
    expect(completed.completedAt).not.toBeNull();
    expect(
      (await prisma.trajectoryAssignment.findUniqueOrThrow({ where: { id: plainItem.id } })).status,
    ).toBe('CANCELLED');

    // Студент видит итог; в мониторинге маршрут остаётся, но без предупреждений.
    const cabinet = (await as(session, http().get('/api/cabinet/trajectories')).expect(200))
      .body as CabinetTrajectoryDto[];
    expect(cabinet[0]).toMatchObject({
      status: 'COMPLETED',
      finalAssessment: 'Цели в основном достигнуты: уравнения решает уверенно',
    });
    const view = await monitoring({ studentId: student.id });
    expect(view.rows[0]!.status).toBe('COMPLETED');
    expect(view.warnings).toEqual([]);
    await action(completed, 'corrections', { ...contentOf(completed), reason: 'Поздно' }).expect(
      409,
    );

    const archived = (
      await action(completed, 'archive', { reason: 'Учебный год завершён' }).expect(200)
    ).body as TrajectoryDto;
    expect(archived.status).toBe('ARCHIVED');
    expect((await monitoring({ studentId: student.id })).rows).toHaveLength(0);
  });
});
