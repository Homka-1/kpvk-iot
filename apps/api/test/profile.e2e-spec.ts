import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type ObservationDto,
  type OwnProfileDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type StudentProfileDto,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const key = () => `test-${randomBytes(8).toString('hex')}`;
const today = () => new Date().toISOString().slice(0, 10);

describe('Профиль студента и педагогические наблюдения (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let colleague: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let studentSession: LoggedIn;
  let otherStudentSession: LoggedIn;
  let student: StudentCreatedDto;
  let otherStudent: StudentCreatedDto;
  let discipline: { id: string; name: string };
  let foreignDiscipline: { id: string };

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  function addObservation(session: LoggedIn, body: Record<string, unknown>, idem = key()) {
    return as(session, http().post(`/api/students/${student.student.id}/observations`))
      .set('Idempotency-Key', idem)
      .send(body);
  }

  async function studentLogin(created: StudentCreatedDto): Promise<LoggedIn> {
    await prisma.user.update({
      where: { login: created.login },
      data: { mustChangePassword: false },
    });
    return login(app, created.login, created.temporaryPassword!);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER, lastName: 'Иванова' });
    teacher = await login(app, teacherUser.login);
    const colleagueUser = await createUser(app, { role: RoleCode.TEACHER, lastName: 'Сидорова' });
    colleague = await login(app, colleagueUser.login);
    const otherUser = await createUser(app, { role: RoleCode.TEACHER });
    otherTeacher = await login(app, otherUser.login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);

    const tag = suffix();
    const group = await as(admin, http().post('/api/groups'))
      .send({ name: `ПР-${tag}`, course: 2, specialty: 'Программное обеспечение' })
      .expect(201);
    const foreignGroup = await as(admin, http().post('/api/groups'))
      .send({ name: `ПЧ-${tag}`, course: 1, specialty: 'Программное обеспечение' })
      .expect(201);
    discipline = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Физика ${tag}` })
        .expect(201)
    ).body as { id: string; name: string };
    foreignDiscipline = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Химия ${tag}` })
        .expect(201)
    ).body as { id: string };
    for (const [teacherId, groupId, disciplineId] of [
      [teacherUser.id, group.body.id, discipline.id],
      [colleagueUser.id, group.body.id, discipline.id],
      [otherUser.id, foreignGroup.body.id, foreignDiscipline.id],
    ] as const) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId, groupId, disciplineId })
        .expect(201);
    }

    const create = (session: LoggedIn, groupId: string, lastName: string) =>
      as(session, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName, firstName: 'Иван', groupId })
        .expect(201);
    student = (await create(teacher, group.body.id, 'Петров')).body as StudentCreatedDto;
    otherStudent = (await create(otherTeacher, foreignGroup.body.id, 'Смирнов'))
      .body as StudentCreatedDto;
    studentSession = await studentLogin(student);
    otherStudentSession = await studentLogin(otherStudent);
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-009, FR-012: профиль содержит группу, дисциплины и преподавателей', async () => {
    const res = await as(teacher, http().get(`/api/students/${student.student.id}/profile`)).expect(
      200,
    );
    const profile = res.body as StudentProfileDto;
    expect(profile.group?.course).toBe(2);
    expect(profile.enrollments).toHaveLength(1);
    expect(profile.interests).toBeNull();
    expect(profile.disciplines).toEqual([
      {
        id: discipline.id,
        name: discipline.name,
        teachers: expect.arrayContaining([
          expect.objectContaining({ fullName: expect.stringContaining('Иванова') }),
          expect.objectContaining({ fullName: expect.stringContaining('Сидорова') }),
        ]) as unknown,
      },
    ]);
  });

  it('FR-002, AT-12: чужой студент — 404, студенту/исследователю/админу — 403', async () => {
    const foreignId = otherStudent.student.id;
    for (const path of ['profile', 'observations', 'history']) {
      await as(teacher, http().get(`/api/students/${foreignId}/${path}`)).expect(404);
      for (const session of [studentSession, researcher, admin]) {
        await as(session, http().get(`/api/students/${student.student.id}/${path}`)).expect(403);
      }
    }
    await as(teacher, http().post(`/api/students/${foreignId}/observations`))
      .set('Idempotency-Key', key())
      .send({ observedAt: today(), text: 'Текст', visibility: 'INTERNAL' })
      .expect(404);
  });

  it('FR-014: наблюдение сохраняется с датой и автором, повтор формы не создаёт дубль', async () => {
    const idem = key();
    const body = {
      observedAt: today(),
      text: 'Активно работает на практических занятиях',
      visibility: 'INTERNAL',
      disciplineId: discipline.id,
    };
    const first = await addObservation(teacher, body, idem).expect(201);
    const created = first.body as ObservationDto;
    expect(created).toMatchObject({
      observedAt: today(),
      visibility: 'INTERNAL',
      discipline: { id: discipline.id },
      author: { fullName: expect.stringContaining('Иванова') as unknown },
      canEdit: true,
    });
    const second = await addObservation(teacher, body, idem).expect(201);
    expect((second.body as ObservationDto).id).toBe(created.id);
    expect(
      await prisma.pedagogicalObservation.count({ where: { studentId: student.student.id } }),
    ).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'observation.created', entityId: created.id },
    });
    expect(JSON.stringify(audit)).not.toContain(body.text);

    const list = await as(
      colleague,
      http().get(`/api/students/${student.student.id}/observations`),
    ).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: created.id, canEdit: false })]);
  });

  it('FR-014: проверка формы и права на изменение', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bad = await addObservation(teacher, {
      observedAt: future,
      text: 'Текст',
      visibility: 'INTERNAL',
      disciplineId: foreignDiscipline.id,
    }).expect(400);
    expect(bad.body.fields).toMatchObject({
      observedAt: expect.stringContaining('будущем') as unknown,
      disciplineId: expect.any(String) as unknown,
    });
    await addObservation(teacher, {
      observedAt: today(),
      text: '  ',
      visibility: 'INTERNAL',
    }).expect(400);

    const created = (
      await addObservation(teacher, {
        observedAt: today(),
        text: 'Нужна помощь с задачами',
        visibility: 'INTERNAL',
      }).expect(201)
    ).body as ObservationDto;
    const patch = (session: LoggedIn) =>
      as(
        session,
        http().patch(`/api/students/${student.student.id}/observations/${created.id}`),
      ).send({ observedAt: today(), text: 'Исправленный текст', visibility: 'INTERNAL' });
    await patch(colleague).expect(403);
    await patch(studentSession).expect(403);
    const updated = await patch(teacher).expect(200);
    expect((updated.body as ObservationDto).text).toBe('Исправленный текст');
  });

  it('FR-016: студент видит только открытые ему наблюдения, служебные — нигде', async () => {
    const visible = (
      await addObservation(teacher, {
        observedAt: today(),
        text: 'Хороший прогресс, продолжайте в том же темпе',
        visibility: 'STUDENT_VISIBLE',
      }).expect(201)
    ).body as ObservationDto;

    const own = await as(studentSession, http().get('/api/cabinet/profile')).expect(200);
    const profile = own.body as OwnProfileDto;
    expect(profile.participantCode).toBe(student.student.participantCode);
    expect(profile.disciplines.map((item) => item.id)).toEqual([discipline.id]);
    expect(profile.observations.map((item) => item.id)).toEqual([visible.id]);
    const raw = JSON.stringify(own.body);
    expect(raw).not.toContain('Нужна помощь');
    expect(raw).not.toContain('Активно работает');
    expect(raw).not.toContain('visibility');

    await as(studentSession, http().get(`/api/students/${student.student.id}/observations`)).expect(
      403,
    );
    const other = await as(otherStudentSession, http().get('/api/cabinet/profile')).expect(200);
    expect((other.body as OwnProfileDto).observations).toEqual([]);
    expect(JSON.stringify(other.body)).not.toContain('Петров');
    await as(teacher, http().get('/api/cabinet/profile')).expect(403);
  });

  it('п. 2.3: студент указывает свои интересы, преподаватель их видит', async () => {
    const res = await as(studentSession, http().patch('/api/cabinet/profile'))
      .send({ interests: '  Робототехника, веб-разработка ' })
      .expect(200);
    expect((res.body as OwnProfileDto).interests).toBe('Робототехника, веб-разработка');
    await as(studentSession, http().patch('/api/cabinet/profile'))
      .send({ interests: 'x'.repeat(1001) })
      .expect(400);
    const profile = await as(
      teacher,
      http().get(`/api/students/${student.student.id}/profile`),
    ).expect(200);
    expect((profile.body as StudentProfileDto).interests).toBe('Робототехника, веб-разработка');
  });

  it('история показывает значимые события с автором', async () => {
    const res = await as(teacher, http().get(`/api/students/${student.student.id}/history`)).expect(
      200,
    );
    const history = res.body as StudentHistoryItemDto[];
    const actions = history.map((item) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'student.created',
        'observation.created',
        'observation.updated',
        'student.interests_updated',
      ]),
    );
    expect(history.find((item) => item.action === 'student.created')).toMatchObject({
      label: 'Студент добавлен',
      actor: { fullName: expect.stringContaining('Иванова') as unknown },
    });
    expect(history[0]!.at >= history[history.length - 1]!.at).toBe(true);
  });
});
