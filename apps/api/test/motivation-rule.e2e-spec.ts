import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AnswerValue,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticForm,
  emptyQuestionnaireContent,
  type MotivationProfileDto,
  type QuestionContent,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  RoleCode,
  type ScaleContent,
  type StudentCreatedDto,
} from '@iot/shared';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;
const DAY = 24 * 60 * 60 * 1000;

const likert = (key: string): QuestionContent => ({
  key,
  text: `Утверждение ${key}`,
  type: 'LIKERT',
  isRequired: true,
  minValue: 1,
  maxValue: 5,
  minLabel: null,
  maxLabel: null,
  options: [],
});

/** Вопрос «да / не знаю / нет», как у Ильиной: баллы задаются ключами на варианты. */
const yesNo = (key: string): QuestionContent => ({
  key,
  text: `Вопрос ${key}`,
  type: 'SINGLE_CHOICE',
  isRequired: true,
  minValue: null,
  maxValue: null,
  minLabel: null,
  maxLabel: null,
  options: [
    { key: `${key}-yes`, text: 'Да', value: 0 },
    { key: `${key}-unsure`, text: 'Не знаю', value: 0 },
    { key: `${key}-no`, text: 'Нет', value: 0 },
  ],
});

function scale(
  key: string,
  role: ScaleContent['motivationRole'],
  aggregation: ScaleContent['aggregation'],
  keys: ScaleContent['keys'],
): ScaleContent {
  return {
    key,
    code: key.toUpperCase(),
    name: `Шкала ${key}`,
    description: null,
    aggregation,
    motivationRole: role,
    keys,
    rules: [],
  };
}

const whole = (questionKey: string) => ({
  questionKey,
  optionKey: null,
  points: null,
  isReverse: false,
  weight: 1,
});
const option = (questionKey: string, optionKey: string, points: number) => ({
  questionKey,
  optionKey,
  points,
  isReverse: false,
  weight: 1,
});

/** «Как Реан — Якунин»: шкалы — средние по пунктам 1–5. */
function meanContent(tag: string): QuestionnaireContent {
  return {
    ...emptyQuestionnaireContent(`Мотивация учебной деятельности ${tag}`),
    source: 'Тестовый источник',
    questions: ['r1', 'r2', 'r3', 'r4', 'r5'].map(likert),
    scales: [
      scale('int', 'INTRINSIC', 'MEAN', [whole('r1'), whole('r2')]),
      scale('ext', 'EXTRINSIC', 'MEAN', [whole('r3'), whole('r4')]),
      scale('ref', 'REFERENCE', 'MEAN', [whole('r5')]),
    ],
  };
}

/** «Как Ильина»: шкалы — суммы, на варианты одного вопроса несколько ключей. */
function percentContent(tag: string): QuestionnaireContent {
  const keyed = (question: string) => [
    option(question, `${question}-yes`, 3.6),
    option(question, `${question}-unsure`, 1.2),
  ];
  return {
    ...emptyQuestionnaireContent(`Мотивация обучения ${tag}`),
    source: 'Тестовый источник',
    questions: ['i1', 'i2', 'i3'].map(yesNo),
    scales: [
      scale('know', 'INTRINSIC', 'SUM', [...keyed('i1'), ...keyed('i2')]),
      scale('diploma', 'EXTRINSIC', 'SUM', keyed('i3')),
    ],
  };
}

