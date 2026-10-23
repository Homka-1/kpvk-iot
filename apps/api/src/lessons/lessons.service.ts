import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CurrentUser,
  formatFullName,
  LESSON_IMPORT_COLUMNS,
  LESSON_IMPORT_MAX_ROWS,
  LESSON_SCORE_MAX,
  LESSON_SCORE_MIN,
  type LessonDto,
  type LessonImportField,
  type LessonImportPreviewDto,
  type LessonImportResultDto,
  type LessonImportRowDto,
  type LessonJournalDto,
  type LessonJournalInput,
  lessonJournalStatus,
  type LessonListDto,
  type LessonOptionsDto,
  LESSONS_LIST_LIMIT,
  normalizePersonName,
  type ObservationCriterionDto,
  observationCriteriaSchema,
  type ObservationCriteriaInput,
  parseScheduleDate,
  parseScheduleTime,
  Permission,
  type PersonRef,
  personNameKeys,
  RoleCode,
  type StudentLessonJournalDto,
  summarizeCriteria,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { parseTableFile } from '../common/table-import.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const personSelect = { id: true, lastName: true, firstName: true, middleName: true } as const;
type PersonRow = { id: string; lastName: string; firstName: string; middleName: string | null };
const toPerson = (row: PersonRow): PersonRef => ({ id: row.id, fullName: formatFullName(row) });

const lessonInclude = {
  group: { select: { id: true, name: true } },
  discipline: { select: { id: true, name: true } },
  teacher: { select: personSelect },
} as const;
type LessonRow = Prisma.LessonGetPayload<{ include: typeof lessonInclude }>;

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const dateValue = (value: string) => new Date(`${value}T00:00:00Z`);
const byName = (a: PersonRef, b: PersonRef) => a.fullName.localeCompare(b.fullName, 'ru');

/** Последняя допустимая дата занятия для журнала: «сегодня» у пользователя восточнее UTC. */
const latestObservableDate = () => isoDate(new Date(Date.now() + 14 * 60 * 60 * 1000));

export interface LessonInput {
  date: string;
  startTime: string;
  groupId: string;
  disciplineId: string;
  teacherId?: string | null;
}

export interface LessonListQuery {
  groupId?: string;
  disciplineId?: string;
  from?: string;
  to?: string;
}

/** Строка импорта после проверки (для повторной проверки при подтверждении). */
export interface LessonImportRowInput {
  line: number;
  date: string;
  time: string;
  groupName: string;
  disciplineName: string;
  teacherName: string;
}

/**
 * Занятия по расписанию и журнал педагогических наблюдений на занятии (этап 25).
 * Доступ: администратор — все занятия; преподаватель — занятия своих пар группа — дисциплина
 * (FR-002) и занятия, где он указан преподавателем. Журнал заполняет только сотрудник с правом
 * наблюдений; студенту журнал не передаётся (FR-016).
 */
