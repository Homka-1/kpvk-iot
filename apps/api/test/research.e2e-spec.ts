import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AnalyticsDto,
  type AnswerValue,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticForm,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  type ResearchDataDto,
  type ResearchParticipantDto,
  type ResearchProjectDetailDto,
  RoleCode,
  type StudentCreatedDto,
  type TrajectoryOptionsDto,
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
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

/**
 * Полный набор ответов: минимальные значения и первые варианты. `high` — первый вопрос (прямой ключ
 * шкалы «Познавательный интерес» демо-методики) с максимальным значением: балл шкалы выше.
 */
function answersFor(form: DiagnosticForm, high: boolean): Record<string, AnswerValue> {
  return Object.fromEntries(
    form.questions.map((question, index): [string, AnswerValue] => {
      switch (question.type) {
        case 'SINGLE_CHOICE':
          return [question.key, question.options[0]!.key];
        case 'MULTIPLE_CHOICE':
          return [question.key, [question.options[0]!.key]];
        case 'SHORT_TEXT':
          return [question.key, 'ответ'];
        default:
          return [question.key, (high && index === 0 ? question.maxValue : question.minValue) ?? 1];
      }
    }),
  );
}

function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Аналитика и исследовательский режим (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let researcher: LoggedIn;
  let researcherWithPd: LoggedIn;
  let disciplineId: string;
  let experimentalGroupId: string;
  let controlGroupId: string;
  let questionnaire: QuestionnaireDetailDto;
  let versionId: string;
  let project: ResearchProjectDetailDto;
  const students: Record<'eg' | 'cg', StudentCreatedDto[]> = { eg: [], cg: [] };
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function createStudent(groupId: string, lastName: string) {
    return (
      await as(teacher, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
        .expect(201)
    ).body as StudentCreatedDto;
  }

  /** Назначить замер студенту и внести бумажный бланк; `daysAgo` — когда пройден. */
  async function measure(
    studentId: string,
    measurementType: 'PRIMARY' | 'REPEATED',
    high: boolean,
    daysAgo: number,
  ) {
    const assignment = (
      await as(teacher, http().post('/api/diagnostic-assignments'))
        .set('Idempotency-Key', key())
        .send({
          questionnaireId: questionnaire.id,
          studentId,
          measurementType,
          ...(measurementType === 'REPEATED' ? { versionId } : {}),
          startsAt: new Date(Date.now() - 60 * DAY).toISOString(),
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
      .send({
        answers: answersFor(form, high),
        completedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
      })
      .expect(201);
  }

  const data = async (query: Record<string, string> = {}) =>
    (
      await as(
        researcher,
        http().get(`/api/research-projects/${project.id}/data`).query(query),
      ).expect(200)
    ).body as ResearchDataDto;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);
    const pdUser = await createUser(app, { role: RoleCode.RESEARCHER });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'research.personal_data.read' },
    });
    await prisma.userPermission.create({
      data: { userId: pdUser.id, permissionId: permission.id, reason: 'Согласие участников' },
    });
    researcherWithPd = await login(app, pdUser.login);

    const group = (name: string) =>
      as(admin, http().post('/api/groups'))
        .send({ name, course: 1, specialty: 'Педагогика' })
        .expect(201)
        .then((response) => response.body.id as string);
    experimentalGroupId = await group(`ЭГ-${tag}`);
    controlGroupId = await group(`КГ-${tag}`);
    disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Психология ${tag}` })
        .expect(201)
    ).body.id as string;
    for (const groupId of [experimentalGroupId, controlGroupId]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherUser.id, groupId, disciplineId })
        .expect(201);
    }
    for (let index = 0; index < 3; index += 1) {
      students.eg.push(await createStudent(experimentalGroupId, `Экспериментов${index}`));
      students.cg.push(await createStudent(controlGroupId, `Контролев${index}`));
    }

    const content: QuestionnaireContent = {
      ...structuredClone(demo.content),
      title: `Методика исследования ${tag}`,
      source: 'Тестовый источник',
    };
    questionnaire = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    versionId = questionnaire.versions[0]!.id;
    await as(
      teacher,
      http().post(`/api/questionnaires/${questionnaire.id}/versions/${versionId}/publish`),
    ).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 2.4, AT-12: исследования ведёт исследователь; преподавателю и студенту — 403', async () => {
    await as(teacher, http().get('/api/research-projects')).expect(403);
    await as(teacher, http().post('/api/research-projects'))
      .set('Idempotency-Key', key())
      .send({ title: 'Чужое' })
      .expect(403);
    const student = students.eg[0]!;
    await prisma.user.update({
      where: { login: student.login },
      data: { mustChangePassword: false },
    });
    const studentSession = await login(app, student.login, student.temporaryPassword!);
    await as(studentSession, http().get('/api/research-projects')).expect(403);
    await as(studentSession, http().get('/api/analytics')).expect(403);
  });

  it('NFR-006: создание исследования — повтор с тем же ключом не создаёт дубля; аудит', async () => {
    const idempotencyKey = key();
    const body = {
      title: `Эффективность ИОТ ${tag}`,
      description: 'Опытно-экспериментальная работа',
      startsOn: isoDay(-90),
      endsOn: isoDay(90),
    };
    const send = () =>
      as(researcher, http().post('/api/research-projects'))
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);
    project = (await send()).body as ResearchProjectDetailDto;
    const again = (await send()).body as ResearchProjectDetailDto;
    expect(again.id).toBe(project.id);
    expect(project).toMatchObject({ status: 'DRAFT', editable: true, measurements: 0 });
    expect(await prisma.researchProject.count({ where: { title: body.title } })).toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'research_project.created', entityId: project.id },
    });
    expect(audit).not.toBeNull();
    await as(researcher, http().post('/api/research-projects'))
      .set('Idempotency-Key', key())
      .send({ title: '' })
      .expect(400);
  });

  it('огр. 4: студент с ИОТ в работе не включается в КГ; участнику КГ ИОТ не создаётся (403)', async () => {
    const withRoute = students.cg[0]!;
    const options = (
      await as(teacher, http().get(`/api/students/${withRoute.student.id}/trajectory-options`))
    ).body as TrajectoryOptionsDto;
    const draft = await as(teacher, http().post('/api/trajectories'))
      .set('Idempotency-Key', key())
      .send({
        studentId: withRoute.student.id,
        disciplineId,
        templateId: options.templates.find((item) => item.isStandard)!.id,
      })
      .expect(201);
    const conflict = await as(
      researcher,
      http().post(`/api/research-projects/${project.id}/participants`),
    )
      .send({ groupId: controlGroupId, group: 'CONTROL' })
      .expect(409);
    expect(conflict.body.message).toContain(withRoute.student.participantCode);
    expect(await prisma.researchParticipant.count({ where: { projectId: project.id } })).toBe(0);

    // Черновик снят — группа включается в КГ.
    await prisma.trajectory.update({
      where: { id: draft.body.id as string },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    const added = await as(
      researcher,
      http().post(`/api/research-projects/${project.id}/participants`),
    )
      .send({ groupId: controlGroupId, group: 'CONTROL' })
      .expect(201);
    expect(added.body).toEqual({ added: 3, skipped: 0 });

    // Новый маршрут участнику контрольной группы — запрещён на сервере.
    const forbidden = await as(teacher, http().post('/api/trajectories'))
      .set('Idempotency-Key', key())
      .send({
        studentId: withRoute.student.id,
        disciplineId,
        templateId: options.templates.find((item) => item.isStandard)!.id,
      })
      .expect(403);
    expect(forbidden.body.message).toContain('контрольную группу');
  });

  it('UC-07: коды участникам ЭГ; повторное включение без дублей; ФИО — только с разрешением', async () => {
    const add = () =>
      as(researcher, http().post(`/api/research-projects/${project.id}/participants`))
        .send({ groupId: experimentalGroupId, group: 'EXPERIMENTAL' })
        .expect(201);
    expect((await add()).body).toEqual({ added: 3, skipped: 0 });
    expect((await add()).body).toEqual({ added: 0, skipped: 3 });

    const list = (
      await as(researcher, http().get(`/api/research-projects/${project.id}/participants`)).expect(
        200,
      )
    ).body as ResearchParticipantDto[];
    expect(list.map((item) => item.code)).toEqual(['R001', 'R002', 'R003', 'R004', 'R005', 'R006']);
    expect(list.filter((item) => item.group === 'EXPERIMENTAL')).toHaveLength(3);
    expect(list.every((item) => item.fullName === null)).toBe(true);
    expect(JSON.stringify(list)).not.toContain('Экспериментов');

    const personal = (
      await as(
        researcherWithPd,
        http().get(`/api/research-projects/${project.id}/participants`),
      ).expect(200)
    ).body as ResearchParticipantDto[];
    expect(personal.some((item) => item.fullName?.startsWith('Экспериментов'))).toBe(true);
  });

  it('FR-072, FR-073: замеры по версии методики; полные и неполные наблюдения, статистики ЭГ/КГ', async () => {
    const addMeasurement = (body: Record<string, unknown>) =>
      as(researcher, http().post(`/api/research-projects/${project.id}/measurements`))
        .set('Idempotency-Key', key())
        .send({ versionId, startsOn: isoDay(-60), ...body });
    await addMeasurement({ measurementType: 'PRIMARY', title: '' }).expect(400);
    await addMeasurement({
      measurementType: 'PRIMARY',
      title: 'Входной замер',
      endsOn: isoDay(-20),
    }).expect(201);
    project = (
      await addMeasurement({
        measurementType: 'REPEATED',
        title: 'Итоговый замер',
        startsOn: isoDay(-19),
        endsOn: isoDay(0),
      }).expect(201)
    ).body as ResearchProjectDetailDto;
    expect(project.measurementList.map((item) => item.questionnaire.versionNumber)).toEqual([1, 1]);

    // ЭГ: первичный низкий, повторный высокий; у третьего студента повторного нет.
    for (const [index, student] of students.eg.entries()) {
      await measure(student.student.id, 'PRIMARY', false, 40);
      if (index < 2) await measure(student.student.id, 'REPEATED', true, 5);
    }
    // КГ: оба замера низкие.
    for (const student of students.cg) {
      await measure(student.student.id, 'PRIMARY', false, 40);
      await measure(student.student.id, 'REPEATED', false, 5);
    }
    // Незавершённое прохождение в расчёт не входит.
    await as(teacher, http().post('/api/diagnostic-assignments'))
      .set('Idempotency-Key', key())
      .send({
        questionnaireId: questionnaire.id,
        studentId: students.eg[2]!.student.id,
        measurementType: 'REPEATED',
        versionId,
        startsAt: new Date(Date.now() - DAY).toISOString(),
        endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
      })
      .expect(201);

    const result = await data();
    expect(result.excludedParticipants).toBe(0);
    expect(result.observations).toEqual([
      { group: 'EXPERIMENTAL', participants: 3, complete: 2, incomplete: 1 },
      { group: 'CONTROL', participants: 3, complete: 3, incomplete: 0 },
    ]);
    const [primary, repeated] = result.measurements;
    const scale = result.scales[0]!;
    const row = (measurementId: string, group: string) =>
      result.stats.find(
        (item) =>
          item.measurementId === measurementId &&
          item.scaleKey === scale.key &&
          item.group === group,
      )!.stats;
    expect(row(primary!.id, 'EXPERIMENTAL')).toMatchObject({ n: 3, missing: 0 });
    expect(row(repeated!.id, 'EXPERIMENTAL')).toMatchObject({ n: 2, missing: 1 });
    expect(row(repeated!.id, 'EXPERIMENTAL').mean!).toBeGreaterThan(
      row(primary!.id, 'EXPERIMENTAL').mean!,
    );
    const change = result.changes[0]!;
    expect(change.comparable).toBe(true);
    const egChange = change.rows.find(
      (item) => item.scaleKey === scale.key && item.group === 'EXPERIMENTAL',
    )!.stats;
    const cgChange = change.rows.find(
      (item) => item.scaleKey === scale.key && item.group === 'CONTROL',
    )!.stats;
    expect(egChange).toMatchObject({ n: 2, missing: 1 });
    expect(egChange.mean!).toBeGreaterThan(0);
    expect(cgChange).toMatchObject({ n: 3, mean: 0 });

    // Выбор шкалы и замера сужает таблицу.
    const narrowed = await data({ measurementIds: primary!.id, scaleKeys: scale.key });
    expect(narrowed.scales.map((item) => item.key)).toEqual([scale.key]);
    expect(narrowed.stats).toHaveLength(2);
    expect(narrowed.changes).toEqual([]);
  });

  it('AT-11, FR-075: обезличенная выгрузка ЭГ и КГ — CSV и XLSX без ФИО, с аудитом', async () => {
    const before = await prisma.auditLog.count({
      where: { action: 'research_data.exported', entityId: project.id },
    });
    const csv = await as(researcher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'csv', dataset: 'raw' })
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.slice(1).trim().split('\r\n');
    expect(lines[0]).toContain('Код участника;Группа исследования;Наблюдение');
    expect(
      lines
        .slice(1)
        .map((line) => line.split(';').slice(0, 2).join(';'))
        .sort(),
    ).toEqual(['R001;КГ', 'R002;КГ', 'R003;КГ', 'R004;ЭГ', 'R005;ЭГ', 'R006;ЭГ']);
    for (const secret of ['Экспериментов', 'Контролев', students.eg[0]!.login]) {
      expect(csv.text).not.toContain(secret);
    }
    // Неполное наблюдение: пустые ячейки повторного замера, а не нули.
    expect(csv.text).toContain('неполное');
    expect(csv.text).toMatch(/;;/);

    const xlsx = await as(researcher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'xlsx', dataset: 'aggregate' })
      .buffer(true)
      .parse(binary)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body as Buffer);
    const sheet = workbook.getWorksheet('Сводные показатели')!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(expect.arrayContaining(['Группа исследования', 'Среднее', 'Медиана']));
    const groups = new Set<unknown>();
    sheet.eachRow((row, index) => {
      if (index > 1) groups.add(row.getCell(6).value);
    });
    expect([...groups].sort()).toEqual(['Контрольная группа', 'Экспериментальная группа']);

    expect(
      await prisma.auditLog.count({
        where: { action: 'research_data.exported', entityId: project.id },
      }),
    ).toBe(before + 2);
    await as(teacher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'csv', dataset: 'raw' })
      .expect(403);
    await as(researcher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'pdf', dataset: 'raw' })
      .expect(400);
  });

  it('UC-07: исключённый участник не входит в расчёт; статусы и запрет изменений после завершения', async () => {
    const list = (
      await as(researcher, http().get(`/api/research-projects/${project.id}/participants`)).expect(
        200,
      )
    ).body as ResearchParticipantDto[];
    const target = list.find((item) => item.group === 'CONTROL')!;
    const excluded = await as(
      researcher,
      http().post(`/api/research-projects/${project.id}/participants/${target.id}/exclude`),
    )
      .send({ reason: 'Отчислен' })
      .expect(200);
    expect(excluded.body.excludedAt).not.toBeNull();
    const result = await data();
    expect(result.excludedParticipants).toBe(1);
    expect(result.observations.find((item) => item.group === 'CONTROL')!.participants).toBe(2);

    const status = (value: string) =>
      as(researcher, http().post(`/api/research-projects/${project.id}/status`)).send({
        status: value,
      });
    await status('COMPLETED').expect(409);
    await status('ACTIVE').expect(200);
    const completed = (await status('COMPLETED').expect(200)).body as ResearchProjectDetailDto;
    expect(completed.editable).toBe(false);
    await as(researcher, http().post(`/api/research-projects/${project.id}/participants`))
      .send({ groupId: experimentalGroupId, group: 'EXPERIMENTAL' })
      .expect(409);
    // Данные завершённого исследования по-прежнему доступны для анализа.
    await data();
    expect(
      await prisma.auditLog.count({
        where: { action: 'research_project.status_changed', entityId: project.id },
      }),
    ).toBe(2);
  });

  it('FR-069, FR-070, FR-073: аналитика преподавателя — статистики по группам и до/после', async () => {
    const analytics = (
      await as(teacher, http().get('/api/analytics'))
        .query({ versionId, period: 'ALL' })
        .expect(200)
    ).body as AnalyticsDto;
    const motivation = analytics.motivation;
    expect(motivation.selected?.versionId).toBe(versionId);
    expect(motivation.completed).toBe(11);
    expect(motivation.incomplete).toBe(1);
    const scale = motivation.scales[0]!;
    expect(scale.measurements.map((item) => [item.measurementType, item.stats.n])).toEqual([
      ['PRIMARY', 6],
      ['REPEATED', 5],
    ]);
    expect(scale.change).toMatchObject({ n: 5, missing: 1 });

    expect(analytics.profiles.total.total).toBe(6);
    expect(analytics.profiles.groups.map((item) => item.distribution.total)).toEqual([3, 3]);
    // Нет маршрутов в работе — пустые статистики, а не нули.
    expect(analytics.trajectories.progress.total).toMatchObject({ n: 0, mean: null });

    // Фильтр группы шапки сужает расчёт.
    const filtered = (
      await as(teacher, http().get('/api/analytics'))
        .query({ versionId, period: 'ALL', groupId: experimentalGroupId })
        .expect(200)
    ).body as AnalyticsDto;
    expect(filtered.motivation.scales[0]!.measurements[0]!.stats.n).toBe(3);
    expect(filtered.profiles.groups).toHaveLength(1);

    // Исследователь не привязан к группам: аналитика преподавателя ему недоступна.
    await as(researcher, http().get('/api/analytics')).expect(403);
  });
});
