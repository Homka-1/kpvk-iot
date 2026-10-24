import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type ResearchDataDto,
  type ResearchParticipantDto,
  type ResearchProjectDetailDto,
  RoleCode,
  type StudentCreatedDto,
} from '@iot/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, createUser, login, type LoggedIn } from './helpers.js';

const tag = `T${randomBytes(3).toString('hex').toUpperCase()}`;
const key = () => `test-${randomBytes(8).toString('hex')}`;
// Учебный год, которого нет в других тестах: семестры исследования видны только по участникам.
const YEAR = `20${60 + (randomBytes(1)[0]! % 30)}`;
const ACADEMIC_YEAR = `${YEAR}/${Number(YEAR) + 1}`;

function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Исследовательская аналитика ЭГ и КГ: успеваемость, наблюдения, широкая выгрузка (e2e, этап 27)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: LoggedIn;
  let teacher: LoggedIn;
  let researcher: LoggedIn;
  let project: ResearchProjectDetailDto;
  let semester1: string;
  let semester2: string;
  let criteria: { id: string; name: string }[];
  const students: Record<'eg' | 'cg', StudentCreatedDto[]> = { eg: [], cg: [] };
  const codeOf = new Map<string, string>();

  const http = () => request(app.getHttpServer());
  const as = (session: LoggedIn, req: request.Test) =>
    req.auth(session.accessToken, { type: 'bearer' });
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
    const adminUser = await createUser(app, { role: RoleCode.ADMIN });
    admin = await login(app, adminUser.login);
    const teacherUser = await createUser(app, { role: RoleCode.TEACHER });
    teacher = await login(app, teacherUser.login);
    researcher = await login(app, (await createUser(app, { role: RoleCode.RESEARCHER })).login);

    const group = async (name: string) =>
      (
        await as(admin, http().post('/api/groups'))
          .send({ name, course: 1, specialty: 'Педагогика' })
          .expect(201)
      ).body.id as string;
    const egGroupId = await group(`ЭГУ-${tag}`);
    const cgGroupId = await group(`КГУ-${tag}`);
    const disciplineId = (
      await as(admin, http().post('/api/disciplines'))
        .send({ name: `Математика ${tag}` })
        .expect(201)
    ).body.id as string;
    for (const groupId of [egGroupId, cgGroupId]) {
      await as(admin, http().post('/api/teacher-assignments'))
        .send({ teacherId: teacherUser.id, groupId, disciplineId })
        .expect(201);
    }
    const createStudent = async (groupId: string, lastName: string) =>
      (
        await as(teacher, http().post('/api/students'))
          .set('Idempotency-Key', key())
          .send({ lastName: `${lastName}${tag}`, firstName: 'Тест', groupId })
          .expect(201)
      ).body as StudentCreatedDto;
    for (let index = 0; index < 2; index += 1) {
      students.eg.push(await createStudent(egGroupId, `Успехов${index}`));
      students.cg.push(await createStudent(cgGroupId, `Сравнев${index}`));
    }

    project = (
      await as(researcher, http().post('/api/research-projects'))
        .set('Idempotency-Key', key())
        .send({ title: `ЭГ и КГ ${tag}`, startsOn: '2026-09-01', endsOn: '2026-12-31' })
        .expect(201)
    ).body as ResearchProjectDetailDto;
    for (const [groupId, researchGroup] of [
      [egGroupId, 'EXPERIMENTAL'],
      [cgGroupId, 'CONTROL'],
    ] as const) {
      await as(researcher, http().post(`/api/research-projects/${project.id}/participants`))
        .send({ groupId, group: researchGroup })
        .expect(201);
    }
    const participants = await prisma.researchParticipant.findMany({
      where: { projectId: project.id },
      select: { studentId: true, code: true },
    });
    for (const item of participants) codeOf.set(item.studentId, item.code);

    // Оценки за два семестра (как после импорта этапа 26).
    const period = async (semester: number) =>
      (
        await prisma.academicPeriod.upsert({
          where: { academicYear_semester: { academicYear: ACADEMIC_YEAR, semester } },
          create: { academicYear: ACADEMIC_YEAR, semester },
          update: {},
        })
      ).id;
    semester1 = await period(1);
    semester2 = await period(2);
    const gradeImport = await prisma.gradeImport.create({
      data: {
        fileName: 'оценки.csv',
        contentHash: key(),
        rowCount: 5,
        createdById: adminUser.id,
      },
    });
    const grade = (
      student: StudentCreatedDto,
      groupId: string,
      periodId: string,
      score: number,
    ) => ({
      studentId: student.student.id,
      disciplineId,
      source: 'SEMESTER_IMPORT' as const,
      score,
      maxScore: 100,
      periodId,
      groupId,
      importId: gradeImport.id,
      recordedAt: new Date(),
    });
    await prisma.academicResult.createMany({
      data: [
        grade(students.eg[0]!, egGroupId, semester1, 60),
        grade(students.eg[0]!, egGroupId, semester2, 80),
        grade(students.eg[1]!, egGroupId, semester1, 70),
        grade(students.cg[0]!, cgGroupId, semester1, 65),
        grade(students.cg[0]!, cgGroupId, semester2, 66),
      ],
    });

    // Наблюдения на занятиях: до начала исследования и во время него.
    criteria = await prisma.observationCriterion.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
      take: 2,
    });
    const lesson = async (groupId: string, date: string) =>
      prisma.lesson.create({
        data: {
          groupId,
          disciplineId,
          teacherId: teacherUser.id,
          date: new Date(date),
          startTime: '08:30',
        },
      });
    const journal = async (
      lessonId: string,
      student: StudentCreatedDto,
      scores: (number | null)[],
      absent = false,
    ) =>
      prisma.lessonJournalEntry.create({
        data: {
          lessonId,
          studentId: student.student.id,
          absent,
          ratings: {
            create: absent
              ? []
              : scores.map((score, index) => ({ criterionId: criteria[index]!.id, score })),
          },
        },
      });
    const egBefore = await lesson(egGroupId, '2026-05-12');
    const egAfter = await lesson(egGroupId, '2026-10-06');
    await journal(egBefore.id, students.eg[0]!, [2, 3]);
    await journal(egAfter.id, students.eg[0]!, [4, 5]);
    // «Не наблюдалось» и отсутствие — не оценки и не нули.
    await journal(egBefore.id, students.eg[1]!, [null, null]);
    await journal(egAfter.id, students.eg[1]!, [], true);
    const cgAfter = await lesson(cgGroupId, '2026-10-07');
    await journal(cgAfter.id, students.cg[0]!, [3, null]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('FR-069, FR-070, FR-074: показатели ЭГ и КГ по умолчанию — два последних семестра и периоды от дат исследования', async () => {
    const result = await data();
    const { outcomes } = result;
    expect(outcomes.periods.map((item) => item.id)).toEqual([semester2, semester1]);
    expect(outcomes.gradesBefore?.id).toBe(semester1);
    expect(outcomes.gradesAfter?.id).toBe(semester2);
    expect(outcomes.observationsBefore).toEqual({ from: null, to: '2026-08-31' });
    expect(outcomes.observationsAfter).toEqual({ from: '2026-09-01', to: '2026-12-31' });

    const eg0 = codeOf.get(students.eg[0]!.student.id)!;
    const eg1 = codeOf.get(students.eg[1]!.student.id)!;
    const cg0 = codeOf.get(students.cg[0]!.student.id)!;
    expect(outcomes.values[eg0]!.grades).toEqual({ before: 60, after: 80 });
    expect(outcomes.values[eg1]!.grades).toEqual({ before: 70, after: null });
    expect(outcomes.values[eg0]!.observations).toEqual({ before: 2.5, after: 4.5 });
    expect(outcomes.values[eg1]!.observations).toEqual({ before: null, after: null });
    expect(outcomes.values[cg0]!.observations).toEqual({ before: null, after: 3 });

    const stat = (indicatorKey: string, group: 'EXPERIMENTAL' | 'CONTROL') =>
      outcomes.stats.find((row) => row.indicatorKey === indicatorKey && row.group === group)!;
    expect(stat('grades', 'EXPERIMENTAL').before).toMatchObject({ n: 2, mean: 65 });
    expect(stat('grades', 'EXPERIMENTAL').change).toMatchObject({ n: 1, missing: 1, mean: 20 });
    expect(stat('grades', 'CONTROL').change).toMatchObject({ n: 1, missing: 1, mean: 1 });
    expect(stat('observations', 'CONTROL').before).toMatchObject({ n: 0, mean: null });
    expect(outcomes.indicators.map((item) => item.name)).toEqual(
      expect.arrayContaining([`Наблюдения: ${criteria[0]!.name}`]),
    );
    // В данных исследования — только коды участников.
    expect(JSON.stringify(result)).not.toContain(tag);
  });

  it('семестры и периоды выбирает исследователь; ошибки выбора — 400', async () => {
    const swapped = await data({
      gradesBeforePeriodId: semester2,
      gradesAfterPeriodId: semester1,
      observationsBeforeFrom: '2026-10-01',
      observationsBeforeTo: '2026-10-31',
    });
    const eg0 = codeOf.get(students.eg[0]!.student.id)!;
    expect(swapped.outcomes.values[eg0]!.grades).toEqual({ before: 80, after: 60 });
    expect(swapped.outcomes.observationsAfter).toBeNull();
    expect(swapped.outcomes.values[eg0]!.observations).toEqual({ before: 4.5, after: null });

    const bad = (query: Record<string, string>) =>
      as(researcher, http().get(`/api/research-projects/${project.id}/data`).query(query)).expect(
        400,
      );
    await bad({ gradesBeforePeriodId: semester1, gradesAfterPeriodId: semester1 });
    await bad({ gradesBeforePeriodId: '01900000-0000-7000-8000-000000000000' });
    await bad({ observationsBeforeFrom: '2026-10-01', observationsBeforeTo: '2026-09-01' });
    await bad({
      observationsBeforeTo: '2026-09-15',
      observationsAfterFrom: '2026-09-01',
    });
  });

  it('FR-071, FR-075: широкая выгрузка — строка на участника, «до/после», без ПДн, с аудитом', async () => {
    const before = await prisma.auditLog.count({
      where: { action: 'research_data.exported', entityId: project.id },
    });
    const csv = await as(researcher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'csv', dataset: 'wide' })
      .expect(200);
    const lines = csv.text.slice(1).trim().split('\r\n');
    const header = lines[0]!.split(';');
    expect(header.slice(0, 2)).toEqual(['Код участника', 'Группа исследования']);
    expect(header).toEqual(
      expect.arrayContaining([
        `Средний балл за семестр — до (семестр: ${ACADEMIC_YEAR}, 1 семестр)`,
        `Средний балл за семестр — после (семестр: ${ACADEMIC_YEAR}, 2 семестр)`,
        'Наблюдения: средняя по критериям — до (период: по 31.08.2026)',
        'Наблюдения: средняя по критериям — после (период: 01.09.2026 – 31.12.2026)',
      ]),
    );
    expect(lines).toHaveLength(1 + 4);
    const eg0 = codeOf.get(students.eg[0]!.student.id)!;
    const row = lines.find((line) => line.startsWith(`${eg0};`))!.split(';');
    const column = (name: string) => row[header.findIndex((item) => item.startsWith(name))];
    expect(column('Средний балл за семестр — до')).toBe('60');
    expect(column('Средний балл за семестр — после')).toBe('80');
    // Пропуск — пустая ячейка, а не ноль.
    const eg1 = codeOf.get(students.eg[1]!.student.id)!;
    const missing = lines.find((line) => line.startsWith(`${eg1};`))!.split(';');
    expect(
      missing[header.findIndex((item) => item.startsWith('Средний балл за семестр — после'))],
    ).toBe('');
    for (const secret of [tag, students.eg[0]!.login, 'ЭГУ-', 'КГУ-']) {
      expect(csv.text).not.toContain(secret);
    }

    const xlsx = await as(researcher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'xlsx', dataset: 'wide' })
      .buffer(true)
      .parse(binary)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body as ArrayBuffer);
    expect(workbook.getWorksheet('До и после')!.rowCount).toBe(1 + 4);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'research_data.exported', entityId: project.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({
      dataset: 'wide',
      gradesBefore: semester1,
      gradesAfter: semester2,
      observationsBefore: [null, '2026-08-31'],
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'research_data.exported', entityId: project.id },
      }),
    ).toBe(before + 2);
    await as(teacher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'csv', dataset: 'wide' })
      .expect(403);
  });

  it('исключённый участник не попадает в показатели и широкую выгрузку', async () => {
    const participants = (
      await as(researcher, http().get(`/api/research-projects/${project.id}/participants`)).expect(
        200,
      )
    ).body as ResearchParticipantDto[];
    const eg0 = codeOf.get(students.eg[0]!.student.id)!;
    const target = participants.find((item) => item.code === eg0)!;
    await as(
      researcher,
      http().post(`/api/research-projects/${project.id}/participants/${target.id}/exclude`),
    )
      .send({ reason: 'Отозвал согласие' })
      .expect(200);
    const result = await data();
    expect(result.outcomes.values[eg0]).toBeUndefined();
    const csv = await as(researcher, http().get(`/api/research-projects/${project.id}/export`))
      .query({ format: 'csv', dataset: 'wide' })
      .expect(200);
    expect(csv.text).not.toContain(`${eg0};`);
  });
});
