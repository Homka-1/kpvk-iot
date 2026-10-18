import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AssignmentStatus,
  type CabinetStageMaterialDto,
  type CabinetTrajectoryDto,
  canTransition,
  type CheckpointStatus,
  type CurrentUser,
  type DifficultyLevel,
  formatFullName,
  type MaterialKind,
  type MotivationLevel,
  type PersonRef,
  ROUTE_PROPOSAL_STATUSES,
  type RouteProposalDto,
  type StageStatus,
  STUDENT_VISIBLE_TRAJECTORY_STATUSES,
  suggestTemplate,
  TRAJECTORY_CURRENT_STATUSES,
  TRAJECTORY_EDITABLE_STATUSES,
  TRAJECTORY_STATUS_LABELS,
  type TrajectoryContent,
  type TrajectoryDto,
  type TrajectoryIssue,
  trajectoryIssues,
  type TrajectoryOptionsDto,
  type TrajectoryPageDto,
  type TrajectorySnapshot,
  type TrajectoryStageDto,
  TrajectoryStatus,
  type TrajectoryStudentRef,
  type TrajectorySummaryDto,
  type TrajectoryTemplateDto,
} from '@iot/shared';
import {
  type AccessScope,
  AccessScopeService,
  activeAssignmentWhere,
} from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toFileDto } from '../library/files.service.js';
import { assignmentScopeWhere, materialScopeWhere } from '../library/library-scope.js';
import { loadPeople } from '../library/materials.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MotivationProfilesService } from '../profiles/motivation-profiles.service.js';
import type {
  CreateTrajectoryDto,
  TrajectoryReasonDto,
  RevisionTokenDto,
  RouteProposalInputDto,
  TrajectoryContentDto,
  TrajectoryListQueryDto,
} from './trajectories.dto.js';

type Db = Prisma.TransactionClient | PrismaService;

const studentSelect = {
  id: true,
  lastName: true,
  firstName: true,
  middleName: true,
  participantCode: true,
  archivedAt: true,
  userId: true,
  currentGroupId: true,
  currentGroup: { select: { id: true, name: true, course: true, specialty: true } },
} satisfies Prisma.StudentSelect;

const detailInclude = {
  student: { select: studentSelect },
  discipline: { select: { id: true, name: true } },
  template: { select: { id: true, title: true } },
  motivationProfile: { select: { id: true, level: true, decidedAt: true } },
  stages: {
    where: { archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      checkpoints: {
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      },
      materials: {
        orderBy: { sortOrder: 'asc' },
        include: {
          material: {
            select: {
              id: true,
              title: true,
              kind: true,
              archivedAt: true,
              description: true,
              url: true,
              body: true,
              file: true,
            },
          },
        },
      },
      assignments: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
        include: {
          assignment: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              archivedAt: true,
              type: { select: { name: true } },
            },
          },
        },
      },
    },
  },
  versions: { orderBy: { versionNumber: 'desc' } },
  feedback: {
    where: { kind: 'ROUTE_CHANGE_PROPOSAL' },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    include: { stage: { select: { id: true, title: true } } },
  },
} satisfies Prisma.TrajectoryInclude;

type DetailRow = Prisma.TrajectoryGetPayload<{ include: typeof detailInclude }>;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);

function toStudentRef(row: StudentRow): TrajectoryStudentRef {
  return {
    id: row.id,
    fullName: formatFullName(row),
    participantCode: row.participantCode,
    group: row.currentGroup,
  };
}

function toProfileRef(
  row: { id: string; level: string | null; decidedAt: Date | null } | null,
): TrajectoryDto['motivationProfile'] {
  return row?.level && row.decidedAt
    ? { id: row.id, level: row.level as MotivationLevel, decidedAt: row.decidedAt.toISOString() }
    : null;
}

/** Содержимое маршрута из БД — для проверки перед утверждением тем же правилом, что в интерфейсе. */
function toContent(dto: TrajectoryDto): TrajectoryContent {
  return {
    goals: dto.goals,
    plannedResults: dto.plannedResults,
    supportMethods: dto.supportMethods,
    startDate: dto.startDate,
    plannedEndDate: dto.plannedEndDate,
    stages: dto.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      goal: stage.goal,
      startDate: stage.startDate,
      endDate: stage.endDate,
      checkpoints: stage.checkpoints,
      materialIds: stage.materials.map((material) => material.id),
      assignments: stage.assignments.map((item) => ({
        id: item.id,
        assignmentId: item.assignment.id,
        dueAt: item.dueAt,
      })),
    })),
  };
}

/** Снимок версии: паспорт и этапы без списка версий и предложений студента. */
function toSnapshot(dto: TrajectoryDto): TrajectorySnapshot {
  const snapshot: Partial<TrajectoryDto> = { ...dto };
  delete snapshot.versions;
  delete snapshot.proposals;
  return snapshot as TrajectorySnapshot;
}

