import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AssignmentReviewDto,
  type AssignmentWorkDto,
  type CabinetAssignmentsDto,
  type FileDto,
  type LibraryAssignmentDto,
  type ReviewQueueItemDto,
  RoleCode,
  type StudentAssignmentDto,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const dueAt = (date: string) => new Date(`${date}T23:59:59`).toISOString();

describe('Сдача и проверка заданий (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let groupId: string;
  let disciplineId: string;
  let scored: LibraryAssignmentDto;
  let plain: LibraryAssignmentDto;
  let linkOnly: LibraryAssignmentDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function studentWithSession(lastName: string) {
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
    return {
      student: created.student,
      session: await login(app, created.login, created.temporaryPassword!),
    };
  }

  /** Назначает задание студенту и возвращает id назначения. */
  async function assignTo(studentId: string, task: LibraryAssignmentDto, due?: string) {
    await as(teacher, http().post('/api/student-assignments'))
      .set('Idempotency-Key', key())
      .send({ assignmentIds: [task.id], studentIds: [studentId], dueAt: due ?? null })
      .expect(201);
    const row = await prisma.trajectoryAssignment.findFirstOrThrow({
      where: { studentId, assignmentId: task.id },
    });
    return row.id;
  }

  const upload = async (session: LoggedIn, name: string, path = '/api/cabinet/files') =>
    (
      await as(session, http().post(path))
        .attach('file', Buffer.from(`Ответ ${name}`), name)
        .expect(201)
    ).body as FileDto;
  const submit = (session: LoggedIn, id: string, body: Record<string, unknown>, idem = key()) =>
    as(session, http().post(`/api/cabinet/assignments/${id}/submissions`))
      .set('Idempotency-Key', idem)
      .send(body);
  const assess = (id: string, body: Record<string, unknown>, session = teacher, idem = key()) =>
    as(session, http().post(`/api/student-assignments/${id}/assessments`))
      .set('Idempotency-Key', idem)
      .send(body);
  const review = async (id: string) =>
    (await as(teacher, http().get(`/api/student-assignments/${id}`)).expect(200))
      .body as AssignmentReviewDto;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    otherTeacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);

    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `СДА-${tag}`, course: 2, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Математика ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);

    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200)).body as {
      id: string;
    }[];
    const task = async (title: string, formats: string[], criteria: object[]) =>
      (
        await as(teacher, http().post('/api/library-assignments'))
          .set('Idempotency-Key', key())
          .send({
            title: `${title} ${tag}`,
            disciplineId,
            difficulty: 'BASIC',
            typeId: types[0]!.id,
            instruction: 'Решите и опишите ход решения',
            submissionFormats: formats,
            criteria,
            attachments: [],
          })
          .expect(201)
      ).body as LibraryAssignmentDto;
    scored = await task(
      'Уравнения',
      ['TEXT', 'FILE'],
      [
        { title: 'Верность', maxScore: 5 },
        { title: 'Оформление', maxScore: 2.5 },
      ],
    );
    plain = await task('Эссе', ['TEXT'], []);
    linkOnly = await task('Проект', ['LINK'], []);
  });

  afterAll(async () => {
    await app.close();
  });

  it('UC-04, AT-07: студент сдаёт задание, преподаватель возвращает и принимает по критериям', async () => {
    const { student, session } = await studentWithSession('Сдающий');
    const id = await assignTo(student.id, scored, dueAt('2030-12-31'));

    // Приступить: «Назначено» → «Выполняется».
    const started = (
      await as(session, http().post(`/api/cabinet/assignments/${id}/start`)).expect(200)
    ).body as AssignmentWorkDto;
    expect(started.status).toBe('IN_PROGRESS');

    // Ответ текстом и файлом, загруженным через кабинет.
    const file = await upload(session, 'reshenie.txt');
    const idem = key();
    const body = { text: 'x = 2', fileIds: [file.id] };
    const sent = (await submit(session, id, body, idem).expect(201)).body as AssignmentWorkDto;
    expect(sent.status).toBe('SUBMITTED');
    expect(sent.submissions).toHaveLength(1);
    expect(sent.submissions[0]).toMatchObject({
      attemptNumber: 1,
      text: 'x = 2',
      url: null,
      late: false,
      assessment: null,
      files: [{ id: file.id, originalName: 'reshenie.txt' }],
    });

    // NFR-006: повтор формы не создаёт вторую попытку; снова отправить нельзя.
    await submit(session, id, body, idem).expect(201);
    expect(await prisma.submission.count({ where: { trajectoryAssignmentId: id } })).toBe(1);
    await submit(session, id, { text: 'ещё' }).expect(409);

    // Преподаватель видит ответ в очереди и скачивает файл.
    const queue = (await as(teacher, http().get('/api/student-assignments/review')).expect(200))
      .body as ReviewQueueItemDto[];
    expect(queue.find((item) => item.id === id)).toMatchObject({
      student: { id: student.id },
      attemptNumber: 1,
      late: false,
    });
    const downloaded = await as(
      teacher,
      http().get(`/api/student-assignments/files/${file.id}`),
    ).expect(200);
    expect(downloaded.text).toBe('Ответ reshenie.txt');
    const teacherUserId = teacher.body.user.id;
    expect(
      await prisma.notification.count({
        where: { userId: teacherUserId, type: 'assignment.submitted', entityId: id },
      }),
    ).toBe(1);

    // FR-051: возврат на доработку требует комментария; баллы не ставятся.
    const submissionId = sent.submissions[0]!.id;
    await assess(id, { submissionId, decision: 'RETURNED' }).expect(400);
    const returned = (
      await assess(id, {
        submissionId,
        decision: 'RETURNED',
        comment: 'Добавьте проверку корня',
      }).expect(201)
    ).body as AssignmentReviewDto;
    expect(returned.status).toBe('RETURNED');
    expect(returned.submissions[0]!.assessment).toMatchObject({
      decision: 'RETURNED',
      score: null,
      comment: 'Добавьте проверку корня',
    });
    await assess(id, { submissionId, decision: 'ACCEPTED' }).expect(409);

    // Студент видит комментарий и сдаёт повторно — новая попытка.
    const own = (await as(session, http().get(`/api/cabinet/assignments/${id}`)).expect(200))
      .body as AssignmentWorkDto;
    expect(own.submissions[0]!.assessment!.comment).toBe('Добавьте проверку корня');
    const again = (await submit(session, id, { text: 'x = 2, проверка: 2·2 = 4' }).expect(201))
      .body as AssignmentWorkDto;
    expect(again.submissions.map((item) => item.attemptNumber)).toEqual([1, 2]);

    // Старая попытка не проверяется; баллы — по каждому критерию в пределах максимума.
    const [verity, layout] = again.criteria;
    await assess(id, { submissionId, decision: 'ACCEPTED' }).expect(409);
    const latest = again.submissions[1]!.id;
    await assess(id, {
      submissionId: latest,
      decision: 'ACCEPTED',
      criterionScores: [
        { criterionId: verity!.id, score: 6 },
        { criterionId: layout!.id, score: 2 },
      ],
    }).expect(400);
    await assess(id, {
      submissionId: latest,
      decision: 'ACCEPTED',
      criterionScores: [{ criterionId: verity!.id, score: 5 }],
    }).expect(400);
    const accepted = (
      await assess(id, {
        submissionId: latest,
        decision: 'ACCEPTED',
        comment: 'Верно',
        criterionScores: [
          { criterionId: verity!.id, score: 5 },
          { criterionId: layout!.id, score: 2, comment: 'Не подписан ответ' },
        ],
      }).expect(201)
    ).body as AssignmentReviewDto;
    expect(accepted.status).toBe('COMPLETED');
    expect(accepted.completedAt).not.toBeNull();
    expect(accepted.submissions[1]!.assessment).toMatchObject({
      decision: 'ACCEPTED',
      score: 7,
      maxScore: 7.5,
      criterionScores: [
        { title: 'Верность', score: 5, maxScore: 5, comment: null },
        { title: 'Оформление', score: 2, maxScore: 2.5, comment: 'Не подписан ответ' },
      ],
    });

    // Оценка — в учебных достижениях; итог — в списках; события — в истории студента.
    const results = await prisma.academicResult.findMany({ where: { trajectoryAssignmentId: id } });
    expect(results).toHaveLength(1);
    expect(Number(results[0]!.score)).toBe(7);
    expect(Number(results[0]!.maxScore)).toBe(7.5);
    const tab = (
      await as(teacher, http().get('/api/student-assignments'))
        .query({ studentId: student.id })
        .expect(200)
    ).body as StudentAssignmentDto[];
    expect(tab.find((item) => item.id === id)!.result).toMatchObject({
      decision: 'ACCEPTED',
      score: 7,
      maxScore: 7.5,
    });
    const cabinet = (await as(session, http().get('/api/cabinet/assignments')).expect(200))
      .body as CabinetAssignmentsDto;
    expect(cabinet.items.find((item) => item.id === id)!.status).toBe('COMPLETED');
    const history = (
      await as(teacher, http().get(`/api/students/${student.id}/history`)).expect(200)
    ).body as StudentHistoryItemDto[];
    expect(history.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'assignment.submitted',
        'assignment.returned',
        'assignment.accepted',
      ]),
    );
    const userId = (await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).userId!;
    expect(
      await prisma.notification.count({
        where: { userId, type: { in: ['assignment.returned', 'assignment.accepted'] } },
      }),
    ).toBe(2);
  });

  it('FR-050: только разрешённые форматы, непустой ответ и свои файлы', async () => {
    const { student, session } = await studentWithSession('Формат');
    const id = await assignTo(student.id, scored);
    await submit(session, id, { url: 'https://example.org/work' }).expect(400);
    await submit(session, id, { text: '   ' }).expect(400);
    const foreign = await upload(teacher, 'chuzhoy.txt', '/api/files');
    await submit(session, id, { fileIds: [foreign.id] }).expect(400);
    await submit(session, id, { url: 'javascript:alert(1)' }).expect(400);

    const linkId = await assignTo(student.id, linkOnly);
    const sent = (await submit(session, linkId, { url: 'https://example.org/project' }).expect(201))
      .body as AssignmentWorkDto;
    expect(sent.submissions[0]!.url).toBe('https://example.org/project');
    expect(await prisma.submission.count({ where: { trajectoryAssignmentId: id } })).toBe(0);
  });

  it('FR-052, FR-053: задание без критериев принимается без балла; сдача после срока отмечается', async () => {
    const { student, session } = await studentWithSession('Поздний');
    const id = await assignTo(student.id, plain, dueAt('2020-01-10'));
    const sent = (await submit(session, id, { text: 'Эссе' }).expect(201))
      .body as AssignmentWorkDto;
    expect(sent.submissions[0]!.late).toBe(true);
    const accepted = (
      await assess(id, { submissionId: sent.submissions[0]!.id, decision: 'ACCEPTED' }).expect(201)
    ).body as AssignmentReviewDto;
    expect(accepted.submissions[0]!.assessment).toMatchObject({ score: null, maxScore: null });
    expect(await prisma.academicResult.count({ where: { trajectoryAssignmentId: id } })).toBe(0);
  });

  it('FR-042, FR-055: принятое задание завершает этап ИОТ, текущим становится следующий', async () => {
    const { student, session } = await studentWithSession('Маршрут');
    const options = (
      await as(teacher, http().get(`/api/students/${student.id}/trajectory-options`)).expect(200)
    ).body as TrajectoryOptionsDto;
    const draft = (
      await as(teacher, http().post('/api/trajectories'))
        .set('Idempotency-Key', key())
        .send({
          studentId: student.id,
          disciplineId,
          templateId: options.templates.find((template) => template.isStandard)!.id,
        })
        .expect(201)
    ).body as TrajectoryDto;
    const months = ['09', '10', '11', '12', '01'];
    const filled = (
      await as(teacher, http().put(`/api/trajectories/${draft.id}`))
        .send({
          updatedAt: draft.updatedAt,
          goals: 'Освоить уравнения',
          startDate: '2026-09-01',
          plannedEndDate: '2027-01-31',
          stages: draft.stages.map((stage, index) => {
            const year = index === 4 ? '2027' : '2026';
            const end = `${year}-${months[index]}-28`;
            return {
              id: stage.id,
              title: stage.title,
              goal: stage.goal,
              startDate: `${year}-${months[index]}-01`,
              endDate: end,
              checkpoints: [{ title: `КТ ${index + 1}`, dueDate: end }],
              materialIds: [],
              assignments:
                index === 0 ? [{ assignmentId: plain.id, dueAt: dueAt('2026-09-20') }] : [],
            };
          }),
        })
        .expect(200)
    ).body as TrajectoryDto;
    const approved = (
      await as(teacher, http().post(`/api/trajectories/${draft.id}/approve`))
        .send({ updatedAt: filled.updatedAt })
        .expect(200)
    ).body as TrajectoryDto;
    const [first, second] = approved.stages;
    expect(approved.currentStageId).toBe(first!.id);
    const id = first!.assignments[0]!.id;

    const sent = (await submit(session, id, { text: 'Готово' }).expect(201))
      .body as AssignmentWorkDto;
    await assess(id, { submissionId: sent.submissions[0]!.id, decision: 'ACCEPTED' }).expect(201);

    const after = (await as(teacher, http().get(`/api/trajectories/${draft.id}`)).expect(200))
      .body as TrajectoryDto;
    expect(after.stages[0]).toMatchObject({ status: 'COMPLETED' });
    expect(after.stages[0]!.assignments[0]!.status).toBe('COMPLETED');
    expect(after.currentStageId).toBe(second!.id);
    expect(after.stages[1]!.status).toBe('IN_PROGRESS');
    // Ход выполнения — не корректировка: версия маршрута прежняя.
    expect(after.version).toBe(approved.version);
  });

  it('AT-12, FR-002: чужие задания и ответы недоступны; студенту проверка — 403', async () => {
    const owner = await studentWithSession('Владелец');
    const stranger = await studentWithSession('Чужой');
    const id = await assignTo(owner.student.id, scored);
    const file = await upload(owner.session, 'moy.txt');
    await submit(owner.session, id, { fileIds: [file.id] }).expect(201);

    await submit(stranger.session, id, { text: 'чужое' }).expect(404);
    await as(stranger.session, http().post(`/api/cabinet/assignments/${id}/start`)).expect(404);
    await as(stranger.session, http().get(`/api/cabinet/files/${file.id}`)).expect(404);
    await as(owner.session, http().get(`/api/cabinet/files/${file.id}`)).expect(200);

    await as(owner.session, http().get('/api/student-assignments/review')).expect(403);
    await as(owner.session, http().get(`/api/student-assignments/${id}`)).expect(403);

    await as(otherTeacher, http().get(`/api/student-assignments/${id}`)).expect(404);
    await as(otherTeacher, http().get(`/api/student-assignments/files/${file.id}`)).expect(404);
    const foreignQueue = (
      await as(otherTeacher, http().get('/api/student-assignments/review')).expect(200)
    ).body as ReviewQueueItemDto[];
    expect(foreignQueue.some((item) => item.id === id)).toBe(false);
    const submissionId = (await review(id)).submissions[0]!.id;
    await assess(id, { submissionId, decision: 'RETURNED', comment: 'нет' }, otherTeacher).expect(
      404,
    );
  });
});