@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ── Область доступа ──

  private lessonsWhere(scope: AccessScope, user: CurrentUser): Prisma.LessonWhereInput {
    if (scope.kind === 'all') return {};
    return {
      OR: [
        { teacherId: user.id },
        ...scope.pairs.map(({ groupId, disciplineId }) => ({ groupId, disciplineId })),
      ],
    };
  }

  private pairAllowed(scope: AccessScope, groupId: string, disciplineId: string): boolean {
    return (
      scope.kind === 'all' ||
      scope.pairs.some((pair) => pair.groupId === groupId && pair.disciplineId === disciplineId)
    );
  }

  private async findLesson(user: CurrentUser, id: string) {
    const scope = await this.scopes.forUser(user);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, ...this.lessonsWhere(scope, user) },
      include: lessonInclude,
    });
    if (!lesson) throw new NotFoundException('Занятие не найдено');
    return lesson;
  }

  // ── Список и карточка занятия ──

  async list(user: CurrentUser, query: LessonListQuery): Promise<LessonListDto> {
    const scope = await this.scopes.forUser(user);
    const date: Prisma.DateTimeFilter = {};
    if (query.from) date.gte = dateValue(query.from);
    if (query.to) date.lte = dateValue(query.to);
    const rows = await this.prisma.lesson.findMany({
      where: {
        AND: [
          this.lessonsWhere(scope, user),
          query.groupId ? { groupId: query.groupId } : {},
          query.disciplineId ? { disciplineId: query.disciplineId } : {},
          query.from || query.to ? { date } : {},
        ],
      },
      include: lessonInclude,
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: LESSONS_LIST_LIMIT + 1,
    });
    const items = await this.describe(user, rows.slice(0, LESSONS_LIST_LIMIT));
    return { items, truncated: rows.length > LESSONS_LIST_LIMIT };
  }

  /** Карточки занятий с заполненностью журнала. */
  private async describe(user: CurrentUser, rows: LessonRow[]): Promise<LessonDto[]> {
    if (rows.length === 0) return [];
    const lessonIds = rows.map((row) => row.id);
    const groupIds = [...new Set(rows.map((row) => row.groupId))];
    const [activeCriteria, entries, students] = await Promise.all([
      this.prisma.observationCriterion.findMany({
        where: { archivedAt: null },
        select: { id: true },
      }),
      this.prisma.lessonJournalEntry.findMany({
        where: { lessonId: { in: lessonIds } },
        select: {
          lessonId: true,
          studentId: true,
          absent: true,
          ratings: { select: { criterionId: true } },
        },
      }),
      this.prisma.student.findMany({
        where: { currentGroupId: { in: groupIds }, archivedAt: null },
        select: { id: true, currentGroupId: true },
      }),
    ]);
    const criterionIds = activeCriteria.map((criterion) => criterion.id);
    const canObserve = user.permissions.includes(Permission.OBSERVATIONS_MANAGE);
    const canManage = user.permissions.includes(Permission.LESSONS_MANAGE);
    return rows.map((row) => {
      const own = entries.filter((entry) => entry.lessonId === row.id);
      const studentIds = new Set([
        ...students.filter((s) => s.currentGroupId === row.groupId).map((s) => s.id),
        ...own.map((entry) => entry.studentId),
      ]);
      const done = own.filter(
        (entry) =>
          entry.absent ||
          criterionIds.every((id) => entry.ratings.some((rating) => rating.criterionId === id)),
      ).length;
      const total = studentIds.size;
      return {
        id: row.id,
        date: isoDate(row.date),
        startTime: row.startTime,
        group: row.group,
        discipline: row.discipline,
        teacher: toPerson(row.teacher),
        journal: { status: lessonJournalStatus(done, total), done, total },
        canObserve,
        canDelete: canManage && own.length === 0,
      };
    });
  }

  async options(user: CurrentUser): Promise<LessonOptionsDto> {
    const scope = await this.scopes.forUser(user);
    if (scope.kind === 'all') {
      const [groups, disciplines, teachers] = await Promise.all([
        this.prisma.group.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.discipline.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.activeTeachers(),
      ]);
      return { groups, disciplines, teachers: teachers.map(toPerson), pairs: null };
    }
    const [groups, disciplines, self] = await Promise.all([
      this.prisma.group.findMany({
        where: { id: { in: scope.groupIds }, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.discipline.findMany({
        where: { id: { in: scope.disciplineIds }, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: personSelect }),
    ]);
    return { groups, disciplines, teachers: [toPerson(self)], pairs: scope.pairs };
  }

  private activeTeachers() {
    return this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: RoleCode.TEACHER } } } },
      select: personSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  // ── Создание, удаление ──

  async create(user: CurrentUser, input: LessonInput): Promise<LessonDto> {
    const scope = await this.scopes.forUser(user);
    const fields: Record<string, string> = {};
    if (!parseScheduleDate(input.date)) fields.date = 'Укажите дату занятия';
    if (!parseScheduleTime(input.startTime)) fields.startTime = 'Укажите время в формате ЧЧ:ММ';
    const teacherId = scope.kind === 'all' ? input.teacherId : user.id;
    const [group, discipline, teacher] = await Promise.all([
      this.prisma.group.findUnique({ where: { id: input.groupId } }),
      this.prisma.discipline.findUnique({ where: { id: input.disciplineId } }),
      teacherId
        ? this.prisma.user.findFirst({
            where: {
              id: teacherId,
              status: 'ACTIVE',
              roles: { some: { role: { code: RoleCode.TEACHER } } },
            },
          })
        : null,
    ]);
    if (!group || group.archivedAt) fields.groupId = 'Выберите группу';
    if (!discipline || discipline.archivedAt) fields.disciplineId = 'Выберите дисциплину';
    if (!teacher) fields.teacherId = 'Выберите преподавателя';
    if (group && discipline && !this.pairAllowed(scope, group.id, discipline.id)) {
      fields.disciplineId = 'Вы не ведёте эту дисциплину в выбранной группе';
    }
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте правильность заполнения формы', fields });
    }
    const data = {
      groupId: group!.id,
      disciplineId: discipline!.id,
      teacherId: teacher!.id,
      date: dateValue(parseScheduleDate(input.date)!),
      startTime: parseScheduleTime(input.startTime)!,
    };
    const duplicate = await this.prisma.lesson.findUnique({
      where: {
        groupId_disciplineId_date_startTime: {
          groupId: data.groupId,
          disciplineId: data.disciplineId,
          date: data.date,
          startTime: data.startTime,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Занятие этой группы по дисциплине в это время уже есть');
    }
    const lesson = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lesson.create({
        data: { ...data, createdById: user.id },
        include: lessonInclude,
      });
      await this.audit.log(
        {
          action: 'lesson.created',
          entityType: 'lesson',
          entityId: created.id,
          after: { ...data, date: isoDate(data.date) },
        },
        tx,
      );
      return created;
    });
    return (await this.describe(user, [lesson]))[0]!;
  }

  async remove(user: CurrentUser, id: string): Promise<void> {
    // Чужое занятие findLesson не находит (404): область доступа уже учтена.
    const lesson = await this.findLesson(user, id);
    await this.prisma.$transaction(async (tx) => {
      const entries = await tx.lessonJournalEntry.count({ where: { lessonId: id } });
      if (entries > 0) {
        throw new ConflictException('В журнале занятия есть наблюдения — занятие нельзя удалить');
      }
      await tx.lesson.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'lesson.deleted',
          entityType: 'lesson',
          entityId: id,
          before: {
            groupId: lesson.groupId,
            disciplineId: lesson.disciplineId,
            teacherId: lesson.teacherId,
            date: isoDate(lesson.date),
            startTime: lesson.startTime,
          },
        },
        tx,
      );
    });
  }

  // ── Импорт расписания ──

  async previewImport(
    user: CurrentUser,
    file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<LessonImportPreviewDto> {
    if (!file) throw new BadRequestException('Выберите файл CSV или XLSX');
    const parsed = await parseTableFile<LessonImportField>(file.buffer, file.originalname, {
      columns: LESSON_IMPORT_COLUMNS,
      maxRows: LESSON_IMPORT_MAX_ROWS,
      emptyMessage: 'В файле нет строк с занятиями',
    });
    const rows = await this.validateImport(
      user,
      parsed.rows.map(({ line, values }) => ({
        line,
        date: values.date,
        time: values.time,
        groupName: values.groupName,
        disciplineName: values.disciplineName,
        teacherName: values.teacherName,
      })),
    );
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    const duplicateCount = rows.filter((row) => row.errors.length === 0 && row.duplicate).length;
    return {
      rows,
      validCount: rows.length - invalidCount - duplicateCount,
      duplicateCount,
      invalidCount,
      fileErrors: parsed.fileErrors,
    };
  }

  /** Импорт подтверждённых строк: проверка заново, при любой ошибке ничего не создаётся. */
  async commitImport(
    user: CurrentUser,
    input: LessonImportRowInput[],
    idempotencyKey: string,
  ): Promise<LessonImportResultDto> {
    const { response, replayed } = await this.idempotency.run(
      user.id,
      `lesson.import:${idempotencyKey}`,
      input,
      async () => {
        const rows = await this.validateImport(user, input);
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
        const fresh = rows.filter((row) => !row.duplicate);
        const created = await this.prisma.$transaction(async (tx) => {
          const result = await tx.lesson.createMany({
            data: fresh.map((row) => ({
              groupId: row.resolved!.group.id,
              disciplineId: row.resolved!.discipline.id,
              teacherId: row.resolved!.teacher.id,
              date: dateValue(row.resolved!.date),
              startTime: row.resolved!.startTime,
              createdById: user.id,
            })),
            skipDuplicates: true,
          });
          await this.audit.log(
            {
              action: 'lesson.imported',
              entityType: 'lesson',
              after: { created: result.count, skipped: rows.length - result.count },
            },
            tx,
          );
          return result.count;
        });
        return { created, skipped: rows.length - created, replayed: false };
      },
    );
    return replayed ? { ...response, replayed: true } : response;
  }

  private async validateImport(
    user: CurrentUser,
    input: LessonImportRowInput[],
  ): Promise<LessonImportRowDto[]> {
    const scope = await this.scopes.forUser(user);
    const normalize = (value: string) => normalizePersonName(value);
    const [groups, disciplines, teachers] = await Promise.all([
      this.prisma.group.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.discipline.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true },
      }),
      this.activeTeachers(),
    ]);
    const groupByName = new Map(groups.map((group) => [normalize(group.name), group]));
    const disciplineByName = new Map(disciplines.map((item) => [normalize(item.name), item]));
    const teachersByKey = new Map<string, PersonRow[]>();
    for (const teacher of teachers) {
      for (const key of personNameKeys(teacher)) {
        teachersByKey.set(key, [...(teachersByKey.get(key) ?? []), teacher]);
      }
    }

    const seen = new Set<string>();
    const rows: LessonImportRowDto[] = input.map((row) => {
      const errors: string[] = [];
      const date = parseScheduleDate(row.date);
      const startTime = parseScheduleTime(row.time);
      const group = groupByName.get(normalize(row.groupName));
      const discipline = disciplineByName.get(normalize(row.disciplineName));
      const candidates = teachersByKey.get(normalize(row.teacherName)) ?? [];
      if (!date) errors.push('Дата не распознана: укажите в формате дд.мм.гггг');
      if (!startTime) errors.push('Время не распознано: укажите в формате ЧЧ:ММ');
      if (!group) errors.push(`Группа «${row.groupName}» не найдена`);
      if (!discipline) errors.push(`Дисциплина «${row.disciplineName}» не найдена`);
      if (candidates.length === 0) {
        errors.push(`Преподаватель «${row.teacherName}» не найден`);
      } else if (candidates.length > 1) {
        errors.push(
          `Преподавателей «${row.teacherName}» несколько: укажите фамилию, имя и отчество полностью`,
        );
      }
      if (group && discipline && !this.pairAllowed(scope, group.id, discipline.id)) {
        errors.push('Вы не ведёте эту дисциплину в этой группе');
      }
      let duplicate = false;
      if (date && startTime && group && discipline) {
        const key = `${group.id}|${discipline.id}|${date}|${startTime}`;
        duplicate = seen.has(key);
        seen.add(key);
      }
      const resolved =
        errors.length === 0
          ? {
              date: date!,
              startTime: startTime!,
              group: group!,
              discipline: discipline!,
              teacher: toPerson(candidates[0]!),
            }
          : null;
      return { ...row, resolved, duplicate, errors };
    });

    // Занятия, которые уже есть в расписании, пропускаются (повторная загрузка файла).
    const resolvedRows = rows.filter((row) => row.resolved && !row.duplicate);
    if (resolvedRows.length > 0) {
      const existing = await this.prisma.lesson.findMany({
        where: {
          OR: resolvedRows.map((row) => ({
            groupId: row.resolved!.group.id,
            disciplineId: row.resolved!.discipline.id,
            date: dateValue(row.resolved!.date),
            startTime: row.resolved!.startTime,
          })),
        },
        select: { groupId: true, disciplineId: true, date: true, startTime: true },
      });
      const keys = new Set(
        existing.map((l) => `${l.groupId}|${l.disciplineId}|${isoDate(l.date)}|${l.startTime}`),
      );
      for (const row of resolvedRows) {
        const { group, discipline, date, startTime } = row.resolved!;
        if (keys.has(`${group.id}|${discipline.id}|${date}|${startTime}`)) row.duplicate = true;
      }
    }
    return rows;
  }

  // ── Журнал занятия ──

  async journal(user: CurrentUser, id: string): Promise<LessonJournalDto> {
    const lesson = await this.findLesson(user, id);
    const [criteria, students, entries] = await Promise.all([
      this.journalCriteria(id),
      this.journalStudents(lesson.groupId, id),
      this.prisma.lessonJournalEntry.findMany({
        where: { lessonId: id },
        include: { ratings: true },
      }),
    ]);
    const [card] = await this.describe(user, [lesson]);
    return {
      lesson: card!,
      criteria,
      students: students.map((student) => {
        const entry = entries.find((item) => item.studentId === student.id);
        return {
          student,
          absent: entry ? entry.absent : null,
          ratings: Object.fromEntries(
            (entry?.ratings ?? []).map((rating) => [rating.criterionId, rating.score]),
          ),
        };
      }),
    };
  }

  /** Действующие критерии и архивные, по которым на занятии уже есть оценки. */
  private async journalCriteria(lessonId: string): Promise<ObservationCriterionDto[]> {
    const rows = await this.prisma.observationCriterion.findMany({
      where: {
        OR: [{ archivedAt: null }, { ratings: { some: { entry: { lessonId } } } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, name: row.name, archived: row.archivedAt !== null }));
  }

  /** Наблюдаются все студенты группы, а также те, кто уже отмечен (переведён или в архиве). */
  private async journalStudents(groupId: string, lessonId: string): Promise<PersonRef[]> {
    const rows = await this.prisma.student.findMany({
      where: {
        OR: [
          { currentGroupId: groupId, archivedAt: null },
          { lessonEntries: { some: { lessonId } } },
        ],
      },
      select: personSelect,
    });
    return rows.map(toPerson).sort(byName);
  }

  /**
   * Сохранение журнала целиком: строки студентов, не переданные в запросе, удаляются.
   * Отсутствующему оценки не ставятся; пропущенная оценка — «нет данных», а не ноль (FR-074).
   */
  async saveJournal(
    user: CurrentUser,
    id: string,
    input: LessonJournalInput,
  ): Promise<LessonJournalDto> {
    const lesson = await this.findLesson(user, id);
    if (isoDate(lesson.date) > latestObservableDate()) {
      throw new ConflictException('Журнал заполняется в день занятия или позже');
    }
    const [criteria, students] = await Promise.all([
      this.journalCriteria(id),
      this.journalStudents(lesson.groupId, id),
    ]);
    const criterionIds = new Set(criteria.map((criterion) => criterion.id));
    const studentIds = new Set(students.map((student) => student.id));
    const fields: Record<string, string> = {};
    const seen = new Set<string>();
    input.entries.forEach((entry, index) => {
      const at = `entries.${index}`;
      if (!studentIds.has(entry.studentId) || seen.has(entry.studentId)) {
        fields[at] = 'Студент не относится к группе занятия или указан дважды';
      }
      seen.add(entry.studentId);
      if (entry.absent && entry.ratings.length > 0) {
        fields[at] = 'Отсутствовавшему студенту оценки не ставятся';
      }
      const rated = new Set<string>();
      for (const rating of entry.ratings) {
        if (!criterionIds.has(rating.criterionId) || rated.has(rating.criterionId)) {
          fields[at] = 'Неизвестный или повторяющийся критерий';
        }
        rated.add(rating.criterionId);
        const { score } = rating;
        if (
          score !== null &&
          (!Number.isInteger(score) || score < LESSON_SCORE_MIN || score > LESSON_SCORE_MAX)
        ) {
          fields[at] =
            `Оценка — целое число от ${LESSON_SCORE_MIN} до ${LESSON_SCORE_MAX} или «Не наблюдалось»`;
        }
      }
    });
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте заполнение журнала', fields });
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.lessonJournalEntry.count({ where: { lessonId: id } });
      await tx.lessonJournalEntry.deleteMany({
        where: { lessonId: id, studentId: { notIn: [...seen] } },
      });
      for (const entry of input.entries) {
        const saved = await tx.lessonJournalEntry.upsert({
          where: { lessonId_studentId: { lessonId: id, studentId: entry.studentId } },
          create: {
            lessonId: id,
            studentId: entry.studentId,
            absent: entry.absent,
            updatedById: user.id,
          },
          update: { absent: entry.absent, updatedById: user.id },
        });
        await tx.lessonRating.deleteMany({ where: { entryId: saved.id } });
        if (entry.ratings.length > 0) {
          await tx.lessonRating.createMany({
            data: entry.ratings.map((rating) => ({
              entryId: saved.id,
              criterionId: rating.criterionId,
              score: rating.score,
            })),
          });
        }
      }
      await this.audit.log(
        {
          action: 'lesson.journal_saved',
          entityType: 'lesson',
          entityId: id,
          before: { entries: before },
          after: {
            entries: input.entries.length,
            absent: input.entries.filter((entry) => entry.absent).length,
            ratings: input.entries.reduce((sum, entry) => sum + entry.ratings.length, 0),
          },
        },
        tx,
      );
    });
    return this.journal(user, id);
  }

  // ── История в профиле студента ──

  async studentJournal(user: CurrentUser, studentId: string): Promise<StudentLessonJournalDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    const entries = await this.prisma.lessonJournalEntry.findMany({
      where: { studentId },
      include: { ratings: true, lesson: { include: lessonInclude } },
      orderBy: [{ lesson: { date: 'desc' } }, { lesson: { startTime: 'desc' } }],
    });
    const usedIds = new Set(entries.flatMap((entry) => entry.ratings.map((r) => r.criterionId)));
    const criteria = (
      await this.prisma.observationCriterion.findMany({
        where: { OR: [{ archivedAt: null }, { id: { in: [...usedIds] } }] },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
    ).map((row) => ({ id: row.id, name: row.name, archived: row.archivedAt !== null }));
    const ratings = entries.flatMap((entry) => entry.ratings);
    return {
      criteria,
      records: entries.map((entry) => ({
        lessonId: entry.lessonId,
        date: isoDate(entry.lesson.date),
        startTime: entry.lesson.startTime,
        discipline: entry.lesson.discipline,
        teacher: toPerson(entry.lesson.teacher),
        absent: entry.absent,
        ratings: Object.fromEntries(
          entry.ratings.map((rating) => [rating.criterionId, rating.score]),
        ),
      })),
      summary: summarizeCriteria(
        criteria.map((criterion) => criterion.id),
        ratings,
      ),
      lessons: entries.length,
      absences: entries.filter((entry) => entry.absent).length,
    };
  }

  // ── Критерии наблюдения (раздел «Настройки») ──

  async criteria(): Promise<ObservationCriterionDto[]> {
    const rows = await this.prisma.observationCriterion.findMany({
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, name: row.name, archived: row.archivedAt !== null }));
  }

  /**
   * Список критериев целиком: порядок — порядок в журнале, новые — без id. Критерии не удаляются
   * (оценки сохраняются), а архивируются, поэтому в списке должны быть все существующие.
   */
  async updateCriteria(input: ObservationCriteriaInput): Promise<ObservationCriterionDto[]> {
    const parsed = observationCriteriaSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Проверьте список');
    }
    const items = parsed.data;
    const before = await this.criteria();
    const known = new Set(before.map((item) => item.id));
    const listed = new Set(items.map((item) => item.id).filter(Boolean));
    if (
      items.some((item) => item.id && !known.has(item.id)) ||
      before.some((item) => !listed.has(item.id))
    ) {
      throw new BadRequestException('Список критериев изменился. Обновите страницу');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Освобождаем названия, чтобы перестановка имён между критериями не нарушила уникальность.
      for (const item of before) {
        await tx.observationCriterion.update({
          where: { id: item.id },
          data: { name: `__${item.id}` },
        });
      }
      for (const [index, item] of items.entries()) {
        const data = {
          name: item.name,
          sortOrder: index + 1,
          archivedAt: item.archived ? now : null,
        };
        if (item.id) {
          const old = before.find((row) => row.id === item.id)!;
          await tx.observationCriterion.update({
            where: { id: item.id },
            data: { ...data, archivedAt: item.archived ? (old.archived ? undefined : now) : null },
          });
        } else {
          await tx.observationCriterion.create({ data });
        }
      }
      await this.audit.log(
        {
          action: 'settings.observation_criteria_updated',
          entityType: 'settings',
          before: before.map(({ name, archived }) => ({ name, archived })),
          after: items.map(({ name, archived }) => ({ name, archived })),
        },
        tx,
      );
    });
    return this.criteria();
  }
}
