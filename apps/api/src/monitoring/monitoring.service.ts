import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AssignmentStatus,
  assignmentProgress,
  averageOf,
  averagePercent,
  type CheckpointStatus,
  type CurrentUser,
  formatFullName,
  HELP_REQUEST_KINDS,
  isAssignmentOverdue,
  isCheckpointMissed,
  localDate,
  type MeasurementType,
  MONITORING_DEFAULT_WEEKS,
  MONITORING_ROWS_LIMIT,
  type MonitoringDetailDto,
  type MonitoringDto,
  type MonitoringDynamicsPointDto,
  type MonitoringPeriodDto,
  type MonitoringRowDto,
  type MonitoringWarningDto,
  type StageStatus,
  type SupportStatus,
  type SupportStatusDto,
  TRAJECTORY_CORRECTABLE_STATUSES,
  TrajectoryStatus,
  weekBuckets,
  weekStart,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { loadPeople } from '../library/materials.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { trajectoryScopeWhere } from '../trajectories/trajectories.service.js';
import type {
  MonitoringPeriodQueryDto,
  MonitoringQueryDto,
  SupportStatusInputDto,
} from './monitoring.dto.js';

/** Маршруты, которые выполняет студент: черновики и архив в мониторинг не входят. */
const MONITORED_STATUSES: TrajectoryStatus[] = [
  TrajectoryStatus.ACTIVE,
  TrajectoryStatus.NEEDS_CORRECTION,
  TrajectoryStatus.COMPLETED,
];

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const include = {
  student: {
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      participantCode: true,
      supportStatus: true,
      userId: true,
      currentGroup: { select: { id: true, name: true, course: true, specialty: true } },
    },
  },
  discipline: { select: { id: true, name: true } },
  stages: {
    where: { archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      endDate: true,
      checkpoints: {
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  },
  assignments: {
    where: { status: { not: 'CANCELLED' } },
    select: {
      id: true,
      status: true,
      dueAt: true,
      completedAt: true,
      stageId: true,
      assignment: { select: { title: true } },
      submissions: { select: { submittedAt: true } },
    },
  },
  versions: { orderBy: { versionNumber: 'desc' } },
} satisfies Prisma.TrajectoryInclude;

type Row = Prisma.TrajectoryGetPayload<{ include: typeof include }>;

interface Period {
  dto: MonitoringPeriodDto;
  /** Границы для отбора событий: [from, to) — конец периода включительно. */
  from: Date | null;
  to: Date | null;
}

interface Collected {
  rows: Row[];
  results: {
    trajectoryId: string;
    score: number;
    maxScore: number;
    recordedAt: Date;
    title: string | null;
  }[];
  helpRequests: Map<string, number>;
  diagnostics: Map<string, { completedAt: Date; measurementType: MeasurementType }[]>;
}

/**
 * Мониторинг выполнения ИОТ (п. 4.8; FR-056–FR-062). Показатели считаются по данным маршрутов
 * области пользователя (FR-002): прогресс по заданиям, этапы, контрольные точки, оценки,
 * сдача ответов, обращения за помощью, корректировки и — отдельно — диагностика (FR-062).
 * Входы в систему не учитываются и не трактуются как снижение мотивации.
 */
@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
    private readonly audit: AuditService,
  ) {}

  async overview(user: CurrentUser, query: MonitoringQueryDto): Promise<MonitoringDto> {
    const period = toPeriod(query);
    const conditions: Prisma.TrajectoryWhereInput[] = [
      trajectoryScopeWhere(await this.scopes.forUser(user)),
      { status: { in: MONITORED_STATUSES }, student: { archivedAt: null } },
    ];
    if (query.groupId) conditions.push({ student: { currentGroupId: query.groupId } });
    if (query.disciplineId) conditions.push({ disciplineId: query.disciplineId });
    if (query.studentId) conditions.push({ studentId: query.studentId });
    if (query.q) {
      conditions.push({
        student: {
          OR: ['lastName', 'firstName', 'participantCode'].map((field) => ({
            [field]: { contains: query.q!, mode: 'insensitive' as const },
          })),
        },
      });
    }
    // В периоде — маршруты, сроки которых с ним пересекаются.
    if (period.dto.from) {
      conditions.push({
        OR: [{ plannedEndDate: null }, { plannedEndDate: { gte: new Date(period.dto.from) } }],
      });
    }
    if (period.dto.to) {
      conditions.push({
        OR: [{ startDate: null }, { startDate: { lte: new Date(period.dto.to) } }],
      });
    }

    const collected = await this.collect({ AND: conditions }, period, MONITORING_ROWS_LIMIT + 1);
    const truncated = collected.rows.length > MONITORING_ROWS_LIMIT;
    if (truncated) collected.rows.length = MONITORING_ROWS_LIMIT;
    const now = new Date();
    const rows = collected.rows.map((row) => toRowDto(row, collected, period, now));
    const warnings = collected.rows.flatMap((row) => warningsOf(row, now));
    const students = new Map(rows.map((row) => [row.student.id, row.student.supportStatus]));
    return {
      period: period.dto,
      summary: {
        trajectories: rows.length,
        averageProgress: averageOf(rows.map((row) => row.progress.percent)),
        overdueAssignments: warnings.filter((item) => item.kind === 'OVERDUE_ASSIGNMENT').length,
        missedCheckpoints: warnings.filter((item) => item.kind === 'MISSED_CHECKPOINT').length,
        needsSupport: [...students.values()].filter((status) => status !== 'STANDARD').length,
        needsCorrection: rows.filter((row) => row.status === 'NEEDS_CORRECTION').length,
      },
      rows,
      warnings,
      dynamics: dynamicsOf(collected.rows, collected.results, period, now),
      truncated,
    };
  }

  /** Мониторинг одной ИОТ (UC-05: затруднения студента → корректировка): этапы, оценки, динамика. */
  async detail(
    user: CurrentUser,
    id: string,
    query: MonitoringPeriodQueryDto,
  ): Promise<MonitoringDetailDto> {
    const period = toPeriod(query);
    const collected = await this.collect(
      {
        id,
        status: { in: MONITORED_STATUSES },
        ...trajectoryScopeWhere(await this.scopes.forUser(user)),
      },
      period,
      1,
    );
    const row = collected.rows[0];
    if (!row) throw new NotFoundException('ИОТ не найдена');
    const now = new Date();
    const today = localDate(now.toISOString());
    const people = await loadPeople(
      this.prisma,
      row.versions.map((version) => version.createdById),
    );
    return {
      period: period.dto,
      row: toRowDto(row, collected, period, now),
      stages: row.stages.map((stage) => ({
        id: stage.id,
        title: stage.title,
        status: stage.status as StageStatus,
        startDate: isoDate(stage.startDate),
        endDate: isoDate(stage.endDate),
        progress: assignmentProgress(
          row.assignments.filter((item) => item.stageId === stage.id).map(toProgressItem),
          now,
        ),
        checkpoints: stage.checkpoints.map((checkpoint) => {
          const dto = {
            id: checkpoint.id,
            title: checkpoint.title,
            description: checkpoint.description,
            dueDate: isoDate(checkpoint.dueDate),
            status: checkpoint.status as CheckpointStatus,
          };
          return { ...dto, missed: isCheckpointMissed(dto, today) };
        }),
      })),
      warnings: warningsOf(row, now),
      results: collected.results
        .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
        .map((item) => ({
          recordedAt: item.recordedAt.toISOString(),
          title: item.title,
          score: item.score,
          maxScore: item.maxScore,
          percent: averagePercent([item]) ?? 0,
        })),
      dynamics: dynamicsOf(collected.rows, collected.results, period, now),
      versions: row.versions.map((version) => ({
        versionNumber: version.versionNumber,
        status: version.status as TrajectoryStatus,
        reason: version.reason,
        createdBy: version.createdById ? (people.get(version.createdById) ?? null) : null,
        createdAt: version.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Отметка о необходимости дополнительного сопровождения (FR-060) с основанием. Ставит
   * преподаватель, который ведёт студента; изменение пишется в журнал аудита и историю студента.
   */
  async setSupportStatus(
    user: CurrentUser,
    studentId: string,
    dto: SupportStatusInputDto,
  ): Promise<SupportStatusDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, archivedAt: null, ...this.scopes.studentsWhere(scope) },
      select: { id: true, supportStatus: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    if (student.supportStatus !== dto.supportStatus) {
      await this.prisma.$transaction(async (tx) => {
        await tx.student.update({
          where: { id: studentId },
          data: { supportStatus: dto.supportStatus },
        });
        await this.audit.log(
          {
            action: 'student.support_status_changed',
            entityType: 'student',
            entityId: studentId,
            before: { supportStatus: student.supportStatus },
            after: { supportStatus: dto.supportStatus },
            reason: dto.reason,
          },
          tx,
        );
      });
    }
    return { studentId, supportStatus: dto.supportStatus as SupportStatus };
  }

  /** Маршруты и связанные с ними события периода одним набором запросов. */
  private async collect(
    where: Prisma.TrajectoryWhereInput,
    period: Period,
    take: number,
  ): Promise<Collected> {
    const rows = await this.prisma.trajectory.findMany({
      where,
      include,
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
        { discipline: { name: 'asc' } },
        { id: 'asc' },
      ],
      take,
    });
    const ids = rows.map((row) => row.id);
    const studentIds = [...new Set(rows.map((row) => row.studentId))];
    const within = (field: string) =>
      period.from || period.to
        ? {
            [field]: {
              ...(period.from && { gte: period.from }),
              ...(period.to && { lt: period.to }),
            },
          }
        : {};
    const [results, feedback, consultations, sessions] = await Promise.all([
      this.prisma.academicResult.findMany({
        where: { trajectoryAssignment: { trajectoryId: { in: ids } }, ...within('recordedAt') },
        select: {
          score: true,
          maxScore: true,
          recordedAt: true,
          title: true,
          trajectoryAssignment: {
            select: { trajectoryId: true, assignment: { select: { title: true } } },
          },
        },
      }),
      this.prisma.feedback.groupBy({
        by: ['trajectoryId'],
        where: {
          trajectoryId: { in: ids },
          kind: { in: [...HELP_REQUEST_KINDS] },
          ...within('createdAt'),
        },
        _count: { _all: true },
      }),
      this.prisma.consultation.findMany({
        where: { trajectoryId: { in: ids }, requestedById: { not: null }, ...within('createdAt') },
        select: { trajectoryId: true, requestedById: true },
      }),
      this.prisma.diagnosticSession.findMany({
        where: {
          studentId: { in: studentIds },
          status: 'COMPLETED',
          completedAt: { not: null },
          ...within('completedAt'),
        },
        select: { studentId: true, completedAt: true, measurementType: true },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const helpRequests = new Map<string, number>();
    for (const item of feedback) {
      if (item.trajectoryId) helpRequests.set(item.trajectoryId, item._count._all);
    }
    const studentUsers = new Map(rows.map((row) => [row.id, row.student.userId]));
    for (const item of consultations) {
      // Запрос консультации — обращение за помощью, только если его отправил сам студент.
      if (!item.trajectoryId || item.requestedById !== studentUsers.get(item.trajectoryId))
        continue;
      helpRequests.set(item.trajectoryId, (helpRequests.get(item.trajectoryId) ?? 0) + 1);
    }
    const diagnostics = new Map<
      string,
      { completedAt: Date; measurementType: MeasurementType }[]
    >();
    for (const session of sessions) {
      const list = diagnostics.get(session.studentId) ?? [];
      list.push({
        completedAt: session.completedAt!,
        measurementType: session.measurementType as MeasurementType,
      });
      diagnostics.set(session.studentId, list);
    }
    return {
      rows,
      results: results.map((item) => ({
        trajectoryId: item.trajectoryAssignment!.trajectoryId!,
        score: Number(item.score),
        maxScore: Number(item.maxScore),
        recordedAt: item.recordedAt,
        title: item.title ?? item.trajectoryAssignment?.assignment.title ?? null,
      })),
      helpRequests,
      diagnostics,
    };
  }
}

/** Начало дня `date` (+ `days`) по местному времени: события периода считаются по дням колледжа. */
function localMidnight(date: string, days: number): Date {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return new Date(year!, month! - 1, dayOfMonth! + days);
}

function toPeriod(query: MonitoringPeriodQueryDto): Period {
  const from = query.from ?? null;
  const to = query.to ?? null;
  if (from && to && to < from) {
    throw new BadRequestException({
      message: 'Конец периода раньше начала',
      fields: { to: 'Конец периода раньше начала' },
    });
  }
  return {
    dto: { from, to },
    from: from ? localMidnight(from, 0) : null,
    to: to ? localMidnight(to, 1) : null,
  };
}

const inPeriod = (date: Date, period: Period) =>
  (!period.from || date >= period.from) && (!period.to || date < period.to);

const toProgressItem = (item: Row['assignments'][number]) => ({
  status: item.status as AssignmentStatus,
  dueAt: item.dueAt?.toISOString() ?? null,
});

const isOpen = (row: Row) =>
  TRAJECTORY_CORRECTABLE_STATUSES.includes(row.status as TrajectoryStatus);

function toRowDto(row: Row, collected: Collected, period: Period, now: Date): MonitoringRowDto {
  const today = localDate(now.toISOString());
  const checkpoints = row.stages.flatMap((stage) =>
    stage.checkpoints.map((item) => ({
      status: item.status as CheckpointStatus,
      dueDate: isoDate(item.dueDate),
    })),
  );
  const submissions = row.assignments
    .flatMap((item) => item.submissions.map((submission) => submission.submittedAt))
    .filter((date) => inPeriod(date, period))
    .sort((a, b) => b.getTime() - a.getTime());
  const results = collected.results.filter((item) => item.trajectoryId === row.id);
  const sessions = collected.diagnostics.get(row.studentId) ?? [];
  return {
    trajectoryId: row.id,
    status: row.status as TrajectoryStatus,
    version: row.currentVersion,
    student: {
      id: row.student.id,
      fullName: formatFullName(row.student),
      participantCode: row.student.participantCode,
      group: row.student.currentGroup,
      supportStatus: row.student.supportStatus as SupportStatus,
    },
    discipline: row.discipline,
    progress: assignmentProgress(row.assignments.map(toProgressItem), now),
    stages: {
      total: row.stages.length,
      completed: row.stages.filter((stage) => stage.status === 'COMPLETED').length,
    },
    checkpoints: {
      total: checkpoints.length,
      passed: checkpoints.filter((item) => item.status === 'PASSED').length,
      // В завершённом маршруте неотмеченная точка — уже история, а не предупреждение.
      missed: checkpoints.filter((item) =>
        isOpen(row) ? isCheckpointMissed(item, today) : item.status === 'MISSED',
      ).length,
    },
    averageScore: averagePercent(results),
    scoredCount: results.length,
    activity: {
      submissions: submissions.length,
      lastSubmissionAt: submissions[0]?.toISOString() ?? null,
    },
    helpRequests: collected.helpRequests.get(row.id) ?? 0,
    corrections: row.versions.filter((version) => version.versionNumber > 1).length,
    diagnostics: {
      completed: sessions.length,
      lastCompletedAt: sessions[0]?.completedAt.toISOString() ?? null,
      lastMeasurementType: sessions[0]?.measurementType ?? null,
    },
  };
}

/** Предупреждения действующего маршрута (FR-058): просроченные задания и пропущенные точки. */
function warningsOf(row: Row, now: Date): MonitoringWarningDto[] {
  if (!isOpen(row)) return [];
  const today = localDate(now.toISOString());
  const base = {
    trajectoryId: row.id,
    student: { id: row.student.id, fullName: formatFullName(row.student) },
    discipline: row.discipline.name,
  };
  const stageTitle = new Map(row.stages.map((stage) => [stage.id, stage.title]));
  const overdue = row.assignments
    .filter((item) => isAssignmentOverdue(toProgressItem(item), now))
    .map((item) => ({
      ...base,
      kind: 'OVERDUE_ASSIGNMENT' as const,
      stageTitle: item.stageId ? (stageTitle.get(item.stageId) ?? null) : null,
      title: item.assignment.title,
      dueAt: item.dueAt!.toISOString(),
    }));
  const missed = row.stages.flatMap((stage) =>
    stage.checkpoints
      .filter((item) =>
        isCheckpointMissed({ status: item.status, dueDate: isoDate(item.dueDate) }, today),
      )
      .map((item) => ({
        ...base,
        kind: 'MISSED_CHECKPOINT' as const,
        stageTitle: stage.title,
        title: item.title,
        dueAt: isoDate(item.dueDate) ?? '',
      })),
  );
  return [...overdue, ...missed].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * Динамика по неделям (FR-059): принятые задания, отправленные ответы и средний результат.
 * Без периода — последние недели до сегодняшнего дня.
 */
function dynamicsOf(
  rows: Row[],
  results: Collected['results'],
  period: Period,
  now: Date,
): MonitoringDynamicsPointDto[] {
  const today = localDate(now.toISOString());
  const to = period.dto.to ?? today;
  const from =
    period.dto.from ??
    new Date(Date.parse(to) - (MONITORING_DEFAULT_WEEKS - 1) * 7 * DAY_MS)
      .toISOString()
      .slice(0, 10);
  const points = new Map(
    weekBuckets(from, to).map((week) => [
      week,
      { completed: 0, submissions: 0, scores: [] as { score: number; maxScore: number }[] },
    ]),
  );
  const bucket = (date: Date) => points.get(weekStart(localDate(date.toISOString())));
  for (const row of rows) {
    for (const item of row.assignments) {
      if (item.status === 'COMPLETED' && item.completedAt) {
        const point = bucket(item.completedAt);
        if (point) point.completed += 1;
      }
      for (const submission of item.submissions) {
        const point = bucket(submission.submittedAt);
        if (point) point.submissions += 1;
      }
    }
  }
  for (const item of results) bucket(item.recordedAt)?.scores.push(item);
  return [...points.entries()].map(([week, point]) => ({
    weekStart: week,
    completedAssignments: point.completed,
    submissions: point.submissions,
    averageScore: averagePercent(point.scores),
  }));
}
