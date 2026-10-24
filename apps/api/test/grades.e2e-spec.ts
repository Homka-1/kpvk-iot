import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type GradeImportDto,
  type GradeImportPreviewDto,
  type GradeImportResultDto,
  type GradeImportRowDto,
  type GradeOptionsDto,
  type GroupGradesDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentGradesDto,
} from '@iot/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const tag = randomBytes(3).toString('hex').toUpperCase();
const key = () => `test-${randomBytes(8).toString('hex')}`;
const HEADER = ['ФИО', 'Группа', 'Учебный год', 'Семестр', 'Дисциплина', 'Оценка'];

describe('Академическая успешность по семестрам (e2e, этап 26)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let stranger: LoggedIn;
  let studentSession: LoggedIn;
  let groupId: string;
  const groupName = `УС-${tag}`;
  const foreignGroupName = `УЧ-${tag}`;
  const math = `Математика ${tag}`;
  const it_ = `Информатика ${tag}`;
  const history = `История ${tag}`;
  const students: Record<string, StudentCreatedDto> = {};
  const name = (last: string) => `${last}${tag}`;

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  const csv = (rows: string[][]) =>
    Buffer.from(rows.map((row) => row.join(';')).join('\r\n'), 'utf8');

  const preview = async (session: LoggedIn, file: Buffer, fileName = 'оценки.csv') =>
    (
      await as(session, http().post('/api/grades/import/preview'))
        .attach('file', file, fileName)
        .expect(200)
    ).body as GradeImportPreviewDto;

  const commit = (session: LoggedIn, rows: GradeImportRowDto[], idempotencyKey = key()) =>
    as(session, http().post('/api/grades/import'))
      .set('Idempotency-Key', idempotencyKey)
      .send({
        fileName: 'оценки.csv',
        rows: rows.map(({ resolved: _r, errors: _e, ...row }) => row),
      });

  const row = (
    student: string,
    year: string,
    semester: string,
    discipline: string,
    score: string,
  ) => [student, groupName, year, semester, discipline, score];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    stranger = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);

    const group = async (groupTitle: string) =>
      (
        await as(admin, http().post('/api/groups'))
          .send({ name: groupTitle, course: 1, specialty: 'Программное обеспечение' })
          .expect(201)
      ).body.id as string;
    groupId = await group(groupName);
    await group(foreignGroupName);
    const disciplines: Record<string, string> = {};
    for (const title of [math, it_, history]) {
      disciplines[title] = (
        await as(admin, http().post('/api/disciplines')).send({ name: title }).expect(201)
      ).body.id as string;
    }
    // Преподаватель ведёт в группе математику и информатику, но не историю.
    for (const title of [math, it_]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherUser.id, groupId, disciplineId: disciplines[title] })
        .expect(201);
    }

    for (const [last, first, middle] of [
      ['Альфин', 'Пётр', 'Ильич'],
      ['Бетова', 'Анна', null],
      ['Гаммин', 'Олег', null],
      ['Двойнов', 'Иван', null],
      ['Двойнов', 'Иван', null],
    ] as const) {
      const created = (
        await as(teacher, http().post('/api/students'))
          .set('Idempotency-Key', key())
          .send({ lastName: name(last), firstName: first, middleName: middle, groupId })
          .expect(201)
      ).body as StudentCreatedDto;
      students[last] = created;
    }
    await prisma.user.update({
      where: { login: students.Альфин!.login! },
      data: { mustChangePassword: false },
    });
    studentSession = await login(app, students.Альфин!.login!, students.Альфин!.temporaryPassword!);
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-006: предпросмотр сопоставляет студентов по ФИО в группе и показывает ошибки по строкам', async () => {
    const result = await preview(
      teacher,
      csv([
        HEADER,
        row(`${name('Альфин')} Пётр Ильич`, '2025/2026', '1', math, '70'),
        row(`${name('альфин')} П. И.`, '2025-2026', 'I', math, '90'),
        row(`${name('Бетова')} Анна`, '2025/26', '1 семестр', it_, '85,5'),
        row(`${name('Нетакого')} Ян`, '2025/2026', '1', math, '80'),
        row(`${name('Двойнов')} Иван`, '2025/2026', '1', math, '80'),
        row(`${name('Бетова')} Анна`, '2025/2027', '3', math, '120'),
        row(`${name('Бетова')} Анна`, '2025/2026', '1', history, '75'),
        row(`${name('Бетова')} Анна`, '2025/2026', '1', 'Нет такой', '75'),
        [`${name('Бетова')} Анна`, foreignGroupName, '2025/2026', '1', math, '75'],
      ]),
    );
    expect(result.fileErrors).toEqual([]);
    expect(result).toMatchObject({ validCount: 3, invalidCount: 6, alreadyImported: null });
    expect(result.rows[1]!.resolved).toMatchObject({
      student: { id: students.Альфин!.student.id },
      period: { academicYear: '2025/2026', semester: 1, label: '2025/2026, 1 семестр' },
      score: 90,
    });
    expect(result.rows[2]!.resolved?.score).toBe(85.5);
    const errors = result.rows.map((item) => item.errors.join('; '));
    expect(errors[3]).toContain('не найден');
    expect(errors[4]).toContain('несколько');
    expect(errors[5]).toContain('Учебный год не распознан');
    expect(errors[5]).toContain('Семестр — 1 или 2');
    expect(errors[5]).toContain('Оценка — число от 0 до 100');
    expect(errors[6]).toContain('Вы не ведёте эту дисциплину');
    expect(errors[7]).toContain('Дисциплина «Нет такой» не найдена');
    // В чужой группе студента нет: сопоставление идёт внутри группы из файла.
    expect(errors[8]).toContain('не найден');
  });

  it('FR-006: файл без обязательных колонок и неподдерживаемый формат', async () => {
    const missing = await preview(
      teacher,
      csv([
        ['ФИО', 'Оценка'],
        ['Иванов', '80'],
      ]),
    );
    expect(missing.fileErrors.join()).toContain('«Учебный год»');
    await as(teacher, http().post('/api/grades/import/preview'))
      .attach('file', Buffer.from('ФИО'), 'оценки.txt')
      .expect(400);
  });

  let firstImportId: string;

  it('NFR-006: импорт сохраняет исходные оценки, повторная отправка и повторная загрузка не дублируют', async () => {
    const file = csv([
      HEADER,
      row(`${name('Альфин')} Пётр Ильич`, '2025/2026', '1', math, '70'),
      row(`${name('Альфин')} П. И.`, '2025/2026', '1', math, '90'),
      row(`${name('Альфин')} Пётр`, '2025/2026', '1', it_, '60'),
      row(`${name('Бетова')} Анна`, '2025/2026', '1', math, '85,5'),
      row(`${name('Альфин')} Пётр`, '2025/2026', '2', math, '88'),
      row(`${name('Альфин')} Пётр`, '2025/2026', '2', it_, '72'),
      row(`${name('Гаммин')} Олег`, '2025/2026', '2', it_, '64'),
    ]);
    const checked = await preview(teacher, file);
    expect(checked.invalidCount).toBe(0);
    const idempotencyKey = key();
    const created = (await commit(teacher, checked.rows, idempotencyKey).expect(201))
      .body as GradeImportResultDto;
    expect(created).toMatchObject({ created: 7, replayed: false });
    firstImportId = created.importId;

    const replay = (await commit(teacher, checked.rows, idempotencyKey).expect(201))
      .body as GradeImportResultDto;
    expect(replay).toMatchObject({ importId: firstImportId, replayed: true });

    // Тот же файл ещё раз (в другом порядке строк) — отклоняется, о прежней загрузке сказано в предпросмотре.
    const again = await preview(teacher, file);
    expect(again.alreadyImported?.fileName).toBe('оценки.csv');
    const conflict = await commit(teacher, [...checked.rows].reverse()).expect(409);
    expect(conflict.body.message).toContain('уже загружены');

    expect(
      await prisma.academicResult.count({
        where: { importId: firstImportId, source: 'SEMESTER_IMPORT' },
      }),
    ).toBe(7);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'grades.imported', entityId: firstImportId },
    });
    expect(audit?.after).toMatchObject({ rows: 7 });
  });

  it('импорт с ошибкой не сохраняет ни одной оценки', async () => {
    const checked = await preview(
      teacher,
      csv([
        HEADER,
        row(`${name('Бетова')} Анна`, '2024/2025', '2', math, '50'),
        row(`${name('Бетова')} Анна`, '2024/2025', '2', history, '50'),
      ]),
    );
    const response = await commit(teacher, checked.rows).expect(400);
    expect(Object.keys(response.body.fields)).toEqual(['rows.3']);
    expect(await prisma.academicPeriod.count({ where: { academicYear: '2024/2025' } })).toBe(0);
  });

  it('XLSX: числовые ячейки оценок и семестров распознаются', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Оценки');
    sheet.addRow(HEADER);
    sheet.addRow([`${name('Бетова')} Анна`, groupName, '2025/2026', 2, it_, 91]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const checked = await preview(teacher, buffer, 'оценки.xlsx');
    expect(checked.rows[0]!.resolved).toMatchObject({ score: 91, period: { semester: 2 } });
    await commit(teacher, checked.rows).expect(201);
  });

  it('средний балл по дисциплине и общий за семестр — среднее средних дисциплин', async () => {
    const grades = (
      await as(teacher, http().get(`/api/students/${students.Альфин!.student.id}/grades`)).expect(
        200,
      )
    ).body as StudentGradesDto;
    expect(grades.semesters.map((item) => item.period.label)).toEqual([
      '2025/2026, 2 семестр',
      '2025/2026, 1 семестр',
    ]);
    const first = grades.semesters[1]!;
    expect(first.groups).toEqual([{ id: groupId, name: groupName }]);
    expect(first.disciplines).toEqual([
      expect.objectContaining({
        discipline: expect.objectContaining({ name: it_ }),
        scores: [60],
        mean: 60,
      }),
      expect.objectContaining({
        discipline: expect.objectContaining({ name: math }),
        scores: [70, 90],
        mean: 80,
      }),
    ]);
    // (80 + 60) / 2 = 70; среднее всех оценок дало бы 73,3.
    expect(first.overall).toBe(70);
    expect(grades.semesters[0]!.overall).toBe(80);
  });

  it('FR-074: у студента без оценок — нет данных, а не ноль', async () => {
    const grades = (
      await as(teacher, http().get(`/api/students/${students.Двойнов!.student.id}/grades`)).expect(
        200,
      )
    ).body as StudentGradesDto;
    expect(grades.semesters).toEqual([]);
  });

  it('сравнение двух семестров группы: разность общих баллов и средних по дисциплинам', async () => {
    const options = (await as(teacher, http().get('/api/grades/options')).expect(200))
      .body as GradeOptionsDto;
    expect(options.groups.map((item) => item.id)).toEqual([groupId]);
    const first = options.periods.find((item) => item.label === '2025/2026, 1 семестр')!;
    const second = options.periods.find((item) => item.label === '2025/2026, 2 семестр')!;
    expect(options.periods.indexOf(second)).toBeLessThan(options.periods.indexOf(first));

    const data = (
      await as(teacher, http().get('/api/grades/group'))
        .query({ groupId, periodId: second.id, compareWith: first.id })
        .expect(200)
    ).body as GroupGradesDto;
    const byStudent = (last: string) =>
      data.students.find((item) => item.student.id === students[last]!.student.id)!;
    expect(byStudent('Альфин')).toMatchObject({ overall: 80, compareOverall: 70, delta: 10 });
    expect(byStudent('Бетова')).toMatchObject({ overall: 91, compareOverall: 85.5, delta: 5.5 });
    // Нет оценок за первый семестр — разности нет (не ноль).
    expect(byStudent('Гаммин')).toMatchObject({ overall: 64, compareOverall: null, delta: null });
    expect(byStudent('Двойнов')).toMatchObject({ overall: null, disciplineCount: 0 });
    // Среднее общих баллов студентов с оценками: (80 + 91 + 64) / 3 = 78,3.
    expect(data).toMatchObject({ overall: 78.3, compareOverall: 77.8, delta: 0.5 });
    const itRow = data.disciplines.find((item) => item.discipline.name === it_)!;
    // Информатика: 2 семестр — (72 + 91 + 64) / 3 = 75,7; 1 семестр — только Альфин, 60.
    expect(itRow).toMatchObject({ mean: 75.7, students: 3, compareMean: 60, delta: 15.7 });

    await as(teacher, http().get('/api/grades/group'))
      .query({ groupId, periodId: first.id, compareWith: first.id })
      .expect(400);
  });

  it('FR-002, FR-016: чужой преподаватель и студент не видят и не загружают оценки', async () => {
    const options = (await as(admin, http().get('/api/grades/options')).expect(200))
      .body as GradeOptionsDto;
    const periodId = options.periods[0]!.id;
    await as(stranger, http().get('/api/grades/group')).query({ groupId, periodId }).expect(404);
    await as(stranger, http().get(`/api/students/${students.Альфин!.student.id}/grades`)).expect(
      404,
    );
    const foreign = await preview(
      stranger,
      csv([HEADER, row(`${name('Бетова')} Анна`, '2025/2026', '1', math, '80')]),
    );
    expect(foreign.rows[0]!.errors.join()).toContain('Вы не ведёте эту дисциплину');

    await as(
      studentSession,
      http().get(`/api/students/${students.Альфин!.student.id}/grades`),
    ).expect(403);
    await as(studentSession, http().get('/api/grades/group'))
      .query({ groupId, periodId })
      .expect(403);
    await as(studentSession, http().get('/api/grades/imports')).expect(403);
    await as(studentSession, http().post('/api/grades/import/preview'))
      .attach('file', csv([HEADER]), 'оценки.csv')
      .expect(403);
  });

  it('отмена загрузки: только автор или администратор, оценки удаляются, загрузка остаётся в списке', async () => {
    const own = (await as(teacher, http().get('/api/grades/imports')).expect(200))
      .body as GradeImportDto[];
    expect(own.find((item) => item.id === firstImportId)).toMatchObject({
      rowCount: 7,
      periods: ['2025/2026, 1 семестр', '2025/2026, 2 семестр'],
      groups: [groupName],
      cancelledAt: null,
      canCancel: true,
    });
    const strangerList = (await as(stranger, http().get('/api/grades/imports')).expect(200))
      .body as GradeImportDto[];
    expect(strangerList.some((item) => item.id === firstImportId)).toBe(false);
    await as(stranger, http().delete(`/api/grades/imports/${firstImportId}`)).expect(404);

    await as(teacher, http().delete(`/api/grades/imports/${firstImportId}`)).expect(204);
    await as(teacher, http().delete(`/api/grades/imports/${firstImportId}`)).expect(409);
    expect(await prisma.academicResult.count({ where: { importId: firstImportId } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'grades.import_cancelled', entityId: firstImportId },
    });
    expect(audit?.before).toMatchObject({ rows: 7 });

    const all = (await as(admin, http().get('/api/grades/imports')).expect(200))
      .body as GradeImportDto[];
    expect(all.find((item) => item.id === firstImportId)).toMatchObject({
      canCancel: false,
      periods: [],
    });
    expect(all.find((item) => item.id === firstImportId)!.cancelledAt).not.toBeNull();

    const grades = (
      await as(teacher, http().get(`/api/students/${students.Альфин!.student.id}/grades`)).expect(
        200,
      )
    ).body as StudentGradesDto;
    expect(grades.semesters).toEqual([]);
  });
});