type StageRow = DetailRow['stages'][number];
type StageMaterialRow = StageRow['materials'][number]['material'];

/** Этап маршрута без материалов: у преподавателя и в кабинете студента материалы разные. */
function toStageBase(stage: StageRow): Omit<TrajectoryStageDto, 'materials'> {
  return {
    id: stage.id,
    sortOrder: stage.sortOrder,
    title: stage.title,
    goal: stage.goal,
    description: stage.description,
    plannedResults: stage.plannedResults,
    startDate: isoDate(stage.startDate),
    endDate: isoDate(stage.endDate),
    status: stage.status as StageStatus,
    checkpoints: stage.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      description: checkpoint.description,
      dueDate: isoDate(checkpoint.dueDate),
      status: checkpoint.status as CheckpointStatus,
    })),
    assignments: stage.assignments.map((item) => ({
      id: item.id,
      assignment: {
        id: item.assignment.id,
        title: item.assignment.title,
        typeName: item.assignment.type.name,
        difficulty: item.assignment.difficulty as DifficultyLevel,
        archived: item.assignment.archivedAt !== null,
      },
      dueAt: item.dueAt?.toISOString() ?? null,
      status: item.status as AssignmentStatus,
    })),
  };
}

function toStageMaterial(material: StageMaterialRow): TrajectoryStageDto['materials'][number] {
  return {
    id: material.id,
    title: material.title,
    kind: material.kind as MaterialKind,
    archived: material.archivedAt !== null,
  };
}

/** Материал этапа для студента — с содержимым, чтобы открыть его из карты маршрута. */
function toCabinetMaterial(material: StageMaterialRow): CabinetStageMaterialDto {
  return {
    ...toStageMaterial(material),
    description: material.description,
    url: material.url,
    body: material.body,
    file: material.file ? toFileDto(material.file) : null,
  };
}

function toProposals(row: DetailRow, people: Map<string, PersonRef>): RouteProposalDto[] {
  return row.feedback.map((item) => ({
    id: item.id,
    stage: item.stage,
    body: item.body,
    author: people.get(item.authorId) ?? null,
    createdAt: item.createdAt.toISOString(),
  }));
}

function issuesException(message: string, issues: TrajectoryIssue[]): BadRequestException {
  return new BadRequestException({
    message,
    fields: Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
  });
}

/** Отбор ИОТ в области пользователя (FR-002): дисциплина, которую он ведёт в группе студента. */
export function trajectoryScopeWhere(scope: AccessScope): Prisma.TrajectoryWhereInput {
  if (scope.kind === 'all') return {};
  // Пустой OR в Prisma не ограничивает выборку: без закреплений — ни одной ИОТ.
  if (scope.pairs.length === 0) return { id: { in: [] } };
  return {
    OR: scope.pairs.map((pair) => ({
      disciplineId: pair.disciplineId,
      student: { currentGroupId: pair.groupId },
    })),
  };
}

/**
 * Индивидуальные образовательные траектории (п. 4.6; FR-034–FR-039, FR-045; UC-03).
 * Преподаватель создаёт черновик из шаблона или с нуля, наполняет этапы материалами и заданиями
 * библиотеки, задаёт сроки и контрольные точки и утверждает маршрут. Утверждение — только
 * с правом «Утверждение ИОТ» (FR-039); оно фиксирует неизменяемую версию маршрута. Студенту
 * контрольной группы исследования ИОТ не создаётся и не утверждается (огр. 4).
 */
