import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type CabinetAssignmentsDto,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticForm,
  type NotificationsDto,
  type QuestionnaireDetailDto,
  RoleCode,
  type StudentCreatedDto,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
} from '@iot/shared';
import request from 'supertest';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';
import { collectRoutes, type RouteInfo } from './routes.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const tag = randomBytes(3).toString('hex').toUpperCase();
const demo = loadDefinitions().find((definition) => definition.slug === 'demo-motivation')!;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Маршруты с параметрами, которые намеренно не входят в обход: данные в них не принадлежат
 * конкретному студенту или преподавателю, доступ к ним целиком определяется разрешением
 * (справочники администратора, общая библиотека методик, исследования).
 */
const SHARED_PREFIXES = [
  '/api/admin/', // администрирование: только USERS_MANAGE, проверено в admin.e2e-spec
  '/api/groups/', // справочник групп: изменение только GROUPS_MANAGE
  '/api/disciplines/', // справочник дисциплин: изменение только DISCIPLINES_MANAGE
  '/api/teacher-assignments/', // закрепления: только GROUPS_MANAGE
  '/api/diagnostic-directions/', // общий справочник направлений диагностики
  '/api/questionnaires/', // общая библиотека методик колледжа (FR-017)
  '/api/questionnaire-comparabilities/', // решения исследователя о сопоставимости версий
  '/api/research-projects/', // исследования ведёт роль исследователя (п. 2.4), research.e2e-spec
  '/api/assignment-types/', // общий справочник типов заданий
];

