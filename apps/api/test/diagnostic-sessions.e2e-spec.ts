import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  type AnswerMap,
  type AnswerValue,
  type CabinetDiagnosticDto,
  type CabinetDiagnosticSessionDto,
  type DiagnosticAnswersDto,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticAssignmentDto,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  type QuestionnaireVersionDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentDiagnosticDto,
} from '@iot/shared';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;

interface ControlExample {
  answers: AnswerMap;
  expected: Record<
    string,
    { rawScore: number | null; missingAnswers: number; levelCode: string | null }
  >;
}
const example = (name: string) =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, 'fixtures/diagnostics/demo-motivation/1', `${name}.json`),
      'utf8',
    ),
  ) as ControlExample;

const DAY = 24 * 60 * 60 * 1000;

describe('Проведение диагностики (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let studentSession: LoggedIn;
  let otherStudentSession: LoggedIn;
  let groupId: string;
  let students: StudentCreatedDto[];
  let otherStudent: StudentCreatedDto;
  let questionnaire: QuestionnaireDetailDto;
  /** Ключи демо-определения (q1, q5-o1, …) → id в опубликованной версии. */
  const keyMap = new Map<string, string>();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  function mapAnswers(answers: AnswerMap): Record<string, AnswerValue> {
    const mapValue = (value: AnswerValue | undefined): AnswerValue =>
      Array.isArray(value)
        ? value.map((item) => keyMap.get(item)!)
        : typeof value === 'string' && keyMap.has(value)
          ? keyMap.get(value)!
          : (value ?? null);
    return Object.fromEntries(
      Object.entries(answers).map(([questionKey, value]) => [
        keyMap.get(questionKey)!,
        mapValue(value),
      ]),
    );
  }

  function assign(body: Record<string, unknown>, idem = key()) {
    return as(teacher, http().post('/api/diagnostic-assignments'))
      .set('Idempotency-Key', idem)
      .send(body);
  }

  const period = (startOffset = -DAY, endOffset = 7 * DAY) => ({
    startsAt: new Date(Date.now() + startOffset).toISOString(),
    endsAt: new Date(Date.now() + endOffset).toISOString(),
  });

  async function studentLogin(created: StudentCreatedDto): Promise<LoggedIn> {
    await prisma.user.update({
      where: { login: created.login },
      data: { mustChangePassword: false },
    });
    return login(app, created.login, created.temporaryPassword!);
  }

  async function ownSessionId(session: LoggedIn, assignmentId: string) {
    const list = (await as(session, http().get('/api/cabinet/diagnostics')).expect(200))
      .body as CabinetDiagnosticDto[];
    const rows = await prisma.diagnosticSession.findMany({
      where: { assignmentId },
      select: { id: true },
    });
    const own = list.find((item) => rows.some((row) => row.id === item.id));
    return own!.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER, lastName: 'Иванова' });
    teacher = await login(app, teacherUser.login);
    const otherUser = await createUser(app, { role: RoleCode.TEACHER });
    otherTeacher = await login(app, otherUser.login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);

    const tag = suffix();
    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ДГ-${tag}`, course: 1, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    const foreignGroupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ДЧ-${tag}`, course: 1, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    const disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Логика ${tag}` })
        .expect(201)
    ).body.id as string;
    for (const [teacherId, group] of [
      [teacherUser.id, groupId],
      [otherUser.id, foreignGroupId],
    ] as const) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId, groupId: group, disciplineId })
        .expect(201);
    }
    const create = (session: LoggedIn, group: string, lastName: string) =>
      as(session, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName, firstName: 'Тест', groupId: group })
        .expect(201)
        .then((res) => res.body as StudentCreatedDto);
    students = [
      await create(teacher, groupId, 'Алексеев'),
      await create(teacher, groupId, 'Борисов'),
      await create(teacher, groupId, 'Васильев'),
    ];
    otherStudent = await create(otherTeacher, foreignGroupId, 'Чужов');
    studentSession = await studentLogin(students[0]!);
    otherStudentSession = await studentLogin(otherStudent);

    const content: QuestionnaireContent = {
      ...structuredClone(demo.content),
      title: `Методика проведения ${tag}`,
      source: 'Тестовый источник',
    };
    questionnaire = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    const versionId = questionnaire.versions[0]!.id;
    await as(
      teacher,
      http().post(`/api/questionnaires/${questionnaire.id}/versions/${versionId}/publish`),
    ).expect(200);
    const saved = (
      await as(
        teacher,
        http().get(`/api/questionnaires/${questionnaire.id}/versions/${versionId}`),
      ).expect(200)
    ).body as QuestionnaireVersionDto;
    demo.content.questions.forEach((question, index) => {
      keyMap.set(question.key, saved.content.questions[index]!.key);
      question.options.forEach((option, optionIndex) =>
        keyMap.set(option.key, saved.content.questions[index]!.options[optionIndex]!.key),
      );
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 2.1, AT-12: назначать диагностику могут только преподаватели', async () => {
    const body = { questionnaireId: questionnaire.id, groupId, ...period() };
    for (const session of [admin, researcher, studentSession]) {
      await as(session, http().post('/api/diagnostic-assignments'))
        .set('Idempotency-Key', key())
        .send(body)
        .expect(403);
    }
    await as(studentSession, http().get('/api/diagnostic-assignments')).expect(403);
  });

  it('FR-018, FR-019, NFR-006: назначение группе создаёт прохождения и уведомления; повтор без дублей', async () => {
    const idem = key();
    const body = { questionnaireId: questionnaire.id, groupId, ...period() };
    const first = (await assign(body, idem).expect(201)).body as DiagnosticAssignmentDetailDto;
    const again = (await assign(body, idem).expect(201)).body as DiagnosticAssignmentDetailDto;
    expect(again.id).toBe(first.id);
    expect(await prisma.diagnosticAssignment.count({ where: { groupId } })).toBe(1);
    expect(first).toMatchObject({
      target: { kind: 'group', group: { id: groupId } },
      state: 'ACTIVE',
      measurementType: 'PRIMARY',
      counts: { total: 3, ASSIGNED: 3 },
      questionnaire: { questionnaireId: questionnaire.id, versionNumber: 1 },
    });
    expect(first.sessions.map((row) => row.student.fullName)).toEqual([
      expect.stringContaining('Алексеев'),
      expect.stringContaining('Борисов'),
      expect.stringContaining('Васильев'),
    ]);
    const user = await prisma.user.findUniqueOrThrow({ where: { login: students[0]!.login } });
    expect(
      await prisma.notification.count({
        where: { userId: user.id, type: 'diagnostic.assigned', entityId: first.id },
      }),
    ).toBe(1);
  });

  it('FR-019: период проверяется; назначается только опубликованная версия', async () => {
    const bad = await assign({
      questionnaireId: questionnaire.id,
      groupId,
      ...period(DAY, -DAY),
    }).expect(400);
    expect(bad.body.fields).toHaveProperty('endsOn');
    await assign({
      questionnaireId: questionnaire.id,
      groupId,
      ...period(-3 * DAY, -DAY),
    }).expect(400);
    const draft = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content: { ...structuredClone(demo.content), title: `Черновик ${suffix()}` } })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    const res = await assign({ questionnaireId: draft.id, groupId, ...period() }).expect(400);
    expect(res.body.fields).toHaveProperty('questionnaireId');
  });

  it('FR-002, AT-12: чужая группа и чужой студент недоступны', async () => {
    await assign({
      questionnaireId: questionnaire.id,
      studentId: otherStudent.student.id,
      ...period(),
    }).expect(404);
    const list = (await as(otherTeacher, http().get('/api/diagnostic-assignments')).expect(200))
      .body as DiagnosticAssignmentDto[];
    expect(
      list.some((item) => item.target.kind === 'group' && item.target.group.id === groupId),
    ).toBe(false);
    await as(
      otherTeacher,
      http().get(`/api/students/${students[0]!.student.id}/diagnostics`),
    ).expect(404);
  });

  it('UC-01, AT-02, FR-020, FR-023: прохождение с черновиком, проверка полноты и расчёт по ключам', async () => {
    const assignment = (
      await assign({
        questionnaireId: questionnaire.id,
        studentId: students[1]!.student.id,
        ...period(),
      }).expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    const session = await studentLogin(students[1]!);
    const sessionId = await ownSessionId(session, assignment.id);
    const opened = (
      await as(session, http().get(`/api/cabinet/diagnostics/${sessionId}`)).expect(200)
    ).body as CabinetDiagnosticSessionDto;
    expect(opened.form.instruction).toBe(demo.content.instruction);
    expect(opened.form.questions).toHaveLength(8);
    // Значения вариантов и ключи студенту не передаются.
    expect(JSON.stringify(opened)).not.toContain('"value"');
    expect(opened.draft).toBeNull();

    // Черновик до начала — нельзя; после начала сохраняется и восстанавливается.
    const { answers, expected } = example('01-high');
    const mapped = mapAnswers(answers);
    const partial = { [keyMap.get('q1')!]: mapped[keyMap.get('q1')!]! };
    await as(session, http().put(`/api/cabinet/diagnostics/${sessionId}/draft`))
      .send({ answers: partial })
      .expect(409);
    await as(session, http().post(`/api/cabinet/diagnostics/${sessionId}/start`)).expect(200);
    await as(session, http().put(`/api/cabinet/diagnostics/${sessionId}/draft`))
      .send({ answers: partial })
      .expect(200);
    const restored = (
      await as(session, http().get(`/api/cabinet/diagnostics/${sessionId}`)).expect(200)
    ).body as CabinetDiagnosticSessionDto;
    expect(restored.status).toBe('IN_PROGRESS');
    expect(restored.draft).toEqual(partial);

    // Неполные ответы не завершают прохождение.
    const incomplete = await as(
      session,
      http().post(`/api/cabinet/diagnostics/${sessionId}/complete`),
    )
      .set('Idempotency-Key', key())
      .send({ answers: partial })
      .expect(400);
    expect(incomplete.body.fields[`answers.${keyMap.get('q2')}`]).toBe('Ответьте на этот вопрос');

    const idem = key();
    const done = (
      await as(session, http().post(`/api/cabinet/diagnostics/${sessionId}/complete`))
        .set('Idempotency-Key', idem)
        .send({ answers: mapped })
        .expect(201)
    ).body as CabinetDiagnosticDto;
    expect(done.status).toBe('COMPLETED');
    expect(done.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(done)).not.toContain('rawScore');
    // Повтор с тем же ключом не создаёт вторую ревизию (NFR-006).
    await as(session, http().post(`/api/cabinet/diagnostics/${sessionId}/complete`))
      .set('Idempotency-Key', idem)
      .send({ answers: mapped })
      .expect(201);
    expect(await prisma.diagnosticRevision.count({ where: { sessionId } })).toBe(1);
    // Повторное прохождение с новым ключом — запрещено.
    await as(session, http().post(`/api/cabinet/diagnostics/${sessionId}/complete`))
      .set('Idempotency-Key', key())
      .send({ answers: mapped })
      .expect(409);

    // Преподаватель видит результат в профиле студента (UC-01, шаг 10).
    const results = (
      await as(teacher, http().get(`/api/students/${students[1]!.student.id}/diagnostics`)).expect(
        200,
      )
    ).body as StudentDiagnosticDto[];
    const result = results.find((item) => item.id === sessionId)!;
    expect(result).toMatchObject({
      status: 'COMPLETED',
      source: 'ONLINE',
      revision: 1,
      questionnaire: { versionNumber: 1, title: expect.stringContaining('Методика проведения') },
    });
    expect(result.durationSeconds).toEqual(expect.any(Number));
    expect(result.completedAt).not.toBeNull();
    for (const [code, value] of Object.entries(expected)) {
      expect(result.scores.find((score) => score.code === code)).toMatchObject({
        rawScore: value.rawScore,
        missingAnswers: value.missingAnswers,
        level: value.levelCode === null ? null : { code: value.levelCode },
      });
    }
    const revision = await prisma.diagnosticRevision.findFirstOrThrow({ where: { sessionId } });
    expect(revision).toMatchObject({
      kind: 'INITIAL',
      scoringVersionId: assignment.questionnaire.versionId,
    });
  });

  it('FR-013: ответы после завершения не изменяются; исправление — новая ревизия с причиной', async () => {
    const assignment = (
      await assign({
        questionnaireId: questionnaire.id,
        studentId: students[2]!.student.id,
        ...period(),
      }).expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    const sessionId = assignment.sessions[0]!.id;
    const low = mapAnswers(example('02-low').answers);
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
      .set('Idempotency-Key', key())
      .send({ answers: low, completedAt: new Date().toISOString() })
      .expect(201);

    // Напрямую в БД изменить ответы и завершённое прохождение нельзя (триггеры).
    await expect(
      prisma.diagnosticAnswer.updateMany({ where: { sessionId }, data: { value: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.diagnosticSession.update({ where: { id: sessionId }, data: { durationSeconds: 1 } }),
    ).rejects.toThrow();

    const high = mapAnswers(example('01-high').answers);
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/corrections`))
      .set('Idempotency-Key', key())
      .send({ answers: high })
      .expect(400);
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/corrections`))
      .set('Idempotency-Key', key())
      .send({ answers: low, reason: 'Ошибка при вводе бланка' })
      .expect(400);
    const corrected = (
      await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/corrections`))
        .set('Idempotency-Key', key())
        .send({ answers: high, reason: 'Перепутаны строки бланка при вводе' })
        .expect(201)
    ).body as StudentDiagnosticDto;
    expect(corrected.revision).toBe(2);
    expect(corrected.scores.find((score) => score.code === 'COGNITIVE')?.level?.code).toBe('HIGH');

    const history = (
      await as(teacher, http().get(`/api/diagnostic-sessions/${sessionId}/answers`)).expect(200)
    ).body as DiagnosticAnswersDto;
    expect(history.revisions.map((item) => [item.revision, item.kind])).toEqual([
      [2, 'CORRECTION'],
      [1, 'INITIAL'],
    ]);
    expect(history.revisions[0]!.reason).toBe('Перепутаны строки бланка при вводе');
    expect(
      history.revisions[1]!.scores.find((score) => score.code === 'COGNITIVE')?.level?.code,
    ).toBe('LOW');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'diagnostic_session.corrected', entityId: sessionId },
    });
    expect(audit.reason).toBe('Перепутаны строки бланка при вводе');
    // В журнал аудита содержание ответов не пишется (п. 2.1).
    expect(JSON.stringify(audit.after)).not.toContain(keyMap.get('q1')!);
  });

  it('FR-022: ручной ввод бумажного бланка; повторный ввод запрещён', async () => {
    const assignment = (
      await assign({
        questionnaireId: questionnaire.id,
        studentId: students[0]!.student.id,
        ...period(),
      }).expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    const sessionId = assignment.sessions[0]!.id;
    const form = await as(teacher, http().get(`/api/diagnostic-sessions/${sessionId}/form`)).expect(
      200,
    );
    expect(form.body.questions).toHaveLength(8);
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
      .set('Idempotency-Key', key())
      .send({
        answers: mapAnswers(example('01-high').answers),
        completedAt: new Date(Date.now() + 2 * DAY).toISOString(),
      })
      .expect(400);
    const entered = (
      await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
        .set('Idempotency-Key', key())
        .send({
          answers: mapAnswers(example('01-high').answers),
          completedAt: new Date(Date.now() - DAY).toISOString(),
        })
        .expect(201)
    ).body as StudentDiagnosticDto;
    expect(entered).toMatchObject({ status: 'COMPLETED', source: 'PAPER', durationSeconds: null });
    await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
      .set('Idempotency-Key', key())
      .send({
        answers: mapAnswers(example('01-high').answers),
        completedAt: new Date().toISOString(),
      })
      .expect(409);
    // Студент видит пройденную диагностику, но не может её пройти ещё раз.
    await as(studentSession, http().post(`/api/cabinet/diagnostics/${sessionId}/start`)).expect(
      409,
    );
  });

  it('п. 2.1, AT-12: ответы — только с разрешением; студент не видит чужие прохождения', async () => {
    const session = await prisma.diagnosticSession.findFirstOrThrow({
      where: { studentId: students[1]!.student.id, status: 'COMPLETED' },
    });
    await as(admin, http().get(`/api/diagnostic-sessions/${session.id}/answers`)).expect(403);
    await as(researcher, http().get(`/api/diagnostic-sessions/${session.id}/answers`)).expect(403);
    await as(otherTeacher, http().get(`/api/diagnostic-sessions/${session.id}/answers`)).expect(
      404,
    );
    await as(studentSession, http().get(`/api/diagnostic-sessions/${session.id}/answers`)).expect(
      403,
    );
    await as(otherStudentSession, http().get(`/api/cabinet/diagnostics/${session.id}`)).expect(404);
    await as(
      otherStudentSession,
      http().post(`/api/cabinet/diagnostics/${session.id}/start`),
    ).expect(404);
    await as(teacher, http().get('/api/cabinet/diagnostics')).expect(403);
  });

  it('FR-019: отмена и окончание срока закрывают незавершённые прохождения', async () => {
    const assignment = (
      await assign({
        questionnaireId: questionnaire.id,
        studentId: students[0]!.student.id,
        ...period(),
      }).expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    const sessionId = assignment.sessions[0]!.id;
    await as(teacher, http().post(`/api/diagnostic-assignments/${assignment.id}/cancel`))
      .send({ reason: 'Назначено по ошибке' })
      .expect(200);
    expect(
      (await prisma.diagnosticSession.findUniqueOrThrow({ where: { id: sessionId } })).status,
    ).toBe('CANCELLED');
    await as(studentSession, http().get(`/api/cabinet/diagnostics/${sessionId}`)).expect(404);

    const expiring = (
      await assign({
        questionnaireId: questionnaire.id,
        studentId: students[0]!.student.id,
        ...period(),
      }).expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    await prisma.diagnosticAssignment.update({
      where: { id: expiring.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const expiredId = expiring.sessions[0]!.id;
    const opened = (
      await as(studentSession, http().get(`/api/cabinet/diagnostics/${expiredId}`)).expect(200)
    ).body as CabinetDiagnosticSessionDto;
    expect(opened.status).toBe('EXPIRED');
    await as(studentSession, http().post(`/api/cabinet/diagnostics/${expiredId}/start`)).expect(
      409,
    );
  });

  it('FR-012: завершение диагностики попадает в историю студента', async () => {
    const history = (
      await as(teacher, http().get(`/api/students/${students[2]!.student.id}/history`)).expect(200)
    ).body as { action: string; reason: string | null }[];
    expect(history.map((item) => item.action)).toEqual(
      expect.arrayContaining(['diagnostic_session.paper_entered', 'diagnostic_session.corrected']),
    );
  });
});
