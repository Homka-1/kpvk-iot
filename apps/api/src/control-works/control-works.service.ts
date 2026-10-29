import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CONTROL_IMPORT_COLUMNS,
  CONTROL_IMPORT_MAX_ROWS,
  type ControlImportField,
  type ControlImportPreviewDto,
  type ControlImportRowDto,
  type ControlKind,
  type ControlMark,
  controlMean,
  type ControlOptionsDto,
  controlProgress,
  type ControlSheetDto,
  type ControlWorkDetailDto,
  type ControlWorkDto,
  type ControlWorkListDto,
  type CurrentUser,
  formatFullName,
  isControlScore,
  type NamedRef,
  normalizePersonName,
  parseControlResult,
  type PersonRef,
  personNameKeys,
  type StudentControlResultsDto,
  summarizeControlResults,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { parseTableFile } from '../common/table-import.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type PersonRow = { id: string; lastName: string; firstName: string; middleName: string | null };
const personSelect = { id: true, lastName: true, firstName: true, middleName: true } as const;
const toPerson = (row: PersonRow): PersonRef => ({ id: row.id, fullName: formatFullName(row) });
const byName = (a: PersonRef, b: PersonRef) => a.fullName.localeCompare(b.fullName, 'ru');
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
/** Самая поздняя «сегодняшняя» дата среди часовых поясов: результаты вносятся после проведения. */
const latestHeldDate = () => isoDate(new Date(Date.now() + 14 * 60 * 60 * 1000));
const validDate = (value: string) =>
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  isoDate(new Date(`${value}T00:00:00Z`)) === value;

const workInclude = {
  discipline: { select: { id: true, name: true } },
  author: { select: personSelect },
  groups: {
    include: { group: { select: { id: true, name: true } } },
    orderBy: { group: { name: 'asc' } },
  },
} as const satisfies Prisma.ControlWorkInclude;

type WorkRow = Prisma.ControlWorkGetPayload<{ include: typeof workInclude }>;

export interface ControlWorkInput {
  disciplineId: string;
  topic: string;
  kind: ControlKind;
  criteria?: string | null;
  groups: { groupId: string; date: string }[];
}

export interface ControlWorkListQuery {
  groupId?: string | null;
  disciplineId?: string | null;
  kind?: ControlKind | null;
}

export interface ControlResultInput {
  studentId: string;
  score: number | null;
  mark: ControlMark | null;
}

/**
 * Академические достижения (этап 28): контрольные работы — входной, текущий и итоговый контроль.
 * Одна работа (тема, вид, рубрика) проводится в нескольких группах: так результаты ЭГ и КГ
 * сравнимы. Результат — балл 0–100 или отметка; отметка и пропуск в средние не входят (FR-074).
 * Просмотр — сотрудникам с доступом к группе; создание и ввод результатов — администратору и
 * преподавателю, закреплённому за группой и дисциплиной (FR-002). Изменения пишутся в аудит.
 */