describe('IDOR: чужие данные по прямой ссылке (e2e, AT-12)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let routes: RouteInfo[];
  /** Владелец данных: преподаватель группы Б и студент группы Б. */
  let ownerTeacher: LoggedIn;
  let ownerStudent: LoggedIn;
  /** Посторонние: преподаватель группы А и студент группы А. */
  let strangerTeacher: LoggedIn;
  let strangerStudent: LoggedIn;
  /** Идентификаторы данных студента группы Б по имени параметра маршрута. */
  const ids: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  /** Какой идентификатор подставить в параметр маршрута (по префиксу пути). */
  function resolve(route: RouteInfo): string | undefined {
    const byPrefix: [string, Record<string, string>][] = [
      ['/api/students/:id/observations/', { id: 'student', observationId: 'observation' }],
      ['/api/students/', { id: 'student' }],
      ['/api/reports/students/', { id: 'student' }],
      ['/api/monitoring/students/', { id: 'student' }],
      ['/api/monitoring/trajectories/', { id: 'trajectory' }],
      [
        '/api/trajectories/',
        { id: 'trajectory', version: 'trajectoryVersion', checkpointId: 'checkpoint' },
      ],
      ['/api/cabinet/trajectories/', { id: 'trajectory' }],
      ['/api/student-assignments/files/', { fileId: 'submissionFile' }],
      ['/api/student-assignments/', { id: 'studentAssignment' }],
      ['/api/cabinet/assignments/', { id: 'studentAssignment' }],
      ['/api/cabinet/assignment-choices/', { id: 'choice' }],
      ['/api/diagnostic-assignments/', { id: 'diagnosticAssignment' }],
      ['/api/diagnostic-sessions/', { id: 'diagnosticSession' }],
      ['/api/cabinet/diagnostics/', { id: 'diagnosticSession' }],
      ['/api/feedback/', { id: 'feedback' }],
      ['/api/cabinet/feedback/', { id: 'feedback' }],
      ['/api/consultations/', { id: 'consultation' }],
      ['/api/notifications/', { id: 'notification' }],
      ['/api/motivation-profiles/', { profileId: 'motivationProfile' }],
      ['/api/files/', { id: 'teacherFile' }],
      ['/api/cabinet/files/', { id: 'submissionFile' }],
      ['/api/materials/', { id: 'material' }],
      ['/api/library-assignments/', { id: 'libraryAssignment' }],
      ['/api/lessons/', { id: 'lesson' }],
      ['/api/grades/imports/', { id: 'gradeImport' }],
    ];
    const entry = byPrefix.find(([prefix]) => route.path.startsWith(prefix));
    if (!entry) return undefined;
    let missing = false;
    const url = route.path.replace(/:([A-Za-z]+)/g, (_match, param: string) => {
      const name = entry[1][param];
      const value = name ? ids[name] : undefined;
      if (!value) missing = true;
      return value ?? '';
    });
    if (missing) return undefined;
    // Отчёты требуют формат файла.
    return route.path.startsWith('/api/reports/') ? `${url}?format=xlsx` : url;
  }

  /**
   * Тела запросов, проходящие проверку формы: посторонний должен получить отказ по доступу
   * (403/404), а не по формату запроса. Маршрут без записи здесь получает пустое тело.
   */
  function bodyFor(route: RouteInfo): Record<string, unknown> {
    const revision = { updatedAt: new Date().toISOString() };
    const reason = { reason: 'Проверка доступа' };
    const stages = Array.from({ length: 5 }, (_value, index) => ({
      title: `Этап ${index + 1}`,
      checkpoints: [{ title: 'Точка' }],
      materialIds: [],
      assignments: [],
    }));
    const observation = {
      observedAt: new Date().toISOString().slice(0, 10),
      text: 'Заметка',
      visibility: 'INTERNAL',
    };
    const bodies: Record<string, Record<string, unknown>> = {
      'PATCH /api/students/:id': { lastName: 'Иванов', firstName: 'Иван' },
      'PATCH /api/students/:id/observations/:observationId': observation,
      'POST /api/students/:id/observations': observation,
      'POST /api/students/:id/archive': reason,
      'POST /api/students/:id/transfer': { ...reason, groupId: ids.strangerGroup },
      'POST /api/cabinet/assignment-choices/:id/choose': { optionIds: [ids.studentAssignment] },
      'POST /api/cabinet/diagnostics/:id/complete': { answers: {} },
      'PUT /api/cabinet/diagnostics/:id/draft': { answers: {} },
      'POST /api/cabinet/feedback/:id/replies': { body: 'Ответ' },
      'POST /api/feedback/:id/replies': { body: 'Ответ' },
      'POST /api/cabinet/trajectories/:id/proposals': { body: 'Предложение' },
      'POST /api/consultations/:id/cancel': reason,
      'POST /api/consultations/:id/schedule': { scheduledAt: new Date().toISOString() },
      'POST /api/diagnostic-assignments/:id/cancel': reason,
      'POST /api/diagnostic-sessions/:id/corrections': { answers: {}, reason: 'Ошибка ввода' },
      'POST /api/diagnostic-sessions/:id/paper': {
        answers: {},
        completedAt: new Date().toISOString(),
      },
      'POST /api/library-assignments/:id/archive': reason,
      'POST /api/materials/:id/archive': reason,
      'PUT /api/materials/:id': { title: 'Материал', kind: 'TEXT', body: 'Текст' },
      'PUT /api/library-assignments/:id': {
        title: 'Задание',
        disciplineId: ids.discipline,
        difficulty: 'BASIC',
        typeId: ids.assignmentType,
        submissionFormats: ['TEXT'],
        criteria: [{ title: 'Верность', maxScore: 5 }],
        attachments: [],
      },
      'POST /api/motivation-profiles/:profileId/decision': { level: 'HIGH' },
      'POST /api/student-assignments/:id/assessments': {
        submissionId: ids.submission,
        decision: 'ACCEPTED',
      },
      'POST /api/student-assignments/:id/cancel': reason,
      'PUT /api/monitoring/students/:id/support-status': {
        ...reason,
        supportStatus: 'ADDITIONAL_SUPPORT',
      },
      'PUT /api/trajectories/:id': { ...revision, stages },
      'PUT /api/lessons/:id/journal': { entries: [] },
      'POST /api/trajectories/:id/corrections': { ...revision, ...reason, stages },
      'POST /api/trajectories/:id/approve': revision,
      'POST /api/trajectories/:id/submit': revision,
      'POST /api/trajectories/:id/return': { ...revision, ...reason },
      'POST /api/trajectories/:id/needs-correction': { ...revision, ...reason },
      'POST /api/trajectories/:id/archive': { ...revision, ...reason },
      'POST /api/trajectories/:id/complete': { ...revision, finalAssessment: 'Цели достигнуты' },
      'POST /api/trajectories/:id/checkpoints/:checkpointId/status': { status: 'PASSED' },
    };
    return bodies[route.key] ?? {};
  }

  const paramRoutes = () =>
    routes.filter(
      (route) =>
        route.path.includes('/:') &&
        !SHARED_PREFIXES.some((prefix) => route.path.startsWith(prefix)),
    );

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    routes = collectRoutes(app);
    const admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherB = await createUser(app, { role: RoleCode.TEACHER });
    const teacherA = await createUser(app, { role: RoleCode.TEACHER });
    ownerTeacher = await login(app, teacherB.login);
    strangerTeacher = await login(app, teacherA.login);

    const group = async (name: string) =>
      (
        await as(admin, http().post('/api/groups'))
          .send({ name, course: 1, specialty: 'Программное обеспечение' })
          .expect(201)
      ).body.id as string;
    const discipline = async (name: string) =>
      (await as(admin, http().post('/api/disciplines')).send({ name }).expect(201)).body
        .id as string;
    const groupB = await group(`ИДБ-${tag}`);
    const groupA = await group(`ИДА-${tag}`);
    ids.strangerGroup = groupA;
    const disciplineB = await discipline(`Физика ${tag}`);
    const disciplineA = await discipline(`История ${tag}`);
    for (const [teacherId, groupId, disciplineId] of [
      [teacherB.id, groupB, disciplineB],
      [teacherA.id, groupA, disciplineA],
    ]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId, groupId, disciplineId })
        .expect(201);
    }

    const student = async (session: LoggedIn, lastName: string, groupId: string) => {
      const created = (
        await as(session, http().post('/api/students'))
          .set('Idempotency-Key', key())
          .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
          .expect(201)
      ).body as StudentCreatedDto;
      await prisma.user.update({
        where: { login: created.login! },
        data: { mustChangePassword: false },
      });
      return {
        id: created.student.id,
        session: await login(app, created.login!, created.temporaryPassword!),
      };
    };
    const owner = await student(ownerTeacher, 'Владельцев', groupB);
    ownerStudent = owner.session;
    strangerStudent = (await student(strangerTeacher, 'Посторонний', groupA)).session;
    ids.student = owner.id;

    // Библиотека преподавателя Б: файл, материал, задания.
    ids.teacherFile = (
      await as(ownerTeacher, http().post('/api/files'))
        .attach('file', Buffer.from('Инструкция'), 'instruction.txt')
        .expect(201)
    ).body.id as string;
    ids.material = (
      await as(ownerTeacher, http().post('/api/materials'))
        .set('Idempotency-Key', key())
        .send({ title: `Памятка ${tag}`, kind: 'TEXT', body: 'Текст', disciplineId: disciplineB })
        .expect(201)
    ).body.id as string;
    const types = (await as(ownerTeacher, http().get('/api/assignment-types')).expect(200))
      .body as { id: string }[];
    const task = async (title: string) =>
      (
        await as(ownerTeacher, http().post('/api/library-assignments'))
          .set('Idempotency-Key', key())
          .send({
            title,
            disciplineId: disciplineB,
            difficulty: 'BASIC',
            typeId: types[0]!.id,
            instruction: 'Решите задачи',
            submissionFormats: ['TEXT', 'FILE'],
            criteria: [{ title: 'Верность', maxScore: 5 }],
            attachments: [{ fileId: ids.teacherFile }],
          })
          .expect(201)
      ).body.id as string;
    ids.discipline = disciplineB;
    ids.assignmentType = types[0]!.id;
    ids.libraryAssignment = await task(`Кинематика ${tag}`);
    const extra = [await task(`Динамика ${tag}`), await task(`Статика ${tag}`)];

    // ИОТ студента Б: утверждена, с контрольными точками.
    const options = (
      await as(ownerTeacher, http().get(`/api/students/${owner.id}/trajectory-options`)).expect(200)
    ).body as TrajectoryOptionsDto;
    const draft = (
      await as(ownerTeacher, http().post('/api/trajectories'))
        .set('Idempotency-Key', key())
        .send({
          studentId: owner.id,
          disciplineId: disciplineB,
          templateId: options.templates.find((template) => template.isStandard)!.id,
        })
        .expect(201)
    ).body as TrajectoryDto;
    const filled = (
      await as(ownerTeacher, http().put(`/api/trajectories/${draft.id}`))
        .send({
          updatedAt: draft.updatedAt,
          goals: 'Освоить механику',
          startDate: '2026-09-01',
          plannedEndDate: '2027-01-31',
          stages: draft.stages.map((stage, index) => {
            const month = ['09', '10', '11', '12', '01'][index]!;
            const year = index === 4 ? '2027' : '2026';
            return {
              id: stage.id,
              title: stage.title,
              goal: stage.goal,
              startDate: `${year}-${month}-01`,
              endDate: `${year}-${month}-28`,
              checkpoints: [{ title: `Точка ${index + 1}`, dueDate: `${year}-${month}-28` }],
              materialIds: index === 0 ? [ids.material] : [],
              assignments: [],
            };
          }),
        })
        .expect(200)
    ).body as TrajectoryDto;
    const approved = (
      await as(ownerTeacher, http().post(`/api/trajectories/${draft.id}/approve`))
        .send({ updatedAt: filled.updatedAt })
        .expect(200)
    ).body as TrajectoryDto;
    ids.trajectory = approved.id;
    ids.trajectoryVersion = String(approved.version);
    ids.checkpoint = approved.stages[0]!.checkpoints[0]!.id;

    // Задания студента Б: обычное и выбор из равнозначных; сдача с файлом.
    const assign = (body: Record<string, unknown>) =>
      as(ownerTeacher, http().post('/api/student-assignments'))
        .set('Idempotency-Key', key())
        .send({
          studentIds: [owner.id],
          dueAt: new Date(Date.now() + 30 * DAY).toISOString(),
          ...body,
        })
        .expect(201);
    await assign({ assignmentIds: [ids.libraryAssignment] });
    await assign({ assignmentIds: extra, choice: { title: 'Выбор', requiredCount: 1 } });
    const cabinet = (await as(ownerStudent, http().get('/api/cabinet/assignments')).expect(200))
      .body as CabinetAssignmentsDto;
    ids.studentAssignment = cabinet.items[0]!.id;
    ids.choice = cabinet.choices[0]!.id;
    ids.submissionFile = (
      await as(ownerStudent, http().post('/api/cabinet/files'))
        .attach('file', Buffer.from('Решение'), 'solution.txt')
        .expect(201)
    ).body.id as string;
    await as(ownerStudent, http().post(`/api/cabinet/assignments/${ids.studentAssignment}/start`))
      .send({})
      .expect((res) => expect(res.status).toBeLessThan(300));
    const submitted = await as(
      ownerStudent,
      http().post(`/api/cabinet/assignments/${ids.studentAssignment}/submissions`),
    )
      .set('Idempotency-Key', key())
      .send({ text: 'Решение', fileIds: [ids.submissionFile] })
      .expect(201);
    ids.submission = (submitted.body as { submissions: { id: string }[] }).submissions[0]!.id;

    // Диагностика студента Б, внесённая с бумажного бланка, и мотивационный профиль.
    const questionnaire = (
      await as(ownerTeacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({
          content: { ...structuredClone(demo.content), title: `Методика ${tag}`, source: 'Тест' },
        })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    const versionId = questionnaire.versions[0]!.id;
    await as(
      ownerTeacher,
      http().post(`/api/questionnaires/${questionnaire.id}/versions/${versionId}/publish`),
    ).expect(200);
    const diagnostic = (
      await as(ownerTeacher, http().post('/api/diagnostic-assignments'))
        .set('Idempotency-Key', key())
        .send({
          questionnaireId: questionnaire.id,
          studentId: owner.id,
          measurementType: 'PRIMARY',
          startsAt: new Date(Date.now() - 10 * DAY).toISOString(),
          endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
        })
        .expect(201)
    ).body as DiagnosticAssignmentDetailDto;
    ids.diagnosticAssignment = diagnostic.id;
    ids.diagnosticSession = diagnostic.sessions[0]!.id;
    const form = (
      await as(
        ownerTeacher,
        http().get(`/api/diagnostic-sessions/${ids.diagnosticSession}/form`),
      ).expect(200)
    ).body as DiagnosticForm;
    const answers = Object.fromEntries(
      form.questions.map((question) => [
        question.key,
        question.type === 'SINGLE_CHOICE'
          ? question.options[0]!.key
          : question.type === 'MULTIPLE_CHOICE'
            ? [question.options[0]!.key]
            : question.type === 'SHORT_TEXT'
              ? 'ответ'
              : (question.minValue ?? 1),
      ]),
    );
    await as(ownerTeacher, http().post(`/api/diagnostic-sessions/${ids.diagnosticSession}/paper`))
      .set('Idempotency-Key', key())
      .send({ answers, completedAt: new Date(Date.now() - DAY).toISOString() })
      .expect(201);
    ids.motivationProfile = (
      await as(ownerTeacher, http().post(`/api/students/${owner.id}/motivation-profiles`))
        .set('Idempotency-Key', key())
        .send({})
        .expect(201)
    ).body.id as string;

    // Сопровождение: наблюдение, обращение, консультация, уведомление.
    ids.observation = (
      await as(ownerTeacher, http().post(`/api/students/${owner.id}/observations`))
        .set('Idempotency-Key', key())
        .send({
          observedAt: new Date().toISOString().slice(0, 10),
          text: 'Служебная заметка',
          visibility: 'INTERNAL',
        })
        .expect(201)
    ).body.id as string;
    ids.feedback = (
      await as(ownerStudent, http().post('/api/cabinet/feedback'))
        .set('Idempotency-Key', key())
        .send({ kind: 'DIFFICULTY_REPORT', body: 'Не получается задача' })
        .expect(201)
    ).body.id as string;
    ids.consultation = (
      await as(ownerStudent, http().post('/api/cabinet/feedback/consultations'))
        .set('Idempotency-Key', key())
        .send({ topic: 'Подготовка к контрольной', trajectoryId: ids.trajectory })
        .expect(201)
    ).body.id as string;
    ids.lesson = (
      await as(ownerTeacher, http().post('/api/lessons'))
        .send({
          date: new Date(Date.now() - DAY).toISOString().slice(0, 10),
          startTime: '08:30',
          groupId: groupB,
          disciplineId: disciplineB,
        })
        .expect(201)
    ).body.id as string;
    ids.gradeImport = (
      await as(ownerTeacher, http().post('/api/grades/import'))
        .set('Idempotency-Key', key())
        .send({
          fileName: 'оценки.csv',
          rows: [
            {
              line: 2,
              studentName: `Владельцев${tag} Тест`,
              groupName: `ИДБ-${tag}`,
              academicYear: '2025/2026',
              semester: '1',
              disciplineName: `Физика ${tag}`,
              score: '80',
            },
          ],
        })
        .expect(201)
    ).body.importId as string;
    const notifications = (await as(ownerStudent, http().get('/api/notifications')).expect(200))
      .body as NotificationsDto;
    ids.notification = notifications.items[0]!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('п. 8.3: изменения ИОТ, диагностических данных, профиля и заданий записаны в аудит', async () => {
    const logged = async (entityId: string) =>
      (await prisma.auditLog.findMany({ where: { entityId }, select: { action: true } })).map(
        (row) => row.action,
      );
    expect(await logged(ids.trajectory!)).toEqual(
      expect.arrayContaining(['trajectory.created', 'trajectory.updated', 'trajectory.approved']),
    );
    expect(await logged(ids.diagnosticSession!)).toContain('diagnostic_session.paper_entered');
    expect(await logged(ids.motivationProfile!)).toContain('motivation_profile.proposed');
    expect(await logged(ids.observation!)).toContain('observation.created');
    expect(await logged(ids.studentAssignment!)).toEqual(
      expect.arrayContaining(['assignment.submitted']),
    );
  });

  it('AT-12: каждый маршрут с идентификатором либо проверяется обходом, либо явно общий', () => {
    const unresolved = paramRoutes()
      .filter((route) => !resolve(route))
      .map((route) => route.key);
    expect(unresolved).toEqual([]);
  });

  it('AT-12: владелец получает свои данные по тем же ссылкам (проверка самих идентификаторов)', async () => {
    const failures: string[] = [];
    for (const route of paramRoutes().filter((r) => r.method === 'GET')) {
      const session = route.path.startsWith('/api/cabinet') ? ownerStudent : ownerTeacher;
      const url = resolve(route)!;
      const res = await as(session, http().get(url));
      if (res.status !== 200) failures.push(`${route.key} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it.each([
    ['преподаватель другой группы', () => strangerTeacher],
    ['студент другой группы', () => strangerStudent],
  ])(
    'AT-12, FR-002: %s не читает и не изменяет чужие данные ни по одному маршруту',
    async (_name, session) => {
      const failures: string[] = [];
      for (const route of paramRoutes()) {
        const url = resolve(route)!;
        const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
        const res = await as(session(), http()[method](url))
          .set('Idempotency-Key', key())
          .send(bodyFor(route));
        // Только отказ по доступу: 400/409 значили бы, что запрос дошёл до чужих данных
        // или не был проверен на доступ вовсе.
        if (res.status !== 403 && res.status !== 404) failures.push(`${route.key} → ${res.status}`);
      }
      expect(failures).toEqual([]);
    },
  );
});
