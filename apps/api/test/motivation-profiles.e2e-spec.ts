import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AnswerValue,
  DEFAULT_MOTIVATION_STRATEGIES,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticForm,
  type MotivationProfileDto,
  type OwnProfileDto,
  type ProfileDistributionDto,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  RoleCode,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type StudentMotivationDto,
  type StudentPageDto,
} from '@iot/shared';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Ответы на демо-методику по уровням шкал «Познавательный интерес» (q1, q2 — обратный, q5, q6-o1)
 * и «Мотивация достижения» (q3, q4 — обратный, q6-o2). Ключи — по порядку вопросов формы.
 */
type Level = 'HIGH' | 'LOW';
function answers(form: DiagnosticForm, cognitive: Level, achievement: Level) {
  const q = form.questions;
  const high = (level: Level) => level === 'HIGH';
  const choices = [
    ...(high(cognitive) ? [q[5]!.options[0]!.key] : []),
    ...(high(achievement) ? [q[5]!.options[1]!.key] : []),
  ];
  const result: Record<string, AnswerValue> = {
    [q[0]!.key]: high(cognitive) ? 5 : 1,
    [q[1]!.key]: high(cognitive) ? 1 : 5,
    [q[2]!.key]: high(achievement) ? 5 : 1,
    [q[3]!.key]: high(achievement) ? 1 : 5,
    [q[4]!.key]: q[4]!.options[high(cognitive) ? 0 : 2]!.key,
    [q[5]!.key]: choices.length ? choices : [q[5]!.options[3]!.key],
    [q[6]!.key]: 10,
    [q[7]!.key]: 'ответ',
  };
  return result;
}

