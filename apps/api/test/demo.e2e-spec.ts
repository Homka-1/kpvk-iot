import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  type DemoStatusDto,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticForm,
  emptyQuestionnaireContent,
  type QuestionContent,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  RoleCode,
} from '@iot/shared';
import request from 'supertest';
import {
  CONTROL_GROUP,
  DEMO_FRESH_DIAGNOSTICS,
  DEMO_TEACHER_PASSWORD,
  EXPERIMENTAL_GROUP,
} from '../src/demo/demo-catalog.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashPassword } from '../src/auth/passwords.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const DAY = 24 * 60 * 60 * 1000;

const likert = (questionKey: string): QuestionContent => ({
  key: questionKey,
  text: `Утверждение ${questionKey}`,
  type: 'LIKERT',
  isRequired: true,
  minValue: 1,
  maxValue: 5,
  minLabel: null,
  maxLabel: null,
  options: [],
});
const whole = (questionKey: string, isReverse = false) => ({
  questionKey,
  optionKey: null,
  points: null,
  isReverse,
  weight: 1,
});

function content(
  title: string,
  aggregation: 'MEAN' | 'SUM',
  withRoles: boolean,
): QuestionnaireContent {
  const questions = ['a', 'b', 'c', 'd', 'e', 'f'].map(likert);
  return {
    ...emptyQuestionnaireContent(title),
    source: 'Тестовый источник',
    questions,
    scales: [
      {
        key: 'int',
        code: 'INT',
        name: 'Внутренняя',
        description: null,
        aggregation,
        motivationRole: withRoles ? 'INTRINSIC' : 'REFERENCE',
        keys: [whole('a'), whole('b'), whole('c', true)],
        rules: [],
      },
      {
        key: 'ext',
        code: 'EXT',
        name: 'Внешняя',
        description: null,
        aggregation,
        motivationRole: withRoles ? 'EXTRINSIC' : 'REFERENCE',
        keys: [whole('d'), whole('e'), whole('f')],
        rules: [],
      },
    ],
  };
}

/**
 * Демо-режим на отдельной чистой базе (общая тестовая база слишком велика для копии):
 * подготовка копии с активностью, переключение отображения, повторный замер, удаление.
 */
