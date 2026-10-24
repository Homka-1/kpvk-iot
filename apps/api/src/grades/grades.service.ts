import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AcademicPeriodDto,
  type AcademicPeriodRef,
  compareAcademicPeriods,
  type CurrentUser,
  formatAcademicPeriod,
  formatFullName,
  GRADE_IMPORT_COLUMNS,
  GRADE_IMPORT_MAX_ROWS,
  GRADE_SCORE_MAX,
  gradeDelta,
  type GradeImportDto,
  type GradeImportField,
  type GradeImportPreviewDto,
  type GradeImportResultDto,
  type GradeImportRowDto,
  gradeMean,
  type GradeOptionsDto,
  type GroupGradesDto,
  normalizePersonName,
  parseAcademicYear,
  parseGradeScore,
  parseSemester,
  type PersonRef,
  personNameKeys,
  type StudentGradesDto,
  summarizeSemester,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { parseTableFile } from '../common/table-import.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SOURCE = 'SEMESTER_IMPORT' as const;
const IMPORTS_LIST_LIMIT = 100;

type PersonRow = { id: string; lastName: string; firstName: string; middleName: string | null };
const personSelect = { id: true, lastName: true, firstName: true, middleName: true } as const;
const toPerson = (row: PersonRow): PersonRef => ({ id: row.id, fullName: formatFullName(row) });
const byName = (a: PersonRef, b: PersonRef) => a.fullName.localeCompare(b.fullName, 'ru');
const periodKey = (period: AcademicPeriodRef) => `${period.academicYear}|${period.semester}`;
const toPeriod = (row: { id: string; academicYear: string; semester: number }) => ({
  id: row.id,
  academicYear: row.academicYear,
  semester: row.semester,
  label: formatAcademicPeriod(row),
});

/** Строка импорта после предпросмотра (для повторной проверки при подтверждении). */
export interface GradeImportRowInput {
  line: number;
  studentName: string;
  groupName: string;
  academicYear: string;
  semester: string;
  disciplineName: string;
  score: string;
}

export interface GroupGradesQuery {
  groupId: string;
  periodId: string;
  compareWith?: string;
}

/**
 * Академическая успешность по семестрам (этап 26). Оценки 0–100 загружаются файлом и хранятся
 * как есть в `academic_results` (источник SEMESTER_IMPORT) с периодом, группой и загрузкой.
 * Средний балл по дисциплине — среднее её оценок, общий за семестр — среднее средних дисциплин.
 * Импорт: администратор — все группы, преподаватель — свои пары группа — дисциплина (FR-002).
 * Просмотр: сотрудники с доступом к студенту; студенту оценки этим модулем не отдаются.
 */