describe('Мотивационные профили (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let groupId: string;
  let questionnaire: QuestionnaireDetailDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function createStudent(lastName: string): Promise<StudentCreatedDto> {
    return (
      await as(teacher, http().post('/api/students'))
        .set('Idempotency-Key', key())
        .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
        .expect(201)
    ).body as StudentCreatedDto;
  }

  /** Бумажный бланк с заданными уровнями шкал, `daysAgo` дней назад. */
  async function measure(studentId: string, cognitive: Level, achievement: Level, daysAgo = 1) {
    const assignment = (
      await as(teacher, http().post('/api/diagnostic-assignments'))
        .set('Idempotency-Key', key())
        .send({
          questionnaireId: questionnaire.id,
          studentId,
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
        answers: answers(form, cognitive, achievement),
        completedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
      })
      .expect(201);
    return sessionId;
  }

  const form = (studentId: string, session = teacher, idem = key()) =>
    as(session, http().post(`/api/students/${studentId}/motivation-profiles`)).set(
      'Idempotency-Key',
      idem,
    );
  const decide = (profileId: string, body: Record<string, unknown>, session = teacher) =>
    as(session, http().post(`/api/motivation-profiles/${profileId}/decision`)).send(body);
  const overview = async (studentId: string) =>
    (await as(teacher, http().get(`/api/students/${studentId}/motivation-profile`)).expect(200))
      .body as StudentMotivationDto;

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
        .send({ name: `МП-${tag}`, course: 1, specialty: 'Педагогика' })
        .expect(201)
    ).body.id as string;
    const disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Психология ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);

    const content: QuestionnaireContent = {
      ...structuredClone(demo.content),
      title: `Методика профилей ${tag}`,
      source: 'Тестовый источник',
    };
    questionnaire = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    await as(
      teacher,
      http().post(
        `/api/questionnaires/${questionnaire.id}/versions/${questionnaire.versions[0]!.id}/publish`,
      ),
    ).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 4.5: без диагностики — «Требуется дополнительная диагностика», уровень не присваивается', async () => {
    const student = await createStudent('Безданных');
    const profile = (await form(student.student.id).expect(201)).body as MotivationProfileDto;
    expect(profile).toMatchObject({
      status: 'NEEDS_MORE_DIAGNOSTICS',
      proposedLevel: null,
      level: null,
      basis: { items: [], counts: { HIGH: 0, MEDIUM: 0, LOW: 0 } },
    });
    expect(profile.basis!.reason).toBeTruthy();
    // Уровень произвольно не присваивается — даже с причиной.
    await decide(profile.id, { level: 'MEDIUM', reason: 'Наблюдение на занятиях' }).expect(409);
    const page = (
      await as(teacher, http().get('/api/students'))
        .query({ groupId, profile: 'NEEDS_MORE_DIAGNOSTICS' })
        .expect(200)
    ).body as StudentPageDto;
    expect(page.items.map((item) => item.id)).toContain(student.student.id);
  });

  it('AT-03, FR-027, FR-028: предварительный профиль по правилам интерпретации с основаниями', async () => {
    const student = await createStudent('Высокий');
    const sessionId = await measure(student.student.id, 'HIGH', 'HIGH');
    const idem = key();
    const profile = (await form(student.student.id, teacher, idem).expect(201))
      .body as MotivationProfileDto;
    expect(profile).toMatchObject({ status: 'PROPOSED', proposedLevel: 'HIGH', level: null });
    expect(profile.basis!.counts).toEqual({ HIGH: 2, MEDIUM: 0, LOW: 0 });
    expect(profile.basis!.items).toEqual([
      expect.objectContaining({
        sessionId,
        scaleCode: 'COGNITIVE',
        rawScore: 13,
        motivationLevel: 'HIGH',
        levelLabel: expect.any(String),
      }),
      expect.objectContaining({ scaleCode: 'ACHIEVEMENT', rawScore: 11, motivationLevel: 'HIGH' }),
    ]);
    const sources = await prisma.motivationProfileSource.findMany({
      where: { profileId: profile.id },
    });
    expect(sources.map((item) => item.sessionId)).toEqual([sessionId]);

    // NFR-006: повтор того же запроса и повторное формирование без новых данных — без дублей.
    expect((await form(student.student.id, teacher, idem).expect(201)).body.id).toBe(profile.id);
    expect((await form(student.student.id).expect(201)).body.id).toBe(profile.id);
    expect(await prisma.motivationProfile.count({ where: { studentId: student.student.id } })).toBe(
      1,
    );

    // Предложение системы — ещё не утверждённый профиль: в фильтре по уровню студента нет.
    const byLevel = (
      await as(teacher, http().get('/api/students')).query({ groupId, profile: 'HIGH' }).expect(200)
    ).body as StudentPageDto;
    expect(byLevel.items.map((item) => item.id)).not.toContain(student.student.id);
    const pending = (
      await as(teacher, http().get('/api/students'))
        .query({ groupId, profile: 'PROPOSED' })
        .expect(200)
    ).body as StudentPageDto;
    expect(pending.items.find((item) => item.id === student.student.id)?.motivationProfile).toEqual(
      { status: 'PROPOSED', level: null, proposedLevel: 'HIGH' },
    );
  });

  it('п. 4.5: показатели шкал расходятся — уровень не предлагается', async () => {
    const student = await createStudent('Смешанный');
    await measure(student.student.id, 'HIGH', 'LOW');
    const profile = (await form(student.student.id).expect(201)).body as MotivationProfileDto;
    expect(profile).toMatchObject({ status: 'NEEDS_MORE_DIAGNOSTICS', proposedLevel: null });
    expect(profile.basis!.counts).toEqual({ HIGH: 1, MEDIUM: 0, LOW: 1 });
  });

  it('AT-04, FR-029, FR-032: корректировка с причиной, подтверждение, история и аудит', async () => {
    const student = await createStudent('Корректируемый');
    await measure(student.student.id, 'LOW', 'LOW', 20);
    const first = (await form(student.student.id).expect(201)).body as MotivationProfileDto;
    expect(first.proposedLevel).toBe('LOW');

    // Другой уровень без причины — 400 с ошибкой поля.
    const invalid = await decide(first.id, { level: 'MEDIUM' }).expect(400);
    expect(invalid.body.fields).toHaveProperty('reason');
    await decide(first.id, { level: 'EXTRA' }).expect(400);
    // Чужой преподаватель не видит студента.
    await decide(first.id, { level: 'LOW' }, otherTeacher).expect(404);

    const corrected = (
      await decide(first.id, {
        level: 'MEDIUM',
        reason: 'Активно работает на практических занятиях',
        studentSummary: 'Вам подойдут практические задания с выбором.',
      }).expect(200)
    ).body as MotivationProfileDto;
    expect(corrected).toMatchObject({
      status: 'CORRECTED',
      proposedLevel: 'LOW',
      level: 'MEDIUM',
      correctionReason: 'Активно работает на практических занятиях',
      decidedBy: { fullName: expect.any(String) },
    });
    // Решение уже принято.
    await decide(first.id, { level: 'LOW' }).expect(409);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'motivation_profile.corrected', entityId: first.id },
    });
    expect(audit?.reason).toBe('Активно работает на практических занятиях');

    // Повторная диагностика → новое предложение; утверждённый уровень сохраняется в lastDecided.
    await measure(student.student.id, 'HIGH', 'HIGH', 1);
    const second = (await form(student.student.id).expect(201)).body as MotivationProfileDto;
    expect(second.id).not.toBe(first.id);
    expect(second.proposedLevel).toBe('HIGH');
    await decide(first.id, { level: 'HIGH', reason: 'x' }).expect(409);
    let state = await overview(student.student.id);
    expect(state.current?.id).toBe(second.id);
    expect(state.lastDecided).toMatchObject({ id: first.id, level: 'MEDIUM' });

    const confirmed = (await decide(second.id, { level: 'HIGH' }).expect(200))
      .body as MotivationProfileDto;
    expect(confirmed).toMatchObject({ status: 'CONFIRMED', level: 'HIGH', correctionReason: null });

    state = await overview(student.student.id);
    expect(state.lastDecided?.id).toBe(second.id);
    expect(state.history.map((item) => [item.status, item.fromLevel, item.toLevel])).toEqual([
      ['CONFIRMED', 'HIGH', 'HIGH'],
      ['PROPOSED', null, 'HIGH'],
      ['CORRECTED', 'LOW', 'MEDIUM'],
      ['PROPOSED', null, 'LOW'],
    ]);
    expect(state.history[2]!.reason).toBe('Активно работает на практических занятиях');
    // История профиля неизменяема (триггер БД).
    await expect(
      prisma.motivationProfileHistory.updateMany({
        where: { profileId: first.id },
        data: { reason: 'подмена' },
      }),
    ).rejects.toThrow();

    const history = (
      await as(teacher, http().get(`/api/students/${student.student.id}/history`)).expect(200)
    ).body as StudentHistoryItemDto[];
    expect(history.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'motivation_profile.proposed',
        'motivation_profile.corrected',
        'motivation_profile.confirmed',
      ]),
    );

    const byLevel = (
      await as(teacher, http().get('/api/students')).query({ groupId, profile: 'HIGH' }).expect(200)
    ).body as StudentPageDto;
    expect(byLevel.items.map((item) => item.id)).toContain(student.student.id);
  });

  it('FR-016, AT-12: студент видит только утверждённое пояснение, без уровня и оснований', async () => {
    const student = await createStudent('Студентов');
    await measure(student.student.id, 'LOW', 'LOW');
    const proposal = (await form(student.student.id).expect(201)).body as MotivationProfileDto;
    await prisma.user.update({
      where: { login: student.login },
      data: { mustChangePassword: false },
    });
    const session = await login(app, student.login, student.temporaryPassword!);

    let own = (await as(session, http().get('/api/cabinet/profile')).expect(200))
      .body as OwnProfileDto;
    expect(own.motivationProfile).toBeNull();

    await decide(proposal.id, {
      level: 'MEDIUM',
      reason: 'Служебная причина корректировки',
      studentSummary: 'Ставьте небольшие цели и отмечайте успехи.',
    }).expect(200);
    own = (await as(session, http().get('/api/cabinet/profile')).expect(200)).body as OwnProfileDto;
    expect(own.motivationProfile).toEqual({
      studentSummary: 'Ставьте небольшие цели и отмечайте успехи.',
      decidedAt: expect.any(String),
    });
    expect(JSON.stringify(own)).not.toContain('Служебная причина');

    // Эндпоинты преподавателя студенту недоступны.
    await as(session, http().get(`/api/students/${student.student.id}/motivation-profile`)).expect(
      403,
    );
    await form(student.student.id, session).expect(403);
    await decide(proposal.id, { level: 'HIGH', reason: 'сам' }, session).expect(403);
  });

  it('FR-002, AT-12: чужой преподаватель и исследователь не получают профиль', async () => {
    const student = await createStudent('Чужой');
    await as(
      otherTeacher,
      http().get(`/api/students/${student.student.id}/motivation-profile`),
    ).expect(404);
    await form(student.student.id, otherTeacher).expect(404);
    await as(
      researcher,
      http().get(`/api/students/${student.student.id}/motivation-profile`),
    ).expect(403);
    await as(admin, http().get(`/api/students/${student.student.id}/motivation-profile`)).expect(
      403,
    );
  });

  it('распределение текущих профилей в доступной области', async () => {
    const distribution = (
      await as(teacher, http().get('/api/motivation-profiles/distribution'))
        .query({ groupId })
        .expect(200)
    ).body as ProfileDistributionDto;
    // Студенты предыдущих тестов этого набора: без данных и смешанный — NEEDS; высокий — ждёт решения;
    // корректируемый — HIGH; студент кабинета — MEDIUM; чужой — без профиля.
    expect(distribution).toEqual({
      total: 6,
      HIGH: 1,
      MEDIUM: 1,
      LOW: 0,
      PROPOSED: 1,
      NEEDS_MORE_DIAGNOSTICS: 2,
      NONE: 1,
    });
    const other = (
      await as(otherTeacher, http().get('/api/motivation-profiles/distribution'))
        .query({ groupId })
        .expect(200)
    ).body as ProfileDistributionDto;
    expect(other.total).toBe(0);
  });

  it('FR-030: стратегии сопровождения — по умолчанию из ТЗ, меняет только администратор', async () => {
    const initial = await as(teacher, http().get('/api/motivation-strategies')).expect(200);
    expect(Object.keys(initial.body).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM']);
    await as(teacher, http().put('/api/motivation-strategies'))
      .send(DEFAULT_MOTIVATION_STRATEGIES)
      .expect(403);
    await as(admin, http().put('/api/motivation-strategies'))
      .send({ ...DEFAULT_MOTIVATION_STRATEGIES, LOW: [] })
      .expect(400);

    const before = initial.body as typeof DEFAULT_MOTIVATION_STRATEGIES;
    const next = { ...before, HIGH: [...before.HIGH.slice(0, 3), `  Олимпиады ${tag}  `] };
    const saved = await as(admin, http().put('/api/motivation-strategies')).send(next).expect(200);
    expect(saved.body.HIGH.at(-1)).toBe(`Олимпиады ${tag}`);
    expect((await as(teacher, http().get('/api/motivation-strategies')).expect(200)).body).toEqual(
      saved.body,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'settings.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit?.after)).toContain(`Олимпиады ${tag}`);
    // Вернуть исходные тексты: тестовая БД общая.
    await as(admin, http().put('/api/motivation-strategies')).send(before).expect(200);
  });
});
