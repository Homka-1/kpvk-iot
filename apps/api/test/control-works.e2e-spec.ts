import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type ControlImportPreviewDto,
  type ControlSheetDto,
  type ControlWorkDetailDto,
  type ControlWorkListDto,
  RoleCode,
  type StudentControlResultsDto,
  type StudentCreatedDto,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const tag = randomBytes(3).toString('hex').toUpperCase();
const key = () => `test-${randomBytes(8).toString('hex')}`;

describe('Академические достижения: контрольные работы (e2e, этап 28)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let stranger: LoggedIn;
  let studentSession: LoggedIn;
  const groups: Record<'eg' | 'kg' | 'foreign', string> = { eg: '', kg: '', foreign: '' };
  let webId: string;
  let workId: string;
  const students: Record<string, StudentCreatedDto> = {};
  const name = (last: string) => `${last}${tag}`;

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });
  const csv = (rows: string[][]) =>
    Buffer.from(rows.map((row) => row.join(';')).join('\r\n'), 'utf8');

  const createWork = (session: LoggedIn, body: object, idempotencyKey = key()) =>
    as(session, http().post('/api/control-works'))
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
  const sheet = async (session: LoggedIn, group: string) =>
    (
      await as(session, http().get(`/api/control-works/${workId}/groups/${group}/results`)).expect(
        200,
      )
    ).body as ControlSheetDto;
  const save = (session: LoggedIn, group: string, entries: object[]) =>
    as(session, http().put(`/api/control-works/${workId}/groups/${group}/results`)).send({
      entries,
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    stranger = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);

    for (const [slot, title] of [
      ['eg', `ЭГ-${tag}`],
      ['kg', `КГ-${tag}`],
      ['foreign', `ЧУ-${tag}`],
    ] as const) {
      groups[slot] = (
        await as(admin, http().post('/api/groups'))
          .send({ name: title, course: 1, specialty: 'Веб-дизайн' })
          .expect(201)
      ).body.id as string;
    }
    webId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Веб-дизайн ${tag}` })
        .expect(201)
    ).body.id as string;
    for (const groupId of [groups.eg, groups.kg]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherUser.id, groupId, disciplineId: webId })
        .expect(201);
    }
    for (const [last, first, groupId] of [
      ['Альфин', 'Пётр', groups.eg],
      ['Бетова', 'Анна', groups.eg],
      ['Гаммин', 'Олег', groups.eg],
      ['Дельтин', 'Иван', groups.kg],
    ] as const) {
      students[last] = (
        await as(admin, http().post('/api/students'))
          .set('Idempotency-Key', key())
          .send({ lastName: name(last), firstName: first, groupId })
          .expect(201)
      ).body as StudentCreatedDto;
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

  it('одна работа для ЭГ и КГ: тема, вид контроля, рубрика, свои даты; повтор формы без дублей', async () => {
    const body = {
      disciplineId: webId,
      topic: 'Создание веб-страниц',
      kind: 'ENTRY',
      criteria: 'Структура HTML — 40; оформление CSS — 40; аккуратность — 20',
      groups: [
        { groupId: groups.eg, date: '2025-10-20' },
        { groupId: groups.kg, date: '2025-10-21' },
      ],
    };
    const idempotencyKey = key();
    const created = (await createWork(teacher, body, idempotencyKey).expect(201))
      .body as ControlWorkDetailDto;
    workId = created.work.id;
    expect(created.work).toMatchObject({
      topic: 'Создание веб-страниц',
      kind: 'ENTRY',
      canEdit: true,
    });
    expect(created.work.groups.map((item) => item.date)).toEqual(['2025-10-21', '2025-10-20']);
    await createWork(teacher, body, idempotencyKey).expect(201);
    expect(await prisma.controlWork.count({ where: { disciplineId: webId } })).toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'control_work.created', entityId: workId },
    });
    expect(audit).not.toBeNull();
  });

  it('FR-002: преподаватель не создаёт работу в чужой группе и не видит чужие работы', async () => {
    const response = await createWork(teacher, {
      disciplineId: webId,
      topic: 'Чужая группа',
      kind: 'CURRENT',
      groups: [{ groupId: groups.foreign, date: '2025-11-01' }],
    }).expect(400);
    expect(response.body.fields['groups.0']).toBe('Вы не ведёте эту дисциплину в этой группе');
    await as(stranger, http().get(`/api/control-works/${workId}`)).expect(404);
    await save(stranger, groups.eg, []).expect(404);
    const list = (await as(stranger, http().get('/api/control-works')).expect(200))
      .body as ControlWorkListDto;
    expect(list.items.some((item) => item.id === workId)).toBe(false);
    await as(studentSession, http().get('/api/control-works')).expect(403);
  });

  it('ведомость: ФИО из базы, балл 0–100, отметки; отметка и пропуск — не ноль (FR-074)', async () => {
    const initial = await sheet(teacher, groups.eg);
    expect(initial.rows.map((row) => row.student.fullName)).toEqual([
      `${name('Альфин')} Пётр`,
      `${name('Бетова')} Анна`,
      `${name('Гаммин')} Олег`,
    ]);
    expect(initial.rows.every((row) => row.score === null && row.mark === null)).toBe(true);

    const bad = await save(teacher, groups.eg, [
      { studentId: students.Альфин!.student.id, score: 101, mark: null },
    ]).expect(400);
    expect(bad.body.message).toBeTruthy();
    const both = await save(teacher, groups.eg, [
      { studentId: students.Альфин!.student.id, score: 50, mark: 'ABSENT' },
    ]).expect(400);
    expect(both.body.fields['entries.0']).toBe('Укажите либо балл, либо отметку');
    await save(teacher, groups.eg, [
      { studentId: students.Дельтин!.student.id, score: 50, mark: null },
    ]).expect(400);

    const saved = (
      await save(teacher, groups.eg, [
        { studentId: students.Альфин!.student.id, score: 62.5, mark: null },
        { studentId: students.Бетова!.student.id, score: null, mark: 'ABSENT' },
        { studentId: students.Гаммин!.student.id, score: null, mark: null },
      ]).expect(200)
    ).body as ControlSheetDto;
    expect(saved.rows.map((row) => [row.score, row.mark])).toEqual([
      [62.5, null],
      [null, 'ABSENT'],
      [null, null],
    ]);
    expect(await prisma.controlResult.count({ where: { workId, groupId: groups.eg } })).toBe(2);
    await save(teacher, groups.kg, [
      { studentId: students.Дельтин!.student.id, score: 48, mark: null },
    ]).expect(200);

    const detail = (await as(teacher, http().get(`/api/control-works/${workId}`)).expect(200))
      .body as ControlWorkDetailDto;
    const eg = detail.groups.find((item) => item.group.id === groups.eg)!;
    expect(eg.stats).toMatchObject({ n: 1, missing: 2, mean: 62.5 });
    expect(eg.marks).toEqual({ ABSENT: 1, NOT_SUBMITTED: 0, EXEMPT: 0 });
    expect(eg.noData).toBe(1);
    expect(detail.groups.find((item) => item.group.id === groups.kg)!.stats.mean).toBe(48);
  });

  it('файл «ФИО | Результат» заполняет ведомость без сохранения', async () => {
    const file = csv([
      ['ФИО', 'Результат'],
      [`${name('Альфин')} Пётр`, '70'],
      [`${name('Бетова')} Анна`, 'Освобождена'],
      [`${name('Гаммин')} Олег`, 'отлично'],
      ['Неизвестный Студент', '50'],
    ]);
    const preview = (
      await as(teacher, http().post(`/api/control-works/${workId}/groups/${groups.eg}/import`))
        .attach('file', file, 'результаты.csv')
        .expect(200)
    ).body as ControlImportPreviewDto;
    expect(preview).toMatchObject({ validCount: 2, invalidCount: 2 });
    expect(preview.rows[0]!.resolved).toMatchObject({ score: 70, mark: null });
    expect(preview.rows[1]!.resolved).toMatchObject({ score: null, mark: 'EXEMPT' });
    expect(preview.rows[3]!.errors).toEqual(['Студент не найден в группе']);
    expect((await sheet(teacher, groups.eg)).rows[0]!.score).toBe(62.5);
  });

  it('группу с результатами убрать нельзя; изменение и удаление пишутся в аудит', async () => {
    const body = {
      disciplineId: webId,
      topic: 'Создание веб-страниц (вариант 2)',
      kind: 'ENTRY',
      criteria: null,
      groups: [{ groupId: groups.eg, date: '2025-10-20' }],
    };
    await as(teacher, http().put(`/api/control-works/${workId}`))
      .send(body)
      .expect(409);
    const updated = (
      await as(teacher, http().put(`/api/control-works/${workId}`))
        .send({ ...body, groups: [...body.groups, { groupId: groups.kg, date: '2025-10-22' }] })
        .expect(200)
    ).body as ControlWorkDetailDto;
    expect(updated.work.topic).toBe('Создание веб-страниц (вариант 2)');

    const future = (
      await createWork(teacher, {
        disciplineId: webId,
        topic: 'Будущая работа',
        kind: 'FINAL',
        groups: [{ groupId: groups.eg, date: '2099-01-10' }],
      }).expect(201)
    ).body as ControlWorkDetailDto;
    await as(
      teacher,
      http().put(`/api/control-works/${future.work.id}/groups/${groups.eg}/results`),
    )
      .send({ entries: [] })
      .expect(409);
    await as(teacher, http().delete(`/api/control-works/${future.work.id}`)).expect(204);
    expect(
      await prisma.auditLog.count({
        where: { entityId: future.work.id, action: 'control_work.deleted' },
      }),
    ).toBe(1);
  });

  it('результаты в профиле и в кабинете: только свои, входной → итоговый', async () => {
    const final = (
      await createWork(admin, {
        disciplineId: webId,
        topic: 'Итоговый проект',
        kind: 'FINAL',
        groups: [{ groupId: groups.eg, date: '2026-04-28' }],
      }).expect(201)
    ).body as ControlWorkDetailDto;
    await as(admin, http().put(`/api/control-works/${final.work.id}/groups/${groups.eg}/results`))
      .send({ entries: [{ studentId: students.Альфин!.student.id, score: 88, mark: null }] })
      .expect(200);

    const profile = (
      await as(
        teacher,
        http().get(`/api/students/${students.Альфин!.student.id}/control-results`),
      ).expect(200)
    ).body as StudentControlResultsDto;
    expect(profile.results.map((item) => [item.date, item.score])).toEqual([
      ['2025-10-20', 62.5],
      ['2026-04-28', 88],
    ]);
    expect(profile.progress).toEqual([
      expect.objectContaining({ entry: 62.5, final: 88, delta: 25.5 }),
    ]);
    await as(
      stranger,
      http().get(`/api/students/${students.Альфин!.student.id}/control-results`),
    ).expect(404);

    const own = (await as(studentSession, http().get('/api/cabinet/control-results')).expect(200))
      .body as StudentControlResultsDto;
    expect(own.results).toHaveLength(2);
    await as(
      studentSession,
      http().get(`/api/students/${students.Альфин!.student.id}/control-results`),
    ).expect(403);
  });
});
