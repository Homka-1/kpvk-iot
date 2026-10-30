import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AssignTasksResultDto,
  type CabinetAssignmentDetailDto,
  type CabinetAssignmentsDto,
  type CabinetTrajectoryDto,
  type FileDto,
  type LibraryAssignmentDto,
  type MaterialDto,
  RoleCode,
  type RouteProposalDto,
  type StudentAssignmentDto,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
  type TrajectorySnapshot,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const dueAt = (date: string) => new Date(`${date}T23:59:59`).toISOString();

describe('Карта ИОТ, кабинет студента и назначение заданий (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let groupId: string;
  let otherGroupId: string;
  let disciplineId: string;
  let material: MaterialDto;
  let tasks: LibraryAssignmentDto[];
  let foreignTask: LibraryAssignmentDto;
  let attachmentFile: FileDto;
  let foreignFile: FileDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function createStudent(lastName: string, group = groupId): Promise<StudentCreatedDto> {
    return (
      await as(teacher, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId: group })
        .expect(201)
    ).body as StudentCreatedDto;
  }

  async function studentLogin(created: StudentCreatedDto): Promise<LoggedIn> {
    await prisma.user.update({
      where: { login: created.login },
      data: { mustChangePassword: false },
    });
    return login(app, created.login, created.temporaryPassword!);
  }

  /** Студент с учётной записью и входом в кабинет. */
  async function studentWithSession(lastName: string) {
    const created = await createStudent(lastName);
    return { student: created.student, session: await studentLogin(created) };
  }

  const assign = (body: Record<string, unknown>, session = teacher, idem = key()) =>
    as(session, http().post('/api/student-assignments')).set('Idempotency-Key', idem).send(body);
  const cabinet = async (session: LoggedIn) =>
    (await as(session, http().get('/api/cabinet/assignments')).expect(200))
      .body as CabinetAssignmentsDto;
  const cabinetTrajectories = async (session: LoggedIn) =>
    (await as(session, http().get('/api/cabinet/trajectories')).expect(200))
      .body as CabinetTrajectoryDto[];

  /** Заполненный и (по желанию) утверждённый маршрут с материалом и заданием в первом этапе. */
  async function trajectoryFor(studentId: string, approve: boolean): Promise<TrajectoryDto> {
    const options = (
      await as(teacher, http().get(`/api/students/${studentId}/trajectory-options`)).expect(200)
    ).body as TrajectoryOptionsDto;
    const standard = options.templates.find((template) => template.isStandard)!;
    const draft = (
      await as(teacher, http().post('/api/trajectories'))
        .set('Idempotency-Key', key())
        .send({ studentId, disciplineId, templateId: standard.id })
        .expect(201)
    ).body as TrajectoryDto;
    const months = ['09', '10', '11', '12', '01'];
    const filled = (
      await as(teacher, http().put(`/api/trajectories/${draft.id}`))
        .send({
          updatedAt: draft.updatedAt,
          goals: 'Освоить линейные уравнения',
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
              checkpoints: [{ title: `Контрольная точка ${index + 1}`, dueDate: end }],
              materialIds: index === 0 ? [material.id] : [],
              assignments:
                index === 0 ? [{ assignmentId: tasks[2]!.id, dueAt: dueAt('2026-09-20') }] : [],
            };
          }),
        })
        .expect(200)
    ).body as TrajectoryDto;
    if (!approve) return filled;
    return (
      await as(teacher, http().post(`/api/trajectories/${draft.id}/approve`))
        .send({ updatedAt: filled.updatedAt })
        .expect(200)
    ).body as TrajectoryDto;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    const otherUser = await createUser(app, { role: RoleCode.TEACHER });
    otherTeacher = await login(app, otherUser.login);

    const group = async (name: string) =>
      (
        await as(admin, http().post('/api/groups'))
          .send({ name, course: 2, specialty: 'Программное обеспечение' })
          .expect(201)
      ).body.id as string;
    groupId = await group(`ЗАД-${tag}`);
    otherGroupId = await group(`ЗАД2-${tag}`);
    const discipline = async (name: string) =>
      (await as(admin, http().post('/api/disciplines')).send({ name }).expect(201)).body
        .id as string;
    disciplineId = await discipline(`Математика ${tag}`);
    const foreignDisciplineId = await discipline(`Химия ${tag}`);
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: otherUser.id, groupId: otherGroupId, disciplineId: foreignDisciplineId })
      .expect(201);

    const upload = async (session: LoggedIn, name: string) =>
      (
        await as(session, http().post('/api/files'))
          .attach('file', Buffer.from(`Файл ${name}`), name)
          .expect(201)
      ).body as FileDto;
    attachmentFile = await upload(teacher, 'instruction.txt');
    foreignFile = await upload(otherTeacher, 'foreign.txt');
    material = (
      await as(teacher, http().post('/api/materials'))
        .set('Idempotency-Key', key())
        .send({ title: `Памятка ${tag}`, kind: 'TEXT', body: 'Правило переноса', disciplineId })
        .expect(201)
    ).body as MaterialDto;

    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200)).body as {
      id: string;
    }[];
    const task = async (session: LoggedIn, title: string, discipline: string, files: FileDto[]) =>
      (
        await as(session, http().post('/api/library-assignments'))
          .set('Idempotency-Key', key())
          .send({
            title,
            disciplineId: discipline,
            difficulty: 'BASIC',
            typeId: types[0]!.id,
            instruction: 'Решите уравнения',
            submissionFormats: ['TEXT', 'FILE'],
            criteria: [{ title: 'Верность', maxScore: 100 }],
            attachments: files.map((file) => ({ fileId: file.id })),
          })
          .expect(201)
      ).body as LibraryAssignmentDto;
    tasks = [
      await task(teacher, `Уравнения ${tag}`, disciplineId, [attachmentFile]),
      await task(teacher, `Неравенства ${tag}`, disciplineId, []),
      await task(teacher, `Системы ${tag}`, disciplineId, []),
      await task(teacher, `Графики ${tag}`, disciplineId, []),
    ];
    foreignTask = await task(otherTeacher, `Реакции ${tag}`, foreignDisciplineId, [foreignFile]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-048: назначение одному студенту, нескольким и группе; дубли пропускаются с причиной', async () => {
    const first = await studentWithSession('Один');
    const second = await studentWithSession('Второй');

    const one = (
      await assign({
        assignmentIds: [tasks[0]!.id],
        studentIds: [first.student.id],
        dueAt: dueAt('2026-11-01'),
      }).expect(201)
    ).body as AssignTasksResultDto;
    expect(one.assigned.map((item) => item.id)).toEqual([first.student.id]);
    expect(one.skipped).toEqual([]);

    const several = (
      await assign({
        assignmentIds: [tasks[0]!.id],
        studentIds: [first.student.id, second.student.id],
      }).expect(201)
    ).body as AssignTasksResultDto;
    expect(several.assigned.map((item) => item.id)).toEqual([second.student.id]);
    expect(several.skipped).toEqual([
      {
        student: { id: first.student.id, fullName: expect.any(String) },
        reason: 'Задание уже назначено',
      },
    ]);

    const whole = (await assign({ assignmentIds: [tasks[1]!.id], groupId }).expect(201))
      .body as AssignTasksResultDto;
    expect(whole.assigned.map((item) => item.id)).toEqual(
      expect.arrayContaining([first.student.id, second.student.id]),
    );

    // Студент видит назначенное задание со сроком; уведомление пришло.
    const own = await cabinet(first.session);
    const item = own.items.find((row) => row.assignment.id === tasks[0]!.id)!;
    expect(item).toMatchObject({
      status: 'ASSIGNED',
      dueAt: dueAt('2026-11-01'),
      trajectory: null,
      discipline: { id: disciplineId },
    });
    expect(own.items.some((row) => row.assignment.id === tasks[1]!.id)).toBe(true);
    const userId = (await prisma.student.findUniqueOrThrow({ where: { id: first.student.id } }))
      .userId!;
    expect(
      await prisma.notification.count({ where: { userId, type: 'assignment.assigned' } }),
    ).toBe(2);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'assignment.assigned', entityId: tasks[0]!.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    // Вкладка «Задания» профиля у преподавателя.
    const tab = (
      await as(teacher, http().get('/api/student-assignments'))
        .query({ studentId: first.student.id })
        .expect(200)
    ).body as StudentAssignmentDto[];
    expect(tab.map((row) => row.assignment.id).sort()).toEqual([tasks[0]!.id, tasks[1]!.id].sort());
    expect(tab[0]!.assignedBy).not.toBeNull();
  });

  it('NFR-006: повторная отправка формы назначения не создаёт дублей', async () => {
    const { student } = await studentWithSession('Повтор');
    const idem = key();
    const body = { assignmentIds: [tasks[3]!.id], studentIds: [student.id] };
    const first = (await assign(body, teacher, idem).expect(201)).body as AssignTasksResultDto;
    const again = (await assign(body, teacher, idem).expect(201)).body as AssignTasksResultDto;
    expect(again).toEqual(first);
    expect(
      await prisma.trajectoryAssignment.count({
        where: { studentId: student.id, assignmentId: tasks[3]!.id },
      }),
    ).toBe(1);
  });

  it('FR-002: назначать можно только задания своих дисциплин своим студентам; студенту — 403', async () => {
    const { student, session } = await studentWithSession('Область');
    await assign({ assignmentIds: [foreignTask.id], studentIds: [student.id] }).expect(400);
    const res = await assign(
      { assignmentIds: [foreignTask.id], studentIds: [student.id] },
      otherTeacher,
    ).expect(400);
    expect(res.body.fields).toHaveProperty('studentIds');
    await assign({ assignmentIds: [tasks[0]!.id], groupId: otherGroupId }).expect(400);
    await assign({ assignmentIds: [tasks[0]!.id] }).expect(400);
    await assign({ assignmentIds: [tasks[0]!.id], studentIds: [student.id] }, session).expect(403);
    await as(session, http().get('/api/student-assignments'))
      .query({ studentId: student.id })
      .expect(403);
    await as(otherTeacher, http().get('/api/student-assignments'))
      .query({ studentId: student.id })
      .expect(404);
  });

  it('FR-054: студент выбирает из равнозначных заданий один раз', async () => {
    const { student, session } = await studentWithSession('Выбор');
    await assign({
      assignmentIds: [tasks[1]!.id, tasks[2]!.id],
      studentIds: [student.id],
      choice: { title: 'Задача на выбор', requiredCount: 2 },
    }).expect(400);
    await assign({
      assignmentIds: [tasks[1]!.id, tasks[2]!.id, tasks[3]!.id],
      studentIds: [student.id],
      choice: { title: 'Задача на выбор', requiredCount: 1 },
      dueAt: dueAt('2026-12-01'),
    }).expect(201);

    let own = await cabinet(session);
    expect(own.items).toEqual([]);
    expect(own.choices).toHaveLength(1);
    const choice = own.choices[0]!;
    expect(choice).toMatchObject({ title: 'Задача на выбор', requiredCount: 1 });
    expect(choice.options.map((option) => option.status)).toEqual([
      'OFFERED',
      'OFFERED',
      'OFFERED',
    ]);

    const choose = (optionIds: string[]) =>
      as(session, http().post(`/api/cabinet/assignment-choices/${choice.id}/choose`)).send({
        optionIds,
      });
    await choose(choice.options.slice(0, 2).map((option) => option.id)).expect(400);
    own = (await choose([choice.options[1]!.id]).expect(200)).body as CabinetAssignmentsDto;
    expect(own.choices).toEqual([]);
    expect(own.items.map((item) => [item.assignment.id, item.status])).toEqual([
      [choice.options[1]!.assignment.id, 'ASSIGNED'],
    ]);
    await choose([choice.options[0]!.id]).expect(409);
    expect(
      await prisma.trajectoryAssignment.count({
        where: { choiceGroupId: choice.id, status: 'DECLINED' },
      }),
    ).toBe(2);

    // Другой студент чужой набор не выбирает (AT-12).
    const stranger = await studentWithSession('Чужой');
    await as(stranger.session, http().post(`/api/cabinet/assignment-choices/${choice.id}/choose`))
      .send({ optionIds: [choice.options[0]!.id] })
      .expect(404);
  });

  it('FR-048: отмена не начатого задания; задание этапа ИОТ отменяется только корректировкой', async () => {
    const { student, session } = await studentWithSession('Отмена');
    await assign({ assignmentIds: [tasks[0]!.id], studentIds: [student.id] }).expect(201);
    const [row] = (await cabinet(session)).items;
    const cancel = (id: string, reason = 'Назначено по ошибке') =>
      as(teacher, http().post(`/api/student-assignments/${id}/cancel`)).send({ reason });
    await as(otherTeacher, http().post(`/api/student-assignments/${row!.id}/cancel`))
      .send({ reason: 'Чужое' })
      .expect(404);
    await cancel(row!.id).expect(204);
    expect((await cabinet(session)).items).toEqual([]);
    await as(session, http().get(`/api/cabinet/assignments/${row!.id}`)).expect(404);
    await cancel(row!.id).expect(404);

    const trajectory = await trajectoryFor(student.id, true);
    await cancel(trajectory.stages[0]!.assignments[0]!.id).expect(409);
  });

  it('FR-040, AT-06: студент видит только утверждённую ИОТ, карту этапов и задания маршрута', async () => {
    const { student, session } = await studentWithSession('Маршрут');
    const draft = await trajectoryFor(student.id, false);
    expect(await cabinetTrajectories(session)).toEqual([]);
    expect((await cabinet(session)).items).toEqual([]);
    await as(
      session,
      http().get(`/api/cabinet/assignments/${draft.stages[0]!.assignments[0]!.id}`),
    ).expect(404);

    const approved = (
      await as(teacher, http().post(`/api/trajectories/${draft.id}/approve`))
        .send({ updatedAt: draft.updatedAt })
        .expect(200)
    ).body as TrajectoryDto;
    const [own] = await cabinetTrajectories(session);
    expect(own).toMatchObject({
      id: approved.id,
      status: 'ACTIVE',
      version: 1,
      goals: 'Освоить линейные уравнения',
      currentStageId: approved.stages[0]!.id,
      discipline: { id: disciplineId },
    });
    expect(own!.stages).toHaveLength(5);
    expect(own!.stages[0]!.status).toBe('IN_PROGRESS');
    expect(own!.stages[0]!.checkpoints).toHaveLength(1);
    expect(own!.stages[0]!.materials[0]).toMatchObject({
      id: material.id,
      kind: 'TEXT',
      body: 'Правило переноса',
    });
    // Служебные поля маршрута студенту не передаются.
    expect(own).not.toHaveProperty('versions');
    expect(own).not.toHaveProperty('updatedAt');
    expect(own).not.toHaveProperty('student');

    const { items } = await cabinet(session);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      assignment: { id: tasks[2]!.id },
      trajectory: { id: approved.id, stage: { id: approved.stages[0]!.id, sortOrder: 0 } },
    });
    const detail = (
      await as(session, http().get(`/api/cabinet/assignments/${items[0]!.id}`)).expect(200)
    ).body as CabinetAssignmentDetailDto;
    expect(detail).toMatchObject({
      instruction: 'Решите уравнения',
      submissionFormats: ['TEXT', 'FILE'],
      criteria: [{ title: 'Верность', maxScore: 100 }],
    });
  });

  it('AT-12: чужие задания, ИОТ и файлы студенту недоступны', async () => {
    const owner = await studentWithSession('Владелец');
    const stranger = await studentWithSession('Посторонний');
    await assign({ assignmentIds: [tasks[0]!.id], studentIds: [owner.student.id] }).expect(201);
    const [row] = (await cabinet(owner.session)).items;
    await as(stranger.session, http().get(`/api/cabinet/assignments/${row!.id}`)).expect(404);

    const detail = (
      await as(owner.session, http().get(`/api/cabinet/assignments/${row!.id}`)).expect(200)
    ).body as CabinetAssignmentDetailDto;
    expect(detail.attachments[0]!.file!.id).toBe(attachmentFile.id);
    const file = await as(
      owner.session,
      http().get(`/api/cabinet/files/${attachmentFile.id}`),
    ).expect(200);
    expect(file.headers['content-disposition']).toContain('attachment');
    await as(stranger.session, http().get(`/api/cabinet/files/${attachmentFile.id}`)).expect(404);
    await as(owner.session, http().get(`/api/cabinet/files/${foreignFile.id}`)).expect(404);
    await as(owner.session, http().get(`/api/files/${attachmentFile.id}`)).expect(403);

    const trajectory = await trajectoryFor(owner.student.id, true);
    expect(await cabinetTrajectories(stranger.session)).toEqual([]);
    await as(stranger.session, http().post(`/api/cabinet/trajectories/${trajectory.id}/proposals`))
      .set('Idempotency-Key', key())
      .send({ body: 'Хочу другой маршрут' })
      .expect(404);
    await as(teacher, http().get('/api/cabinet/trajectories')).expect(403);
  });

  it('п. 2.3: студент предлагает изменение маршрута, маршрут не меняется, преподаватель видит предложение', async () => {
    const { student, session } = await studentWithSession('Предложение');
    const trajectory = await trajectoryFor(student.id, true);
    const propose = (body: Record<string, unknown>, idem = key()) =>
      as(session, http().post(`/api/cabinet/trajectories/${trajectory.id}/proposals`))
        .set('Idempotency-Key', idem)
        .send(body);

    await propose({ body: '   ' }).expect(400);
    await propose({ body: 'Другой этап', stageId: '00000000-0000-7000-8000-000000000001' }).expect(
      400,
    );
    const idem = key();
    const created = (
      await propose(
        { body: 'Добавить проект по теме сайта', stageId: trajectory.stages[3]!.id },
        idem,
      ).expect(201)
    ).body as RouteProposalDto;
    await propose(
      { body: 'Добавить проект по теме сайта', stageId: trajectory.stages[3]!.id },
      idem,
    ).expect(201);
    expect(created.stage).toEqual({
      id: trajectory.stages[3]!.id,
      title: trajectory.stages[3]!.title,
    });

    const [own] = await cabinetTrajectories(session);
    expect(own!.proposals.map((item) => item.id)).toEqual([created.id]);

    const seen = (await as(teacher, http().get(`/api/trajectories/${trajectory.id}`)).expect(200))
      .body as TrajectoryDto;
    expect(seen.proposals).toHaveLength(1);
    expect(seen.proposals[0]).toMatchObject({ body: 'Добавить проект по теме сайта' });
    expect(seen.updatedAt).toBe(trajectory.updatedAt);
    expect(seen.version).toBe(1);
    const snapshot = (
      await prisma.trajectoryVersion.findFirstOrThrow({ where: { trajectoryId: trajectory.id } })
    ).snapshot as unknown as TrajectorySnapshot;
    expect(snapshot).not.toHaveProperty('proposals');
    expect(
      await prisma.notification.count({
        where: { type: 'trajectory.change_proposed', entityId: trajectory.id },
      }),
    ).toBe(1);
    const history = (
      await as(teacher, http().get(`/api/students/${student.id}/history`)).expect(200)
    ).body as StudentHistoryItemDto[];
    expect(history.map((item) => item.label)).toContain('Студент предложил изменить ИОТ');
  });
});
