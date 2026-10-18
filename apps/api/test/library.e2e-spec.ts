import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AssignmentTypeDto,
  FILE_UPLOAD_MAX_BYTES,
  type FileDto,
  type LibraryAssignmentDto,
  type MaterialDto,
  RoleCode,
  SYSTEM_ASSIGNMENT_TYPES,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n', 'latin1');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00', 'latin1');

describe('Библиотека материалов и заданий (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let student: LoggedIn;
  let researcher: LoggedIn;
  let disciplineId: string;
  let foreignDisciplineId: string;
  let practicalTypeId: string;
  const tag = suffix();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });
  const upload = (session: LoggedIn, content: Buffer, name: string) =>
    as(session, http().post('/api/files')).attach('file', content, name);
  const uploadPdf = async (session = teacher, name = `Конспект ${tag}.pdf`) =>
    (await upload(session, PDF, name).expect(201)).body as FileDto;
  const createMaterial = (body: Record<string, unknown>, session = teacher, idem = key()) =>
    as(session, http().post('/api/materials')).set('Idempotency-Key', idem).send(body);
  const listMaterials = async (query: Record<string, string>, session = teacher) =>
    (await as(session, http().get('/api/materials')).query(query).expect(200))
      .body as MaterialDto[];
  const assignmentBody = (overrides: Record<string, unknown> = {}) => ({
    title: `Кейс ${tag}`,
    disciplineId,
    topic: `Дроби ${tag}`,
    goal: 'Научиться сравнивать дроби',
    difficulty: 'INTERMEDIATE',
    typeId: practicalTypeId,
    instruction: 'Решите задачи и объясните решение',
    submissionFormats: ['TEXT', 'FILE'],
    criteria: [
      { title: 'Верность', maxScore: 6 },
      { title: 'Обоснование', description: 'Пояснение к каждому шагу', maxScore: 4.5 },
    ],
    attachments: [],
    ...overrides,
  });
  const createAssignment = (body: Record<string, unknown>, session = teacher, idem = key()) =>
    as(session, http().post('/api/library-assignments')).set('Idempotency-Key', idem).send(body);
  const listAssignments = async (query: Record<string, string>, session = teacher) =>
    (await as(session, http().get('/api/library-assignments')).query(query).expect(200))
      .body as LibraryAssignmentDto[];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    const otherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    otherTeacher = await login(app, otherUser.login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);
    student = await login(app, (await createUser(app, { role: RoleCode.STUDENT })).login);

    const groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `БМ-${tag}`, course: 1, specialty: 'Педагогика' })
        .expect(201)
    ).body.id as string;
    disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Математика ${tag}` })
        .expect(201)
    ).body.id as string;
    foreignDisciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Химия ${tag}` })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: teacherUser.id, groupId, disciplineId })
      .expect(201);
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: otherUser.id, groupId, disciplineId: foreignDisciplineId })
      .expect(201);
    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200))
      .body as AssignmentTypeDto[];
    practicalTypeId = types.find((type) => type.code === 'practical')!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-049: файл загружается, MIME определяется по содержимому, скачивание — вложением с исходным именем', async () => {
    const file = await uploadPdf();
    expect(file).toMatchObject({
      originalName: `Конспект ${tag}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    const res = await as(teacher, http().get(`/api/files/${file.id}`))
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment;');
    expect(res.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent(`Конспект ${tag}.pdf`)}`,
    );
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
    const row = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(row.storageKey).not.toContain('.');
    expect(row.storageKey).not.toContain('Конспект');
  });

  it('п. 8.3: запрещённый тип, переименованный файл и превышение размера отклоняются без сохранения', async () => {
    const before = await prisma.file.count();
    const exe = await upload(teacher, EXE, 'setup.exe').expect(400);
    expect(exe.body.message).toContain('Этот тип файла загружать нельзя');
    const renamed = await upload(teacher, EXE, 'отчёт.pdf').expect(400);
    expect(renamed.body.message).toContain('не соответствует его расширению');
    const big = Buffer.alloc(FILE_UPLOAD_MAX_BYTES + 1, 0x20);
    const tooBig = await upload(teacher, big, 'большой.txt').expect(413);
    expect(tooBig.body.message).toContain('Файл больше 20 МБ');
    await as(teacher, http().post('/api/files')).expect(400);
    expect(await prisma.file.count()).toBe(before);
  });

  it('п. 2: студент и исследователь не работают с библиотекой (403)', async () => {
    for (const session of [student, researcher]) {
      await upload(session, PDF, 'a.pdf').expect(403);
      await as(session, http().get('/api/materials')).expect(403);
      await as(session, http().get('/api/library-assignments')).expect(403);
    }
  });

  it('библиотека материалов: файл, ссылка и текст; поиск по дисциплине, теме, виду и тексту', async () => {
    const file = await uploadPdf();
    const fileMaterial = (
      await createMaterial({
        title: `Опорный конспект ${tag}`,
        kind: 'FILE',
        fileId: file.id,
        url: 'https://example.org/игнорируется',
        disciplineId,
        topic: `Уравнения ${tag}`,
      }).expect(201)
    ).body as MaterialDto;
    expect(fileMaterial).toMatchObject({
      kind: 'FILE',
      file: { id: file.id },
      url: null,
      discipline: { id: disciplineId },
      createdBy: { fullName: expect.stringContaining('Тестов') },
    });
    await createMaterial({
      title: `Видеоурок ${tag}`,
      kind: 'LINK',
      url: 'https://example.org/video',
      disciplineId,
      topic: `Дроби ${tag}`,
    }).expect(201);
    await createMaterial({ title: `Памятка ${tag}`, kind: 'TEXT', body: 'Шаги решения' }).expect(
      201,
    );

    const unsafe = await createMaterial({
      title: 'Опасная ссылка',
      kind: 'LINK',
      url: 'javascript:alert(1)',
    }).expect(400);
    expect(unsafe.body.fields.url).toContain('http');
    const noFile = await createMaterial({ title: 'Без файла', kind: 'FILE' }).expect(400);
    expect(noFile.body.fields.fileId).toBe('Загрузите файл');

    expect((await listMaterials({ q: tag })).map((item) => item.title).sort()).toEqual(
      [`Видеоурок ${tag}`, `Опорный конспект ${tag}`, `Памятка ${tag}`].sort(),
    );
    expect((await listMaterials({ q: tag, kind: 'LINK' })).map((item) => item.title)).toEqual([
      `Видеоурок ${tag}`,
    ]);
    expect((await listMaterials({ topic: `уравнения ${tag}` })).map((item) => item.id)).toEqual([
      fileMaterial.id,
    ]);
    expect(await listMaterials({ q: tag, disciplineId })).toHaveLength(2);
  });

  it('FR-002: материалы и файлы чужой дисциплины не видны; общие материалы видны всем преподавателям', async () => {
    const file = await uploadPdf();
    const own = (
      await createMaterial({
        title: `Закрытый ${tag}`,
        kind: 'FILE',
        fileId: file.id,
        disciplineId,
      }).expect(201)
    ).body as MaterialDto;
    const shared = (
      await createMaterial({ title: `Общий ${tag}`, kind: 'TEXT', body: 'Для всех' }).expect(201)
    ).body as MaterialDto;

    const visible = (await listMaterials({ q: tag }, otherTeacher)).map((item) => item.id);
    expect(visible).toContain(shared.id);
    expect(visible).not.toContain(own.id);
    await as(otherTeacher, http().get(`/api/materials/${own.id}`)).expect(404);
    await as(otherTeacher, http().get(`/api/files/${file.id}`)).expect(404);
    await as(otherTeacher, http().put(`/api/materials/${own.id}`))
      .send({ title: 'Взлом', kind: 'TEXT', body: 'x' })
      .expect(404);

    // Чужой загруженный файл нельзя прикрепить к своей записи.
    const stolen = await createMaterial(
      { title: 'Чужой файл', kind: 'FILE', fileId: file.id },
      otherTeacher,
    ).expect(400);
    expect(stolen.body.fields.fileId).toBeTruthy();
    // Дисциплину, за которой преподаватель не закреплён, выбрать нельзя.
    await createMaterial({
      title: 'Не своя дисциплина',
      kind: 'TEXT',
      body: 'x',
      disciplineId: foreignDisciplineId,
    }).expect(400);
  });

  it('материал изменяется и архивируется с причиной в аудите; архивный скрыт из поиска', async () => {
    const material = (
      await createMaterial({
        title: `Черновик ${tag}`,
        kind: 'TEXT',
        body: 'Первая версия',
      }).expect(201)
    ).body as MaterialDto;
    const updated = (
      await as(teacher, http().put(`/api/materials/${material.id}`))
        .send({ title: `Памятка-2 ${tag}`, kind: 'LINK', url: 'https://example.org/a', body: 'x' })
        .expect(200)
    ).body as MaterialDto;
    expect(updated).toMatchObject({ kind: 'LINK', url: 'https://example.org/a', body: null });

    await as(teacher, http().post(`/api/materials/${material.id}/archive`))
      .send({})
      .expect(400);
    await as(teacher, http().post(`/api/materials/${material.id}/archive`))
      .send({ reason: 'Устарел' })
      .expect(200);
    expect((await listMaterials({ q: `Памятка-2 ${tag}` })).length).toBe(0);
    expect(
      (await listMaterials({ q: `Памятка-2 ${tag}`, includeArchived: 'true' }))[0]?.archivedAt,
    ).toBeTruthy();
    await as(teacher, http().put(`/api/materials/${material.id}`))
      .send({ title: 'x', kind: 'TEXT', body: 'x' })
      .expect(409);
    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'material', entityId: material.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'material.created',
      'material.updated',
      'material.archived',
    ]);
    expect(audit[2]!.reason).toBe('Устарел');
    await as(teacher, http().post(`/api/materials/${material.id}/restore`)).expect(200);
  });

  it('п. 4.7: стандартные типы заданий есть, свой тип добавляется, дубль названия — 409', async () => {
    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200))
      .body as AssignmentTypeDto[];
    expect(types.slice(0, SYSTEM_ASSIGNMENT_TYPES.length).map((type) => type.name)).toEqual(
      SYSTEM_ASSIGNMENT_TYPES.map((type) => type.name),
    );
    expect(
      types.every((type, index) => index >= SYSTEM_ASSIGNMENT_TYPES.length || type.isSystem),
    ).toBe(true);
    const custom = (
      await as(teacher, http().post('/api/assignment-types'))
        .set('Idempotency-Key', key())
        .send({ name: `Эссе ${tag}` })
        .expect(201)
    ).body as AssignmentTypeDto;
    expect(custom).toMatchObject({ name: `Эссе ${tag}`, isSystem: false });
    await as(teacher, http().post('/api/assignment-types'))
      .set('Idempotency-Key', key())
      .send({ name: `эссе ${tag}` })
      .expect(409);
  });

  it('FR-046, FR-049: задание с критериями, файлом и ссылкой; повторная отправка не создаёт дубль', async () => {
    const file = await uploadPdf(teacher, `Условие ${tag}.pdf`);
    const idem = key();
    const body = assignmentBody({
      title: `Сравнение дробей ${tag}`,
      attachments: [
        { title: 'Условие', fileId: file.id },
        { title: 'Тренажёр', url: 'https://example.org/trainer' },
      ],
    });
    const created = (await createAssignment(body, teacher, idem).expect(201))
      .body as LibraryAssignmentDto;
    const replay = (await createAssignment(body, teacher, idem).expect(201))
      .body as LibraryAssignmentDto;
    expect(replay.id).toBe(created.id);
    expect(await prisma.assignment.count({ where: { title: `Сравнение дробей ${tag}` } })).toBe(1);
    expect(created).toMatchObject({
      discipline: { id: disciplineId },
      difficulty: 'INTERMEDIATE',
      type: { code: 'practical', name: 'Практическая работа' },
      submissionFormats: ['TEXT', 'FILE'],
      maxScore: 10.5,
      criteria: [
        { title: 'Верность', maxScore: 6, description: null },
        { title: 'Обоснование', maxScore: 4.5 },
      ],
      attachments: [
        { title: 'Условие', file: { id: file.id }, url: null },
        { title: 'Тренажёр', file: null, url: 'https://example.org/trainer' },
      ],
    });
    // Файл задания доступен коллеге по дисциплине? Нет: коллеге другой дисциплины — 404.
    await as(otherTeacher, http().get(`/api/files/${file.id}`)).expect(404);

    const invalid = await createAssignment(
      assignmentBody({
        submissionFormats: [],
        criteria: [{ title: '', maxScore: 0 }],
        attachments: [{ title: 'Пусто' }],
      }),
    ).expect(400);
    expect(Object.keys(invalid.body.fields)).toEqual(
      expect.arrayContaining(['submissionFormats', 'criteria.0.title', 'criteria.0.maxScore']),
    );
    const noSource = await createAssignment(
      assignmentBody({ attachments: [{ title: 'Пусто' }] }),
    ).expect(400);
    expect(noSource.body.fields['attachments.0.url']).toBe('Укажите либо файл, либо ссылку');
    await createAssignment(assignmentBody({ disciplineId: foreignDisciplineId })).expect(400);
  });

  it('FR-046: задание редактируется (критерии и вложения заменяются), изменение пишется в аудит', async () => {
    const created = (await createAssignment(assignmentBody({ title: `Правка ${tag}` })).expect(201))
      .body as LibraryAssignmentDto;
    const updated = (
      await as(teacher, http().put(`/api/library-assignments/${created.id}`))
        .send(
          assignmentBody({
            title: `Правка-2 ${tag}`,
            difficulty: 'ADVANCED',
            submissionFormats: ['LINK'],
            criteria: [{ title: 'Итог', maxScore: 5 }],
            attachments: [{ url: 'https://example.org/b' }],
          }),
        )
        .expect(200)
    ).body as LibraryAssignmentDto;
    expect(updated).toMatchObject({
      title: `Правка-2 ${tag}`,
      difficulty: 'ADVANCED',
      maxScore: 5,
      criteria: [{ title: 'Итог', maxScore: 5 }],
      attachments: [{ url: 'https://example.org/b', title: null }],
    });
    expect(await prisma.assessmentCriterion.count({ where: { assignmentId: created.id } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'assignment', entityId: created.id, action: 'assignment.updated' },
    });
    expect(audit.before).toMatchObject({ title: `Правка ${tag}` });
    await as(otherTeacher, http().put(`/api/library-assignments/${created.id}`))
      .send(assignmentBody())
      .expect(404);
  });

  it('FR-047: поиск заданий по дисциплине, теме, уровню сложности, типу и тексту; чужие не видны', async () => {
    const research = (
      (await as(teacher, http().get('/api/assignment-types')).expect(200))
        .body as AssignmentTypeDto[]
    ).find((type) => type.code === 'research')!;
    await createAssignment(
      assignmentBody({ title: `Поиск-А ${tag}`, topic: `Проценты ${tag}`, difficulty: 'BASIC' }),
    ).expect(201);
    await createAssignment(
      assignmentBody({
        title: `Поиск-Б ${tag}`,
        topic: `Проценты ${tag}`,
        difficulty: 'ADVANCED',
        typeId: research.id,
      }),
    ).expect(201);
    const archived = (
      await createAssignment(
        assignmentBody({ title: `Поиск-В ${tag}`, topic: `Проценты ${tag}` }),
      ).expect(201)
    ).body as LibraryAssignmentDto;
    await as(teacher, http().post(`/api/library-assignments/${archived.id}/archive`))
      .send({ reason: 'Не нужно' })
      .expect(200);

    const titles = (items: LibraryAssignmentDto[]) => items.map((item) => item.title).sort();
    expect(titles(await listAssignments({ topic: `проценты ${tag}` }))).toEqual([
      `Поиск-А ${tag}`,
      `Поиск-Б ${tag}`,
    ]);
    expect(
      titles(await listAssignments({ topic: `Проценты ${tag}`, difficulty: 'BASIC' })),
    ).toEqual([`Поиск-А ${tag}`]);
    expect(
      titles(await listAssignments({ q: `Поиск`, typeId: research.id, disciplineId })),
    ).toEqual([`Поиск-Б ${tag}`]);
    expect(
      titles(await listAssignments({ topic: `Проценты ${tag}`, includeArchived: 'true' })),
    ).toHaveLength(3);
    expect(await listAssignments({ q: tag }, otherTeacher)).toEqual([]);
    await as(otherTeacher, http().get(`/api/library-assignments/${archived.id}`)).expect(404);
    await as(teacher, http().get('/api/library-assignments'))
      .query({ difficulty: 'HARD' })
      .expect(400);
  });
});