describe('Правило мотивационного профиля этапа 24 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: LoggedIn;
  let groupId: string;
  let meanQ: QuestionnaireDetailDto;
  let percentQ: QuestionnaireDetailDto;
  let legacyQ: QuestionnaireDetailDto;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function publishNew(content: QuestionnaireContent): Promise<QuestionnaireDetailDto> {
    const created = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    await as(
      teacher,
      http().post(`/api/questionnaires/${created.id}/versions/${created.versions[0]!.id}/publish`),
    ).expect(200);
    return created;
  }

  async function createStudent(lastName: string): Promise<string> {
    return (
      (
        await as(teacher, http().post('/api/students'))
          .set('Idempotency-Key', key())
          .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
          .expect(201)
      ).body as StudentCreatedDto
    ).student.id;
  }

  /** Бумажный бланк: `pick` по форме возвращает ответы. */
  async function pass(
    questionnaireId: string,
    studentId: string,
    pick: (form: DiagnosticForm) => Record<string, AnswerValue>,
  ): Promise<string> {
    const assignment = (
      await as(teacher, http().post('/api/diagnostic-assignments'))
        .set('Idempotency-Key', key())
        .send({
          questionnaireId,
          studentId,
          startsAt: new Date(Date.now() - 30 * DAY).toISOString(),
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
      .send({ answers: pick(form), completedAt: new Date(Date.now() - DAY).toISOString() })
      .expect(201);
    return sessionId;
  }

  /** Ответы 1–5 по пунктам r1…r5. */
  const meanAnswers = (values: number[]) => (form: DiagnosticForm) =>
    Object.fromEntries(form.questions.map((question, index) => [question.key, values[index]!]));
  /** Варианты «yes» / «unsure» / «no» по вопросам i1…i3. */
  const percentAnswers =
    (choices: ('yes' | 'unsure' | 'no')[]) =>
    (form: DiagnosticForm): Record<string, AnswerValue> =>
      Object.fromEntries(
        form.questions.map((question, index) => [
          question.key,
          question.options[['yes', 'unsure', 'no'].indexOf(choices[index]!)]!.key,
        ]),
      );

  const formProfile = async (studentId: string) =>
    (
      await as(teacher, http().post(`/api/students/${studentId}/motivation-profiles`))
        .set('Idempotency-Key', key())
        .expect(201)
    ).body as MotivationProfileDto;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ПР-${tag}`, course: 1, specialty: 'Педагогика' })
        .expect(201)
    ).body.id as string;
    const disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Педагогика ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);
    meanQ = await publishNew(meanContent(tag));
    percentQ = await publishNew(percentContent(tag));
    legacyQ = await publishNew({
      ...structuredClone(demo.content),
      title: `Методика с прежним правилом ${tag}`,
      source: 'Тестовый источник',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-027, FR-028: совпали уровни методик — этот уровень; основания и предупреждение о внешней мотивации', async () => {
    const studentId = await createStudent('Совпали');
    // Среднее внутренних (5 + 4) / 2 = 4,5 — высокий; внешние 5,0 выше внутренних — предупреждение.
    const meanSession = await pass(meanQ.id, studentId, meanAnswers([5, 4, 5, 5, 1]));
    // (3,6 + 1,2) / 7,2 = 66,7 % → 67 % — высокий. Максимум 7,2: ключи на «да» и «не знаю»
    // одного вопроса не складываются.
    const percentSession = await pass(
      percentQ.id,
      studentId,
      percentAnswers(['yes', 'unsure', 'no']),
    );
    // Прохождение методики без ролей шкал в новом правиле не участвует.
    await pass(legacyQ.id, studentId, (form) =>
      Object.fromEntries(
        form.questions.map((question) => [
          question.key,
          question.type === 'LIKERT'
            ? 1
            : question.type === 'NUMBER'
              ? 1
              : question.type === 'SHORT_TEXT'
                ? 'ответ'
                : question.type === 'MULTIPLE_CHOICE'
                  ? [question.options[0]!.key]
                  : question.options[0]!.key,
        ]),
      ),
    );

    const profile = await formProfile(studentId);
    expect(profile).toMatchObject({ status: 'PROPOSED', proposedLevel: 'HIGH', level: null });
    expect(profile.basis).toMatchObject({
      rule: 'METHODOLOGIES',
      outcome: 'MATCH',
      reason: null,
      counts: { HIGH: 2, MEDIUM: 0, LOW: 0 },
    });
    expect(profile.basis!.methodologies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: meanSession,
          method: 'INTRINSIC_MEAN',
          intrinsic: 4.5,
          extrinsic: 5,
          level: 'HIGH',
          extrinsicPrevails: true,
        }),
        expect.objectContaining({
          sessionId: percentSession,
          method: 'INTRINSIC_PERCENT',
          intrinsic: 67,
          extrinsic: 0,
          level: 'HIGH',
          extrinsicPrevails: false,
        }),
      ]),
    );
    expect(profile.basis!.methodologies).toHaveLength(2);
    // Основания — внутренние и внешние шкалы; справочная не показывается.
    expect(profile.basis!.items.map((item) => [item.scaleCode, item.motivationRole])).toEqual(
      expect.arrayContaining([
        ['INT', 'INTRINSIC'],
        ['EXT', 'EXTRINSIC'],
        ['KNOW', 'INTRINSIC'],
        ['DIPLOMA', 'EXTRINSIC'],
      ]),
    );
    expect(profile.basis!.items.some((item) => item.scaleCode === 'REF')).toBe(false);
    const sources = await prisma.motivationProfileSource.findMany({
      where: { profileId: profile.id },
    });
    expect(sources.map((item) => item.sessionId).sort()).toEqual(
      [meanSession, percentSession].sort(),
    );

    // Решение остаётся за преподавателем (FR-029): подтверждение без причины.
    await as(teacher, http().post(`/api/motivation-profiles/${profile.id}/decision`))
      .send({ level: 'HIGH' })
      .expect(200);
  });

  it('FR-027: разница в одну ступень — предлагается более низкий уровень', async () => {
    const studentId = await createStudent('Ступень');
    await pass(meanQ.id, studentId, meanAnswers([5, 4, 1, 1, 1])); // 4,5 — высокий
    await pass(percentQ.id, studentId, percentAnswers(['yes', 'no', 'yes'])); // 50 % — средний
    const profile = await formProfile(studentId);
    expect(profile).toMatchObject({ status: 'PROPOSED', proposedLevel: 'MEDIUM' });
    expect(profile.basis).toMatchObject({ outcome: 'ONE_STEP_LOWER', reason: null });
    expect(profile.basis!.explanation).toContain('более низкий');
  });

  it('п. 4.5: «высокий» и «низкий» — требуется дополнительная диагностика', async () => {
    const studentId = await createStudent('Расхождение');
    await pass(meanQ.id, studentId, meanAnswers([1, 2, 5, 5, 5])); // 1,5 — низкий
    await pass(percentQ.id, studentId, percentAnswers(['yes', 'yes', 'no'])); // 100 % — высокий
    const profile = await formProfile(studentId);
    expect(profile).toMatchObject({ status: 'NEEDS_MORE_DIAGNOSTICS', proposedLevel: null });
    expect(profile.basis).toMatchObject({ outcome: 'CONFLICT' });
    expect(profile.basis!.reason).toContain('Требуется дополнительная диагностика');
    await as(teacher, http().post(`/api/motivation-profiles/${profile.id}/decision`))
      .send({ level: 'MEDIUM', reason: 'Наблюдения' })
      .expect(409);
  });

  it('п. 4.5: пройдена одна методика — недостаточно данных, уровень не предлагается', async () => {
    const studentId = await createStudent('Одна');
    await pass(meanQ.id, studentId, meanAnswers([3, 4, 2, 2, 3])); // 3,5 — средний
    const profile = await formProfile(studentId);
    expect(profile).toMatchObject({ status: 'NEEDS_MORE_DIAGNOSTICS', proposedLevel: null });
    expect(profile.basis).toMatchObject({
      rule: 'METHODOLOGIES',
      outcome: 'SINGLE_METHODOLOGY',
      counts: { HIGH: 0, MEDIUM: 1, LOW: 0 },
    });
    expect(profile.basis!.reason).toContain('Недостаточно данных');
  });

  it('FR-026: роль шкалы опубликованной версии не меняется — только новой версией', async () => {
    const version = await prisma.questionnaireVersion.findFirstOrThrow({
      where: { questionnaireId: meanQ.id },
      include: { scales: true },
    });
    await expect(
      prisma.questionnaireScale.update({
        where: { id: version.scales[0]!.id },
        data: { motivationRole: 'REFERENCE' },
      }),
    ).rejects.toThrow();
  });
});
