import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type LessonDto,
  type LessonImportPreviewDto,
  type LessonImportResultDto,
  type LessonJournalDto,
  type LessonJournalInput,
  type ObservationCriterionDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentLessonJournalDto,
} from '@iot/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const tag = randomBytes(3).toString('hex').toUpperCase();
const key = () => `test-${randomBytes(8).toString('hex')}`;
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const localDay = (offset: number) => isoDay(offset).split('-').reverse().join('.');

describe('Занятия и журнал педагогических наблюдений (e2e, этап 25)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let stranger: LoggedIn;
  let studentSession: LoggedIn;
  let teacherId: string;
  let groupId: string;
  let groupName: string;
  let foreignGroupId: string;
  let disciplineId: string;
  let disciplineName: string;
  const students: StudentCreatedDto[] = [];
  let criteria: ObservationCriterionDto[];

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  const createLesson = (session: LoggedIn, body: Record<string, unknown>) =>
    as(session, http().post('/api/lessons')).send(body);

  const saveJournal = (session: LoggedIn, lessonId: string, body: LessonJournalInput) =>
    as(session, http().put(`/api/lessons/${lessonId}/journal`)).send(body);

  function csv(rows: string[][]): Buffer {
    return Buffer.from(rows.map((row) => row.join(';')).join('\r\n'), 'utf8');
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, {
      role: RoleCode.TEACHER,
      lastName: `Журналова${tag}`,
    });
    teacherId = teacherUser.id;
    teacher = await login(app, teacherUser.login);
    const strangerUser = await createUser(app, { role: RoleCode.TEACHER });
    stranger = await login(app, strangerUser.login);
    // Два преподавателя с одинаковой фамилией — запись «Двойникова» в расписании неоднозначна.
    await createUser(app, { role: RoleCode.TEACHER, lastName: `Двойникова${tag}` });
    await createUser(app, { role: RoleCode.TEACHER, lastName: `Двойникова${tag}` });

    groupName = `ЖН-${tag}`;
    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: groupName, course: 2, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    foreignGroupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ЖЧ-${tag}`, course: 2, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    disciplineName = `Информатика ${tag}`;
    disciplineId = (
      await as(admin, http().post('/api/disciplines')).send({ name: disciplineName }).expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId, groupId, disciplineId })
      .expect(201);

    for (const lastName of ['Альфина', 'Бетова', 'Гаммин']) {
      const created = (
        await as(teacher, http().post('/api/students'))
          .set('Idempotency-Key', key())
          .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
          .expect(201)
      ).body as StudentCreatedDto;
      students.push(created);
    }
    await prisma.user.update({
      where: { login: students[0]!.login },
      data: { mustChangePassword: false },
    });
    studentSession = await login(app, students[0]!.login, students[0]!.temporaryPassword!);

    criteria = (await as(admin, http().get('/api/observation-criteria')).expect(200))
      .body as ObservationCriterionDto[];
  });

  afterAll(async () => {
    await app.close();
  });

  it('критерии по умолчанию: пять критериев наблюдения из миграции', () => {
    expect(criteria.filter((item) => !item.archived).map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'Активность на занятии',
        'Включённость в работу',
        'Самостоятельность',
        'Инициативность',
        'Доведение задания до конца',
      ]),
    );
  });

  it('FR-002: преподаватель добавляет занятие только по своей группе и дисциплине', async () => {
    const own = await createLesson(teacher, {
      date: isoDay(-7),
      startTime: '8:30',
      groupId,
      disciplineId,
    }).expect(201);
    expect(own.body).toMatchObject({
      startTime: '08:30',
      teacher: { id: teacherId },
      journal: { status: 'EMPTY', done: 0, total: 3 },
    });
    await createLesson(teacher, {
      date: isoDay(-7),
      startTime: '08:30',
      groupId,
      disciplineId,
    }).expect(409);
    const foreign = await createLesson(teacher, {
      date: isoDay(-7),
      startTime: '10:00',
      groupId: foreignGroupId,
      disciplineId,
    }).expect(400);
    expect(foreign.body.fields.disciplineId).toBeDefined();
    // Чужой преподаватель не видит занятие.
    const list = (await as(stranger, http().get('/api/lessons')).expect(200)).body as {
      items: LessonDto[];
    };
    expect(list.items.some((item) => item.id === own.body.id)).toBe(false);
    await as(stranger, http().get(`/api/lessons/${own.body.id}/journal`)).expect(404);
  });

  it('администратор ведёт расписание любой группы, но журнал не заполняет', async () => {
    const lesson = (
      await createLesson(admin, {
        date: isoDay(-6),
        startTime: '12:00',
        groupId,
        disciplineId,
        teacherId,
      }).expect(201)
    ).body as LessonDto;
    expect(lesson.teacher.id).toBe(teacherId);
    await createLesson(admin, {
      date: isoDay(-6),
      startTime: '13:00',
      groupId,
      disciplineId,
    }).expect(400);
    await as(admin, http().get(`/api/lessons/${lesson.id}/journal`)).expect(200);
    await saveJournal(admin, lesson.id, { entries: [] }).expect(403);
    await as(admin, http().delete(`/api/lessons/${lesson.id}`)).expect(204);
  });

  it('импорт расписания: предпросмотр с ошибками по строкам, импорт, повторная загрузка без дублей', async () => {
    const file = csv([
      ['Дата', 'Время', 'Группа', 'Дисциплина', 'Преподаватель'],
      [localDay(-3), '08:30–10:00', groupName, disciplineName, `Журналова${tag} Т.`],
      [localDay(-2), '10.10', groupName.toLowerCase(), disciplineName, `журналова${tag} тест`],
      ['31.02.2026', '08:30', groupName, disciplineName, `Журналова${tag}`],
      [localDay(-1), '08:30', 'НЕТ-ГРУППЫ', disciplineName, `Журналова${tag}`],
      [localDay(-1), '08:30', groupName, disciplineName, `Двойникова${tag}`],
      [localDay(-1), '09:00', `ЖЧ-${tag}`, disciplineName, `Журналова${tag}`],
    ]);
    const preview = (
      await as(teacher, http().post('/api/lessons/import/preview'))
        .attach('file', file, 'расписание.csv')
        .expect(200)
    ).body as LessonImportPreviewDto;
    expect(preview.fileErrors).toEqual([]);
    expect(preview).toMatchObject({ validCount: 2, duplicateCount: 0, invalidCount: 4 });
    expect(preview.rows[0]!.resolved).toMatchObject({ date: isoDay(-3), startTime: '08:30' });
    expect(preview.rows[2]!.errors.join()).toContain('Дата не распознана');
    expect(preview.rows[3]!.errors.join()).toContain('не найдена');
    expect(preview.rows[4]!.errors.join()).toContain('несколько');
    expect(preview.rows[5]!.errors.join()).toContain('не ведёте');

    // Строки с ошибками в импорт не попадают — при попытке их передать ничего не создаётся.
    const rows = preview.rows.map(
      ({ line, date, time, groupName: g, disciplineName: d, teacherName }) => ({
        line,
        date,
        time,
        groupName: g,
        disciplineName: d,
        teacherName,
      }),
    );
    await as(teacher, http().post('/api/lessons/import'))
      .set('Idempotency-Key', key())
      .send({ rows })
      .expect(400);
    const valid = rows.filter((_row, index) => preview.rows[index]!.errors.length === 0);
    const idem = key();
    const result = (
      await as(teacher, http().post('/api/lessons/import'))
        .set('Idempotency-Key', idem)
        .send({ rows: valid })
        .expect(201)
    ).body as LessonImportResultDto;
    expect(result).toEqual({ created: 2, skipped: 0, replayed: false });
    const replay = (
      await as(teacher, http().post('/api/lessons/import'))
        .set('Idempotency-Key', idem)
        .send({ rows: valid })
        .expect(201)
    ).body as LessonImportResultDto;
    expect(replay.replayed).toBe(true);

    const again = (
      await as(teacher, http().post('/api/lessons/import/preview'))
        .attach(
          'file',
          csv([
            file.toString().split('\r\n')[0]!.split(';'),
            ...valid.map((r) => [r.date, r.time, r.groupName, r.disciplineName, r.teacherName]),
          ]),
          'повтор.csv',
        )
        .expect(200)
    ).body as LessonImportPreviewDto;
    expect(again).toMatchObject({ validCount: 0, duplicateCount: 2, invalidCount: 0 });
    expect(
      await prisma.auditLog.count({ where: { action: 'lesson.imported', actorId: teacherId } }),
    ).toBe(1);
  });

  it('импорт расписания из XLSX: даты и время ячейками Excel', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Расписание');
    sheet.addRow(['Дата', 'Время', 'Группа', 'Дисциплина', 'Преподаватель']);
    sheet.addRow([
      new Date(`${isoDay(-4)}T00:00:00Z`),
      new Date(Date.UTC(1899, 11, 30, 14, 40)),
      groupName,
      disciplineName,
      `Журналова${tag} Тест`,
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const preview = (
      await as(teacher, http().post('/api/lessons/import/preview'))
        .attach('file', buffer, 'расписание.xlsx')
        .expect(200)
    ).body as LessonImportPreviewDto;
    expect(preview.rows[0]!.errors).toEqual([]);
    expect(preview.rows[0]!.resolved).toMatchObject({ date: isoDay(-4), startTime: '14:40' });
  });

  it('импорт: битый файл и файл без колонок отклоняются с понятной ошибкой', async () => {
    await as(teacher, http().post('/api/lessons/import/preview'))
      .attach('file', Buffer.from('PK\u0003\u0004мусор'), 'расписание.xlsx')
      .expect(400);
    const preview = (
      await as(teacher, http().post('/api/lessons/import/preview'))
        .attach(
          'file',
          csv([
            ['Дата', 'Группа'],
            ['01.09.2025', groupName],
          ]),
          'мало.csv',
        )
        .expect(200)
    ).body as LessonImportPreviewDto;
    expect(preview.fileErrors[0]).toContain('«Время»');
  });

  describe('журнал занятия', () => {
    let lesson: LessonDto;
    let active: ObservationCriterionDto[];

    beforeAll(async () => {
      lesson = (
        await createLesson(teacher, {
          date: isoDay(-1),
          startTime: '15:00',
          groupId,
          disciplineId,
        }).expect(201)
      ).body as LessonDto;
      active = criteria.filter((item) => !item.archived);
    });

    it('FR-014: в журнале все студенты группы и действующие критерии; пока нет отметок — нет данных', async () => {
      const journal = (
        await as(teacher, http().get(`/api/lessons/${lesson.id}/journal`)).expect(200)
      ).body as LessonJournalDto;
      expect(journal.students.map((row) => row.student.id).sort()).toEqual(
        students.map((s) => s.student.id).sort(),
      );
      expect(journal.criteria.map((item) => item.id)).toEqual(active.map((item) => item.id));
      expect(journal.students.every((row) => row.absent === null)).toBe(true);
      expect(journal.students.every((row) => Object.keys(row.ratings).length === 0)).toBe(true);
    });

    it('проверка формы: оценки отсутствующему, оценка вне 1–5, чужой студент', async () => {
      const [first] = students;
      await saveJournal(teacher, lesson.id, {
        entries: [
          {
            studentId: first!.student.id,
            absent: true,
            ratings: [{ criterionId: active[0]!.id, score: 4 }],
          },
        ],
      }).expect(400);
      await saveJournal(teacher, lesson.id, {
        entries: [
          {
            studentId: first!.student.id,
            absent: false,
            ratings: [{ criterionId: active[0]!.id, score: 0 }],
          },
        ],
      }).expect(400);
      const outsider = await prisma.student.findFirstOrThrow({
        where: { currentGroupId: { not: groupId } },
        select: { id: true },
      });
      await saveJournal(teacher, lesson.id, {
        entries: [{ studentId: outsider.id, absent: true, ratings: [] }],
      }).expect(400);
    });

    it('FR-014, FR-074: оценки 1–5, «Не наблюдалось», «Отсутствовал»; повторное сохранение без дублей', async () => {
      const [first, second, third] = students;
      const body: LessonJournalInput = {
        entries: [
          {
            studentId: first!.student.id,
            absent: false,
            ratings: active.map((item, index) => ({
              criterionId: item.id,
              score: index === 0 ? null : 4,
            })),
          },
          { studentId: second!.student.id, absent: true, ratings: [] },
          {
            studentId: third!.student.id,
            absent: false,
            ratings: [{ criterionId: active[0]!.id, score: 5 }],
          },
        ],
      };
      await saveJournal(teacher, lesson.id, body).expect(200);
      const journal = (await saveJournal(teacher, lesson.id, body).expect(200))
        .body as LessonJournalDto;
      expect(await prisma.lessonJournalEntry.count({ where: { lessonId: lesson.id } })).toBe(3);
      expect(journal.lesson.journal).toEqual({ status: 'PARTIAL', done: 2, total: 3 });
      const row = journal.students.find((item) => item.student.id === first!.student.id)!;
      expect(row.ratings[active[0]!.id]).toBeNull();
      expect(row.ratings[active[1]!.id]).toBe(4);
      expect(journal.students.find((item) => item.student.id === second!.student.id)!.absent).toBe(
        true,
      );
      expect(
        await prisma.auditLog.count({
          where: { action: 'lesson.journal_saved', entityId: lesson.id },
        }),
      ).toBe(2);
    });

    it('FR-074: история в профиле студента — средние только по оценкам, без нулей', async () => {
      const [first, second] = students;
      const history = (
        await as(teacher, http().get(`/api/students/${first!.student.id}/lesson-journal`)).expect(
          200,
        )
      ).body as StudentLessonJournalDto;
      expect(history).toMatchObject({ lessons: 1, absences: 0 });
      expect(history.records[0]).toMatchObject({ lessonId: lesson.id, absent: false });
      const summary = new Map(history.summary.map((item) => [item.criterionId, item]));
      expect(summary.get(active[0]!.id)).toEqual({
        criterionId: active[0]!.id,
        mean: null,
        rated: 0,
        notObserved: 1,
      });
      expect(summary.get(active[1]!.id)).toMatchObject({ mean: 4, rated: 1 });

      const absent = (
        await as(teacher, http().get(`/api/students/${second!.student.id}/lesson-journal`)).expect(
          200,
        )
      ).body as StudentLessonJournalDto;
      expect(absent).toMatchObject({ lessons: 1, absences: 1 });
      expect(absent.summary.every((item) => item.mean === null)).toBe(true);
    });

    it('FR-016: студенту журнал и наблюдения на занятиях недоступны', async () => {
      await as(studentSession, http().get(`/api/lessons/${lesson.id}/journal`)).expect(403);
      await as(studentSession, http().get('/api/lessons')).expect(403);
      await as(
        studentSession,
        http().get(`/api/students/${students[0]!.student.id}/lesson-journal`),
      ).expect(403);
      await as(
        stranger,
        http().get(`/api/students/${students[0]!.student.id}/lesson-journal`),
      ).expect(404);
    });

    it('занятие с записями в журнале не удаляется; журнал будущего занятия не заполняется', async () => {
      await as(teacher, http().delete(`/api/lessons/${lesson.id}`)).expect(409);
      const future = (
        await createLesson(teacher, {
          date: isoDay(3),
          startTime: '08:30',
          groupId,
          disciplineId,
        }).expect(201)
      ).body as LessonDto;
      await saveJournal(teacher, future.id, {
        entries: [{ studentId: students[0]!.student.id, absent: true, ratings: [] }],
      }).expect(409);
      await as(teacher, http().delete(`/api/lessons/${future.id}`)).expect(204);
    });

    it('настройки: архивный критерий не предлагается в новых журналах, но оценки по нему сохраняются', async () => {
      await as(teacher, http().put('/api/observation-criteria'))
        .send({ items: criteria })
        .expect(403);
      const target = active[1]!;
      const updated = (
        await as(admin, http().put('/api/observation-criteria'))
          .send({
            items: [
              ...criteria.map((item) =>
                item.id === target.id ? { ...item, archived: true } : item,
              ),
              { name: `Работа в паре ${tag}`, archived: false },
            ],
          })
          .expect(200)
      ).body as ObservationCriterionDto[];
      expect(updated.find((item) => item.id === target.id)!.archived).toBe(true);

      const old = (await as(teacher, http().get(`/api/lessons/${lesson.id}/journal`)).expect(200))
        .body as LessonJournalDto;
      expect(old.criteria.find((item) => item.id === target.id)).toMatchObject({ archived: true });
      const fresh = (
        await createLesson(teacher, {
          date: isoDay(-1),
          startTime: '17:00',
          groupId,
          disciplineId,
        }).expect(201)
      ).body as LessonDto;
      const journal = (
        await as(teacher, http().get(`/api/lessons/${fresh.id}/journal`)).expect(200)
      ).body as LessonJournalDto;
      expect(journal.criteria.some((item) => item.id === target.id)).toBe(false);
      expect(journal.criteria.some((item) => item.name === `Работа в паре ${tag}`)).toBe(true);

      // Список без одного из существующих критериев отклоняется: удалять критерии нельзя.
      await as(admin, http().put('/api/observation-criteria'))
        .send({ items: updated.slice(1) })
        .expect(400);
      // Возвращаем исходное состояние: общий список критериев используют другие тесты.
      await as(admin, http().put('/api/observation-criteria'))
        .send({
          items: updated.map((item) =>
            item.id === target.id
              ? { ...item, archived: false }
              : item.name === `Работа в паре ${tag}`
                ? { ...item, archived: true }
                : item,
          ),
        })
        .expect(200);
      expect(
        await prisma.auditLog.count({ where: { action: 'settings.observation_criteria_updated' } }),
      ).toBeGreaterThanOrEqual(2);
    });
  });
});
