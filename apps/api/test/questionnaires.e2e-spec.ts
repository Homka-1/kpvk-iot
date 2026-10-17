import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AnswerMap,
  DEMO_MARK,
  type DiagnosticDirectionDto,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  type QuestionnaireSummaryDto,
  type QuestionnaireVersionDto,
  RoleCode,
  scoreQuestionnaire,
} from '@iot/shared';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;

/** Содержимое демо-методики под уникальным названием (без признака демо-методики). */
function sampleContent(title = `Методика ${randomBytes(3).toString('hex')}`): QuestionnaireContent {
  return { ...structuredClone(demo.content), title, source: 'Тестовый источник' };
}

describe('Конструктор диагностических методик (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: LoggedIn;
  let admin: LoggedIn;
  let researcher: LoggedIn;

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function create(content = sampleContent(), idem = key()) {
    const res = await as(teacher, http().post('/api/questionnaires'))
      .set('Idempotency-Key', idem)
      .send({ content })
      .expect(201);
    return res.body as QuestionnaireDetailDto;
  }

  async function version(q: QuestionnaireDetailDto, versionId = q.versions[0]!.id) {
    const res = await as(
      teacher,
      http().get(`/api/questionnaires/${q.id}/versions/${versionId}`),
    ).expect(200);
    return res.body as QuestionnaireVersionDto;
  }

  const publish = (q: QuestionnaireDetailDto, versionId: string) =>
    as(teacher, http().post(`/api/questionnaires/${q.id}/versions/${versionId}/publish`));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    teacher = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 2.1: администратор, исследователь и студент не имеют доступа к методикам', async () => {
    await http().get('/api/questionnaires').expect(401);
    await as(admin, http().get('/api/questionnaires')).expect(403);
    await as(researcher, http().get('/api/questionnaires')).expect(403);
    const student = await createUser(app, { role: RoleCode.STUDENT });
    await as(await login(app, student.login), http().get('/api/diagnostic-directions')).expect(403);
  });

  it('п. 4.4: диагностические направления из ТЗ и добавление своего', async () => {
    const list = (await as(teacher, http().get('/api/diagnostic-directions')).expect(200))
      .body as DiagnosticDirectionDto[];
    expect(list.slice(0, 5).map((direction) => direction.name)).toEqual([
      'Учебная мотивация',
      'Саморегуляция',
      'Академическая успешность',
      'Педагогическое наблюдение',
      'Итоговое аналитическое заключение',
    ]);
    const code = `TEST_${randomBytes(3).toString('hex').toUpperCase()}`;
    const created = await as(teacher, http().post('/api/diagnostic-directions'))
      .send({ code, name: 'Профессиональные интересы', sortOrder: 60 })
      .expect(201);
    await as(teacher, http().post('/api/diagnostic-directions'))
      .send({ code, name: 'Дубль' })
      .expect(409);
    await as(teacher, http().patch(`/api/diagnostic-directions/${created.body.id}`))
      .send({ code, name: 'Профессиональные интересы и планы' })
      .expect(200);
  });

  it('FR-017, NFR-006: создание методики с черновиком версии 1; повтор формы не создаёт дубль', async () => {
    const idem = key();
    const content = sampleContent();
    const first = await create(content, idem);
    const again = await create(content, idem);
    expect(again.id).toBe(first.id);
    expect(await prisma.questionnaireVersion.count({ where: { title: content.title } })).toBe(1);
    expect(first.versions).toEqual([
      expect.objectContaining({ versionNumber: 1, status: 'DRAFT', title: content.title }),
    ]);

    const list = (await as(teacher, http().get('/api/questionnaires')).expect(200))
      .body as QuestionnaireSummaryDto[];
    expect(list.find((item) => item.id === first.id)).toMatchObject({
      title: content.title,
      draft: { versionNumber: 1 },
      published: null,
      questionCount: 8,
    });
  });

  it('FR-020, FR-021: сохранённая методика считает так же, как исходное определение', async () => {
    const q = await create();
    const saved = (await version(q)).content;
    // Ключи элементов заменены на id из БД; переводим ответы контрольного примера по порядку.
    const keyMap = new Map<string, string>();
    demo.content.questions.forEach((question, index) => {
      keyMap.set(question.key, saved.questions[index]!.key);
      question.options.forEach((option, optionIndex) =>
        keyMap.set(option.key, saved.questions[index]!.options[optionIndex]!.key),
      );
    });
    const answers: AnswerMap = { q1: 4, q2: 2, q3: 4, q4: 1, q5: 'q5-o2', q6: ['q6-o1', 'q6-o3'] };
    const mapped = Object.fromEntries(
      Object.entries(answers).map(([questionKey, value]) => [
        keyMap.get(questionKey)!,
        Array.isArray(value)
          ? value.map((item) => keyMap.get(item)!)
          : typeof value === 'string'
            ? keyMap.get(value)!
            : value,
      ]),
    );
    const strip = (scores: ReturnType<typeof scoreQuestionnaire>) =>
      scores.map(({ code, rawScore, missingAnswers, rule }) => ({
        code,
        rawScore,
        missingAnswers,
        level: rule?.levelCode ?? null,
      }));
    expect(strip(scoreQuestionnaire(saved, mapped))).toEqual(
      strip(scoreQuestionnaire(demo.content, answers)),
    );
    expect(saved.questions[0]).toMatchObject({ minLabel: 'Совсем не согласен', minValue: 1 });
  });

  it('сохранение черновика: ссылки ключей проверяются, замечания возвращаются по полям', async () => {
    const q = await create();
    const draft = await version(q);
    const broken = structuredClone(draft.content);
    broken.scales[0]!.keys[0]!.questionKey = 'unknown-question';
    const res = await as(teacher, http().put(`/api/questionnaires/${q.id}/versions/${draft.id}`))
      .send(broken)
      .expect(400);
    expect(res.body.fields).toEqual({
      'scales.0.keys.0.questionKey': 'Вопрос не найден в методике',
    });

    const edited = structuredClone(draft.content);
    edited.questions.push({
      key: 'new-question',
      text: 'Новый вопрос',
      type: 'LIKERT',
      isRequired: true,
      minValue: 1,
      maxValue: 4,
      minLabel: null,
      maxLabel: null,
      options: [],
    });
    edited.scales[0]!.keys.push({
      questionKey: 'new-question',
      optionKey: null,
      points: null,
      isReverse: true,
      weight: 0.5,
    });
    const saved = (
      await as(teacher, http().put(`/api/questionnaires/${q.id}/versions/${draft.id}`))
        .send(edited)
        .expect(200)
    ).body as QuestionnaireVersionDto;
    expect(saved.content.questions).toHaveLength(9);
    const newKey = saved.content.questions[8]!.key;
    expect(newKey).not.toBe('new-question');
    expect(saved.content.scales[0]!.keys[4]).toEqual({
      questionKey: newKey,
      optionKey: null,
      points: null,
      isReverse: true,
      weight: 0.5,
    });
  });

  it('публикация: замечания мешают публикации, опубликованная версия неизменяема (FR-026)', async () => {
    const empty = await create({ ...sampleContent(), questions: [], scales: [] });
    const issues = await publish(empty, empty.versions[0]!.id).expect(400);
    expect(issues.body.fields).toMatchObject({
      questions: 'Добавьте хотя бы один вопрос',
      scales: 'Добавьте хотя бы одну шкалу',
    });

    const q = await create();
    const v1 = await version(q);
    const published = (await publish(q, v1.id).expect(200)).body as QuestionnaireVersionDto;
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedAt: expect.any(String) });
    await publish(q, v1.id).expect(409);

    await as(teacher, http().put(`/api/questionnaires/${q.id}/versions/${v1.id}`))
      .send(v1.content)
      .expect(409);
    await as(teacher, http().delete(`/api/questionnaires/${q.id}/versions/${v1.id}`)).expect(409);

    // Защита и на уровне БД: в обход API содержимое опубликованной версии не изменить.
    await expect(
      prisma.questionnaireScale.update({
        where: { id: v1.content.scales[0]!.key },
        data: { name: 'x' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.questionnaireVersion.update({ where: { id: v1.id }, data: { title: 'Подмена' } }),
    ).rejects.toThrow();
    await expect(prisma.questionnaireVersion.delete({ where: { id: v1.id } })).rejects.toThrow();
  });

  it('FR-026: изменили ключ → новая версия, прежняя версия и её результаты не изменились', async () => {
    const q = await create();
    const v1 = await version(q);
    await publish(q, v1.id).expect(200);

    // Результат прохождения по версии 1 (сами прохождения появятся на этапе 07).
    const scale = v1.content.scales[0]!;
    const student = await prisma.student.create({
      data: {
        participantCode: `T-${randomBytes(4).toString('hex').toUpperCase()}`,
        lastName: 'Тестов',
        firstName: 'Студент',
      },
    });
    const session = await prisma.diagnosticSession.create({
      data: {
        studentId: student.id,
        versionId: v1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    await prisma.diagnosticScore.create({
      data: {
        sessionId: session.id,
        scaleId: scale.key,
        rawScore: 10,
        interpretationRuleId: scale.rules[1]!.key,
      },
    });

    const v2 = (
      await as(teacher, http().post(`/api/questionnaires/${q.id}/versions`))
        .send({ changeNote: 'Вопрос 2 больше не обратный' })
        .expect(201)
    ).body as QuestionnaireVersionDto;
    expect(v2).toMatchObject({
      versionNumber: 2,
      status: 'DRAFT',
      changeNote: 'Вопрос 2 больше не обратный',
    });
    await as(teacher, http().post(`/api/questionnaires/${q.id}/versions`))
      .send({})
      .expect(409);

    const changed = structuredClone(v2.content);
    changed.scales[0]!.keys[1]!.isReverse = false;
    await as(teacher, http().put(`/api/questionnaires/${q.id}/versions/${v2.id}`))
      .send(changed)
      .expect(200);
    await publish(q, v2.id).expect(200);

    const detail = (await as(teacher, http().get(`/api/questionnaires/${q.id}`)).expect(200))
      .body as QuestionnaireDetailDto;
    expect(detail.versions.map((item) => [item.versionNumber, item.status])).toEqual([
      [2, 'PUBLISHED'],
      [1, 'RETIRED'],
    ]);
    const oldVersion = await version(q, v1.id);
    expect(oldVersion.content).toEqual(v1.content);
    expect(oldVersion.content.scales[0]!.keys[1]!.isReverse).toBe(true);
    const score = await prisma.diagnosticScore.findFirstOrThrow({
      where: { sessionId: session.id },
    });
    expect(score.rawScore?.toNumber()).toBe(10);
    expect(score.scaleId).toBe(scale.key);
    expect(
      (await prisma.diagnosticSession.findUniqueOrThrow({ where: { id: session.id } })).versionId,
    ).toBe(v1.id);
  });

  it('черновик новой версии можно удалить, первую версию — нет', async () => {
    const q = await create();
    await as(
      teacher,
      http().delete(`/api/questionnaires/${q.id}/versions/${q.versions[0]!.id}`),
    ).expect(409);
    await publish(q, q.versions[0]!.id).expect(200);
    const v2 = (
      await as(teacher, http().post(`/api/questionnaires/${q.id}/versions`))
        .send({})
        .expect(201)
    ).body as QuestionnaireVersionDto;
    await as(teacher, http().delete(`/api/questionnaires/${q.id}/versions/${v2.id}`)).expect(204);
    const detail = (await as(teacher, http().get(`/api/questionnaires/${q.id}`)).expect(200))
      .body as QuestionnaireDetailDto;
    expect(detail.versions).toHaveLength(1);
  });

  it('FR-017, огр. 1: копирование; копия демо-методики остаётся демо с пометкой', async () => {
    const q = await create();
    await prisma.questionnaire.update({ where: { id: q.id }, data: { isDemo: true } });
    const idem = key();
    const copy = (
      await as(teacher, http().post(`/api/questionnaires/${q.id}/copy`))
        .set('Idempotency-Key', idem)
        .expect(201)
    ).body as QuestionnaireDetailDto;
    const again = await as(teacher, http().post(`/api/questionnaires/${q.id}/copy`))
      .set('Idempotency-Key', idem)
      .expect(201);
    expect(again.body.id).toBe(copy.id);
    expect(copy).toMatchObject({ isDemo: true, copiedFrom: { id: q.id } });
    expect(copy.versions).toEqual([expect.objectContaining({ versionNumber: 1, status: 'DRAFT' })]);
    expect(copy.versions[0]!.title).toContain(DEMO_MARK);
    // Источник без пометки — демо-копию нельзя опубликовать.
    const res = await publish(copy, copy.versions[0]!.id).expect(400);
    expect(res.body.fields.source).toContain(DEMO_MARK);
  });

  it('FR-017: архивирование с причиной; архивную методику нельзя изменить, затем возврат', async () => {
    const q = await create();
    await as(teacher, http().post(`/api/questionnaires/${q.id}/archive`))
      .send({})
      .expect(400);
    await as(teacher, http().post(`/api/questionnaires/${q.id}/archive`))
      .send({ reason: 'Заменена другой методикой' })
      .expect(200);
    const list = (await as(teacher, http().get('/api/questionnaires')).expect(200))
      .body as QuestionnaireSummaryDto[];
    expect(list.some((item) => item.id === q.id)).toBe(false);
    const draft = await version(q);
    await as(teacher, http().put(`/api/questionnaires/${q.id}/versions/${draft.id}`))
      .send(draft.content)
      .expect(409);
    await publish(q, draft.id).expect(409);
    await as(teacher, http().post(`/api/questionnaires/${q.id}/restore`)).expect(200);
    await publish(q, draft.id).expect(200);
  });

  it('п. 8.3: изменения методики пишутся в журнал аудита без содержимого вопросов', async () => {
    const q = await create();
    await publish(q, q.versions[0]!.id).expect(200);
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'questionnaire', entityId: q.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((log) => log.action)).toEqual([
      'questionnaire.created',
      'questionnaire_version.published',
    ]);
    expect(JSON.stringify(logs)).not.toContain('Мне интересно узнавать');
  });
});
