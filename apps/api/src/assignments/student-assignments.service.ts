import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSIGNMENT_CANCELLABLE_STATUSES,
  ASSIGNMENT_INACTIVE_STATUSES,
  type AssignmentChoiceDto,
  type AssignmentStatus,
  type AssignTasksResultDto,
  type CabinetAssignmentDetailDto,
  type CabinetAssignmentsDto,
  type CurrentUser,
  type DifficultyLevel,
  formatFullName,
  type StudentAssignmentDto,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toFileDto } from '../library/files.service.js';
import {
  assignmentScopeWhere,
  cabinetAssignmentWhere,
  publishedAssignmentWhere,
} from '../library/library-scope.js';
import { loadPeople } from '../library/materials.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AssignTasksDto } from './student-assignments.dto.js';

const rowInclude = {
  assignment: {
    select: {
      id: true,
      title: true,
      topic: true,
      difficulty: true,
      discipline: { select: { id: true, name: true } },
      type: { select: { name: true } },
    },
  },
  stage: { select: { id: true, title: true, sortOrder: true } },
  choiceGroup: { select: { id: true, title: true, requiredCount: true, chosenAt: true } },
} satisfies Prisma.TrajectoryAssignmentInclude;

const detailInclude = {
  ...rowInclude,
  assignment: {
    select: {
      ...rowInclude.assignment.select,
      goal: true,
      instruction: true,
      submissionFormats: true,
      maxScore: true,
      criteria: { orderBy: { sortOrder: 'asc' } },
      attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
    },
  },
} satisfies Prisma.TrajectoryAssignmentInclude;

type Row = Prisma.TrajectoryAssignmentGetPayload<{ include: typeof rowInclude }>;
type DetailRow = Prisma.TrajectoryAssignmentGetPayload<{ include: typeof detailInclude }>;