@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private pairAllowed(scope: AccessScope, groupId: string, disciplineId: string): boolean {
    return (
      scope.kind === 'all' ||
      scope.pairs.some((pair) => pair.groupId === groupId && pair.disciplineId === disciplineId)
    );
  }

  private async periods(): Promise<AcademicPeriodDto[]> {
    const rows = await this.prisma.academicPeriod.findMany();
    return rows.sort((a, b) => compareAcademicPeriods(b, a)).map(toPeriod);
  }

  async options(user: CurrentUser): Promise<GradeOptionsDto> {
    const scope = await this.scopes.forUser(user);
    const [periods, groups] = await Promise.all([
      this.periods(),
      this.prisma.group.findMany({
        where: scope.kind === 'all' ? { archivedAt: null } : { id: { in: scope.groupIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { periods, groups };
  }

  // ── Успеваемость студента и группы ──

  async studentGrades(user: CurrentUser, studentId: string): Promise<StudentGradesDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    const rows = await this.prisma.academicResult.findMany({
      where: { studentId, source: SOURCE },
      select: {
        score: true,
        period: true,
        group: { select: { id: true, name: true } },
        discipline: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byPeriod = new Map<string, typeof rows>();
    for (const row of rows) {
      byPeriod.set(row.period!.id, [...(byPeriod.get(row.period!.id) ?? []), row]);
    }
    const semesters = [...byPeriod.values()].map((items) => {
      const grades = items.map((item) => ({
        disciplineId: item.discipline.id,
        score: item.score.toNumber(),
      }));
      const summary = summarizeSemester(grades);
      const groups = new Map(items.map((item) => [item.group!.id, item.group!]));
      return {
        period: toPeriod(items[0]!.period!),
        groups: [...groups.values()],
        disciplines: summary.disciplines
          .map((item) => ({
            discipline: items.find((row) => row.discipline.id === item.disciplineId)!.discipline,
            scores: grades.filter((g) => g.disciplineId === item.disciplineId).map((g) => g.score),
            mean: item.mean,
          }))
          .sort((a, b) => a.discipline.name.localeCompare(b.discipline.name, 'ru')),
        overall: summary.overall,
      };
    });
    semesters.sort((a, b) => compareAcademicPeriods(b.period, a.period));
    return { semesters };
  }

  async groupGrades(user: CurrentUser, query: GroupGradesQuery): Promise<GroupGradesDto> {
    const scope = await this.scopes.forUser(user);
    const group = await this.prisma.group.findUnique({
      where: { id: query.groupId },
      select: { id: true, name: true },
    });
    // Чужая группа неотличима от несуществующей (FR-002).
    if (!group || (scope.kind !== 'all' && !scope.groupIds.includes(group.id))) {
      throw new NotFoundException('Группа не найдена');
    }
    if (query.compareWith && query.compareWith === query.periodId) {
      throw new BadRequestException('Для сравнения выберите другой семестр');
    }
    const [period, comparePeriod] = await Promise.all([
      this.prisma.academicPeriod.findUnique({ where: { id: query.periodId } }),
      query.compareWith
        ? this.prisma.academicPeriod.findUnique({ where: { id: query.compareWith } })
        : null,
    ]);
    if (!period || (query.compareWith && !comparePeriod)) {
      throw new NotFoundException('Семестр не найден');
    }
    const periodIds = [period.id, ...(comparePeriod ? [comparePeriod.id] : [])];

    // Студенты группы: действующие и те, чьи оценки загружены по этой группе за выбранные семестры.
    const students = await this.prisma.student.findMany({
      where: {
        OR: [
          { currentGroupId: group.id, archivedAt: null },
          {
            academicResults: {
              some: { source: SOURCE, groupId: group.id, periodId: { in: periodIds } },
            },
          },
        ],
      },
      select: personSelect,
    });
    const grades = await this.prisma.academicResult.findMany({
      where: {
        source: SOURCE,
        periodId: { in: periodIds },
        studentId: { in: students.map((student) => student.id) },
      },
      select: {
        studentId: true,
        periodId: true,
        score: true,
        discipline: { select: { id: true, name: true } },
      },
    });

    const summaryOf = (studentId: string, periodId: string) =>
      summarizeSemester(
        grades
          .filter((grade) => grade.studentId === studentId && grade.periodId === periodId)
          .map((grade) => ({ disciplineId: grade.discipline.id, score: grade.score.toNumber() })),
      );
    const rows = students.map((student) => ({
      student: toPerson(student),
      current: summaryOf(student.id, period.id),
      previous: comparePeriod ? summaryOf(student.id, comparePeriod.id) : null,
    }));

    const disciplines = new Map(grades.map((grade) => [grade.discipline.id, grade.discipline]));
    const disciplineMean = (
      summaries: (ReturnType<typeof summarizeSemester> | null)[],
      id: string,
    ) =>
      summaries.flatMap(
        (summary) => summary?.disciplines.filter((item) => item.disciplineId === id) ?? [],
      );
    const overall = gradeMean(rows.flatMap((row) => row.current.overall ?? []));
    const compareOverall = comparePeriod
      ? gradeMean(rows.flatMap((row) => row.previous?.overall ?? []))
      : null;

    return {
      group,
      period: toPeriod(period),
      comparePeriod: comparePeriod ? toPeriod(comparePeriod) : null,
      overall,
      compareOverall,
      delta: gradeDelta(overall, compareOverall),
      disciplines: [...disciplines.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((discipline) => {
          const current = disciplineMean(
            rows.map((row) => row.current),
            discipline.id,
          );
          const previous = disciplineMean(
            rows.map((row) => row.previous),
            discipline.id,
          );
          const mean = gradeMean(current.map((item) => item.mean));
          const compareMean = comparePeriod ? gradeMean(previous.map((item) => item.mean)) : null;
          return {
            discipline,
            mean,
            students: current.length,
            compareMean,
            delta: gradeDelta(mean, compareMean),
          };
        }),
      students: rows
        .map((row) => {
          const compare = row.previous?.overall ?? null;
          return {
            student: row.student,
            overall: row.current.overall,
            disciplineCount: row.current.disciplines.length,
            compareOverall: compare,
            delta: gradeDelta(row.current.overall, compare),
          };
        })
        .sort((a, b) => byName(a.student, b.student)),
    };
  }

  // ── Импорт оценок ──

  async previewImport(
    user: CurrentUser,
    file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<GradeImportPreviewDto> {
    if (!file) throw new BadRequestException('Выберите файл CSV или XLSX');
    const parsed = await parseTableFile<GradeImportField>(file.buffer, file.originalname, {
      columns: GRADE_IMPORT_COLUMNS,
      maxRows: GRADE_IMPORT_MAX_ROWS,
      emptyMessage: 'В файле нет строк с оценками',
    });
    const rows = await this.validateImport(
      user,
      parsed.rows.map(({ line, values }) => ({ line, ...values })),
    );
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    const valid = rows.filter((row) => row.errors.length === 0);
    const previous = valid.length > 0 ? await this.findSameImport(contentHash(valid)) : null;
    return {
      rows,
      validCount: valid.length,
      invalidCount,
      fileErrors: parsed.fileErrors,
      alreadyImported: previous
        ? { fileName: previous.fileName, createdAt: previous.createdAt.toISOString() }
        : null,
    };
  }

  private findSameImport(hash: string) {
    return this.prisma.gradeImport.findFirst({
      where: { contentHash: hash, cancelledAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Импорт подтверждённых строк: проверка заново, при любой ошибке ничего не сохраняется. */
  async commitImport(
    user: CurrentUser,
    input: { fileName: string; rows: GradeImportRowInput[] },
    idempotencyKey: string,
  ): Promise<GradeImportResultDto> {
    const { response, replayed } = await this.idempotency.run(
      user.id,
      `grade.import:${idempotencyKey}`,
      input,
      async () => {
        const rows = await this.validateImport(user, input.rows);
        const fields = Object.fromEntries(
          rows
            .filter((row) => row.errors.length > 0)
            .map((row) => [`rows.${row.line}`, row.errors.join('; ')]),
        );
        if (Object.keys(fields).length > 0) {
          throw new BadRequestException({
            message: 'Данные изменились после предпросмотра. Загрузите файл заново',
            fields,
          });
        }
        const hash = contentHash(rows);
        const previous = await this.findSameImport(hash);
        if (previous) {
          throw new ConflictException(
            `Эти оценки уже загружены из файла «${previous.fileName}». Чтобы загрузить их заново, сначала отмените прежнюю загрузку`,
          );
        }
        const result = await this.prisma.$transaction(async (tx) => {
          const wanted = new Map(
            rows.map((row) => [periodKey(row.resolved!.period), row.resolved!.period]),
          );
          await tx.academicPeriod.createMany({
            data: [...wanted.values()].map(({ academicYear, semester }) => ({
              academicYear,
              semester,
            })),
            skipDuplicates: true,
          });
          const periods = await tx.academicPeriod.findMany({
            where: {
              OR: [...wanted.values()].map(({ academicYear, semester }) => ({
                academicYear,
                semester,
              })),
            },
          });
          const periodId = new Map(periods.map((period) => [periodKey(period), period.id]));
          const created = await tx.gradeImport.create({
            data: {
              fileName: input.fileName,
              contentHash: hash,
              rowCount: rows.length,
              createdById: user.id,
            },
          });
          const now = new Date();
          await tx.academicResult.createMany({
            data: rows.map(({ resolved }) => ({
              studentId: resolved!.student.id,
              disciplineId: resolved!.discipline.id,
              groupId: resolved!.group.id,
              periodId: periodId.get(periodKey(resolved!.period))!,
              importId: created.id,
              source: SOURCE,
              score: resolved!.score,
              maxScore: GRADE_SCORE_MAX,
              recordedAt: now,
              recordedById: user.id,
            })),
          });
          await this.audit.log(
            {
              action: 'grades.imported',
              entityType: 'grade_import',
              entityId: created.id,
              after: {
                fileName: input.fileName,
                rows: rows.length,
                periods: [...wanted.values()].map(formatAcademicPeriod),
              },
            },
            tx,
          );
          return created;
        });
        return { importId: result.id, created: rows.length, replayed: false };
      },
    );
    return replayed ? { ...response, replayed: true } : response;
  }

  private async validateImport(
    user: CurrentUser,
    input: GradeImportRowInput[],
  ): Promise<GradeImportRowDto[]> {
    const scope = await this.scopes.forUser(user);
    const normalize = normalizePersonName;
    // Архивные группы и дисциплины тоже сопоставляются: загружаются оценки прошлых семестров.
    const [groups, disciplines] = await Promise.all([
      this.prisma.group.findMany({ select: { id: true, name: true } }),
      this.prisma.discipline.findMany({ select: { id: true, name: true } }),
    ]);
    const groupByName = new Map(groups.map((group) => [normalize(group.name), group]));
    const disciplineByName = new Map(disciplines.map((item) => [normalize(item.name), item]));

    // Студенты сопоставляются внутри группы из файла: текущий состав и все, кто в ней учился.
    const groupIds = [
      ...new Set(input.flatMap((row) => groupByName.get(normalize(row.groupName))?.id ?? [])),
    ];
    const students = await this.prisma.student.findMany({
      where: {
        OR: [
          { currentGroupId: { in: groupIds } },
          { enrollments: { some: { groupId: { in: groupIds } } } },
        ],
      },
      select: { ...personSelect, currentGroupId: true, enrollments: { select: { groupId: true } } },
    });
    const studentsByKey = new Map<string, PersonRow[]>();
    for (const student of students) {
      const memberOf = new Set([
        student.currentGroupId,
        ...student.enrollments.map((item) => item.groupId),
      ]);
      // Только фамилия не подходит: в группе часто есть однофамильцы.
      const keys = personNameKeys(student).filter((key) => key !== normalize(student.lastName));
      for (const groupId of memberOf) {
        if (!groupId) continue;
        for (const key of keys) {
          const mapKey = `${groupId}|${key}`;
          const list = studentsByKey.get(mapKey) ?? [];
          if (!list.some((item) => item.id === student.id)) list.push(student);
          studentsByKey.set(mapKey, list);
        }
      }
    }

    return input.map((row) => {
      const errors: string[] = [];
      const group = groupByName.get(normalize(row.groupName));
      const discipline = disciplineByName.get(normalize(row.disciplineName));
      const academicYear = parseAcademicYear(row.academicYear);
      const semester = parseSemester(row.semester);
      const score = parseGradeScore(row.score);
      const candidates = group
        ? (studentsByKey.get(`${group.id}|${normalize(row.studentName)}`) ?? [])
        : [];
      if (!row.studentName) errors.push('Не указано ФИО студента');
      if (!group) errors.push(`Группа «${row.groupName}» не найдена`);
      else if (row.studentName && candidates.length === 0) {
        errors.push(`Студент «${row.studentName}» в группе «${group.name}» не найден`);
      } else if (candidates.length > 1) {
        errors.push(
          `Студентов «${row.studentName}» в группе несколько: укажите фамилию, имя и отчество полностью`,
        );
      }
      if (!academicYear) errors.push('Учебный год не распознан: укажите в формате 2025/2026');
      if (!semester) errors.push('Семестр — 1 или 2');
      if (!discipline) errors.push(`Дисциплина «${row.disciplineName}» не найдена`);
      if (score === null) errors.push('Оценка — число от 0 до 100');
      if (group && discipline && !this.pairAllowed(scope, group.id, discipline.id)) {
        errors.push('Вы не ведёте эту дисциплину в этой группе');
      }
      const period = academicYear && semester ? { academicYear, semester } : null;
      const resolved =
        errors.length === 0
          ? {
              student: toPerson(candidates[0]!),
              group: group!,
              period: { ...period!, label: formatAcademicPeriod(period!) },
              discipline: discipline!,
              score: score!,
            }
          : null;
      return { ...row, resolved, errors };
    });
  }

  // ── Загрузки ──

  async imports(user: CurrentUser): Promise<GradeImportDto[]> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.gradeImport.findMany({
      where: scope.kind === 'all' ? {} : { createdById: user.id },
      include: { author: { select: personSelect } },
      orderBy: { createdAt: 'desc' },
      take: IMPORTS_LIST_LIMIT,
    });
    const details = await this.prisma.academicResult.findMany({
      where: { importId: { in: rows.map((row) => row.id) } },
      distinct: ['importId', 'periodId', 'groupId'],
      select: { importId: true, period: true, group: { select: { name: true } } },
    });
    return rows.map((row) => {
      const own = details.filter((item) => item.importId === row.id);
      return {
        id: row.id,
        fileName: row.fileName,
        rowCount: row.rowCount,
        createdAt: row.createdAt.toISOString(),
        author: toPerson(row.author),
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        periods: [
          ...new Set(
            own
              .map((item) => item.period!)
              .sort(compareAcademicPeriods)
              .map(formatAcademicPeriod),
          ),
        ],
        groups: [...new Set(own.map((item) => item.group!.name))].sort((a, b) =>
          a.localeCompare(b, 'ru'),
        ),
        canCancel:
          row.cancelledAt === null && (scope.kind === 'all' || row.createdById === user.id),
      };
    });
  }

  /**
   * Отмена ошибочной загрузки: её оценки удаляются, сама загрузка остаётся в списке с отметкой.
   * Отменяет автор загрузки или администратор; действие записывается в журнал аудита.
   */
  async cancelImport(user: CurrentUser, id: string): Promise<void> {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.gradeImport.findUnique({ where: { id } });
    if (!row || (scope.kind !== 'all' && row.createdById !== user.id)) {
      throw new NotFoundException('Загрузка не найдена');
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.gradeImport.updateMany({
        where: { id, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelledById: user.id },
      });
      if (updated.count === 0) throw new ConflictException('Загрузка уже отменена');
      const deleted = await tx.academicResult.deleteMany({ where: { importId: id } });
      await this.audit.log(
        {
          action: 'grades.import_cancelled',
          entityType: 'grade_import',
          entityId: id,
          before: { fileName: row.fileName, rows: deleted.count },
        },
        tx,
      );
    });
  }
}

/** Отпечаток содержания загрузки: не зависит от порядка строк и формата файла. */
function contentHash(rows: GradeImportRowDto[]): string {
  const lines = rows
    .map(({ resolved }) =>
      [
        resolved!.student.id,
        periodKey(resolved!.period),
        resolved!.discipline.id,
        resolved!.score,
      ].join('|'),
    )
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