@Injectable()
export class ControlWorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ── Область доступа ──

  private pairAllowed(scope: AccessScope, groupId: string, disciplineId: string): boolean {
    return (
      scope.kind === 'all' ||
      scope.pairs.some((pair) => pair.groupId === groupId && pair.disciplineId === disciplineId)
    );
  }

  private canEdit(scope: AccessScope, work: WorkRow): boolean {
    return work.groups.every((item) => this.pairAllowed(scope, item.groupId, work.disciplineId));
  }

  /** Работа видна, если хотя бы одна её группа доступна пользователю. */
  private worksWhere(scope: AccessScope): Prisma.ControlWorkWhereInput {
    return scope.kind === 'all' ? {} : { groups: { some: { groupId: { in: scope.groupIds } } } };
  }

  private async findWork(scope: AccessScope, id: string): Promise<WorkRow> {
    const work = await this.prisma.controlWork.findFirst({
      where: { id, ...this.worksWhere(scope) },
      include: workInclude,
    });
    if (!work) throw new NotFoundException('Контрольная работа не найдена');
    return work;
  }

  private async editableWork(scope: AccessScope, id: string): Promise<WorkRow> {
    const work = await this.findWork(scope, id);
    if (!this.canEdit(scope, work)) {
      throw new NotFoundException('Контрольная работа не найдена');
    }
    return work;
  }

  async options(user: CurrentUser): Promise<ControlOptionsDto> {
    const scope = await this.scopes.forUser(user);
    const [groups, disciplines] = await Promise.all([
      this.prisma.group.findMany({
        where: scope.kind === 'all' ? { archivedAt: null } : { id: { in: scope.groupIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.discipline.findMany({
        where:
          scope.kind === 'all'
            ? { archivedAt: null }
            : { id: { in: scope.disciplineIds }, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { groups, disciplines, pairs: scope.kind === 'all' ? null : scope.pairs };
  }

  // ── Список и карточка работы ──

  async list(user: CurrentUser, query: ControlWorkListQuery): Promise<ControlWorkListDto> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.controlWork.findMany({
      where: {
        AND: [
          this.worksWhere(scope),
          query.groupId ? { groups: { some: { groupId: query.groupId } } } : {},
        ],
        ...(query.disciplineId ? { disciplineId: query.disciplineId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      },
      include: workInclude,
    });
    return { items: await this.describe(scope, rows) };
  }

  private async describe(scope: AccessScope, rows: WorkRow[]): Promise<ControlWorkDto[]> {
    const scores = await this.prisma.controlResult.findMany({
      where: { workId: { in: rows.map((row) => row.id) }, score: { not: null } },
      select: { workId: true, groupId: true, score: true },
    });
    const dated = (row: WorkRow) =>
      row.groups.reduce((latest, item) => (item.date > latest ? item.date : latest), new Date(0));
    return rows
      .sort((a, b) => dated(b).getTime() - dated(a).getTime() || b.id.localeCompare(a.id))
      .map((row) => ({
        id: row.id,
        discipline: row.discipline,
        topic: row.topic,
        kind: row.kind,
        criteria: row.criteria,
        groups: row.groups
          .filter((item) => scope.kind === 'all' || scope.groupIds.includes(item.groupId))
          .map((item) => {
            const own = scores
              .filter((score) => score.workId === row.id && score.groupId === item.groupId)
              .map((score) => score.score!.toNumber());
            return {
              group: item.group,
              date: isoDate(item.date),
              scored: own.length,
              mean: controlMean(own),
            };
          }),
        author: row.author ? toPerson(row.author) : null,
        createdAt: row.createdAt.toISOString(),
        canEdit: this.canEdit(scope, row),
      }));
  }

  /** Карточка работы со сравнением групп: статистики баллов, отметки и «нет данных». */
  async detail(user: CurrentUser, id: string): Promise<ControlWorkDetailDto> {
    const scope = await this.scopes.forUser(user);
    const work = await this.findWork(scope, id);
    const [card] = await this.describe(scope, [work]);
    const groups = await Promise.all(
      card!.groups.map(async (item) => {
        const rows = await this.sheetRows(work.id, item.group.id);
        return { group: item.group, date: item.date, ...summarizeControlResults(rows) };
      }),
    );
    return { work: card!, groups };
  }

  // ── Создание, изменение, удаление ──

  async create(
    user: CurrentUser,
    input: ControlWorkInput,
    idempotencyKey: string,
  ): Promise<ControlWorkDetailDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `control_work.create:${idempotencyKey}`,
      input,
      async () => {
        const scope = await this.scopes.forUser(user);
        await this.validateInput(scope, input);
        const work = await this.prisma.$transaction(async (tx) => {
          const created = await tx.controlWork.create({
            data: {
              disciplineId: input.disciplineId,
              topic: input.topic,
              kind: input.kind,
              criteria: input.criteria ?? null,
              createdById: user.id,
              groups: {
                create: input.groups.map((item) => ({
                  groupId: item.groupId,
                  date: new Date(`${item.date}T00:00:00Z`),
                })),
              },
            },
          });
          await this.audit.log(
            {
              action: 'control_work.created',
              entityType: 'control_work',
              entityId: created.id,
              after: { ...input, criteria: input.criteria ?? null },
            },
            tx,
          );
          return created;
        });
        return this.detail(user, work.id);
      },
    );
    return response;
  }

  async update(
    user: CurrentUser,
    id: string,
    input: ControlWorkInput,
  ): Promise<ControlWorkDetailDto> {
    const scope = await this.scopes.forUser(user);
    const work = await this.editableWork(scope, id);
    await this.validateInput(scope, input);
    const resultGroups = await this.prisma.controlResult.groupBy({
      by: ['groupId'],
      where: { workId: id },
    });
    if (resultGroups.length > 0 && input.disciplineId !== work.disciplineId) {
      throw new ConflictException(
        'По работе уже внесены результаты: дисциплину изменить нельзя. Создайте новую работу',
      );
    }
    const kept = new Set(input.groups.map((item) => item.groupId));
    const removed = resultGroups.filter((item) => !kept.has(item.groupId));
    if (removed.length > 0) {
      throw new ConflictException(
        'В группе, которую вы убираете, уже есть результаты. Сначала очистите её ведомость',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.controlWork.update({
        where: { id },
        data: {
          disciplineId: input.disciplineId,
          topic: input.topic,
          kind: input.kind,
          criteria: input.criteria ?? null,
        },
      });
      await tx.controlWorkGroup.deleteMany({
        where: { workId: id, groupId: { notIn: [...kept] } },
      });
      for (const item of input.groups) {
        const date = new Date(`${item.date}T00:00:00Z`);
        await tx.controlWorkGroup.upsert({
          where: { workId_groupId: { workId: id, groupId: item.groupId } },
          create: { workId: id, groupId: item.groupId, date },
          update: { date },
        });
      }
      await this.audit.log(
        {
          action: 'control_work.updated',
          entityType: 'control_work',
          entityId: id,
          before: {
            disciplineId: work.disciplineId,
            topic: work.topic,
            kind: work.kind,
            criteria: work.criteria,
            groups: work.groups.map((item) => ({
              groupId: item.groupId,
              date: isoDate(item.date),
            })),
          },
          after: { ...input, criteria: input.criteria ?? null },
        },
        tx,
      );
    });
    return this.detail(user, id);
  }

  /** Удаление работы вместе с результатами; число удалённых результатов пишется в аудит. */
  async remove(user: CurrentUser, id: string): Promise<void> {
    const scope = await this.scopes.forUser(user);
    const work = await this.editableWork(scope, id);
    await this.prisma.$transaction(async (tx) => {
      const results = await tx.controlResult.count({ where: { workId: id } });
      await tx.controlWork.delete({ where: { id } });
      await this.audit.log(
        {
          action: 'control_work.deleted',
          entityType: 'control_work',
          entityId: id,
          before: { topic: work.topic, kind: work.kind, results },
        },
        tx,
      );
    });
  }

  private async validateInput(scope: AccessScope, input: ControlWorkInput): Promise<void> {
    const fields: Record<string, string> = {};
    const [discipline, groups] = await Promise.all([
      this.prisma.discipline.findUnique({ where: { id: input.disciplineId } }),
      this.prisma.group.findMany({
        where: { id: { in: input.groups.map((item) => item.groupId) } },
        select: { id: true },
      }),
    ]);
    if (!discipline || discipline.archivedAt) fields.disciplineId = 'Дисциплина не найдена';
    const known = new Set(groups.map((group) => group.id));
    const seen = new Set<string>();
    input.groups.forEach((item, index) => {
      const at = `groups.${index}`;
      if (!known.has(item.groupId) || seen.has(item.groupId)) {
        fields[at] = 'Группа не найдена или указана дважды';
      } else if (discipline && !this.pairAllowed(scope, item.groupId, discipline.id)) {
        fields[at] = 'Вы не ведёте эту дисциплину в этой группе';
      } else if (!validDate(item.date)) {
        fields[at] = 'Укажите дату проведения';
      }
      seen.add(item.groupId);
    });
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте данные контрольной работы', fields });
    }
  }

  // ── Ведомость группы ──

  private async sheetGroup(work: WorkRow, groupId: string) {
    const item = work.groups.find((row) => row.groupId === groupId);
    if (!item) throw new NotFoundException('Группа не участвует в этой работе');
    return item;
  }

  /** Студенты ведомости: текущий состав группы и все, у кого уже есть результат по работе. */
  private async sheetStudents(workId: string, groupId: string): Promise<PersonRow[]> {
    return this.prisma.student.findMany({
      where: {
        OR: [
          { currentGroupId: groupId, archivedAt: null },
          { controlResults: { some: { workId, groupId } } },
        ],
      },
      select: personSelect,
    });
  }

  private async sheetRows(workId: string, groupId: string) {
    const [students, results] = await Promise.all([
      this.sheetStudents(workId, groupId),
      this.prisma.controlResult.findMany({ where: { workId, groupId } }),
    ]);
    return students
      .map((student) => {
        const result = results.find((row) => row.studentId === student.id);
        return {
          student: toPerson(student),
          score: result?.score?.toNumber() ?? null,
          mark: result?.mark ?? null,
        };
      })
      .sort((a, b) => byName(a.student, b.student));
  }

  async sheet(user: CurrentUser, id: string, groupId: string): Promise<ControlSheetDto> {
    const scope = await this.scopes.forUser(user);
    const work = await this.findWork(scope, id);
    if (scope.kind !== 'all' && !scope.groupIds.includes(groupId)) {
      throw new NotFoundException('Группа не участвует в этой работе');
    }
    const item = await this.sheetGroup(work, groupId);
    const [card] = await this.describe(scope, [work]);
    return {
      work: card!,
      group: item.group,
      date: isoDate(item.date),
      rows: await this.sheetRows(id, groupId),
      canEdit: this.pairAllowed(scope, groupId, work.disciplineId),
    };
  }

  /**
   * Сохранение ведомости целиком: у студента — балл, отметка или ничего («нет данных»).
   * Строки без балла и отметки и не переданные студенты удаляются — нулём они не становятся.
   */
  async saveSheet(
    user: CurrentUser,
    id: string,
    groupId: string,
    entries: ControlResultInput[],
  ): Promise<ControlSheetDto> {
    const scope = await this.scopes.forUser(user);
    const work = await this.findWork(scope, id);
    const item = await this.sheetGroup(work, groupId);
    if (!this.pairAllowed(scope, groupId, work.disciplineId)) {
      throw new NotFoundException('Группа не участвует в этой работе');
    }
    if (isoDate(item.date) > latestHeldDate()) {
      throw new ConflictException('Результаты вносятся в день проведения работы или позже');
    }
    const students = new Set((await this.sheetStudents(id, groupId)).map((row) => row.id));
    const fields: Record<string, string> = {};
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      const at = `entries.${index}`;
      if (!students.has(entry.studentId) || seen.has(entry.studentId)) {
        fields[at] = 'Студент не относится к группе или указан дважды';
      } else if (entry.score !== null && entry.mark !== null) {
        fields[at] = 'Укажите либо балл, либо отметку';
      } else if (entry.score !== null && !isControlScore(entry.score)) {
        fields[at] = 'Балл — число от 0 до 100 (не более одного знака после запятой)';
      }
      seen.add(entry.studentId);
    });
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте заполнение ведомости', fields });
    }
    const filled = entries.filter((entry) => entry.score !== null || entry.mark !== null);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.controlResult.count({ where: { workId: id, groupId } });
      await tx.controlResult.deleteMany({
        where: {
          workId: id,
          groupId,
          studentId: { notIn: filled.map((entry) => entry.studentId) },
        },
      });
      for (const entry of filled) {
        const data = { score: entry.score, mark: entry.mark, updatedById: user.id };
        await tx.controlResult.upsert({
          where: { workId_studentId: { workId: id, studentId: entry.studentId } },
          create: { workId: id, studentId: entry.studentId, groupId, ...data },
          update: { groupId, ...data },
        });
      }
      await this.audit.log(
        {
          action: 'control_results.saved',
          entityType: 'control_work',
          entityId: id,
          before: { groupId, results: before },
          after: {
            groupId,
            scored: filled.filter((entry) => entry.score !== null).length,
            marked: filled.filter((entry) => entry.mark !== null).length,
          },
        },
        tx,
      );
    });
    return this.sheet(user, id, groupId);
  }

  /**
   * Разбор файла `ФИО | Результат` для ведомости группы: строки сопоставляются со студентами,
   * ничего не сохраняется — преподаватель проверяет заполненную ведомость и сохраняет её сам.
   */
  async previewImport(
    user: CurrentUser,
    id: string,
    groupId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<ControlImportPreviewDto> {
    const scope = await this.scopes.forUser(user);
    const work = await this.findWork(scope, id);
    await this.sheetGroup(work, groupId);
    if (!this.pairAllowed(scope, groupId, work.disciplineId)) {
      throw new NotFoundException('Группа не участвует в этой работе');
    }
    if (!file) throw new BadRequestException('Выберите файл CSV или XLSX');
    const parsed = await parseTableFile<ControlImportField>(file.buffer, file.originalname, {
      columns: CONTROL_IMPORT_COLUMNS,
      maxRows: CONTROL_IMPORT_MAX_ROWS,
      emptyMessage: 'В файле нет строк с результатами',
    });
    const students = await this.sheetStudents(id, groupId);
    const byKey = new Map<string, PersonRow[]>();
    for (const student of students) {
      // Только фамилия не подходит: в группе часто есть однофамильцы.
      for (const key of personNameKeys(student)) {
        if (key === normalizePersonName(student.lastName)) continue;
        const list = byKey.get(key) ?? [];
        if (!list.includes(student)) list.push(student);
        byKey.set(key, list);
      }
    }
    const matched = new Map<string, number>();
    const rows: ControlImportRowDto[] = parsed.rows.map(({ line, values }) => {
      const errors: string[] = [];
      const candidates = byKey.get(normalizePersonName(values.studentName)) ?? [];
      const result = parseControlResult(values.result);
      if (!values.studentName) errors.push('Не указано ФИО студента');
      else if (candidates.length === 0) errors.push('Студент не найден в группе');
      else if (candidates.length > 1) {
        errors.push('Студентов с таким ФИО несколько: укажите фамилию, имя и отчество полностью');
      } else if (matched.has(candidates[0]!.id)) {
        errors.push(`Студент уже указан в строке ${matched.get(candidates[0]!.id)}`);
      }
      if (result === 'invalid') {
        errors.push(
          'Результат — балл от 0 до 100 или отметка: отсутствовал, не выполнил, освобождён',
        );
      }
      if (errors.length === 0) matched.set(candidates[0]!.id, line);
      return {
        line,
        studentName: values.studentName,
        result: values.result,
        resolved:
          errors.length === 0 && result !== 'invalid'
            ? { student: toPerson(candidates[0]!), ...result }
            : null,
        errors,
      };
    });
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    return {
      rows,
      validCount: rows.length - invalidCount,
      invalidCount,
      fileErrors: parsed.fileErrors,
    };
  }

  // ── Результаты студента ──

  async studentResults(user: CurrentUser, studentId: string): Promise<StudentControlResultsDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    return this.resultsOf(studentId);
  }

  async cabinetResults(user: CurrentUser): Promise<StudentControlResultsDto> {
    const { id } = await this.scopes.ownStudent(user);
    return this.resultsOf(id);
  }

  private async resultsOf(studentId: string): Promise<StudentControlResultsDto> {
    const rows = await this.prisma.controlResult.findMany({
      where: { studentId },
      include: {
        work: {
          select: {
            id: true,
            topic: true,
            kind: true,
            discipline: { select: { id: true, name: true } },
            groups: { select: { groupId: true, date: true } },
          },
        },
      },
    });
    const results = rows
      .map((row) => ({
        work: {
          id: row.work.id,
          topic: row.work.topic,
          kind: row.work.kind,
          discipline: row.work.discipline,
        },
        date: isoDate(row.work.groups.find((item) => item.groupId === row.groupId)!.date),
        score: row.score?.toNumber() ?? null,
        mark: row.mark,
      }))
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.work.topic.localeCompare(b.work.topic, 'ru'),
      );
    const disciplines = new Map<string, NamedRef>(
      results.map((result) => [result.work.discipline.id, result.work.discipline]),
    );
    const progress = controlProgress(
      results.map((result) => ({
        disciplineId: result.work.discipline.id,
        kind: result.work.kind,
        score: result.score,
      })),
    )
      .map(({ disciplineId, ...rest }) => ({ discipline: disciplines.get(disciplineId)!, ...rest }))
      .sort((a, b) => a.discipline.name.localeCompare(b.discipline.name, 'ru'));
    return { results, progress };
  }
}