const order = [
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { assignedAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.TrajectoryAssignmentOrderByWithRelationInput[];

const studentSelect = {
  id: true,
  userId: true,
  lastName: true,
  firstName: true,
  middleName: true,
  currentGroupId: true,
  archivedAt: true,
} satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const studentRef = (row: StudentRow) => ({ id: row.id, fullName: formatFullName(row) });

/** Группы, в которых пользователь ведёт дисциплину; null — без ограничений (администратор). */
function groupsForDiscipline(scope: AccessScope, disciplineId: string): Set<string> | null {
  if (scope.kind === 'all') return null;
  return new Set(
    scope.pairs.filter((pair) => pair.disciplineId === disciplineId).map((pair) => pair.groupId),
  );
}

/** Задания студента в области пользователя: дисциплины, которые он ведёт в группе студента. */
function disciplinesForGroup(scope: AccessScope, groupId: string | null): Prisma.StringFilter {
  if (scope.kind === 'all') return {};
  return {
    in: scope.pairs.filter((pair) => pair.groupId === groupId).map((pair) => pair.disciplineId),
  };
}

/**
 * Назначение заданий библиотеки студентам (FR-048) и выбор из равнозначных заданий (FR-054);
 * кабинет студента «Мои задания» (AT-06). Задания этапов ИОТ назначаются при утверждении маршрута
 * (этап 11); здесь — задания вне маршрута. Студент видит только свои задания (AT-12).
 */
@Injectable()
export class StudentAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Назначение одному студенту, нескольким или группе (FR-048). Всем — одни и те же задания
   * либо набор на выбор (FR-054). Студентов, которым задание уже назначено, система пропускает
   * и сообщает причину; повторная отправка формы дублей не создаёт (NFR-006).
   */
  async assign(user: CurrentUser, dto: AssignTasksDto, key: string): Promise<AssignTasksResultDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `student-assignments.assign:${key}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const ids = [...new Set(dto.assignmentIds)];
        const tasks = await this.prisma.assignment.findMany({
          where: { id: { in: ids }, archivedAt: null, ...assignmentScopeWhere(scope) },
          select: { id: true, title: true, disciplineId: true },
        });
        if (tasks.length !== ids.length) {
          throw new BadRequestException({
            message: 'Задание недоступно или в архиве',
            fields: { assignmentIds: 'Выберите задания из библиотеки своих дисциплин' },
          });
        }
        const disciplineId = tasks[0]!.disciplineId;
        if (tasks.some((task) => task.disciplineId !== disciplineId)) {
          throw new BadRequestException({
            message: 'Задания должны относиться к одной дисциплине',
            fields: { assignmentIds: 'Выберите задания одной дисциплины' },
          });
        }
        if (dto.choice && dto.choice.requiredCount >= ids.length) {
          throw new BadRequestException({
            message: 'Для выбора предложите больше заданий, чем нужно выбрать',
            fields: { 'choice.requiredCount': 'Выбрать нужно меньше заданий, чем предложено' },
          });
        }

        const groups = groupsForDiscipline(scope, disciplineId);
        const students = await this.recipients(scope, dto, groups);
        const skipped: AssignTasksResultDto['skipped'] = [];
        const eligible: StudentRow[] = [];
        for (const student of students) {
          if (student.archivedAt) {
            skipped.push({ student: studentRef(student), reason: 'Студент в архиве' });
          } else if (groups && !(student.currentGroupId && groups.has(student.currentGroupId))) {
            skipped.push({
              student: studentRef(student),
              reason: 'Вы не ведёте эту дисциплину в группе студента',
            });
          } else {
            eligible.push(student);
          }
        }
        eligible.sort((a, b) => a.id.localeCompare(b.id));
        const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

        const assigned = await this.prisma.$transaction(
          async (tx) => {
            const done: AssignTasksResultDto['assigned'] = [];
            for (const student of eligible) {
              // Параллельные назначения одному студенту выполняются по очереди: без дублей.
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assign:${student.id}`}, 0))`;
              const existing = await tx.trajectoryAssignment.findFirst({
                where: {
                  studentId: student.id,
                  assignmentId: { in: ids },
                  status: { notIn: [...ASSIGNMENT_INACTIVE_STATUSES] },
                },
                select: { id: true },
              });
              if (existing) {
                skipped.push({ student: studentRef(student), reason: 'Задание уже назначено' });
                continue;
              }
              const choiceGroupId = dto.choice
                ? (
                    await tx.assignmentChoiceGroup.create({
                      data: {
                        studentId: student.id,
                        title: dto.choice.title,
                        requiredCount: dto.choice.requiredCount,
                        createdById: user.id,
                      },
                    })
                  ).id
                : null;
              await tx.trajectoryAssignment.createMany({
                data: ids.map((assignmentId) => ({
                  assignmentId,
                  studentId: student.id,
                  choiceGroupId,
                  status: dto.choice ? ('OFFERED' as const) : ('ASSIGNED' as const),
                  dueAt,
                  assignedById: user.id,
                })),
              });
              if (student.userId) {
                await tx.notification.create({
                  data: {
                    userId: student.userId,
                    type: dto.choice ? 'assignment.choice_offered' : 'assignment.assigned',
                    title: dto.choice
                      ? 'Выберите задание'
                      : ids.length > 1
                        ? 'Новые задания'
                        : 'Новое задание',
                    body: dto.choice
                      ? dto.choice.title
                      : tasks
                          .map((task) => task.title)
                          .join(', ')
                          .slice(0, 500),
                    link: '/student/assignments',
                    entityType: 'assignment',
                    entityId: ids[0],
                  },
                });
              }
              done.push(studentRef(student));
            }
            if (done.length > 0) {
              await this.audit.log(
                {
                  action: 'assignment.assigned',
                  entityType: 'assignment',
                  entityId: ids.length === 1 ? ids[0] : null,
                  after: {
                    assignmentIds: ids,
                    studentIds: done.map((item) => item.id),
                    groupId: dto.groupId ?? null,
                    dueAt: dueAt?.toISOString() ?? null,
                    choice: dto.choice
                      ? { title: dto.choice.title, requiredCount: dto.choice.requiredCount }
                      : null,
                  },
                },
                tx,
              );
            }
            return done;
          },
          { timeout: 30_000 },
        );
        return { assigned, skipped };
      },
    );
    return response;
  }

  /** Вкладка «Задания» профиля студента: задания дисциплин, которые пользователь ведёт в его группе. */
  async listForStudent(user: CurrentUser, studentId: string): Promise<StudentAssignmentDto[]> {
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true, currentGroupId: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    const rows = await this.prisma.trajectoryAssignment.findMany({
      where: {
        ...publishedAssignmentWhere(),
        studentId,
        assignment: { disciplineId: disciplinesForGroup(scope, student.currentGroupId) },
      },
      include: rowInclude,
      orderBy: order,
    });
    return this.toDtos(rows);
  }

  /**
   * Отмена ещё не начатого задания, назначенного вне ИОТ, с причиной. Невыбранный набор
   * отменяется целиком. Задания маршрута меняются корректировкой ИОТ (этап 14).
   */
  async cancel(user: CurrentUser, id: string, reason: string): Promise<void> {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.trajectoryAssignment.findFirst({
      where: { id, status: { not: 'CANCELLED' }, student: this.scopes.studentsWhere(scope) },
      include: {
        student: { select: { currentGroupId: true, userId: true } },
        assignment: { select: { disciplineId: true, title: true } },
        choiceGroup: { select: { chosenAt: true } },
      },
    });
    const groups = row ? groupsForDiscipline(scope, row.assignment.disciplineId) : null;
    if (!row || (groups && !groups.has(row.student.currentGroupId ?? ''))) {
      throw new NotFoundException('Назначение не найдено');
    }
    if (row.trajectoryId) {
      throw new ConflictException('Задание этапа ИОТ меняется корректировкой маршрута');
    }
    if (!ASSIGNMENT_CANCELLABLE_STATUSES.includes(row.status as AssignmentStatus)) {
      throw new ConflictException('Студент уже работает над заданием: отменить его нельзя');
    }
    const wholeChoice = row.choiceGroupId && !row.choiceGroup?.chosenAt;
    await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.trajectoryAssignment.updateMany({
        where: {
          ...(wholeChoice ? { choiceGroupId: row.choiceGroupId } : { id }),
          status: { in: [...ASSIGNMENT_CANCELLABLE_STATUSES] },
        },
        data: { status: 'CANCELLED' },
      });
      if (cancelled.count === 0) {
        throw new ConflictException('Статус задания изменился. Обновите страницу');
      }
      if (row.student.userId) {
        await tx.notification.create({
          data: {
            userId: row.student.userId,
            type: 'assignment.cancelled',
            title: 'Задание отменено',
            body: row.assignment.title,
            link: '/student/assignments',
            entityType: 'assignment',
            entityId: row.assignmentId,
          },
        });
      }
      await this.audit.log(
        {
          action: 'assignment.cancelled',
          entityType: 'trajectory_assignment',
          entityId: id,
          before: { status: row.status },
          after: { status: 'CANCELLED', wholeChoice: !!wholeChoice },
          reason,
        },
        tx,
      );
    });
  }

  // ── Кабинет студента ──

  /** «Мои задания»: наборы на выбор и назначенные задания (AT-06). */
  async cabinetList(user: CurrentUser): Promise<CabinetAssignmentsDto> {
    await this.scopes.ownStudent(user);
    const rows = await this.prisma.trajectoryAssignment.findMany({
      where: cabinetAssignmentWhere(user.id),
      include: rowInclude,
      orderBy: order,
    });
    const dtos = await this.toDtos(rows);
    const choices = new Map<string, AssignmentChoiceDto>();
    const items: StudentAssignmentDto[] = [];
    for (const item of dtos) {
      if (item.status !== 'OFFERED' || !item.choiceGroup) {
        items.push(item);
        continue;
      }
      const group = choices.get(item.choiceGroup.id) ?? {
        id: item.choiceGroup.id,
        title: item.choiceGroup.title,
        requiredCount: item.choiceGroup.requiredCount,
        discipline: item.discipline,
        options: [],
      };
      group.options.push(item);
      choices.set(group.id, group);
    }
    return { choices: [...choices.values()], items };
  }

  /** Карточка своего задания (п. 4.7). Чужое, отменённое или из черновика ИОТ — 404 (AT-12). */
  async cabinetGet(user: CurrentUser, id: string): Promise<CabinetAssignmentDetailDto> {
    await this.scopes.ownStudent(user);
    const row: DetailRow | null = await this.prisma.trajectoryAssignment.findFirst({
      where: { id, ...cabinetAssignmentWhere(user.id) },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('Задание не найдено');
    const [base] = await this.toDtos([row]);
    const { assignment } = row;
    return {
      ...base!,
      goal: assignment.goal,
      instruction: assignment.instruction,
      submissionFormats: assignment.submissionFormats,
      maxScore: assignment.maxScore === null ? null : Number(assignment.maxScore),
      criteria: assignment.criteria.map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        description: criterion.description,
        maxScore: Number(criterion.maxScore),
      })),
      attachments: assignment.attachments.map((attachment) => ({
        id: attachment.id,
        title: attachment.title,
        file: attachment.file ? toFileDto(attachment.file) : null,
        url: attachment.url,
      })),
    };
  }

  /**
   * Выбор из равнозначных заданий (FR-054): выбранные назначаются, остальные отмечаются
   * «Не выбрано». Выбор делается один раз; изменить его может преподаватель.
   */
  async choose(
    user: CurrentUser,
    groupId: string,
    optionIds: string[],
  ): Promise<CabinetAssignmentsDto> {
    const student = await this.scopes.ownStudent(user);
    const group = await this.prisma.assignmentChoiceGroup.findFirst({
      where: { id: groupId, studentId: student.id },
      include: { options: { where: { status: 'OFFERED' }, select: { id: true } } },
    });
    if (!group) throw new NotFoundException('Набор заданий не найден');
    if (group.chosenAt) throw new ConflictException('Выбор уже сделан');
    if (group.options.length === 0) throw new ConflictException('Набор заданий отменён');
    const chosen = [...new Set(optionIds)];
    const offered = new Set(group.options.map((option) => option.id));
    if (chosen.length !== group.requiredCount || chosen.some((id) => !offered.has(id))) {
      throw new BadRequestException({
        message: `Выберите заданий: ${group.requiredCount}`,
        fields: { optionIds: `Нужно выбрать заданий: ${group.requiredCount}` },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const marked = await tx.assignmentChoiceGroup.updateMany({
        where: { id: groupId, chosenAt: null },
        data: { chosenAt: now },
      });
      if (marked.count === 0) throw new ConflictException('Выбор уже сделан');
      await tx.trajectoryAssignment.updateMany({
        where: { id: { in: chosen }, status: 'OFFERED' },
        data: { status: 'ASSIGNED', assignedAt: now },
      });
      await tx.trajectoryAssignment.updateMany({
        where: { choiceGroupId: groupId, status: 'OFFERED' },
        data: { status: 'DECLINED' },
      });
      if (group.createdById) {
        await tx.notification.create({
          data: {
            userId: group.createdById,
            type: 'assignment.chosen',
            title: 'Студент выбрал задание',
            body: group.title,
            link: `/students/${student.id}?tab=assignments`,
            entityType: 'assignment_choice_group',
            entityId: groupId,
          },
        });
      }
      await this.audit.log(
        {
          action: 'assignment.chosen',
          entityType: 'assignment_choice_group',
          entityId: groupId,
          after: { chosen },
        },
        tx,
      );
    });
    return this.cabinetList(user);
  }

  // ── Вспомогательное ──

  /** Получатели: студенты из списка (в области пользователя) или все студенты группы. */
  private async recipients(
    scope: AccessScope,
    dto: AssignTasksDto,
    groups: Set<string> | null,
  ): Promise<StudentRow[]> {
    const studentIds = [...new Set(dto.studentIds ?? [])];
    if (!dto.groupId === (studentIds.length === 0)) {
      throw new BadRequestException({
        message: 'Укажите либо студентов, либо группу',
        fields: { studentIds: 'Выберите студентов или группу' },
      });
    }
    if (dto.groupId) {
      if (groups && !groups.has(dto.groupId)) {
        throw new BadRequestException({
          message: 'Вы не ведёте эту дисциплину в выбранной группе',
          fields: { groupId: 'Выберите свою группу' },
        });
      }
      const students = await this.prisma.student.findMany({
        where: { currentGroupId: dto.groupId, archivedAt: null },
        select: studentSelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      if (students.length === 0) {
        throw new BadRequestException({
          message: 'В группе нет студентов',
          fields: { groupId: 'В группе нет студентов' },
        });
      }
      return students;
    }
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, ...this.scopes.studentsWhere(scope) },
      select: studentSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    if (students.length !== studentIds.length) {
      throw new BadRequestException({
        message: 'Студент не найден',
        fields: { studentIds: 'Выберите студентов своих групп' },
      });
    }
    return students;
  }

  private async toDtos(rows: Row[]): Promise<StudentAssignmentDto[]> {
    const people = await loadPeople(
      this.prisma,
      rows.map((row) => row.assignedById),
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status as AssignmentStatus,
      dueAt: row.dueAt?.toISOString() ?? null,
      assignedAt: row.assignedAt.toISOString(),
      assignment: {
        id: row.assignment.id,
        title: row.assignment.title,
        typeName: row.assignment.type.name,
        difficulty: row.assignment.difficulty as DifficultyLevel,
        topic: row.assignment.topic,
      },
      discipline: row.assignment.discipline,
      trajectory: row.trajectoryId ? { id: row.trajectoryId, stage: row.stage } : null,
      choiceGroup: row.choiceGroup
        ? { ...row.choiceGroup, chosenAt: row.choiceGroup.chosenAt?.toISOString() ?? null }
        : null,
      assignedBy: people.get(row.assignedById) ?? null,
    }));
  }
}
