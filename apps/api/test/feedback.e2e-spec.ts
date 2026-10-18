import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type CabinetConsultationDto,
  type CabinetFeedbackDto,
  type ConsultationDto,
  type FeedbackDto,
  type LibraryAssignmentDto,
  type NotificationsDto,
  type ReflectionDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type StudentSupportDto,
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
const inDays = (offset: number) =>
  new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString();

describe('Обратная связь, консультации, рефлексия и уведомления (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let groupId: string;
  let disciplineId: string;
  let task: LibraryAssignmentDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });
  const cabinet = async (session: LoggedIn) =>
    (await as(session, http().get('/api/cabinet/feedback')).expect(200)).body as CabinetFeedbackDto;
  const notifications = async (session: LoggedIn) =>
    (await as(session, http().get('/api/notifications')).expect(200)).body as NotificationsDto;
  const sendFeedback = (body: Record<string, unknown>, session = teacher) =>
    as(session, http().post('/api/feedback')).set('Idempotency-Key', key()).send(body);

  /** Студент с утверждённой ИОТ: в первом этапе задание и контрольная точка. */
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
                ? [{ assignmentId: task.id, dueAt: new Date(`${day(1)}T23:59:59`).toISOString() }]
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
    const admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    otherTeacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);
    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ОС-${tag}`, course: 1, specialty: 'Информатика' })
        .expect(201)
    ).body.id as string;
    disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Физика ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);
    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200)).body as {
      id: string;
    }[];
    task = (
      await as(teacher, http().post('/api/library-assignments'))
        .set('Idempotency-Key', key())
        .send({
          title: `Лабораторная ${tag}`,
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-068, FR-016, AT-12: внутренние заметки не уходят студенту ни в одном эндпоинте', async () => {
    const { student, session, trajectory } = await studentWithTrajectory('Заметки');
    const other = await studentWithTrajectory('Чужой');
    const secret = `СЕКРЕТ-${tag}`;

    const visible = (
      await sendFeedback({
        studentId: student.id,
        kind: 'RECOMMENDATION',
        visibility: 'STUDENT_VISIBLE',
        body: 'Повторите параграф 3',
        trajectoryId: trajectory.id,
      }).expect(201)
    ).body as FeedbackDto;
    await sendFeedback({
      studentId: student.id,
      kind: 'COMMENT',
      visibility: 'INTERNAL',
      body: `Заметка для коллег ${secret}`,
    }).expect(201);
    // Внутренний ответ в открытой студенту ветке.
    await as(teacher, http().post(`/api/feedback/${visible.id}/replies`))
      .set('Idempotency-Key', key())
      .send({ body: `Ответ ${secret}`, visibility: 'INTERNAL' })
      .expect(201);
    // Цель и запрос самооценки не бывают внутренними.
    await sendFeedback({
      studentId: student.id,
      kind: 'SHORT_TERM_GOAL',
      visibility: 'INTERNAL',
      body: 'Цель',
    }).expect(400);

    const consultation = (
      await as(teacher, http().post('/api/consultations'))
        .set('Idempotency-Key', key())
        .send({ studentId: student.id, topic: 'Разбор ошибок', scheduledAt: inDays(1) })
        .expect(201)
    ).body as ConsultationDto;
    const held = (
      await as(teacher, http().post(`/api/consultations/${consultation.id}/held`))
        .send({ summary: 'Разобрали задачи 1–3', internalNote: `Тревожность ${secret}` })
        .expect(200)
    ).body as ConsultationDto;
    expect(held.internalNote).toContain(secret);

    const support = (
      await as(teacher, http().get(`/api/students/${student.id}/support`)).expect(200)
    ).body as StudentSupportDto;
    expect(support.feedback).toHaveLength(2);
    expect(support.feedback.find((item) => item.id === visible.id)!.replies).toHaveLength(1);

    const own = await cabinet(session);
    expect(JSON.stringify(own)).not.toContain(secret);
    expect(own.feedback.map((item) => item.id)).toEqual([visible.id]);
    expect(own.feedback[0]!.replies).toHaveLength(0);
    expect(own.consultations[0]!.summary).toBe('Разобрали задачи 1–3');
    expect(own.consultations[0]).not.toHaveProperty('internalNote');
    // Ответить на внутреннюю ветку или чужую запись студент не может.
    const internalId = support.feedback.find((item) => item.visibility === 'INTERNAL')!.id;
    await as(session, http().post(`/api/cabinet/feedback/${internalId}/replies`))
      .set('Idempotency-Key', key())
      .send({ body: 'Ответ' })
      .expect(404);
    await as(other.session, http().post(`/api/cabinet/feedback/${visible.id}/replies`))
      .set('Idempotency-Key', key())
      .send({ body: 'Ответ' })
      .expect(404);
    expect((await cabinet(other.session)).feedback).toHaveLength(0);

    // Студенту и исследователю разделы преподавателя закрыты; чужой преподаватель не видит студента.
    await as(session, http().get('/api/feedback')).expect(403);
    await as(session, http().get(`/api/students/${student.id}/support`)).expect(403);
    await as(researcher, http().get('/api/feedback')).expect(403);
    await as(researcher, http().get('/api/consultations')).expect(403);
    await as(otherTeacher, http().get(`/api/students/${student.id}/support`)).expect(404);
    await as(otherTeacher, http().post(`/api/feedback/${visible.id}/replies`))
      .set('Idempotency-Key', key())
      .send({ body: 'Чужой ответ' })
      .expect(404);
    expect(
      (await as(otherTeacher, http().get('/api/feedback')).expect(200)).body as FeedbackDto[],
    ).toHaveLength(0);
  });

  it('FR-064, FR-065, FR-063: вопрос по заданию, ответ, уведомления и отметка «рассмотрено»', async () => {
    const { student, session, trajectory } = await studentWithTrajectory('Вопрос');
    const assignmentId = trajectory.stages[0]!.assignments[0]!.id;
    const before = (await notifications(teacher)).unread;

    const question = (
      await as(session, http().post('/api/cabinet/feedback'))
        .set('Idempotency-Key', key())
        .send({
          kind: 'QUESTION',
          body: 'Как оформить вывод?',
          trajectoryAssignmentId: assignmentId,
        })
        .expect(201)
    ).body as FeedbackDto;
    // Привязка задания уточняет этап и ИОТ.
    expect(question.assignment).toEqual({ id: assignmentId, title: task.title });
    expect(question.trajectory?.id).toBe(trajectory.id);
    expect(question.stage?.id).toBe(trajectory.stages[0]!.id);
    expect(question.fromStudent).toBe(true);

    const teacherInbox = await notifications(teacher);
    expect(teacherInbox.unread).toBe(before + 1);
    expect(teacherInbox.items[0]).toMatchObject({ type: 'feedback.created', link: '/feedback' });

    const open = (
      await as(teacher, http().get('/api/feedback'))
        .query({ groupId, source: 'student', open: 'true' })
        .expect(200)
    ).body as FeedbackDto[];
    expect(open.map((item) => item.id)).toContain(question.id);
    const byAssignment = (
      await as(teacher, http().get('/api/feedback'))
        .query({ trajectoryAssignmentId: assignmentId })
        .expect(200)
    ).body as FeedbackDto[];
    expect(byAssignment.map((item) => item.id)).toEqual([question.id]);

    await as(teacher, http().post(`/api/feedback/${question.id}/replies`))
      .set('Idempotency-Key', key())
      .send({ body: 'Сформулируйте вывод в двух предложениях' })
      .expect(201);
    const studentInbox = await notifications(session);
    expect(studentInbox.items[0]).toMatchObject({
      type: 'feedback.reply',
      link: `/student/assignments/${assignmentId}`,
    });
    const thread = (await cabinet(session)).feedback.find((item) => item.id === question.id)!;
    expect(thread.replies.map((reply) => reply.body)).toEqual([
      'Сформулируйте вывод в двух предложениях',
    ]);

    const resolved = (
      await as(teacher, http().post(`/api/feedback/${question.id}/resolve`)).expect(200)
    ).body as FeedbackDto;
    expect(resolved.resolvedAt).not.toBeNull();
    const stillOpen = (
      await as(teacher, http().get('/api/feedback')).query({ groupId, open: 'true' }).expect(200)
    ).body as FeedbackDto[];
    expect(stillOpen.map((item) => item.id)).not.toContain(question.id);

    // Сообщение преподавателя «рассмотренным» не отмечается.
    const goal = (
      await sendFeedback({
        studentId: student.id,
        kind: 'SHORT_TERM_GOAL',
        visibility: 'STUDENT_VISIBLE',
        body: 'Сдать лабораторную до пятницы',
        dueDate: day(4),
      }).expect(201)
    ).body as FeedbackDto;
    expect(goal.dueDate).toBe(day(4));
    await as(teacher, http().post(`/api/feedback/${goal.id}/resolve`)).expect(400);

    // Привязка к чужой ИОТ отклоняется.
    const stranger = await studentWithTrajectory('Посторонний');
    await as(session, http().post('/api/cabinet/feedback'))
      .set('Idempotency-Key', key())
      .send({ kind: 'QUESTION', body: 'Вопрос', trajectoryId: stranger.trajectory.id })
      .expect(400);

    // Уведомления: чужое не отмечается, «прочитать все» обнуляет счётчик.
    const mine = studentInbox.items[0]!;
    await as(teacher, http().post(`/api/notifications/${mine.id}/read`)).expect(404);
    const read = (await as(session, http().post(`/api/notifications/${mine.id}/read`)).expect(200))
      .body as { readAt: string | null };
    expect(read.readAt).not.toBeNull();
    const cleared = (await as(session, http().post('/api/notifications/read-all')).expect(200))
      .body as NotificationsDto;
    expect(cleared.unread).toBe(0);
  });

  it('FR-008: сообщение о затруднении отражается в фильтре студентов до рассмотрения', async () => {
    const { student, session } = await studentWithTrajectory('Затруднение');
    const withDifficulties = async () =>
      (
        (
          await as(teacher, http().get('/api/students'))
            .query({ groupId, hasDifficulties: 'true' })
            .expect(200)
        ).body as { items: { id: string }[] }
      ).items.map((item) => item.id);
    expect(await withDifficulties()).not.toContain(student.id);
    const report = (
      await as(session, http().post('/api/cabinet/feedback'))
        .set('Idempotency-Key', key())
        .send({ kind: 'DIFFICULTY_REPORT', body: 'Не понимаю тему про давление' })
        .expect(201)
    ).body as FeedbackDto;
    expect(await withDifficulties()).toContain(student.id);
    await as(teacher, http().post(`/api/feedback/${report.id}/resolve`)).expect(200);
    expect(await withDifficulties()).not.toContain(student.id);
  });

  it('FR-067: запрос, назначение, проведение и история консультаций', async () => {
    const { student, session, trajectory } = await studentWithTrajectory('Консультация');
    const requested = (
      await as(session, http().post('/api/cabinet/feedback/consultations'))
        .set('Idempotency-Key', key())
        .send({ topic: 'Подготовка к контрольной', trajectoryId: trajectory.id })
        .expect(201)
    ).body as CabinetConsultationDto;
    expect(requested).toMatchObject({ status: 'REQUESTED', requestedByStudent: true });
    expect(requested).not.toHaveProperty('internalNote');
    expect((await notifications(teacher)).items[0]!.type).toBe('consultation.requested');

    const listed = (
      await as(teacher, http().get('/api/consultations'))
        .query({ groupId, status: 'REQUESTED' })
        .expect(200)
    ).body as ConsultationDto[];
    expect(listed.map((item) => item.id)).toContain(requested.id);

    await as(teacher, http().post(`/api/consultations/${requested.id}/schedule`))
      .send({ scheduledAt: inDays(-3) })
      .expect(400);
    const scheduled = (
      await as(teacher, http().post(`/api/consultations/${requested.id}/schedule`))
        .send({ scheduledAt: inDays(2) })
        .expect(200)
    ).body as ConsultationDto;
    expect(scheduled.status).toBe('SCHEDULED');
    expect(scheduled.teacher).not.toBeNull();
    expect((await notifications(session)).items[0]!.type).toBe('consultation.scheduled');

    await as(teacher, http().post(`/api/consultations/${requested.id}/held`))
      .send({ heldAt: inDays(1) })
      .expect(400);
    await as(teacher, http().post(`/api/consultations/${requested.id}/held`))
      .send({ summary: 'Составили план повторения' })
      .expect(200);
    await as(teacher, http().post(`/api/consultations/${requested.id}/cancel`))
      .send({ reason: 'Ошибка' })
      .expect(409);

    const second = (
      await as(teacher, http().post('/api/consultations'))
        .set('Idempotency-Key', key())
        .send({ studentId: student.id, topic: 'Повторная встреча', scheduledAt: inDays(5) })
        .expect(201)
    ).body as ConsultationDto;
    await as(teacher, http().post(`/api/consultations/${second.id}/cancel`))
      .send({})
      .expect(400);
    const cancelled = (
      await as(teacher, http().post(`/api/consultations/${second.id}/cancel`))
        .send({ reason: 'Студент заболел' })
        .expect(200)
    ).body as ConsultationDto;
    expect(cancelled.status).toBe('CANCELLED');

    const support = (
      await as(teacher, http().get(`/api/students/${student.id}/support`)).expect(200)
    ).body as StudentSupportDto;
    expect(support.consultations.map((item) => item.status).sort()).toEqual(['CANCELLED', 'HELD']);
    const history = (
      await as(teacher, http().get(`/api/students/${student.id}/history`)).expect(200)
    ).body as StudentHistoryItemDto[];
    const actions = history.map((item) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'consultation.requested',
        'consultation.scheduled',
        'consultation.held',
        'consultation.cancelled',
      ]),
    );
    expect(history.find((item) => item.action === 'consultation.cancelled')!.reason).toBe(
      'Студент заболел',
    );
  });

  it('FR-066, NFR-006: рефлексия после контрольной точки — одна на точку, без дублей', async () => {
    const { student, session, trajectory } = await studentWithTrajectory('Рефлексия');
    const checkpoint = trajectory.stages[0]!.checkpoints[0]!;
    const reflect = (body: Record<string, unknown>, idempotencyKey = key()) =>
      as(session, http().post('/api/cabinet/feedback/reflections'))
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

    expect((await cabinet(session)).pendingReflections).toHaveLength(0);
    await reflect({ checkpointId: checkpoint.id, achievements: 'Всё понял' }).expect(409);

    await as(
      teacher,
      http().post(`/api/trajectories/${trajectory.id}/checkpoints/${checkpoint.id}/status`),
    )
      .send({ status: 'PASSED' })
      .expect(200);
    expect((await notifications(session)).items[0]).toMatchObject({
      type: 'reflection.requested',
      link: '/student/feedback',
    });
    const pending = (await cabinet(session)).pendingReflections;
    expect(pending.map((item) => item.checkpointId)).toEqual([checkpoint.id]);

    await reflect({ checkpointId: checkpoint.id }).expect(400);
    await reflect({ checkpointId: checkpoint.id, selfAssessment: 7 }).expect(400);
    const repeatKey = key();
    const body = {
      checkpointId: checkpoint.id,
      selfAssessment: 4,
      achievements: 'Решил все задачи',
      difficulties: 'Графики',
      nextSteps: 'Повторить построение графиков',
    };
    const first = (await reflect(body, repeatKey).expect(201)).body as ReflectionDto;
    const replay = (await reflect(body, repeatKey).expect(201)).body as ReflectionDto;
    expect(replay.id).toBe(first.id);
    await reflect(body).expect(409);
    expect(await prisma.reflection.count({ where: { studentId: student.id } })).toBe(1);
    expect((await cabinet(session)).pendingReflections).toHaveLength(0);
    expect((await notifications(teacher)).items[0]!.type).toBe('reflection.created');

    const support = (
      await as(teacher, http().get(`/api/students/${student.id}/support`)).expect(200)
    ).body as StudentSupportDto;
    expect(support.reflections[0]).toMatchObject({
      selfAssessment: 4,
      checkpoint: { id: checkpoint.id, title: checkpoint.title },
    });

    // Точку с рефлексией нельзя удалить при корректировке, даже вернув её в «Ожидается».
    await as(
      teacher,
      http().post(`/api/trajectories/${trajectory.id}/checkpoints/${checkpoint.id}/status`),
    )
      .send({ status: 'PENDING' })
      .expect(200);
    const current = (
      await as(teacher, http().get(`/api/trajectories/${trajectory.id}`)).expect(200)
    ).body as TrajectoryDto;
    const correction = await as(
      teacher,
      http().post(`/api/trajectories/${trajectory.id}/corrections`),
    )
      .send({
        updatedAt: current.updatedAt,
        reason: 'Убрать точку',
        goals: current.goals,
        plannedResults: current.plannedResults,
        supportMethods: current.supportMethods,
        startDate: current.startDate,
        plannedEndDate: current.plannedEndDate,
        stages: current.stages.map((stage, index) => ({
          id: stage.id,
          title: stage.title,
          goal: stage.goal,
          description: stage.description,
          plannedResults: stage.plannedResults,
          startDate: stage.startDate,
          endDate: stage.endDate,
          checkpoints: (index === 0 ? [] : stage.checkpoints).map((item) => ({
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
      })
      .expect(400);
    expect(JSON.stringify(correction.body)).toContain('рефлексию');
  });

  it('FR-066: ответ на запрос самооценки закрывает запрос', async () => {
    const { student, session } = await studentWithTrajectory('Самооценка');
    const requestRow = (
      await sendFeedback({
        studentId: student.id,
        kind: 'SELF_ASSESSMENT_REQUEST',
        visibility: 'STUDENT_VISIBLE',
        body: 'Оцените, как прошёл первый этап',
        dueDate: day(3),
      }).expect(201)
    ).body as FeedbackDto;
    expect((await notifications(session)).items[0]!.type).toBe('feedback.created');
    await as(session, http().post('/api/cabinet/feedback/reflections'))
      .set('Idempotency-Key', key())
      .send({ requestId: requestRow.id, selfAssessment: 3, difficulties: 'Мало времени' })
      .expect(201);
    const own = await cabinet(session);
    expect(own.feedback.find((item) => item.id === requestRow.id)!.resolvedAt).not.toBeNull();
    expect(own.reflections[0]!.selfAssessment).toBe(3);
    await as(session, http().post('/api/cabinet/feedback/reflections'))
      .set('Idempotency-Key', key())
      .send({ requestId: requestRow.id, selfAssessment: 5 })
      .expect(409);
  });
});
