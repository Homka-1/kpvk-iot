import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AnswerValue,
  type ComparabilityQuestionnaireDto,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticComparisonDto,
  type DiagnosticForm,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  type QuestionnaireVersionDto,
  RoleCode,
  type StudentCreatedDto,
} from '@iot/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;
const DAY = 24 * 60 * 60 * 1000;

/** Полный набор ответов по форме: минимальное значение шкал, первый вариант, короткий текст. */
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

/** Двоичный ответ supertest (XLSX) как Buffer. */
function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Повторная диагностика и сравнение замеров (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let groupId: string;
  let student: StudentCreatedDto;
  let questionnaire: QuestionnaireDetailDto;
  let v1: string;
  let v2: string;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  const period = () => ({
    startsAt: new Date(Date.now() - DAY).toISOString(),
    endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
  });

  function assign(body: Record<string, unknown>) {
    return as(teacher, http().post('/api/diagnostic-assignments'))
      .set('Idempotency-Key', key())
      .send({
        questionnaireId: questionnaire.id,
        studentId: student.student.id,
        ...period(),
        ...body,
      });
  }

  /** Назначить студенту и внести бумажный бланк с датой `daysAgo` дней назад. */
  async function measure(body: Record<string, unknown>, daysAgo: number) {
    const assignment = (await assign(body).expect(201)).body as DiagnosticAssignmentDetailDto;
    const sessionId = assignment.sessions[0]!.id;
    const form = (
      await as(teacher, http().get(`/api/diagnostic-sessions/${sessionId}/form`)).expect(200)
    ).body as DiagnosticForm;
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
      .set('Idempotency-Key', key())
      .send({
        answers: answersFor(form),
        completedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
      })
      .expect(201);
    return { assignment, sessionId };
  }

  const comparison = async (session = teacher) =>
    (
      (
        await as(
          session,
          http().get(`/api/students/${student.student.id}/diagnostics/comparison`),
        ).expect(200)
      ).body as DiagnosticComparisonDto[]
    ).find((item) => item.questionnaireId === questionnaire.id)!;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    otherTeacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);

    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ПЗ-${tag}`, course: 2, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    const disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Алгоритмы ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);
    student = (
      await as(teacher, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName: `Секретов${tag}`, firstName: 'Тест', groupId })
        .expect(201)
    ).body as StudentCreatedDto;

    const content: QuestionnaireContent = {
      ...structuredClone(demo.content),
      title: `Методика замеров ${tag}`,
      source: 'Тестовый источник',
    };
    questionnaire = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    v1 = questionnaire.versions[0]!.id;
    await as(
      teacher,
      http().post(`/api/questionnaires/${questionnaire.id}/versions/${v1}/publish`),
    ).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('UC-06: первичный замер — только действующая версия; повторный — опубликованная ранее', async () => {
    await measure({ measurementType: 'PRIMARY' }, 30);

    const draft = (
      await as(teacher, http().post(`/api/questionnaires/${questionnaire.id}/versions`))
        .send({ changeNote: 'Новая редакция' })
        .expect(201)
    ).body as QuestionnaireVersionDto;
    v2 = draft.id;
    // Черновик назначить нельзя ни для какого замера.
    const res = await assign({ measurementType: 'REPEATED', versionId: v2 }).expect(400);
    expect(res.body.fields).toHaveProperty('versionId');
    await as(
      teacher,
      http().post(`/api/questionnaires/${questionnaire.id}/versions/${v2}/publish`),
    ).expect(200);

    // Первичный замер по выбранной (не действующей) версии — нельзя.
    const primary = await assign({ measurementType: 'PRIMARY', versionId: v1 }).expect(400);
    expect(primary.body.fields).toHaveProperty('versionId');
    await assign({ measurementType: 'UNKNOWN' }).expect(400);

    // Повторный замер по прежней (уже заменённой) версии — можно.
    const repeated = await measure({ measurementType: 'REPEATED', versionId: v1 }, 10);
    expect(repeated.assignment).toMatchObject({
      measurementType: 'REPEATED',
      questionnaire: { versionId: v1, versionNumber: 1 },
    });
    const session = await prisma.diagnosticSession.findUniqueOrThrow({
      where: { id: repeated.sessionId },
    });
    expect(session.measurementType).toBe('REPEATED');
    // Без versionId — действующая версия 2.
    const current = await measure({ measurementType: 'INTERMEDIATE' }, 5);
    expect(current.assignment.questionnaire.versionNumber).toBe(2);
  });

  it('FR-024, FR-015, AT-10: повторный замер сравнивается с первичным; несопоставимая версия — отдельно', async () => {
    const result = await comparison();
    expect(result.measurements.map((item) => [item.measurementType, item.versionNumber])).toEqual([
      ['PRIMARY', 1],
      ['REPEATED', 1],
    ]);
    expect(result.scales.length).toBeGreaterThan(0);
    for (const scale of result.scales) {
      const first = result.measurements[0]!.values[scale.code]!.rawScore;
      const last = result.measurements[1]!.values[scale.code]!.rawScore;
      expect(result.changes[scale.code]).toBe(
        first === null || last === null ? null : Math.round((last - first) * 100) / 100,
      );
    }
    expect(result.excluded).toEqual([
      expect.objectContaining({
        measurementType: 'INTERMEDIATE',
        versionNumber: 2,
        reason: 'Версия 2 не утверждена как сопоставимая с версией 1',
      }),
    ]);
  });

  it('FR-002, AT-12: сравнение — только студенты своих групп', async () => {
    await as(
      otherTeacher,
      http().get(`/api/students/${student.student.id}/diagnostics/comparison`),
    ).expect(404);
    await as(
      researcher,
      http().get(`/api/students/${student.student.id}/diagnostics/comparison`),
    ).expect(403);
  });

  it('UC-06: сопоставимость версий утверждает исследователь, с аудитом; повтор — 409', async () => {
    const body = { versionAId: v2, versionBId: v1, note: 'Ключи шкал не менялись' };
    await as(teacher, http().post('/api/questionnaire-comparabilities')).send(body).expect(403);
    await as(admin, http().post('/api/questionnaire-comparabilities')).send(body).expect(403);
    await as(researcher, http().post('/api/questionnaire-comparabilities'))
      .send({ versionAId: v1, versionBId: v1 })
      .expect(400);

    const approved = (
      await as(researcher, http().post('/api/questionnaire-comparabilities')).send(body).expect(201)
    ).body as ComparabilityQuestionnaireDto;
    expect(approved.comparabilities).toEqual([
      expect.objectContaining({
        versionA: { id: v1, versionNumber: 1 },
        versionB: { id: v2, versionNumber: 2 },
        note: 'Ключи шкал не менялись',
      }),
    ]);
    expect(approved.versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    await as(researcher, http().post('/api/questionnaire-comparabilities')).send(body).expect(409);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'questionnaire_comparability.approved',
          entityId: approved.comparabilities[0]!.id,
        },
      }),
    ).toBe(1);

    const list = (
      await as(researcher, http().get('/api/questionnaire-comparabilities')).expect(200)
    ).body as ComparabilityQuestionnaireDto[];
    expect(list.find((item) => item.id === questionnaire.id)?.comparabilities).toHaveLength(1);
    await as(teacher, http().get('/api/questionnaire-comparabilities')).expect(403);

    // Преподаватель видит утверждённые пары в карточке методики (выбор версии при назначении).
    const detail = (
      await as(teacher, http().get(`/api/questionnaires/${questionnaire.id}`)).expect(200)
    ).body as QuestionnaireDetailDto;
    expect(detail.comparabilities).toEqual([{ versionAId: v1, versionBId: v2 }]);

    // После утверждения замер версии 2 входит в сравнение.
    const result = await comparison();
    expect(result.measurements.map((item) => item.versionNumber)).toEqual([1, 1, 2]);
    expect(result.excluded).toEqual([]);
  });

  it('UC-06: отзыв сопоставимости — с причиной в аудите, сравнение снова раздельное', async () => {
    const list = (
      await as(researcher, http().get('/api/questionnaire-comparabilities')).expect(200)
    ).body as ComparabilityQuestionnaireDto[];
    const pairId = list.find((item) => item.id === questionnaire.id)!.comparabilities[0]!.id;
    await as(researcher, http().post(`/api/questionnaire-comparabilities/${pairId}/revoke`))
      .send({})
      .expect(400);
    const revoked = (
      await as(researcher, http().post(`/api/questionnaire-comparabilities/${pairId}/revoke`))
        .send({ reason: 'Ошибочно утверждена' })
        .expect(200)
    ).body as ComparabilityQuestionnaireDto;
    expect(revoked.comparabilities).toEqual([]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'questionnaire_comparability.revoked', entityId: pairId },
    });
    expect(audit.reason).toBe('Ошибочно утверждена');
    expect((await comparison()).excluded).toHaveLength(1);
  });

  it('FR-025: обезличенная выгрузка CSV — код участника и версия, без ФИО и логинов; аудит', async () => {
    const query = { questionnaireId: questionnaire.id, format: 'csv' };
    await as(teacher, http().get('/api/diagnostic-results/export')).query(query).expect(403);
    await as(admin, http().get('/api/diagnostic-results/export')).query(query).expect(403);
    await as(researcher, http().get('/api/diagnostic-results/export'))
      .query({ ...query, format: 'pdf' })
      .expect(400);

    const res = await as(researcher, http().get('/api/diagnostic-results/export'))
      .query(query)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="diagnostics-.+\.csv"/,
    );
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toContain('Код участника;Группа;Методика;Версия методики;Замер');
    expect(lines).toHaveLength(4);
    expect(text).toContain(student.student.participantCode);
    expect(text).toContain(`ПЗ-${tag}`);
    expect(text).toContain('Повторный');
    expect(text).not.toContain(`Секретов${tag}`);
    expect(text).not.toContain(student.login);

    const repeated = await as(researcher, http().get('/api/diagnostic-results/export'))
      .query({ ...query, measurementType: 'REPEATED' })
      .expect(200);
    expect(repeated.text.slice(1).trim().split('\r\n')).toHaveLength(2);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'diagnostic_results.exported', entityId: questionnaire.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.after).toMatchObject({ format: 'csv', rowCount: 3, measurementType: null });
    expect(JSON.stringify(audit)).not.toContain(student.student.participantCode);
  });

  it('FR-025: выгрузка XLSX — те же данные без персональных данных', async () => {
    const res = await as(researcher, http().get('/api/diagnostic-results/export'))
      .query({ questionnaireId: questionnaire.id, format: 'xlsx' })
      .buffer(true)
      .parse(binary)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.rowCount).toBe(4);
    const cells = sheet
      .getSheetValues()
      .flat()
      .map((value) => String(value ?? ''));
    expect(cells).toContain(student.student.participantCode);
    expect(cells.join('|')).not.toContain(`Секретов${tag}`);
    expect(cells.join('|')).not.toContain(student.login);
  });
});