describe('Демо-режим (e2e)', () => {
  const originalUrl = process.env.DATABASE_URL!;
  const sourceUrl = (() => {
    const url = new URL(originalUrl);
    url.pathname = '/iot_test_demo_source';
    return url.toString();
  })();
  let root: PrismaClient;
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let webDesignerId: string;
  let teacher: LoggedIn;
  let paperSessionId: string;
  let freshSessionId: string;
  const experimental: string[] = [];
  const control: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });

  async function waitForJob(): Promise<DemoStatusDto> {
    for (;;) {
      const status = (await as(admin, http().get('/api/admin/demo')).expect(200))
        .body as DemoStatusDto;
      if (status.job?.status !== 'RUNNING') return status;
      await new Promise((done) => setTimeout(done, 300));
    }
  }

  async function publish(questionnaire: QuestionnaireContent): Promise<QuestionnaireDetailDto> {
    const created = (
      await as(teacher, http().post('/api/questionnaires'))
        .set('Idempotency-Key', key())
        .send({ content: questionnaire })
        .expect(201)
    ).body as QuestionnaireDetailDto;
    await as(
      teacher,
      http().post(`/api/questionnaires/${created.id}/versions/${created.versions[0]!.id}/publish`),
    ).expect(200);
    return created;
  }

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: originalUrl }) });
    await root.$executeRawUnsafe('DROP DATABASE IF EXISTS "iot_test_demo_source" WITH (FORCE)');
    await root.$executeRawUnsafe(
      'DROP DATABASE IF EXISTS "iot_test_demo_source_demo" WITH (FORCE)',
    );
    await root.$executeRawUnsafe('CREATE DATABASE "iot_test_demo_source"');
    const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    await promisify(execFile)(process.execPath, [cli, 'migrate', 'deploy'], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...process.env, DATABASE_URL: sourceUrl },
    });
    process.env.DATABASE_URL = sourceUrl;
    app = await createTestApp();
    prisma = app.get(PrismaService);

    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, {
      role: RoleCode.TEACHER,
      lastName: 'Исследователь',
    });
    teacher = await login(app, teacherUser.login);
    // Администратор с ролью преподавателя ведёт «ДО Веб-дизайн» (как в рабочей базе).
    const webDesigner = await createUser(app, {
      role: RoleCode.ADMIN,
      login: 'super_prepod',
      lastName: 'Задорожнюк',
    });
    await prisma.user.update({
      where: { id: webDesigner.id },
      data: {
        firstName: 'Вера',
        middleName: 'Викторовна',
        roles: {
          create: {
            roleId: (await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.TEACHER } })).id,
          },
        },
      },
    });
    webDesignerId = webDesigner.id;
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.STUDENT } });
    const passwordHash = await hashPassword('Студент-пароль-2026');
    for (const [name, list] of [
      [EXPERIMENTAL_GROUP, experimental],
      [CONTROL_GROUP, control],
    ] as const) {
      const group = await prisma.group.create({
        data: { name, course: 1, specialty: 'Программное обеспечение' },
      });
      for (let i = 0; i < 4; i += 1) {
        const student = await prisma.student.create({
          data: {
            participantCode: `${name}-${i}`,
            lastName: `Студент${i}`,
            firstName: name,
            currentGroup: { connect: { id: group.id } },
            enrollments: { create: { groupId: group.id } },
            user: {
              create: {
                login: `st-${randomBytes(4).toString('hex')}`,
                lastName: `Студент${i}`,
                firstName: name,
                passwordHash,
                roles: { create: { roleId: studentRole.id } },
              },
            },
          },
        });
        list.push(student.id);
      }
    }
    const discipline = await prisma.discipline.create({ data: { name: 'Педагогика' } });
    const groups = await prisma.group.findMany();
    await prisma.teacherAssignment.createMany({
      data: groups.map((group) => ({
        teacherId: teacherUser.id,
        groupId: group.id,
        disciplineId: discipline.id,
      })),
    });

    /** Бумажное прохождение методики в рабочей базе; ответы — по порядку вопросов a…f. */
    async function paper(questionnaireId: string, studentId: string, values: number[]) {
      const created = (
        await as(teacher, http().post('/api/diagnostic-assignments'))
          .set('Idempotency-Key', key())
          .send({
            questionnaireId,
            studentId,
            startsAt: new Date(Date.now() - 2 * DAY).toISOString(),
            endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
          })
          .expect(201)
      ).body as DiagnosticAssignmentDetailDto;
      const sessionId = created.sessions[0]!.id;
      const questions = (
        (await as(teacher, http().get(`/api/diagnostic-sessions/${sessionId}/form`)).expect(200))
          .body as DiagnosticForm
      ).questions;
      await as(teacher, http().post(`/api/diagnostic-sessions/${sessionId}/paper`))
        .set('Idempotency-Key', key())
        .send({
          answers: Object.fromEntries(questions.map((question, i) => [question.key, values[i]])),
          completedAt: new Date(Date.now() - DAY).toISOString(),
        })
        .expect(201);
      return sessionId;
    }
    const formProfile = async (studentId: string) =>
      (
        await as(teacher, http().post(`/api/students/${studentId}/motivation-profiles`))
          .set('Idempotency-Key', key())
          .expect(201)
      ).body as { status: string };

    const mean = await publish(content('Мотивация учебной деятельности', 'MEAN', true));
    // Первая версия методики — без ролей шкал (как в рабочей базе до этапа 24).
    const sum = await publish(content('Мотивация обучения', 'SUM', false));
    await publish(content('Стиль саморегуляции', 'SUM', false));

    // Один студент уже прошёл методику в рабочей базе: в копии прохождение переносится на октябрь.
    // Вопросы a, b, c (c — обратный) — шкала внутренней мотивации.
    paperSessionId = await paper(mean.id, experimental[0]!, [4, 4, 4, 4, 4, 4]);

    // Студент КГ прошёл методику на прежней версии, затем вышла версия с ролями шкал. В копии
    // прежнее прохождение уходит в историю и не мешает профилю по актуальным версиям.
    await paper(mean.id, control[1]!, [4, 3, 3, 3, 3, 3]);
    await paper(sum.id, control[1]!, [4, 3, 3, 3, 3, 3]);
    await formProfile(control[1]!);
    const draft = (
      await as(teacher, http().post(`/api/questionnaires/${sum.id}/versions`))
        .send({ changeNote: 'Роли шкал' })
        .expect(201)
    ).body as { id: string };
    await as(teacher, http().put(`/api/questionnaires/${sum.id}/versions/${draft.id}`))
      .send(content('Мотивация обучения', 'SUM', true))
      .expect(200);
    await as(
      teacher,
      http().post(`/api/questionnaires/${sum.id}/versions/${draft.id}/publish`),
    ).expect(200);

    // У другого студента КГ методики расходятся (высокий и низкий уровень): профиль
    // «Требуется дополнительная диагностика». Демо такого профиля не оставляет.
    await paper(mean.id, control[0]!, [5, 5, 1, 3, 3, 3]);
    await paper(sum.id, control[0]!, [1, 1, 5, 3, 3, 3]);
    expect((await formProfile(control[0]!)).status).toBe('NEEDS_MORE_DIAGNOSTICS');

    // Прохождения студента из DEMO_FRESH_DIAGNOSTICS в копию не переносятся.
    await prisma.student.update({
      where: { id: control[2]! },
      data: { participantCode: DEMO_FRESH_DIAGNOSTICS[0] },
    });
    freshSessionId = await paper(mean.id, control[2]!, [5, 5, 1, 3, 3, 3]);
    await formProfile(control[2]!);
  }, 120_000);

  afterAll(async () => {
    await as(admin, http().delete('/api/admin/demo'));
    await app.close();
    process.env.DATABASE_URL = originalUrl;
    await root.$executeRawUnsafe(
      'DROP DATABASE IF EXISTS "iot_test_demo_source_demo" WITH (FORCE)',
    );
    await root.$executeRawUnsafe('DROP DATABASE IF EXISTS "iot_test_demo_source" WITH (FORCE)');
    await root.$disconnect();
  });

  it('демо-режим доступен только администратору', async () => {
    await as(teacher, http().get('/api/admin/demo')).expect(403);
    await as(teacher, http().post('/api/admin/demo/prepare')).expect(403);
  });

  it('нельзя включить отображение до подготовки данных', async () => {
    await as(admin, http().put('/api/admin/demo/mode')).send({ active: true }).expect(409);
  });

  it('подготовка создаёт копию с активностью, рабочая база не меняется', async () => {
    await as(admin, http().post('/api/admin/demo/prepare')).expect(202);
    const status = await waitForJob();
    expect(status.job).toMatchObject({ status: 'DONE', error: null });
    expect(status).toMatchObject({ active: false, exists: true, stage: 'PRIMARY' });
    expect(await prisma.trajectory.count()).toBe(0);
    expect(await prisma.lesson.count()).toBe(0);
  }, 180_000);

  it('включённое отображение показывает копию: профили, ИОТ ЭГ, журнал, исследование', async () => {
    await as(admin, http().put('/api/admin/demo/mode')).send({ active: true }).expect(200);

    // ИОТ по математике и информатике — только у экспериментальной группы (огр. 4).
    const trajectories = await prisma.trajectory.findMany({
      include: { versions: true, assignments: true },
    });
    expect(trajectories).toHaveLength(experimental.length * 2);
    expect(trajectories.every((item) => experimental.includes(item.studentId))).toBe(true);
    expect(trajectories.every((item) => item.status === 'COMPLETED')).toBe(true);
    expect(trajectories.every((item) => item.versions.length >= 1)).toBe(true);
    expect(
      trajectories.flatMap((item) => item.assignments).some((item) => item.status === 'COMPLETED'),
    ).toBe(true);

    // Первичный замер: у каждого студента три завершённые методики, профиль подтверждён.
    const sessions = await prisma.diagnosticSession.findMany({
      where: { status: 'COMPLETED' },
    });
    // У каждого студента три методики; ещё одно — прохождение прежней версии в истории.
    expect(sessions).toHaveLength((experimental.length + control.length) * 3 + 1);
    expect(sessions.every((item) => item.completedAt! < new Date('2025-10-18T00:00:00Z'))).toBe(
      true,
    );
    expect(sessions.some((item) => item.id === freshSessionId)).toBe(false);
    expect(await prisma.diagnosticAssignment.count({ where: { studentId: control[2]! } })).toBe(0);
    const moved = sessions.find((item) => item.id === paperSessionId)!;
    expect(moved.completedAt!.toISOString().slice(0, 7)).toBe('2025-10');
    const students = await prisma.student.findMany({
      include: { currentMotivationProfile: true },
    });
    expect(
      students.every((item) =>
        ['CONFIRMED', 'CORRECTED'].includes(item.currentMotivationProfile?.status ?? ''),
      ),
    ).toBe(true);

    // Два занятия в неделю у каждой группы, журнал по каждому студенту.
    const lessons = await prisma.lesson.count();
    expect(lessons).toBeGreaterThan(100);
    expect(await prisma.lessonJournalEntry.count()).toBe(lessons * experimental.length);
    expect(await prisma.researchParticipant.count()).toBe(experimental.length + control.length);
    expect(await prisma.academicResult.count({ where: { source: 'SEMESTER_IMPORT' } })).toBe(
      (experimental.length + control.length) * 7 * 2,
    );
    expect(await prisma.feedback.count()).toBeGreaterThan(0);

    // Администратор-преподаватель закреплён только за своей дисциплиной, остальные преподаватели
    // рабочей базы — за всеми дисциплинами групп исследования.
    const webDesign = await prisma.teacherAssignment.findMany({
      where: { teacherId: webDesignerId },
      include: { discipline: true },
    });
    expect(webDesign).toHaveLength(2);
    expect(webDesign.every((item) => item.discipline.name === 'ДО Веб-дизайн')).toBe(true);
    // ИОТ ЭГ — по веб-дизайну и информатике: 5 этапов × 3 уровня заданий.
    expect(
      await prisma.assignment.count({ where: { discipline: { name: 'ДО Веб-дизайн' } } }),
    ).toBe(15);
    expect(
      await prisma.trajectory.count({ where: { discipline: { name: 'ДО Веб-дизайн' } } }),
    ).toBe(experimental.length);

    // Входной и три текущих контроля — одни и те же работы у обеих групп (этап 28).
    const works = await prisma.controlWork.findMany({ include: { groups: true, results: true } });
    expect(works.map((work) => work.kind).sort()).toEqual([
      'CURRENT',
      'CURRENT',
      'CURRENT',
      'ENTRY',
    ]);
    expect(works.every((work) => work.groups.length === 2)).toBe(true);
    expect(
      works.every((work) => work.results.length === experimental.length + control.length),
    ).toBe(true);
    // Только баллы, без отметок «отсутствовал», «не сдал», «освобождён».
    expect(
      works.every((work) =>
        work.results.every((result) => result.mark === null && result.score !== null),
      ),
    ).toBe(true);

    // Сгенерированные преподаватели входят с паролем из ТЗ заказчика.
    await http()
      .post('/api/auth/login')
      .send({ login: 'litvinov.do', password: DEMO_TEACHER_PASSWORD })
      .expect(200);
  });

  it('повторный замер после ИОТ: новые прохождения и профили, замер исследования', async () => {
    await as(admin, http().post('/api/admin/demo/repeat')).expect(202);
    const status = await waitForJob();
    expect(status).toMatchObject({ stage: 'REPEATED', job: { status: 'DONE' } });
    const repeated = await prisma.diagnosticSession.findMany({
      where: { measurementType: 'REPEATED' },
    });
    // Один студент контрольной группы повторную диагностику пропустил (FR-073).
    expect(repeated.filter((item) => item.status === 'COMPLETED')).toHaveLength(
      (experimental.length + control.length - 1) * 3,
    );
    expect(repeated.filter((item) => item.status === 'EXPIRED')).toHaveLength(3);
    expect(
      repeated.every(
        (item) =>
          item.status !== 'COMPLETED' || item.completedAt! > new Date('2026-04-19T00:00:00Z'),
      ),
    ).toBe(true);
    expect(await prisma.researchMeasurement.count({ where: { measurementType: 'REPEATED' } })).toBe(
      3,
    );
    // Профилей «Требуется дополнительная диагностика» демо не оставляет.
    expect(
      await prisma.student.count({
        where: { currentMotivationProfile: { status: 'NEEDS_MORE_DIAGNOSTICS' } },
      }),
    ).toBe(0);

    // Итоговый контроль — та же работа, что входной: ЭГ растёт заметнее КГ.
    const scores = async (kind: 'ENTRY' | 'FINAL', students: string[]) => {
      const rows = await prisma.controlResult.findMany({
        where: { work: { kind }, studentId: { in: students }, score: { not: null } },
      });
      return rows.reduce((sum, row) => sum + row.score!.toNumber(), 0) / rows.length;
    };
    const growthEg = (await scores('FINAL', experimental)) - (await scores('ENTRY', experimental));
    const growthKg = (await scores('FINAL', control)) - (await scores('ENTRY', control));
    expect(growthEg).toBeGreaterThan(growthKg);
    expect(growthEg).toBeGreaterThan(8);
    // КГ тоже немного растёт, но слабее ЭГ.
    expect(growthKg).toBeGreaterThan(0);
    // Шкала колледжа: «4» — с 70 баллов; в среднем КГ к итоговому контролю на «4».
    expect(await scores('FINAL', control)).toBeGreaterThanOrEqual(70);
    expect(await prisma.controlResult.count({ where: { mark: { not: null } } })).toBe(0);
    await as(admin, http().post('/api/admin/demo/repeat')).expect(409);
  }, 180_000);

  it('выключение возвращает рабочую базу, удаление убирает копию', async () => {
    await as(admin, http().put('/api/admin/demo/mode')).send({ active: false }).expect(200);
    expect(await prisma.trajectory.count()).toBe(0);
    const status = (await as(admin, http().delete('/api/admin/demo')).expect(200))
      .body as DemoStatusDto;
    expect(status).toMatchObject({ active: false, exists: false, stage: 'NONE' });
  });
});
