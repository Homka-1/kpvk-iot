import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  RoleCode,
  type StudentCreatedDto,
  type StudentDetailsDto,
  type StudentImportPreviewDto,
  type StudentImportResultDto,
  type StudentPageDto,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const key = () => `test-${randomBytes(8).toString('hex')}`;

describe('Группы, дисциплины и студенты (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let teacherId: string;
  let otherTeacher: LoggedIn;
  let groupA: { id: string; name: string };
  let groupB: { id: string; name: string };
  let foreignGroup: { id: string; name: string };
  let discipline: { id: string };

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function createGroup(name: string) {
    const res = await as(admin, http().post('/api/groups'))
      .send({ name, course: 2, specialty: 'Программное обеспечение' })
      .expect(201);
    return res.body as { id: string; name: string };
  }

  function addStudent(session: LoggedIn, body: Record<string, unknown>, idem = key()) {
    return as(session, http().post('/api/students')).set('Idempotency-Key', idem).send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const adminUser = await createUser(app, { role: RoleCode.ADMIN });
    admin = await login(app, adminUser.login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacherId = teacherUser.id;
    teacher = await login(app, teacherUser.login);
    const otherUser = await createUser(app, { role: RoleCode.TEACHER });
    otherTeacher = await login(app, otherUser.login);

    const tag = suffix();
    groupA = await createGroup(`ТА-${tag}`);
    groupB = await createGroup(`ТБ-${tag}`);
    foreignGroup = await createGroup(`ТЧ-${tag}`);
    const res = await as(admin, http().post('/api/disciplines'))
      .send({ name: `Математика ${tag}`, code: `M-${tag}` })
      .expect(201);
    discipline = res.body as { id: string };
    for (const [teacherKey, group] of [
      [teacherId, groupA],
      [teacherId, groupB],
      [otherUser.id, foreignGroup],
    ] as const) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherKey, groupId: group.id, disciplineId: discipline.id })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('справочники', () => {
    it('п. 2.1: группы и дисциплины создаёт администратор, преподавателю — 403', async () => {
      await as(teacher, http().post('/api/groups'))
        .send({ name: `X-${suffix()}`, course: 1, specialty: 'Тест' })
        .expect(403);
      await as(teacher, http().post('/api/disciplines'))
        .send({ name: `X-${suffix()}` })
        .expect(403);
      await as(teacher, http().get('/api/teacher-assignments')).expect(403);
    });

    it('п. 2.1: повтор названия группы — 409 с понятным сообщением', async () => {
      const res = await as(admin, http().post('/api/groups'))
        .send({ name: groupA.name.toLowerCase(), course: 1, specialty: 'Тест' })
        .expect(409);
      expect(res.body.message).toBe('Группа с таким названием уже существует');
    });

    it('FR-002: преподаватель видит только закреплённые группы и дисциплины', async () => {
      const groups = await as(teacher, http().get('/api/groups')).expect(200);
      const ids = (groups.body as { id: string }[]).map((group) => group.id);
      expect(ids).toEqual(expect.arrayContaining([groupA.id, groupB.id]));
      expect(ids).not.toContain(foreignGroup.id);

      const disciplines = await as(teacher, http().get('/api/disciplines')).expect(200);
      const own = (disciplines.body as { id: string; groups: { id: string }[] }[]).find(
        (item) => item.id === discipline.id,
      );
      expect(own?.groups.map((group) => group.id).sort()).toEqual([groupA.id, groupB.id].sort());
    });

    it('п. 2.1: повторное закрепление — 409; снятие сохраняет историю', async () => {
      const groupC = await createGroup(`ТВ-${suffix()}`);
      const body = { teacherId, groupId: groupC.id, disciplineId: discipline.id };
      const created = await as(admin, http().post('/api/teacher-assignments'))
        .send(body)
        .expect(201);
      await as(admin, http().post('/api/teacher-assignments')).send(body).expect(409);
      await as(admin, http().post(`/api/teacher-assignments/${created.body.id}/end`))
        .send({ reason: 'Смена нагрузки' })
        .expect(200);
      const all = await as(admin, http().get('/api/teacher-assignments?includeEnded=true')).expect(
        200,
      );
      const ended = (all.body as { id: string; endsAt: string | null }[]).find(
        (item) => item.id === created.body.id,
      );
      expect(ended?.endsAt).not.toBeNull();
      const groups = await as(teacher, http().get('/api/groups')).expect(200);
      expect((groups.body as { id: string }[]).map((group) => group.id)).not.toContain(groupC.id);
    });

    it('п. 2.1: группу со студентами архивировать нельзя', async () => {
      const group = await createGroup(`ТГ-${suffix()}`);
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId, groupId: group.id, disciplineId: discipline.id })
        .expect(201);
      await addStudent(teacher, {
        lastName: 'Архивов',
        firstName: 'Тест',
        groupId: group.id,
      }).expect(201);
      const res = await as(admin, http().post(`/api/groups/${group.id}/archive`))
        .send({ reason: 'Выпуск' })
        .expect(409);
      expect(res.body.message).toMatch(/В группе есть студенты/);
    });
  });

  describe('студенты', () => {
    it('FR-006, NFR-006: ручное добавление создаёт карточку и учётную запись; повтор формы не создаёт дубль', async () => {
      const idem = key();
      const body = {
        lastName: 'Петров',
        firstName: 'Иван',
        middleName: 'Сергеевич',
        groupId: groupA.id,
      };
      const first = await addStudent(teacher, body, idem).expect(201);
      const created = first.body as StudentCreatedDto;
      expect(created.student.participantCode).toMatch(/^S-[A-Z0-9]{6}$/);
      expect(created.login).toBe(created.student.participantCode.toLowerCase());
      expect(created.temporaryPassword).toEqual(expect.any(String));
      expect(created.student.group?.id).toBe(groupA.id);
      expect(created.student.enrollments).toHaveLength(1);
      // Поля, для которых ещё нет данных, — null («нет данных»), а не нули (FR-005).
      expect(created.student).toMatchObject({
        motivationProfile: null,
        currentTrajectory: null,
        averageScore: null,
        completedAssignments: null,
        lastActivityAt: null,
      });

      const second = await addStudent(teacher, body, idem).expect(201);
      expect((second.body as StudentCreatedDto).student.id).toBe(created.student.id);
      expect((second.body as StudentCreatedDto).temporaryPassword).toBeNull();
      expect(
        await prisma.student.count({ where: { participantCode: created.student.participantCode } }),
      ).toBe(1);

      // Учётная запись студента работает и требует смены пароля.
      const session = await login(app, created.login, created.temporaryPassword!);
      expect(session.body.user).toMatchObject({ roles: ['student'], mustChangePassword: true });

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'student.created', entityId: created.student.id },
      });
      expect(audit?.after).toMatchObject({ groupId: groupA.id, source: 'manual' });
    });

    it('NFR-006: тот же ключ с другими данными — 409; без ключа — 400', async () => {
      const idem = key();
      await addStudent(
        teacher,
        { lastName: 'Один', firstName: 'Тест', groupId: groupA.id },
        idem,
      ).expect(201);
      await addStudent(
        teacher,
        { lastName: 'Другой', firstName: 'Тест', groupId: groupA.id },
        idem,
      ).expect(409);
      await as(teacher, http().post('/api/students'))
        .send({ lastName: 'Без', firstName: 'Ключа', groupId: groupA.id })
        .expect(400);
    });

    it('FR-006: занятый код участника и чужая группа — ошибки полей формы', async () => {
      const code = `P-${suffix()}`;
      await addStudent(teacher, {
        lastName: 'Код',
        firstName: 'Тест',
        groupId: groupA.id,
        participantCode: code.toLowerCase(),
      }).expect(201);
      const clash = await addStudent(teacher, {
        lastName: 'Код2',
        firstName: 'Тест',
        groupId: groupA.id,
        participantCode: code,
      }).expect(400);
      expect(clash.body.fields.participantCode).toBe(`Код участника «${code}» уже занят`);
      const foreign = await addStudent(teacher, {
        lastName: 'Чужой',
        firstName: 'Тест',
        groupId: foreignGroup.id,
      }).expect(400);
      expect(foreign.body.fields.groupId).toBe('Группа не найдена среди ваших действующих групп');
    });

    it('FR-002, AT-12: чужих студентов преподаватель не видит; студент и исследователь — 403', async () => {
      const own = (
        await addStudent(teacher, {
          lastName: 'Свой',
          firstName: 'Тест',
          groupId: groupA.id,
        }).expect(201)
      ).body as StudentCreatedDto;
      const foreign = (
        await addStudent(otherTeacher, {
          lastName: 'Чужой',
          firstName: 'Тест',
          groupId: foreignGroup.id,
        }).expect(201)
      ).body as StudentCreatedDto;

      const list = await as(teacher, http().get('/api/students?pageSize=100')).expect(200);
      const ids = (list.body as StudentPageDto).items.map((item) => item.id);
      expect(ids).toContain(own.student.id);
      expect(ids).not.toContain(foreign.student.id);
      await as(teacher, http().get(`/api/students/${foreign.student.id}`)).expect(404);
      await as(teacher, http().post(`/api/students/${foreign.student.id}/archive`))
        .send({ reason: 'x' })
        .expect(404);

      await prisma.user.update({
        where: { login: own.login },
        data: { mustChangePassword: false },
      });
      const studentSession = await login(app, own.login, own.temporaryPassword!);
      for (const session of [
        studentSession,
        await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login),
      ]) {
        await as(session, http().get('/api/students')).expect(403);
        await as(session, http().get(`/api/students/${own.student.id}`)).expect(403);
      }
      await as(studentSession, http().get('/api/groups')).expect(403);
    });

    it('FR-007, FR-008: поиск по фамилии, коду и группе; фильтры по группе, дисциплине и затруднениям', async () => {
      const lastName = `Поисков${suffix()}`;
      const created = (
        await addStudent(teacher, { lastName, firstName: 'Тест', groupId: groupB.id }).expect(201)
      ).body as StudentCreatedDto;
      const find = async (query: string) =>
        (
          (await as(teacher, http().get(`/api/students?${query}`)).expect(200))
            .body as StudentPageDto
        ).items.map((item) => item.id);

      expect(await find(`search=${encodeURIComponent(lastName.toLowerCase())}`)).toEqual([
        created.student.id,
      ]);
      expect(await find(`search=${created.student.participantCode}`)).toEqual([created.student.id]);
      expect(await find(`search=${encodeURIComponent(groupB.name)}&pageSize=100`)).toContain(
        created.student.id,
      );
      expect(await find(`groupId=${groupA.id}&pageSize=100`)).not.toContain(created.student.id);
      expect(
        await find(`disciplineId=${discipline.id}&search=${encodeURIComponent(lastName)}`),
      ).toEqual([created.student.id]);
      expect(await find(`hasDifficulties=false&search=${encodeURIComponent(lastName)}`)).toEqual([
        created.student.id,
      ]);
      expect(await find(`hasDifficulties=true&search=${encodeURIComponent(lastName)}`)).toEqual([]);
      expect(await find(`profile=HIGH&search=${encodeURIComponent(lastName)}`)).toEqual([]);
      expect(await find(`trajectoryStatus=ACTIVE&search=${encodeURIComponent(lastName)}`)).toEqual(
        [],
      );
    });

    it('FR-010: перевод в другую группу сохраняет историю групп', async () => {
      const created = (
        await addStudent(teacher, {
          lastName: 'Переводов',
          firstName: 'Тест',
          groupId: groupA.id,
        }).expect(201)
      ).body as StudentCreatedDto;
      const url = `/api/students/${created.student.id}/transfer`;
      await as(teacher, http().post(url)).send({ groupId: groupB.id }).expect(400);
      await as(teacher, http().post(url))
        .send({ groupId: foreignGroup.id, reason: 'Заявление' })
        .expect(400);
      const res = await as(teacher, http().post(url))
        .send({ groupId: groupB.id, reason: 'Заявление студента' })
        .expect(200);
      const details = res.body as StudentDetailsDto;
      expect(details.group?.id).toBe(groupB.id);
      expect(details.enrollments).toHaveLength(2);
      expect(details.enrollments[0]).toMatchObject({
        group: { id: groupB.id },
        endsAt: null,
        reason: 'Заявление студента',
      });
      expect(details.enrollments[1]!.group.id).toBe(groupA.id);
      expect(details.enrollments[1]!.endsAt).not.toBeNull();
      await as(teacher, http().post(url))
        .send({ groupId: groupB.id, reason: 'Повтор' })
        .expect(409);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'student.transferred', entityId: created.student.id },
      });
      expect(audit).toMatchObject({
        reason: 'Заявление студента',
        before: { groupId: groupA.id },
        after: { groupId: groupB.id },
      });
    });

    it('FR-011: архивирование скрывает студента из списка, закрывает вход и сохраняет данные; возврат из архива', async () => {
      const created = (
        await addStudent(teacher, {
          lastName: `Архивный${suffix()}`,
          firstName: 'Тест',
          groupId: groupA.id,
        }).expect(201)
      ).body as StudentCreatedDto;
      const id = created.student.id;
      await as(teacher, http().post(`/api/students/${id}/archive`))
        .send({})
        .expect(400);
      const archived = await as(teacher, http().post(`/api/students/${id}/archive`))
        .send({ reason: 'Отчислен' })
        .expect(200);
      expect((archived.body as StudentDetailsDto).archiveReason).toBe('Отчислен');

      const search = `search=${encodeURIComponent(created.student.lastName)}`;
      const active = await as(teacher, http().get(`/api/students?${search}`)).expect(200);
      expect((active.body as StudentPageDto).total).toBe(0);
      const inArchive = await as(
        teacher,
        http().get(`/api/students?${search}&archived=true`),
      ).expect(200);
      expect((inArchive.body as StudentPageDto).items.map((item) => item.id)).toEqual([id]);
      await http()
        .post('/api/auth/login')
        .send({ login: created.login, password: created.temporaryPassword })
        .expect(401);
      expect(await prisma.enrollment.count({ where: { studentId: id } })).toBe(1);

      await as(teacher, http().post(`/api/students/${id}/restore`)).expect(200);
      await login(app, created.login, created.temporaryPassword!);
    });

    it('FR-009: изменение ФИО меняет и учётную запись; сброс пароля выдаёт новый временный', async () => {
      const created = (
        await addStudent(teacher, {
          lastName: 'Старая',
          firstName: 'Тест',
          groupId: groupA.id,
        }).expect(201)
      ).body as StudentCreatedDto;
      await as(teacher, http().patch(`/api/students/${created.student.id}`))
        .send({ lastName: 'Новая', firstName: 'Тест', middleName: '' })
        .expect(200);
      const account = await prisma.user.findUniqueOrThrow({ where: { login: created.login } });
      expect(account).toMatchObject({ lastName: 'Новая', middleName: null });
      const reset = await as(
        teacher,
        http().post(`/api/students/${created.student.id}/reset-password`),
      ).expect(200);
      expect(reset.body.login).toBe(created.login);
      await http()
        .post('/api/auth/login')
        .send({ login: created.login, password: created.temporaryPassword })
        .expect(401);
      await login(app, created.login, reset.body.temporaryPassword as string);
    });

    it('ADR-028: администратор видит студентов всех групп и ведёт их карточки без закреплений', async () => {
      const foreign = (
        await addStudent(otherTeacher, {
          lastName: `Админский${suffix()}`,
          firstName: 'Тест',
          groupId: foreignGroup.id,
        }).expect(201)
      ).body as StudentCreatedDto;
      const id = foreign.student.id;

      const list = await as(
        admin,
        http().get(`/api/students?search=${encodeURIComponent(foreign.student.lastName)}`),
      ).expect(200);
      expect((list.body as StudentPageDto).items.map((item) => item.id)).toEqual([id]);
      await as(admin, http().get(`/api/students/${id}`)).expect(200);
      await as(admin, http().get(`/api/students/${id}/profile`)).expect(200);

      await addStudent(admin, {
        lastName: 'Добавленный',
        firstName: 'Тест',
        groupId: groupA.id,
      }).expect(201);
      await as(admin, http().patch(`/api/students/${id}`))
        .send({ lastName: 'Исправленный', firstName: 'Тест', middleName: '' })
        .expect(200);
      const moved = await as(admin, http().post(`/api/students/${id}/transfer`))
        .send({ groupId: groupB.id, reason: 'Решение учебной части' })
        .expect(200);
      expect((moved.body as StudentDetailsDto).group?.id).toBe(groupB.id);
      await as(admin, http().post(`/api/students/${id}/reset-password`)).expect(200);
      await as(admin, http().post(`/api/students/${id}/archive`))
        .send({ reason: 'Отчислен' })
        .expect(200);
      await as(admin, http().post(`/api/students/${id}/restore`)).expect(200);
    });

    it('п. 4.2, FR-005, FR-012: карточка собирает прогресс, успеваемость, задания и активность; без данных — null', async () => {
      const created = await addStudent(teacher, {
        lastName: `Показатели${suffix()}`,
        firstName: 'Тест',
        groupId: groupA.id,
      }).expect(201);
      const { id, userId } = (await prisma.student.findUniqueOrThrow({
        where: { id: (created.body as StudentCreatedDto).student.id },
      })) as { id: string; userId: string };
      const card = async () => {
        const res = await as(teacher, http().get(`/api/students/${id}`)).expect(200);
        return res.body as StudentDetailsDto;
      };

      const empty = await card();
      expect(empty.currentTrajectory).toBeNull();
      expect(empty.averageScore).toBeNull();
      expect(empty.completedAssignments).toBeNull();
      expect(empty.lastActivityAt).toBeNull();

      const type = await prisma.assignmentType.findUniqueOrThrow({ where: { code: 'practical' } });
      const assignment = await prisma.assignment.create({
        data: {
          title: `Задание ${suffix()}`,
          disciplineId: discipline.id,
          difficulty: 'BASIC',
          typeId: type.id,
          submissionFormats: ['TEXT'],
          maxScore: 100,
        },
      });
      const trajectory = await prisma.trajectory.create({
        data: { studentId: id, disciplineId: discipline.id, teacherId, status: 'ACTIVE' },
      });
      const assign = (status: 'COMPLETED' | 'IN_PROGRESS' | 'CANCELLED') =>
        prisma.trajectoryAssignment.create({
          data: {
            assignmentId: assignment.id,
            studentId: id,
            trajectoryId: trajectory.id,
            status,
            assignedById: teacherId,
          },
        });
      const done = await assign('COMPLETED');
      await assign('IN_PROGRESS');
      await assign('CANCELLED');
      const submittedAt = new Date('2026-09-10T10:00:00Z');
      await prisma.submission.create({
        data: { trajectoryAssignmentId: done.id, attemptNumber: 1, text: 'Ответ', submittedAt },
      });
      await prisma.academicResult.createMany({
        data: [
          { score: 80, maxScore: 100 },
          { score: 3, maxScore: 5 },
        ].map((item) => ({
          ...item,
          studentId: id,
          disciplineId: discipline.id,
          source: 'MANUAL' as const,
          recordedAt: new Date(),
        })),
      });
      // Консультация, назначенная преподавателем, — не активность студента.
      await prisma.consultation.create({
        data: {
          studentId: id,
          status: 'REQUESTED',
          topic: 'Разбор ошибок',
          requestedById: teacherId,
          createdAt: new Date('2026-09-20T10:00:00Z'),
        },
      });

      const filled = await card();
      expect(filled.currentTrajectory?.progress).toBe(50);
      expect(filled.averageScore).toBe(70);
      expect(filled.completedAssignments).toBe(1);
      expect(filled.lastActivityAt).toBe(submittedAt.toISOString());

      const question = new Date('2026-09-15T10:00:00Z');
      await prisma.feedback.create({
        data: {
          studentId: id,
          authorId: userId,
          kind: 'QUESTION',
          body: 'Вопрос по заданию',
          createdAt: question,
        },
      });
      const page = await as(teacher, http().get('/api/students'))
        .query({ search: created.body.student.lastName })
        .expect(200);
      const [item] = (page.body as StudentPageDto).items;
      expect(item).toMatchObject({
        id,
        averageScore: 70,
        completedAssignments: 1,
        lastActivityAt: question.toISOString(),
      });
    });
  });

  describe('импорт', () => {
    const preview = (session: LoggedIn, content: string | Buffer, name = 'students.csv') =>
      as(session, http().post('/api/students/import/preview')).attach(
        'file',
        Buffer.from(content),
        name,
      );

    it('FR-006: предпросмотр показывает ошибки по строкам; импорт создаёт студентов; повтор не создаёт дублей', async () => {
      const code = `I-${suffix()}`;
      const csv = [
        'Фамилия;Имя;Отчество;Группа;Код участника',
        `Импортов;Алексей;;${groupA.name.toLowerCase()};${code}`,
        `Импортова;Мария;Петровна;${groupB.name};`,
        `;Без фамилии;;${groupA.name};`,
        `Чужой;Студент;;${foreignGroup.name};`,
        `Дубль;Кода;;${groupA.name};${code}`,
      ].join('\n');
      const res = await preview(teacher, csv).expect(200);
      const result = res.body as StudentImportPreviewDto;
      expect(result.fileErrors).toEqual([]);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(4);
      expect(result.rows.map((row) => [row.line, row.errors])).toEqual([
        [
          2,
          [
            `Код участника «${code}» повторяется в файле`,
            `Логин «${code.toLowerCase()}» повторяется в файле`,
          ],
        ],
        [3, []],
        [4, ['Не указано: фамилия']],
        [5, [`Группа «${foreignGroup.name}» не найдена среди ваших действующих групп`]],
        [
          6,
          [
            `Код участника «${code}» повторяется в файле`,
            `Логин «${code.toLowerCase()}» повторяется в файле`,
          ],
        ],
      ]);

      // Импортируются только корректные строки; ошибочная строка в запросе отклоняет весь импорт.
      const strip = (rows: StudentImportPreviewDto['rows']) =>
        rows.map(({ errors: _errors, ...row }) => row);
      const invalid = strip(result.rows.filter((row) => row.errors.length > 0).slice(1, 2));
      const rejected = await as(teacher, http().post('/api/students/import'))
        .set('Idempotency-Key', key())
        .send({ rows: invalid })
        .expect(400);
      expect(rejected.body.fields).toEqual({ 'rows.4': 'Не указано: фамилия' });

      const valid = strip(result.rows.filter((row) => row.errors.length === 0));
      const idem = key();
      const imported = await as(teacher, http().post('/api/students/import'))
        .set('Idempotency-Key', idem)
        .send({ rows: valid })
        .expect(201);
      const body = imported.body as StudentImportResultDto;
      expect(body.replayed).toBe(false);
      expect(body.created).toHaveLength(1);
      expect(body.created[0]!.student).toMatchObject({
        lastName: 'Импортова',
        middleName: 'Петровна',
        group: { id: groupB.id },
      });
      expect(body.created[0]!.temporaryPassword).toEqual(expect.any(String));

      const replay = await as(teacher, http().post('/api/students/import'))
        .set('Idempotency-Key', idem)
        .send({ rows: valid })
        .expect(201);
      expect((replay.body as StudentImportResultDto).replayed).toBe(true);
      expect((replay.body as StudentImportResultDto).created[0]!.temporaryPassword).toBeNull();
      expect(await prisma.student.count({ where: { id: body.created[0]!.student.id } })).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'student.imported', actorId: teacher.body.user.id },
        }),
      ).toBe(1);
    });

    it('FR-006: битый файл — понятная ошибка; без файла — 400', async () => {
      const wrong = await preview(
        teacher,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]),
        'photo.png',
      ).expect(400);
      expect(wrong.body.message).toBe(
        'Поддерживаются файлы CSV и XLSX (первая строка — заголовки колонок)',
      );
      const noColumns = await preview(teacher, 'ФИО;Класс\nПетров;9А\n').expect(200);
      expect((noColumns.body as StudentImportPreviewDto).fileErrors).toEqual([
        'Нет обязательных колонок: «Фамилия», «Имя», «Группа»',
      ]);
      await as(teacher, http().post('/api/students/import/preview')).expect(400);
    });
  });
});
