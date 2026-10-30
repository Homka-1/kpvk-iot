import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  DEFAULT_MOTIVATION_STRATEGIES,
  type LibraryAssignmentDto,
  type MaterialDto,
  PROFILE_STAGE_DIFFICULTY,
  RoleCode,
  STANDARD_TRAJECTORY_STAGES,
  type StudentCreatedDto,
  type StudentHistoryItemDto,
  type TrajectoryContent,
  type TrajectoryDto,
  type TrajectoryOptionsDto,
  type TrajectoryPageDto,
  type TrajectorySnapshot,
} from '@iot/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const key = () => `test-${randomBytes(8).toString('hex')}`;
const suffix = () => randomBytes(3).toString('hex').toUpperCase();
/** Конец дня по местному времени — так срок задания передаёт интерфейс. */
const dueAt = (date: string) => new Date(`${date}T23:59:59`).toISOString();

describe('Индивидуальные траектории (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let otherTeacher: LoggedIn;
  let researcher: LoggedIn;
  let studentSession: LoggedIn;
  let groupId: string;
  let disciplineId: string;
  let secondDisciplineId: string;
  let foreignDisciplineId: string;
  let material: MaterialDto;
  let foreignMaterial: MaterialDto;
  let assignment: LibraryAssignmentDto;
  let archivedAssignment: LibraryAssignmentDto;
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

  const options = async (studentId: string) =>
    (await as(teacher, http().get(`/api/students/${studentId}/trajectory-options`)).expect(200))
      .body as TrajectoryOptionsDto;
  const create = (body: Record<string, unknown>, session = teacher, idem = key()) =>
    as(session, http().post('/api/trajectories')).set('Idempotency-Key', idem).send(body);
  const save = (trajectory: TrajectoryDto, body: object, session = teacher) =>
    as(session, http().put(`/api/trajectories/${trajectory.id}`)).send({
      updatedAt: trajectory.updatedAt,
      ...body,
    });
  const action = (
    trajectory: TrajectoryDto,
    name: 'approve' | 'submit' | 'return' | 'archive',
    body: Record<string, unknown> = {},
    session = teacher,
  ) =>
    as(session, http().post(`/api/trajectories/${trajectory.id}/${name}`)).send({
      updatedAt: trajectory.updatedAt,
      ...body,
    });

  /** Полностью заполненный маршрут: 5 этапов по месяцу, точка в конце этапа, материал и задание в первом. */
  function completeContent(trajectory: TrajectoryDto): TrajectoryContent {
    const months = ['09', '10', '11', '12', '01'];
    return {
      goals: 'Освоить линейные уравнения и применять их в профессиональных задачах',
      plannedResults: 'Решает уравнения самостоятельно',
      supportMethods: 'Еженедельная консультация',
      startDate: '2026-09-01',
      plannedEndDate: '2027-01-31',
      stages: trajectory.stages.map((stage, index) => {
        const year = index === 4 ? '2027' : '2026';
        const end = `${year}-${months[index]}-${index === 1 || index === 4 ? '31' : '28'}`;
        return {
          id: stage.id,
          title: stage.title,
          goal: stage.goal,
          startDate: `${year}-${months[index]}-01`,
          endDate: end,
          checkpoints: [{ title: `Контрольная точка ${index + 1}`, dueDate: end }],
          materialIds: index === 0 ? [material.id] : [],
          assignments:
            index === 0 ? [{ assignmentId: assignment.id, dueAt: dueAt('2026-09-20') }] : [],
        };
      }),
    };
  }

  /** Студент, черновик из стандартного шаблона и заполненный маршрут. */
  async function filledDraft(lastName: string) {
    const student = await createStudent(lastName);
    const standard = (await options(student.student.id)).templates.find((t) => t.isStandard)!;
    const draft = (
      await create({ studentId: student.student.id, disciplineId, templateId: standard.id }).expect(
        201,
      )
    ).body as TrajectoryDto;
    const filled = (await save(draft, completeContent(draft)).expect(200)).body as TrajectoryDto;
    return { student, draft: filled };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await login(app, (await createUser(app, { role: RoleCode.ADMIN })).login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    const otherUser = await createUser(app, { role: RoleCode.TEACHER });
    otherTeacher = await login(app, otherUser.login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);
    studentSession = await login(app, (await createUser(app, { role: RoleCode.STUDENT })).login);

    groupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ИОТ-${tag}`, course: 2, specialty: 'Программное обеспечение' })
        .expect(201)
    ).body.id as string;
    const discipline = async (name: string) =>
      (await as(admin, http().post('/api/disciplines')).send({ name }).expect(201)).body
        .id as string;
    disciplineId = await discipline(`Математика ${tag}`);
    secondDisciplineId = await discipline(`Физика ${tag}`);
    foreignDisciplineId = await discipline(`Химия ${tag}`);
    for (const id of [disciplineId, secondDisciplineId]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherUser.id, groupId, disciplineId: id })
        .expect(201);
    }
    const otherGroupId = (
      await as(admin, http().post('/api/groups'))
        .send({ name: `ИОТ2-${tag}`, course: 1, specialty: 'Химия' })
        .expect(201)
    ).body.id as string;
    await as(admin, http().post('/api/teacher-assignments'))
      .send({ teacherId: otherUser.id, groupId: otherGroupId, disciplineId: foreignDisciplineId })
      .expect(201);

    const materialBody = (title: string, id: string) => ({
      title,
      kind: 'TEXT',
      body: 'Текст',
      disciplineId: id,
    });
    material = (
      await as(teacher, http().post('/api/materials'))
        .set('Idempotency-Key', key())
        .send(materialBody(`Памятка ${tag}`, disciplineId))
        .expect(201)
    ).body as MaterialDto;
    foreignMaterial = (
      await as(otherTeacher, http().post('/api/materials'))
        .set('Idempotency-Key', key())
        .send(materialBody(`Чужая памятка ${tag}`, foreignDisciplineId))
        .expect(201)
    ).body as MaterialDto;
    const types = (await as(teacher, http().get('/api/assignment-types')).expect(200)).body as {
      id: string;
    }[];
    const assignmentBody = (title: string) => ({
      title,
      disciplineId,
      difficulty: 'BASIC',
      typeId: types[0]!.id,
      submissionFormats: ['TEXT'],
      criteria: [{ title: 'Верность', maxScore: 100 }],
      attachments: [],
    });
    assignment = (
      await as(teacher, http().post('/api/library-assignments'))
        .set('Idempotency-Key', key())
        .send(assignmentBody(`Уравнения ${tag}`))
        .expect(201)
    ).body as LibraryAssignmentDto;
    archivedAssignment = (
      await as(teacher, http().post('/api/library-assignments'))
        .set('Idempotency-Key', key())
        .send(assignmentBody(`Старое ${tag}`))
        .expect(201)
    ).body as LibraryAssignmentDto;
    await as(teacher, http().post(`/api/library-assignments/${archivedAssignment.id}/archive`))
      .send({ reason: 'Устарело' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-035: шаблон предлагается по утверждённому профилю; без профиля — стандартный', async () => {
    const student = await createStudent('Шаблон');
    let result = await options(student.student.id);
    expect(result.disciplines.map((item) => item.id).sort()).toEqual(
      [disciplineId, secondDisciplineId].sort(),
    );
    expect(result.profile).toBeNull();
    expect(result.blockedReason).toBeNull();
    const standard = result.templates.find((template) => template.isStandard)!;
    expect(standard.stages.map((stage) => stage.title)).toEqual(
      STANDARD_TRAJECTORY_STAGES.map((stage) => stage.title),
    );
    expect(result.templates.filter((template) => template.motivationLevel)).toHaveLength(3);
    expect(result.suggestedTemplateId).toBe(standard.id);

    // Предложение без решения преподавателя на шаблон не влияет; утверждённый профиль — влияет.
    await prisma.motivationProfile.create({
      data: { studentId: student.student.id, status: 'PROPOSED', proposedLevel: 'HIGH' },
    });
    expect((await options(student.student.id)).suggestedTemplateId).toBe(standard.id);
    await prisma.motivationProfile.create({
      data: {
        studentId: student.student.id,
        status: 'CONFIRMED',
        proposedLevel: 'LOW',
        level: 'LOW',
        decidedAt: new Date(),
      },
    });
    result = await options(student.student.id);
    expect(result.profile).toMatchObject({ level: 'LOW' });
    expect(result.suggestedTemplateId).toBe(
      result.templates.find((template) => template.motivationLevel === 'LOW')!.id,
    );
  });

  it('FR-034, FR-045, NFR-006: черновик из шаблона, повтор без дубля, по дисциплине — одна ИОТ', async () => {
    const student = await createStudent('Создание');
    await prisma.motivationProfile.create({
      data: {
        studentId: student.student.id,
        status: 'CONFIRMED',
        proposedLevel: 'MEDIUM',
        level: 'MEDIUM',
        decidedAt: new Date(),
      },
    });
    const { suggestedTemplateId } = await options(student.student.id);
    const idem = key();
    const body = { studentId: student.student.id, disciplineId, templateId: suggestedTemplateId };
    const draft = (await create(body, teacher, idem).expect(201)).body as TrajectoryDto;
    expect(draft).toMatchObject({
      status: 'DRAFT',
      version: 0,
      student: { id: student.student.id },
      discipline: { id: disciplineId },
      template: { id: suggestedTemplateId },
      motivationProfile: { level: 'MEDIUM' },
      supportMethods: DEFAULT_MOTIVATION_STRATEGIES.MEDIUM.join('\n'),
    });
    expect(draft.stages.map((stage) => stage.title)).toEqual(
      STANDARD_TRAJECTORY_STAGES.map((stage) => stage.title),
    );
    expect(draft.stages[0]!.goal).toBe(STANDARD_TRAJECTORY_STAGES[0]!.goal);

    const replay = (await create(body, teacher, idem).expect(201)).body as TrajectoryDto;
    expect(replay.id).toBe(draft.id);
    expect(await prisma.trajectory.count({ where: { studentId: student.student.id } })).toBe(1);
    await create(body).expect(409);

    // FR-045: по другой дисциплине — отдельная ИОТ, с нуля — без этапов.
    const second = (
      await create({ studentId: student.student.id, disciplineId: secondDisciplineId }).expect(201)
    ).body as TrajectoryDto;
    expect(second.stages).toEqual([]);
    expect(second.template).toBeNull();
    const result = await options(student.student.id);
    expect(result.disciplines.find((item) => item.id === disciplineId)!.currentTrajectoryId).toBe(
      draft.id,
    );

    // Чужая дисциплина и чужой студент недоступны.
    await create({ studentId: student.student.id, disciplineId: foreignDisciplineId }).expect(400);
    await create({ studentId: student.student.id, disciplineId }, otherTeacher).expect(404);

    const history = (
      await as(teacher, http().get(`/api/students/${student.student.id}/history`)).expect(200)
    ).body as StudentHistoryItemDto[];
    expect(history.map((item) => item.action)).toContain('trajectory.created');
  });

  it('FR-033, FR-047: этапы шаблона уровня несут рекомендуемую сложность, она сохраняется при правке', async () => {
    const student = await createStudent('Сложность');
    const { templates } = await options(student.student.id);
    expect(
      templates.find((t) => t.isStandard)!.stages.every((s) => s.recommendedDifficulty === null),
    ).toBe(true);
    const high = templates.find((t) => t.motivationLevel === 'HIGH')!;
    expect(high.stages.map((s) => s.recommendedDifficulty)).toEqual(PROFILE_STAGE_DIFFICULTY.HIGH);

    const draft = (
      await create({ studentId: student.student.id, disciplineId, templateId: high.id }).expect(201)
    ).body as TrajectoryDto;
    expect(draft.stages.map((s) => s.recommendedDifficulty)).toEqual(PROFILE_STAGE_DIFFICULTY.HIGH);

    // Правка и перестановка этапов не теряют рекомендацию; новый этап — без рекомендации.
    const [first, second, ...rest] = draft.stages;
    const content = completeContent({ ...draft, stages: [second!, first!, ...rest] });
    content.stages.push({
      id: null,
      title: 'Дополнительный',
      checkpoints: [],
      materialIds: [],
      assignments: [],
    });
    const saved = (await save(draft, content).expect(200)).body as TrajectoryDto;
    expect(saved.stages.map((s) => s.recommendedDifficulty)).toEqual([
      PROFILE_STAGE_DIFFICULTY.HIGH[1],
      PROFILE_STAGE_DIFFICULTY.HIGH[0],
      ...PROFILE_STAGE_DIFFICULTY.HIGH.slice(2),
      null,
    ]);
  });

  it('FR-036, FR-037: черновик — цели, сроки, этапы, точки, материалы и задания библиотеки', async () => {
    const { draft } = await filledDraft('Редактор');
    expect(draft).toMatchObject({
      goals: expect.stringContaining('линейные'),
      startDate: '2026-09-01',
      plannedEndDate: '2027-01-31',
    });
    const first = draft.stages[0]!;
    expect(first).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-28' });
    expect(first.checkpoints).toEqual([
      expect.objectContaining({ title: 'Контрольная точка 1', dueDate: '2026-09-28' }),
    ]);
    expect(first.materials).toEqual([
      { id: material.id, title: material.title, kind: 'TEXT', archived: false },
    ]);
    expect(first.assignments).toEqual([
      expect.objectContaining({
        assignment: expect.objectContaining({ id: assignment.id, title: assignment.title }),
        dueAt: dueAt('2026-09-20'),
        status: 'ASSIGNED',
      }),
    ]);

    // Порядок этапов меняется, этап удаляется, точки и назначения сохраняют id.
    const content = completeContent(draft);
    const [a, b, , ...rest] = content.stages;
    const reordered = [
      { ...a!, checkpoints: [{ ...a!.checkpoints[0]!, id: first.checkpoints[0]!.id }] },
      { ...b!, title: 'Самостоятельность (адаптировано)' },
      ...rest,
    ];
    reordered[0]!.assignments = [
      { id: first.assignments[0]!.id, assignmentId: assignment.id, dueAt: dueAt('2026-09-25') },
    ];
    const saved = (await save(draft, { ...content, stages: reordered }).expect(200))
      .body as TrajectoryDto;
    expect(saved.stages).toHaveLength(4);
    expect(saved.stages[1]!.title).toBe('Самостоятельность (адаптировано)');
    expect(saved.stages[0]!.checkpoints[0]!.id).toBe(first.checkpoints[0]!.id);
    expect(saved.stages[0]!.assignments[0]).toMatchObject({
      id: first.assignments[0]!.id,
      dueAt: dueAt('2026-09-25'),
    });
    expect(await prisma.trajectoryStage.count({ where: { trajectoryId: draft.id } })).toBe(4);

    // Устаревшая редакция не затирает сохранённую.
    await save(draft, content).expect(409);
    // Противоречивые сроки, чужой материал, новое архивное задание — 400 с указанием полей.
    const bad = await save(saved, {
      ...content,
      stages: [{ ...content.stages[0]!, id: undefined, endDate: '2026-08-01' }],
    }).expect(400);
    expect(bad.body.fields).toHaveProperty(['stages.0.endDate']);
    const foreign = await save(saved, {
      ...content,
      stages: [
        {
          ...content.stages[0]!,
          id: undefined,
          materialIds: [foreignMaterial.id],
          assignments: [{ assignmentId: archivedAssignment.id }],
        },
      ],
    }).expect(400);
    expect(Object.keys(foreign.body.fields)).toEqual(
      expect.arrayContaining(['stages.0.materialIds.0', 'stages.0.assignments.0.assignmentId']),
    );
  });

  it('FR-038: незаполненный маршрут не утверждается — сервер называет поля', async () => {
    const student = await createStudent('Неполный');
    const draft = (await create({ studentId: student.student.id, disciplineId }).expect(201))
      .body as TrajectoryDto;
    const res = await action(draft, 'approve').expect(400);
    expect(Object.keys(res.body.fields)).toEqual(
      expect.arrayContaining(['goals', 'startDate', 'plannedEndDate', 'stages']),
    );
    expect((await prisma.trajectory.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      'DRAFT',
    );
  });

  it('FR-039, AT-12: утвердить может только преподаватель с правом в своей области', async () => {
    const { draft } = await filledDraft('Права');
    for (const session of [studentSession, researcher, admin]) {
      await action(draft, 'approve', {}, session).expect(403);
      await as(session, http().get(`/api/trajectories/${draft.id}`)).expect(403);
    }
    await action(draft, 'approve', {}, otherTeacher).expect(404);
    await as(otherTeacher, http().get(`/api/trajectories/${draft.id}`)).expect(404);
    const page = (await as(otherTeacher, http().get('/api/trajectories')).expect(200))
      .body as TrajectoryPageDto;
    expect(page.items.map((item) => item.id)).not.toContain(draft.id);
  });

  it('FR-002: преподаватель без закреплений не видит ни одной ИОТ', async () => {
    const { draft } = await filledDraft('БезЗакреплений');
    const idle = await login(app, (await createUser(app, { role: RoleCode.TEACHER })).login);
    await as(idle, http().get(`/api/trajectories/${draft.id}`)).expect(404);
    const page = (await as(idle, http().get('/api/trajectories')).expect(200))
      .body as TrajectoryPageDto;
    expect(page.total).toBe(0);
  });

  it('AT-05, UC-03: утверждение — «Активна», версия со снимком, задания назначены, уведомление', async () => {
    const { student, draft } = await filledDraft('Утверждение');
    const approved = (await action(draft, 'approve').expect(200)).body as TrajectoryDto;
    expect(approved).toMatchObject({
      status: 'ACTIVE',
      version: 1,
      currentStageId: approved.stages[0]!.id,
      approvedBy: { id: expect.any(String) },
    });
    expect(approved.stages).toHaveLength(5);
    expect(approved.stages[0]!.status).toBe('IN_PROGRESS');
    expect(approved.versions).toEqual([
      expect.objectContaining({ versionNumber: 1, status: 'ACTIVE', reason: null }),
    ]);

    const version = await prisma.trajectoryVersion.findFirstOrThrow({
      where: { trajectoryId: draft.id },
    });
    const snapshot = version.snapshot as unknown as TrajectorySnapshot;
    expect(snapshot.status).toBe('ACTIVE');
    expect(snapshot.stages.map((stage) => stage.title)).toEqual(
      approved.stages.map((stage) => stage.title),
    );
    expect(snapshot.stages[0]!.assignments[0]!.assignment.id).toBe(assignment.id);
    // Зафиксированная версия неизменяема (FR-043).
    await expect(
      prisma.trajectoryVersion.update({ where: { id: version.id }, data: { reason: 'x' } }),
    ).rejects.toThrow();

    const userId = (await prisma.student.findUniqueOrThrow({ where: { id: student.student.id } }))
      .userId!;
    expect(
      await prisma.notification.count({
        where: { userId, type: 'trajectory.approved', entityId: draft.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'trajectory.approved', entityId: draft.id } }),
    ).toBe(1);

    // Повторное утверждение и правка утверждённого маршрута отклоняются.
    await action(approved, 'approve').expect(409);
    await save(approved, completeContent(approved)).expect(409);
    const page = (
      await as(teacher, http().get('/api/trajectories'))
        .query({ studentId: student.student.id })
        .expect(200)
    ).body as TrajectoryPageDto;
    expect(page.items).toEqual([
      expect.objectContaining({ id: draft.id, status: 'ACTIVE', version: 1, stageCount: 5 }),
    ]);
  });

  it('п. 4.6: «На утверждении» — согласование, возврат на доработку с причиной', async () => {
    const { draft } = await filledDraft('Согласование');
    const pending = (await action(draft, 'submit').expect(200)).body as TrajectoryDto;
    expect(pending.status).toBe('PENDING_APPROVAL');
    await save(pending, completeContent(pending)).expect(409);
    await action(pending, 'return', { reason: '' }).expect(400);
    const returned = (
      await action(pending, 'return', { reason: 'Уточнить цели этапа 3' }).expect(200)
    ).body as TrajectoryDto;
    expect(returned.status).toBe('DRAFT');
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'trajectory.returned', entityId: draft.id },
    });
    expect(log.reason).toBe('Уточнить цели этапа 3');
    const resubmitted = (await action(returned, 'submit').expect(200)).body as TrajectoryDto;
    expect((await action(resubmitted, 'approve').expect(200)).body.status).toBe('ACTIVE');
  });

  it('архив черновика: задания отменяются, по дисциплине можно создать новую ИОТ', async () => {
    const { student, draft } = await filledDraft('Архив');
    await action(draft, 'archive', { reason: '' }).expect(400);
    const archived = (await action(draft, 'archive', { reason: 'Создан по ошибке' }).expect(200))
      .body as TrajectoryDto;
    expect(archived.status).toBe('ARCHIVED');
    expect(
      await prisma.trajectoryAssignment.count({
        where: { trajectoryId: draft.id, status: { not: 'CANCELLED' } },
      }),
    ).toBe(0);
    const page = (
      await as(teacher, http().get('/api/trajectories'))
        .query({ studentId: student.student.id })
        .expect(200)
    ).body as TrajectoryPageDto;
    expect(page.total).toBe(0);
    await create({ studentId: student.student.id, disciplineId }).expect(201);
  });

  it('огр. 4: студенту контрольной группы исследования ИОТ не создаётся и не утверждается', async () => {
    const { student, draft } = await filledDraft('Контроль');
    const project = await prisma.researchProject.create({
      data: { title: `Исследование ${tag}`, status: 'ACTIVE' },
    });
    await prisma.researchParticipant.create({
      data: {
        projectId: project.id,
        studentId: student.student.id,
        code: `K-${tag}`,
        group: 'CONTROL',
      },
    });
    expect((await options(student.student.id)).blockedReason).toContain('контрольную группу');
    const res = await action(draft, 'approve').expect(403);
    expect(res.body.message).toContain('контрольную группу');
    await create({ studentId: student.student.id, disciplineId: secondDisciplineId }).expect(403);
  });
});