@Injectable()
export class TrajectoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
    private readonly profiles: MotivationProfilesService,
  ) {}

  async list(user: CurrentUser, query: TrajectoryListQueryDto): Promise<TrajectoryPageDto> {
    const scope = await this.scopes.forUser(user);
    const conditions: Prisma.TrajectoryWhereInput[] = [
      trajectoryScopeWhere(scope),
      { status: query.status ?? { not: TrajectoryStatus.ARCHIVED } },
    ];
    if (query.studentId) conditions.push({ studentId: query.studentId });
    if (query.disciplineId) conditions.push({ disciplineId: query.disciplineId });
    if (query.groupId) conditions.push({ student: { currentGroupId: query.groupId } });
    if (query.q) {
      conditions.push({
        student: {
          OR: ['lastName', 'firstName', 'participantCode'].map((field) => ({
            [field]: { contains: query.q!, mode: 'insensitive' as const },
          })),
        },
      });
    }
    const where: Prisma.TrajectoryWhereInput = { AND: conditions };
    const [rows, total] = await Promise.all([
      this.prisma.trajectory.findMany({
        where,
        include: {
          student: { select: studentSelect },
          discipline: { select: { id: true, name: true } },
          _count: { select: { stages: { where: { archivedAt: null } } } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trajectory.count({ where }),
    ]);
    const people = await loadPeople(
      this.prisma,
      rows.map((row) => row.teacherId),
    );
    return {
      items: rows.map((row): TrajectorySummaryDto => ({
        id: row.id,
        status: row.status as TrajectoryStatus,
        version: row.currentVersion,
        student: toStudentRef(row.student),
        discipline: row.discipline,
        teacher: people.get(row.teacherId) ?? null,
        startDate: isoDate(row.startDate),
        plannedEndDate: isoDate(row.plannedEndDate),
        stageCount: row._count.stages,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(user: CurrentUser, id: string): Promise<TrajectoryDto> {
    await this.findInScope(user, id);
    return this.load(this.prisma, id);
  }

  /** Данные для начала конструктора (UC-03): дисциплины, профиль, шаблоны, предложение (FR-035). */
  async options(user: CurrentUser, studentId: string): Promise<TrajectoryOptionsDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.studentInScope(scope, studentId);
    const [disciplines, current, profile, templates, controlGroup] = await Promise.all([
      this.disciplinesFor(scope, user.id, student),
      this.prisma.trajectory.findMany({
        where: { studentId, status: { in: [...TRAJECTORY_CURRENT_STATUSES] } },
        select: { id: true, disciplineId: true },
      }),
      this.profiles.lastDecided(studentId),
      this.templates(),
      this.controlGroupReason(this.prisma, studentId),
    ]);
    const profileRef = toProfileRef(profile);
    return {
      student: toStudentRef(student),
      profile: profileRef,
      disciplines: disciplines.map((discipline) => ({
        ...discipline,
        currentTrajectoryId:
          current.find((item) => item.disciplineId === discipline.id)?.id ?? null,
      })),
      templates,
      suggestedTemplateId: suggestTemplate(templates, profileRef?.level ?? null)?.id ?? null,
      blockedReason: student.archivedAt ? 'Студент в архиве: ИОТ не создаётся' : controlGroup,
    };
  }

  /** Черновик ИОТ из шаблона или с нуля (FR-034); по дисциплине — не более одной действующей (FR-045). */
  async create(user: CurrentUser, dto: CreateTrajectoryDto, key: string): Promise<TrajectoryDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `trajectory.create:${key}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const student = await this.studentInScope(scope, dto.studentId);
        this.assertStudentActive(student);
        await this.assertNotControlGroup(this.prisma, student.id);
        const disciplines = await this.disciplinesFor(scope, user.id, student);
        if (!disciplines.some((item) => item.id === dto.disciplineId)) {
          throw new BadRequestException({
            message: 'Выберите дисциплину, которую вы ведёте в группе студента',
            fields: { disciplineId: 'Дисциплина недоступна' },
          });
        }
        const template = dto.templateId
          ? await this.prisma.trajectoryTemplate.findFirst({
              where: { id: dto.templateId, archivedAt: null },
              include: { stages: { orderBy: { sortOrder: 'asc' } } },
            })
          : null;
        if (dto.templateId && !template) {
          throw new BadRequestException({
            message: 'Шаблон недоступен',
            fields: { templateId: 'Шаблон не найден или в архиве' },
          });
        }
        const profile = await this.profiles.lastDecided(student.id);
        const strategies = await this.profiles.getStrategies();
        const supportLevel = (profile?.level ??
          template?.motivationLevel) as MotivationLevel | null;

        const id = await this.prisma.$transaction(async (tx) => {
          // Параллельное создание по той же паре «студент — дисциплина» выполняется по очереди.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trajectory:${student.id}:${dto.disciplineId}`}, 0))`;
          const existing = await tx.trajectory.findFirst({
            where: {
              studentId: student.id,
              disciplineId: dto.disciplineId,
              status: { in: [...TRAJECTORY_CURRENT_STATUSES] },
            },
            select: { id: true },
          });
          if (existing) {
            throw new ConflictException({
              message: 'У студента уже есть действующая ИОТ по этой дисциплине',
              fields: { disciplineId: 'Откройте существующую ИОТ' },
            });
          }
          const row = await tx.trajectory.create({
            data: {
              studentId: student.id,
              disciplineId: dto.disciplineId,
              teacherId: user.id,
              templateId: template?.id ?? null,
              motivationProfileId: profile?.id ?? null,
              supportMethods: supportLevel ? strategies[supportLevel].join('\n') : null,
              createdById: user.id,
              stages: {
                create: (template?.stages ?? []).map((stage) => ({
                  sortOrder: stage.sortOrder,
                  title: stage.title,
                  goal: stage.goal,
                  description: stage.description,
                  plannedResults: stage.plannedResults,
                })),
              },
            },
          });
          await this.audit.log(
            {
              action: 'trajectory.created',
              entityType: 'trajectory',
              entityId: row.id,
              after: {
                studentId: student.id,
                disciplineId: dto.disciplineId,
                templateId: template?.id ?? null,
              },
            },
            tx,
          );
          return row.id;
        });
        return this.load(this.prisma, id);
      },
    );
    return response;
  }

  /** Сохранение черновика (FR-036, FR-037): паспорт, этапы, контрольные точки, материалы, задания. */
  async update(user: CurrentUser, id: string, dto: TrajectoryContentDto): Promise<TrajectoryDto> {
    const scope = await this.scopes.forUser(user);
    const trajectory = await this.findInScope(user, id, scope);
    if (!TRAJECTORY_EDITABLE_STATUSES.includes(trajectory.status as TrajectoryStatus)) {
      throw new ConflictException(
        `ИОТ в статусе «${TRAJECTORY_STATUS_LABELS[trajectory.status as TrajectoryStatus]}» не редактируется`,
      );
    }
    this.assertStudentActive(trajectory.student);
    this.assertRevision(trajectory, dto.updatedAt);
    const issues = trajectoryIssues(dto, 'draft');
    if (issues.length > 0) throw issuesException('Проверьте сроки и названия в маршруте', issues);
    const current = await this.load(this.prisma, id);
    await this.assertReferences(scope, current, dto);

    await this.prisma.$transaction(async (tx) => {
      await this.touch(tx, id, dto.updatedAt, [TrajectoryStatus.DRAFT], {
        goals: dto.goals ?? null,
        plannedResults: dto.plannedResults ?? null,
        supportMethods: dto.supportMethods ?? null,
        startDate: toDate(dto.startDate),
        plannedEndDate: toDate(dto.plannedEndDate),
      });
      const kept = new Set(dto.stages.map((stage) => stage.id).filter(Boolean));
      const removed = current.stages
        .filter((stage) => !kept.has(stage.id))
        .map((stage) => stage.id);
      // Черновик ещё не видел студент, поэтому удалённые этапы удаляются полностью.
      if (removed.length > 0) {
        await tx.trajectoryAssignment.deleteMany({ where: { stageId: { in: removed } } });
        await tx.trajectoryCheckpoint.deleteMany({ where: { stageId: { in: removed } } });
        await tx.trajectoryStage.deleteMany({ where: { id: { in: removed } } });
      }

      for (const [index, stage] of dto.stages.entries()) {
        const data = {
          sortOrder: index,
          title: stage.title,
          goal: stage.goal ?? null,
          description: stage.description ?? null,
          plannedResults: stage.plannedResults ?? null,
          startDate: toDate(stage.startDate),
          endDate: toDate(stage.endDate),
        };
        const stageId = stage.id
          ? (await tx.trajectoryStage.update({ where: { id: stage.id }, data })).id
          : (await tx.trajectoryStage.create({ data: { ...data, trajectoryId: id } })).id;
        const before = current.stages.find((item) => item.id === stage.id);

        const keptCheckpoints = stage.checkpoints.map((item) => item.id).filter(Boolean);
        await tx.trajectoryCheckpoint.deleteMany({
          where: { stageId, id: { notIn: keptCheckpoints as string[] } },
        });
        for (const checkpoint of stage.checkpoints) {
          const fields = {
            title: checkpoint.title,
            description: checkpoint.description ?? null,
            dueDate: toDate(checkpoint.dueDate),
          };
          if (checkpoint.id) {
            await tx.trajectoryCheckpoint.update({ where: { id: checkpoint.id }, data: fields });
          } else {
            await tx.trajectoryCheckpoint.create({ data: { ...fields, stageId } });
          }
        }

        await tx.stageMaterial.deleteMany({ where: { stageId } });
        await tx.stageMaterial.createMany({
          data: stage.materialIds.map((materialId, sortOrder) => ({
            stageId,
            materialId,
            sortOrder,
          })),
        });

        const keptAssignments = stage.assignments.map((item) => item.id).filter(Boolean);
        const dropped = (before?.assignments ?? [])
          .map((item) => item.id)
          .filter((itemId) => !keptAssignments.includes(itemId));
        if (dropped.length > 0) {
          await tx.trajectoryAssignment.deleteMany({ where: { id: { in: dropped } } });
        }
        for (const item of stage.assignments) {
          const fields = { assignmentId: item.assignmentId, dueAt: toDate(item.dueAt) };
          if (item.id) {
            await tx.trajectoryAssignment.update({ where: { id: item.id }, data: fields });
          } else {
            await tx.trajectoryAssignment.create({
              data: {
                ...fields,
                studentId: trajectory.studentId,
                trajectoryId: id,
                stageId,
                assignedById: user.id,
              },
            });
          }
        }
      }

      await this.audit.log(
        {
          action: 'trajectory.updated',
          entityType: 'trajectory',
          entityId: id,
          after: {
            stages: dto.stages.length,
            materials: dto.stages.reduce((sum, stage) => sum + stage.materialIds.length, 0),
            assignments: dto.stages.reduce((sum, stage) => sum + stage.assignments.length, 0),
          },
        },
        tx,
      );
    });
    return this.load(this.prisma, id);
  }

  /** Отправка на дополнительное согласование: «Черновик» → «На утверждении» (п. 4.6). */
  async submit(user: CurrentUser, id: string, dto: RevisionTokenDto): Promise<TrajectoryDto> {
    const trajectory = await this.findInScope(user, id);
    this.assertTransition(trajectory.status, TrajectoryStatus.PENDING_APPROVAL);
    this.assertStudentActive(trajectory.student);
    await this.assertComplete(id);
    await this.prisma.$transaction(async (tx) => {
      await this.touch(tx, id, dto.updatedAt, [TrajectoryStatus.DRAFT], {
        status: TrajectoryStatus.PENDING_APPROVAL,
      });
      await this.audit.log(
        { action: 'trajectory.submitted', entityType: 'trajectory', entityId: id },
        tx,
      );
    });
    return this.load(this.prisma, id);
  }

  /** Возврат на доработку с причиной: «На утверждении» → «Черновик». */
  async returnToDraft(
    user: CurrentUser,
    id: string,
    dto: TrajectoryReasonDto,
  ): Promise<TrajectoryDto> {
    const trajectory = await this.findInScope(user, id);
    this.assertTransition(trajectory.status, TrajectoryStatus.DRAFT);
    await this.prisma.$transaction(async (tx) => {
      await this.touch(tx, id, dto.updatedAt, [TrajectoryStatus.PENDING_APPROVAL], {
        status: TrajectoryStatus.DRAFT,
      });
      await this.audit.log(
        {
          action: 'trajectory.returned',
          entityType: 'trajectory',
          entityId: id,
          reason: dto.reason,
        },
        tx,
      );
    });
    return this.load(this.prisma, id);
  }

  /**
   * Утверждение и назначение (FR-039, UC-03): маршрут становится «Активна», фиксируется версия
   * со снимком паспорта, этапов, контрольных точек и заданий, профиль на момент назначения,
   * студент получает уведомление. Утверждается та редакция, которую видел преподаватель.
   */
  async approve(user: CurrentUser, id: string, dto: RevisionTokenDto): Promise<TrajectoryDto> {
    const trajectory = await this.findInScope(user, id);
    this.assertTransition(trajectory.status, TrajectoryStatus.ACTIVE);
    if (trajectory.status === TrajectoryStatus.NEEDS_CORRECTION) {
      // Утверждение скорректированной версии — этап 14 (UC-05).
      throw new ConflictException('Скорректированная версия утверждается при корректировке ИОТ');
    }
    this.assertStudentActive(trajectory.student);
    await this.assertComplete(id);
    const from = trajectory.status as TrajectoryStatus;

    await this.prisma.$transaction(async (tx) => {
      await this.assertNotControlGroup(tx, trajectory.studentId);
      const profile = await this.profiles.lastDecided(trajectory.studentId, tx);
      const firstStage = await tx.trajectoryStage.findFirst({
        where: { trajectoryId: id, archivedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      const now = new Date();
      const version = trajectory.currentVersion + 1;
      await this.touch(tx, id, dto.updatedAt, [from], {
        status: TrajectoryStatus.ACTIVE,
        approvedById: user.id,
        approvedAt: now,
        currentVersion: version,
        motivationProfileId: profile?.id ?? null,
        currentStageId: firstStage?.id ?? null,
      });
      if (firstStage) {
        await tx.trajectoryStage.update({
          where: { id: firstStage.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
      // Задания этапов назначаются студенту в момент утверждения.
      await tx.trajectoryAssignment.updateMany({
        where: { trajectoryId: id, status: 'ASSIGNED' },
        data: { assignedAt: now, assignedById: user.id },
      });
      const snapshot = toSnapshot(await this.load(tx, id));
      await tx.trajectoryVersion.create({
        data: {
          trajectoryId: id,
          versionNumber: version,
          status: TrajectoryStatus.ACTIVE,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });
      if (trajectory.student.userId) {
        await tx.notification.create({
          data: {
            userId: trajectory.student.userId,
            type: 'trajectory.approved',
            title: 'Утверждена индивидуальная траектория',
            body: snapshot.discipline.name,
            link: '/student/trajectory',
            entityType: 'trajectory',
            entityId: id,
          },
        });
      }
      await this.audit.log(
        {
          action: 'trajectory.approved',
          entityType: 'trajectory',
          entityId: id,
          before: { status: from },
          after: { status: TrajectoryStatus.ACTIVE, version },
        },
        tx,
      );
    });
    return this.load(this.prisma, id);
  }

  /** Архивирование черновика с причиной; задания черновика отменяются. */
  async archive(user: CurrentUser, id: string, dto: TrajectoryReasonDto): Promise<TrajectoryDto> {
    const trajectory = await this.findInScope(user, id);
    this.assertTransition(trajectory.status, TrajectoryStatus.ARCHIVED);
    const from = trajectory.status as TrajectoryStatus;
    await this.prisma.$transaction(async (tx) => {
      await this.touch(tx, id, dto.updatedAt, [from], {
        status: TrajectoryStatus.ARCHIVED,
        archivedAt: new Date(),
      });
      await tx.trajectoryAssignment.updateMany({
        where: { trajectoryId: id, status: { in: ['ASSIGNED', 'OFFERED'] } },
        data: { status: 'CANCELLED' },
      });
      await this.audit.log(
        {
          action: 'trajectory.archived',
          entityType: 'trajectory',
          entityId: id,
          before: { status: from },
          reason: dto.reason,
        },
        tx,
      );
    });
    return this.load(this.prisma, id);
  }

  // ── Кабинет студента (FR-040, FR-041) ──

  /**
   * Утверждённые маршруты студента (FR-040): «Активна», «Требует корректировки», «Завершена».
   * Черновики и маршруты на согласовании студент не видит. Служебные поля не передаются.
   */
  async cabinetList(user: CurrentUser): Promise<CabinetTrajectoryDto[]> {
    const student = await this.scopes.ownStudent(user);
    const rows = await this.prisma.trajectory.findMany({
      where: { studentId: student.id, status: { in: [...STUDENT_VISIBLE_TRAJECTORY_STATUSES] } },
      include: {
        ...detailInclude,
        feedback: {
          ...detailInclude.feedback,
          where: { kind: 'ROUTE_CHANGE_PROPOSAL', authorId: user.id },
        },
      },
      orderBy: [{ discipline: { name: 'asc' } }, { id: 'asc' }],
    });
    const people = await loadPeople(this.prisma, [user.id, ...rows.map((row) => row.teacherId)]);
    return rows.map((row) => ({
      id: row.id,
      status: row.status as TrajectoryStatus,
      version: row.currentVersion,
      discipline: row.discipline,
      teacher: people.get(row.teacherId) ?? null,
      goals: row.goals,
      plannedResults: row.plannedResults,
      supportMethods: row.supportMethods,
      startDate: isoDate(row.startDate),
      plannedEndDate: isoDate(row.plannedEndDate),
      currentStageId: row.currentStageId,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      stages: row.stages.map((stage) => ({
        ...toStageBase(stage),
        materials: stage.materials.map(({ material }) => toCabinetMaterial(material)),
      })),
      proposals: toProposals(row, people),
    }));
  }

  /**
   * Предложение студента изменить маршрут (п. 2.3): записывается для преподавателя, сам маршрут
   * не меняется — обязательные этапы студент не изменяет, решение за преподавателем.
   */
  async propose(
    user: CurrentUser,
    id: string,
    dto: RouteProposalInputDto,
    key: string,
  ): Promise<RouteProposalDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `trajectory.propose:${key}`,
      { id, ...dto },
      async () => {
        const student = await this.scopes.ownStudent(user);
        const trajectory = await this.prisma.trajectory.findFirst({
          where: {
            id,
            studentId: student.id,
            status: { in: [...STUDENT_VISIBLE_TRAJECTORY_STATUSES] },
          },
          include: { stages: { where: { archivedAt: null }, select: { id: true, title: true } } },
        });
        if (!trajectory) throw new NotFoundException('ИОТ не найдена');
        if (!ROUTE_PROPOSAL_STATUSES.includes(trajectory.status as TrajectoryStatus)) {
          throw new ConflictException('Маршрут завершён: предложения по нему не принимаются');
        }
        const stage = dto.stageId
          ? trajectory.stages.find((item) => item.id === dto.stageId)
          : null;
        if (dto.stageId && !stage) {
          throw new BadRequestException({
            message: 'Этап не относится к этой ИОТ',
            fields: { stageId: 'Выберите этап из списка' },
          });
        }
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.feedback.create({
            data: {
              studentId: student.id,
              authorId: user.id,
              kind: 'ROUTE_CHANGE_PROPOSAL',
              visibility: 'STUDENT_VISIBLE',
              trajectoryId: id,
              stageId: stage?.id ?? null,
              body: dto.body,
            },
          });
          await tx.notification.create({
            data: {
              userId: trajectory.teacherId,
              type: 'trajectory.change_proposed',
              title: 'Студент предложил изменить маршрут',
              body: stage ? `Этап «${stage.title}»` : null,
              link: `/trajectories/${id}`,
              entityType: 'trajectory',
              entityId: id,
            },
          });
          await this.audit.log(
            {
              action: 'trajectory.change_proposed',
              entityType: 'trajectory',
              entityId: id,
              after: { feedbackId: created.id, stageId: stage?.id ?? null },
            },
            tx,
          );
          return created;
        });
        const people = await loadPeople(this.prisma, [user.id]);
        return {
          id: row.id,
          stage: stage ?? null,
          body: row.body,
          author: people.get(user.id) ?? null,
          createdAt: row.createdAt.toISOString(),
        };
      },
    );
    return response;
  }

  // ── Вспомогательное ──

  private async templates(): Promise<TrajectoryTemplateDto[]> {
    const rows = await this.prisma.trajectoryTemplate.findMany({
      where: { archivedAt: null },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ isStandard: 'desc' }, { title: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      motivationLevel: row.motivationLevel as MotivationLevel | null,
      isStandard: row.isStandard,
      stages: row.stages.map((stage) => ({
        title: stage.title,
        goal: stage.goal,
        description: stage.description,
        plannedResults: stage.plannedResults,
        durationDays: stage.durationDays,
      })),
    }));
  }

  /** Дисциплины, которые пользователь ведёт в текущей группе студента (FR-002). */
  private async disciplinesFor(
    scope: AccessScope,
    userId: string,
    student: StudentRow,
  ): Promise<{ id: string; name: string }[]> {
    if (!student.currentGroupId) return [];
    const rows = await this.prisma.teacherAssignment.findMany({
      where: {
        groupId: student.currentGroupId,
        teacherId: scope.kind === 'assigned' ? userId : undefined,
        discipline: { archivedAt: null },
        ...activeAssignmentWhere(),
      },
      select: { discipline: { select: { id: true, name: true } } },
      orderBy: { discipline: { name: 'asc' } },
    });
    return [...new Map(rows.map((row) => [row.discipline.id, row.discipline])).values()];
  }

  private async studentInScope(scope: AccessScope, studentId: string): Promise<StudentRow> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: studentSelect,
    });
    if (!student) throw new NotFoundException('Студент не найден');
    return student;
  }

  private async findInScope(user: CurrentUser, id: string, scope?: AccessScope) {
    const row = await this.prisma.trajectory.findFirst({
      where: { id, ...trajectoryScopeWhere(scope ?? (await this.scopes.forUser(user))) },
      include: { student: { select: studentSelect } },
    });
    if (!row) throw new NotFoundException('ИОТ не найдена');
    return row;
  }

  private assertStudentActive(student: { archivedAt: Date | null }): void {
    if (student.archivedAt) throw new ConflictException('Студент в архиве: ИОТ не изменяется');
  }

  private assertTransition(from: string, to: TrajectoryStatus): void {
    if (!canTransition(from as TrajectoryStatus, to)) {
      throw new ConflictException(
        `Переход «${TRAJECTORY_STATUS_LABELS[from as TrajectoryStatus]}» → «${TRAJECTORY_STATUS_LABELS[to]}» недопустим`,
      );
    }
  }

  /** Полнота маршрута перед согласованием и утверждением (FR-038). */
  private async assertComplete(id: string): Promise<void> {
    const issues = trajectoryIssues(toContent(await this.load(this.prisma, id)), 'approve');
    if (issues.length > 0) {
      throw issuesException('Маршрут заполнен не полностью — проверьте предпросмотр', issues);
    }
  }

  /**
   * Изменение записи ИОТ только из ожидаемой редакции и статуса: если маршрут уже сохранил
   * или утвердил другой пользователь, изменение отклоняется, а не затирает чужое.
   */
  private async touch(
    tx: Prisma.TransactionClient,
    id: string,
    updatedAt: string,
    statuses: TrajectoryStatus[],
    data: Prisma.TrajectoryUncheckedUpdateManyInput,
  ): Promise<void> {
    const moved = await tx.trajectory.updateMany({
      where: { id, updatedAt: new Date(updatedAt), status: { in: statuses } },
      data,
    });
    if (moved.count === 0) throw this.staleException();
  }

  /** Ранняя проверка редакции: устаревшая форма получает 409, а не ошибки по полям. */
  private assertRevision(trajectory: { updatedAt: Date }, updatedAt: string): void {
    if (trajectory.updatedAt.getTime() !== new Date(updatedAt).getTime()) {
      throw this.staleException();
    }
  }

  private staleException(): ConflictException {
    return new ConflictException(
      'ИОТ изменена другим пользователем или её статус изменился. Обновите страницу',
    );
  }

  private async controlGroupReason(db: Db, studentId: string): Promise<string | null> {
    const participant = await db.researchParticipant.findFirst({
      where: {
        studentId,
        group: 'CONTROL',
        excludedAt: null,
        project: { status: { in: ['DRAFT', 'ACTIVE'] } },
      },
      select: { project: { select: { title: true } } },
    });
    return participant
      ? `Студент входит в контрольную группу исследования «${participant.project.title}»: ИОТ ему не назначается`
      : null;
  }

  /** Огр. 4 ТЗ: контрольная группа исследования не получает ИОТ. Проверка на сервере. */
  private async assertNotControlGroup(db: Db, studentId: string): Promise<void> {
    const reason = await this.controlGroupReason(db, studentId);
    if (reason) throw new ForbiddenException(reason);
  }

  /**
   * Ссылки содержимого: этапы, точки и назначения — этого маршрута; материалы и задания —
   * из библиотеки дисциплины маршрута в области пользователя. Архивные записи остаются, только
   * если уже были в этапе; новые из архива не добавляются.
   */
  private async assertReferences(
    scope: AccessScope,
    current: TrajectoryDto,
    dto: TrajectoryContentDto,
  ): Promise<void> {
    const fields: Record<string, string> = {};
    const stages = new Map(current.stages.map((stage) => [stage.id, stage]));
    const materialIds = new Set(dto.stages.flatMap((stage) => stage.materialIds));
    const assignmentIds = new Set(
      dto.stages.flatMap((stage) => stage.assignments.map((item) => item.assignmentId)),
    );
    const [materials, assignments] = await Promise.all([
      this.prisma.material.findMany({
        where: {
          id: { in: [...materialIds] },
          AND: [
            materialScopeWhere(scope),
            { OR: [{ disciplineId: null }, { disciplineId: current.discipline.id }] },
          ],
        },
        select: { id: true, archivedAt: true },
      }),
      this.prisma.assignment.findMany({
        where: {
          id: { in: [...assignmentIds] },
          disciplineId: current.discipline.id,
          ...assignmentScopeWhere(scope),
        },
        select: { id: true, archivedAt: true },
      }),
    ]);
    const materialArchived = new Map(materials.map((row) => [row.id, row.archivedAt !== null]));
    const assignmentArchived = new Map(assignments.map((row) => [row.id, row.archivedAt !== null]));

    const seenStages = new Set<string>();
    dto.stages.forEach((stage, index) => {
      const at = `stages.${index}`;
      const before = stage.id ? stages.get(stage.id) : undefined;
      if (stage.id && (!before || seenStages.has(stage.id))) {
        fields[`${at}.id`] = 'Этап не относится к этой ИОТ. Обновите страницу';
        return;
      }
      if (stage.id) seenStages.add(stage.id);
      stage.checkpoints.forEach((checkpoint, item) => {
        if (checkpoint.id && !before?.checkpoints.some((row) => row.id === checkpoint.id)) {
          fields[`${at}.checkpoints.${item}.id`] = 'Контрольная точка не относится к этапу';
        }
      });
      stage.materialIds.forEach((materialId, item) => {
        const archived = materialArchived.get(materialId);
        const linked = before?.materials.some((row) => row.id === materialId);
        if (archived === undefined || (archived && !linked)) {
          fields[`${at}.materialIds.${item}`] = 'Материал недоступен или в архиве';
        }
      });
      const used = new Set<string>();
      stage.assignments.forEach((item, position) => {
        const path = `${at}.assignments.${position}`;
        const archived = assignmentArchived.get(item.assignmentId);
        const linked = before?.assignments.some(
          (row) => row.assignment.id === item.assignmentId && (!item.id || row.id === item.id),
        );
        if (item.id && !before?.assignments.some((row) => row.id === item.id)) {
          fields[`${path}.id`] = 'Назначение не относится к этапу';
        } else if (archived === undefined || (archived && !linked)) {
          fields[`${path}.assignmentId`] = 'Задание недоступно, в архиве или другой дисциплины';
        } else if (used.has(item.assignmentId)) {
          fields[`${path}.assignmentId`] = 'Задание уже добавлено в этот этап';
        }
        used.add(item.assignmentId);
      });
    });
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте материалы и задания этапов', fields });
    }
  }

  private async load(db: Db, id: string): Promise<TrajectoryDto> {
    const row: DetailRow = await db.trajectory.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
    const people = await loadPeople(this.prisma, [
      row.teacherId,
      row.approvedById,
      ...row.versions.map((version) => version.createdById),
      ...row.feedback.map((item) => item.authorId),
    ]);
    return {
      id: row.id,
      status: row.status as TrajectoryStatus,
      version: row.currentVersion,
      student: toStudentRef(row.student),
      discipline: row.discipline,
      teacher: people.get(row.teacherId) ?? null,
      template: row.template,
      motivationProfile: toProfileRef(row.motivationProfile),
      goals: row.goals,
      plannedResults: row.plannedResults,
      supportMethods: row.supportMethods,
      startDate: isoDate(row.startDate),
      plannedEndDate: isoDate(row.plannedEndDate),
      currentStageId: row.currentStageId,
      approvedBy: row.approvedById ? (people.get(row.approvedById) ?? null) : null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      stages: row.stages.map((stage) => ({
        ...toStageBase(stage),
        materials: stage.materials.map(({ material }) => toStageMaterial(material)),
      })),
      versions: row.versions.map((version) => ({
        versionNumber: version.versionNumber,
        status: version.status as TrajectoryStatus,
        reason: version.reason,
        createdBy: version.createdById ? (people.get(version.createdById) ?? null) : null,
        createdAt: version.createdAt.toISOString(),
      })),
      proposals: toProposals(row, people),
    };
  }
}
