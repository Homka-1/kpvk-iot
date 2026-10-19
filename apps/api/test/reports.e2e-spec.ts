import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AnswerValue,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticForm,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  RoleCode,
  type StudentCreatedDto,
} from '@iot/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const tag = randomBytes(3).toString('hex').toUpperCase();
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;
const DAY = 24 * 60 * 60 * 1000;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function answersFor(form: DiagnosticForm): Record<string, AnswerValue> {
  return Object.fromEntries(
    form.questions.map((question): [string, AnswerValue] => {
      switch (question.type) {
        case 'SINGLE_CHOICE':
          return [question.key, question.options[0]!.key];
        case 'MULTIPLE_CHOICE':
          return [question.key, [question.options[0]!.key]];
        case 'SHORT_TEXT':
          return [question.key, 'ответ'];
        default:
          return [question.key, question.minValue ?? 1];
      }
    }),
  );
}

function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Отчёты (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let teacherUserId: string;
  let outsider: LoggedIn;
  let researcher: LoggedIn;
  let groupId: string;
  let otherGroupId: string;
  let student: StudentCreatedDto;
  let studentSession: LoggedIn;
  let versionId: string;

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });
  const download = (session: LoggedIn, path: string, query: Record<string, string>) =>
    as(session, http().get(`/api/reports/${path}`).query(query))
      .buffer(true)
      .parse(binary);

  async function workbook(session: LoggedIn, path: string, query: Record<string, string> = {}) {
    const res = await download(session, path, { format: 'xlsx', ...query }).expect(200);
    expect(res.headers['content-type']).toContain(XLSX_TYPE);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as never);
    return { book, headers: res.headers };
  }

  const cells = (book: ExcelJS.Workbook) =>
    book.worksheets.flatMap((sheet) =>
      sheet.getSheetValues().flatMap((row) => (Array.isArray(row) ? row : [])),
    );

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacherUserId = teacherUser.id;
    teacher = await login(app, teacherUser.login);
    outsider = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);

    const group = (name: string) =>
      as(admin, http().post('/api/groups'))
        .send({ name, course: 2, specialty: 'Педагогика' })
        .expect(201)
        .then((response) => response.body.id as string);
    groupId = await group(`ОТЧ-${tag}`);
    otherGroupId = await group(`ДРУГ-${tag}`);
    const disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Психология ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUserId, groupId, disciplineId })
      .expect(201);

    student = (
      await as(teacher, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName: `Отчётов${tag}`, firstName: 'Тест', groupId })
        .expect(201)
    ).body as StudentCreatedDto;
    await prisma.user.update({
      where: { login: student.login! },
      data: { mustChangePassword: false },
    });
    studentSession = await login(app, student.login!, student.temporaryPassword!);

    const questionnaire = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({
          content: {
            ...structuredClone(demo.content),
            title: `Методика отчёта ${tag}`,
            source: 'Тестовый источник',
          } satisfies QuestionnaireContent,
        })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    versionId = questionnaire.versions[0]!.id;
    await as(
      teacher,
      http().post(`/api/questionnaires/${questionnaire.id}/versions/${versionId}/publish`),
    ).expect(200);
    const assignment = (
      await as(teacher, http().post('/api/diagnostic-assignments'))
        .set('Idempotency-Key', key())
        .send({
          questionnaireId: questionnaire.id,
          studentId: student.student.id,
          measurementType: 'PRIMARY',
          startsAt: new Date(Date.now() - 10 * DAY).toISOString(),
          endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
        })
        .expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    const sessionId = assignment.sessions[0]!.id;
    const form = (
      await as(teacher, http().get(`/api/diagnostic-sessions/${sessionId}/form`)).expect(200)
    ).body as DiagnosticForm;
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
      .set('Idempotency-Key', key())
      .send({ answers: answersFor(form), completedAt: new Date(Date.now() - DAY).toISOString() })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-076, FR-080: индивидуальный отчёт студента в XLSX с реквизитами и диагностикой', async () => {
    const { book, headers } = await workbook(teacher, `students/${student.student.id}`);
    expect(headers['content-disposition']).toMatch(
      /attachment; filename="report-student-.*\.xlsx"/,
    );
    const values = cells(book);
    expect(book.worksheets[0]!.name).toBe('Сводка');
    expect(values).toContain('Индивидуальный отчёт студента');
    expect(values).toContain('Дата формирования');
    expect(values).toContain('Период');
    expect(values).toContain('Сформировал');
    expect(values.some((value) => String(value).includes(student.student.participantCode))).toBe(
      true,
    );
    const diagnostics = book.getWorksheet('Результаты диагностики')!;
    expect(diagnostics.rowCount).toBeGreaterThan(1);
    // ИОТ у студента нет: пояснение, а не нулевые показатели (FR-005).
    const trajectories = book.worksheets.find((sheet) => sheet.name.startsWith('Индивидуальные'))!;
    expect(trajectories.rowCount).toBe(3);
  });

  it('FR-080: отчёт в PDF (кириллица встроена шрифтом)', async () => {
    const res = await download(teacher, `students/${student.student.id}`, { format: 'pdf' }).expect(
      200,
    );
    expect(res.headers['content-type']).toContain('application/pdf');
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(2000);
  });

  it('FR-077: отчёт по группе содержит состав, профили и статистики', async () => {
    const { book } = await workbook(teacher, 'group', { groupId });
    const values = cells(book);
    expect(values).toContain('Студентов в группе');
    expect(book.getWorksheet('Статистики группы')).toBeDefined();
    // Группа без ИОТ: статистики — «Нет данных», не нули.
    const stats = book.getWorksheet('Статистики группы')!;
    expect(String(stats.getRow(2).getCell(3).value)).toBe('0');
    expect(String(stats.getRow(2).getCell(5).value)).toBe('Нет данных');
  });

  it('FR-078, FR-079: отчёты по ИОТ и по диагностике формируются', async () => {
    const trajectories = await workbook(teacher, 'trajectories', { groupId });
    expect(cells(trajectories.book)).toContain('Отчёт по реализации ИОТ');

    const diagnostics = await workbook(teacher, 'diagnostics', { groupId, versionId });
    const values = cells(diagnostics.book);
    expect(values).toContain('Завершено (вошли в расчёт)');
    expect(values.some((value) => String(value).startsWith('Методика отчёта'))).toBe(false);
    expect(values.some((value) => String(value).includes(`Методика отчёта ${tag}`))).toBe(true);
  });

  it('FR-002: чужие студент и группа — 404, группа обязательна для группового отчёта', async () => {
    await download(outsider, `students/${student.student.id}`, { format: 'pdf' }).expect(404);
    await download(outsider, 'group', { format: 'pdf', groupId }).expect(404);
    await download(teacher, 'group', { format: 'pdf', groupId: otherGroupId }).expect(404);
    await download(teacher, 'group', { format: 'pdf' }).expect(400);
    await download(teacher, 'trajectories', { format: 'txt' }).expect(400);
  });

  it('п. 2.4, AT-12: исследователь, студент и администратор отчётов по студентам не получают', async () => {
    for (const session of [researcher, studentSession, admin]) {
      await download(session, `students/${student.student.id}`, { format: 'pdf' }).expect(403);
      await download(session, 'trajectories', { format: 'pdf' }).expect(403);
    }
  });

  it('п. 8.3: формирование отчёта пишется в аудит без ПДн', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { action: 'report.generated', actorId: teacherUserId },
    });
    expect(logs.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(logs.map((log) => log.after))).not.toContain('Отчётов');
  });
});
