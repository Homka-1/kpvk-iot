import { Injectable } from '@nestjs/common';
import {
  type AssignmentStatus,
  type CurrentUser,
  DASHBOARD_LIST_LIMIT,
  type DashboardActivityDto,
  type DashboardDto,
  DashboardPeriod,
  dashboardPeriodRange,
  type DashboardRecentAssignmentDto,
  type DashboardStageBarDto,
  type DashboardUpcomingDto,
  formatFullName,
  localDate,
  ROUTE_PROPOSAL_STATUSES,
  type StageStatus,
  STUDENT_FEEDBACK_KINDS,
} from '@iot/shared';
import { reviewQueueWhere } from '../assignments/submissions.service.js';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { publishedAssignmentWhere, teacherAssignmentWhere } from '../library/library-scope.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MotivationProfilesService } from '../profiles/motivation-profiles.service.js';
import { contextWhere, NEEDS_ATTENTION } from '../students/students.service.js';
import { trajectoryScopeWhere } from '../trajectories/trajectories.service.js';
import type { DashboardQueryDto } from './dashboard.dto.js';

/** Маршруты в работе: по ним строится диаграмма этапов и предстоящие контрольные точки. */
const IN_WORK = [...ROUTE_PROPOSAL_STATUSES];
const BODY_PREVIEW = 80;

const studentName = {
  select: { id: true, lastName: true, firstName: true, middleName: true },
} as const;
const toStudent = (row: {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
}) => ({
  id: row.id,
  fullName: formatFullName(row),
});

interface Context {
  groupId?: string;
  disciplineId?: string;
}

/**
 * Главная панель преподавателя (п. 4.1, 6.2; FR-001–FR-005). Показатели ИОТ берутся из мониторинга
 * (те же правила, что в разделе «Мониторинг»), распределение профилей — из модуля профилей,
 * очередь проверки — из модуля заданий: карточка и отфильтрованный список считают одинаково
 * (FR-003). Всё — только по студентам области пользователя (FR-002) и контексту шапки (FR-004).
 * Данные не кэшируются: каждый запрос отражает последние изменения (FR-001).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
    private readonly monitoring: MonitoringService,
    private readonly profiles: MotivationProfilesService,
  ) {}

  async overview(user: CurrentUser, query: DashboardQueryDto): Promise<DashboardDto> {
    const scope = await this.scopes.forUser(user);
    const context: Context = {
      groupId: query.groupId ?? undefined,
      disciplineId: query.disciplineId ?? undefined,
    };
    const now = new Date();
    const today = localDate(now.toISOString());
    const period = dashboardPeriodRange(query.period ?? DashboardPeriod.ACADEMIC_YEAR, today);
    // Начало периода — начало местных суток, как в мониторинге.
    const since = period.from ? new Date(`${period.from}T00:00:00`) : undefined;
    const students: Prisma.StudentWhereInput = {
      AND: [
        this.scopes.studentsWhere(scope),
        { archivedAt: null },
        ...contextWhere(scope, user.id, context),
      ],
    };

    const [monitoring, profiles, toReview, needsAttention, recentAssignments, activity, upcoming] =
      await Promise.all([
        this.monitoring.overview(user, { ...context, ...period }),
        this.profiles.distribution(user, context),
        this.prisma.trajectoryAssignment.count({ where: reviewQueueWhere(scope, context) }),
        this.prisma.student.count({ where: { AND: [students, NEEDS_ATTENTION] } }),
        this.recentAssignments(scope, context, since),
        this.activity(scope, context, students, since),
        this.upcoming(scope, context, students, today, now),
      ]);

    const rows = monitoring.rows;
    const hasStudents = profiles.total > 0;
    const hasRoutes = rows.length > 0;
    return {
      period,
      cards: {
        students: hasStudents ? profiles.total : null,
        activeTrajectories: hasRoutes ? rows.filter((row) => row.status === 'ACTIVE').length : null,
        averageProgress: monitoring.summary.averageProgress,
        toReview: hasStudents ? toReview : null,
        overdueAssignments: hasRoutes ? monitoring.summary.overdueAssignments : null,
        needsAttention: hasStudents ? needsAttention : null,
      },
      stages: await this.stageBars(
        rows.filter((row) => IN_WORK.includes(row.status)).map((row) => row.trajectoryId),
      ),
      profiles,
      recentAssignments,
      activity,
      upcoming,
    };
  }

  /** Диаграмма выполнения ИОТ: сколько маршрутов на каждом номере этапа не начали, ведут, завершили. */
  private async stageBars(trajectoryIds: string[]): Promise<DashboardStageBarDto[]> {
    if (trajectoryIds.length === 0) return [];
    const stages = await this.prisma.trajectoryStage.findMany({
      where: { trajectoryId: { in: trajectoryIds }, archivedAt: null },
      select: { trajectoryId: true, status: true },
      orderBy: [{ trajectoryId: 'asc' }, { sortOrder: 'asc' }],
    });
    const bars: DashboardStageBarDto[] = [];
    let previous: string | null = null;
    let position = 0;
    for (const stage of stages) {
      position = stage.trajectoryId === previous ? position + 1 : 1;
      previous = stage.trajectoryId;
      bars[position - 1] ??= {
        position,
        counts: { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0 },
      };
      bars[position - 1]!.counts[stage.status as StageStatus] += 1;
    }
    return bars;
  }

  /** Назначения студентов, которых пользователь ведёт, в контексте шапки. */
  private assignmentsWhere(
    scope: AccessScope,
    context: Context,
  ): Prisma.TrajectoryAssignmentWhereInput {
    return {
      AND: [teacherAssignmentWhere(scope), publishedAssignmentWhere()],
      student: {
        archivedAt: null,
        ...(context.groupId ? { currentGroupId: context.groupId } : {}),
      },
      ...(context.disciplineId ? { assignment: { disciplineId: context.disciplineId } } : {}),
    };
  }

  private async recentAssignments(
    scope: AccessScope,
    context: Context,
    since: Date | undefined,
  ): Promise<DashboardRecentAssignmentDto[]> {
    const rows = await this.prisma.trajectoryAssignment.findMany({
      where: { ...this.assignmentsWhere(scope, context), assignedAt: { gte: since } },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
      take: DASHBOARD_LIST_LIMIT,
      select: {
        id: true,
        status: true,
        assignedAt: true,
        dueAt: true,
        student: studentName,
        assignment: { select: { title: true, discipline: { select: { name: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.assignment.title,
      status: row.status as AssignmentStatus,
      assignedAt: row.assignedAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      student: toStudent(row.student),
      discipline: row.assignment.discipline.name,
    }));
  }

  /**
   * Последняя активность студентов: сдача ответов, пройденная диагностика, вопросы и сообщения
   * о затруднениях, запросы консультаций, рефлексия. Входы в систему не учитываются (FR-062).
   */
  private async activity(
    scope: AccessScope,
    context: Context,
    students: Prisma.StudentWhereInput,
    since: Date | undefined,
  ): Promise<DashboardActivityDto[]> {
    const take = DASHBOARD_LIST_LIMIT;
    const [submissions, sessions, feedback, consultations, reflections] = await Promise.all([
      this.prisma.submission.findMany({
        where: {
          submittedAt: { gte: since },
          trajectoryAssignment: this.assignmentsWhere(scope, context),
        },
        orderBy: { submittedAt: 'desc' },
        take,
        select: {
          submittedAt: true,
          trajectoryAssignment: {
            select: {
              id: true,
              status: true,
              student: studentName,
              assignment: { select: { title: true } },
            },
          },
        },
      }),
      this.prisma.diagnosticSession.findMany({
        where: { status: 'COMPLETED', completedAt: { not: null, gte: since }, student: students },
        orderBy: { completedAt: 'desc' },
        take,
        select: { completedAt: true, student: studentName, version: { select: { title: true } } },
      }),
      this.prisma.feedback.findMany({
        where: {
          parentId: null,
          kind: { in: [...STUDENT_FEEDBACK_KINDS] },
          createdAt: { gte: since },
          student: students,
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: { kind: true, body: true, createdAt: true, resolvedAt: true, student: studentName },
      }),
      this.prisma.consultation.findMany({
        where: { requestedById: { not: null }, createdAt: { gte: since }, student: students },
        orderBy: { createdAt: 'desc' },
        take: take * 2,
        select: {
          topic: true,
          status: true,
          createdAt: true,
          requestedById: true,
          student: { select: { ...studentName.select, userId: true } },
        },
      }),
      this.prisma.reflection.findMany({
        where: { createdAt: { gte: since }, student: students },
        orderBy: { createdAt: 'desc' },
        take,
        select: { createdAt: true, student: studentName, checkpoint: { select: { title: true } } },
      }),
    ]);

    const entries: DashboardActivityDto[] = [
      ...submissions.map((item) => ({
        kind: 'SUBMISSION' as const,
        at: item.submittedAt.toISOString(),
        student: toStudent(item.trajectoryAssignment.student),
        title: item.trajectoryAssignment.assignment.title,
        reviewId:
          item.trajectoryAssignment.status === 'SUBMITTED' ? item.trajectoryAssignment.id : null,
        open: false,
      })),
      ...sessions.map((item) => ({
        kind: 'DIAGNOSTIC' as const,
        at: item.completedAt!.toISOString(),
        student: toStudent(item.student),
        title: item.version.title,
        reviewId: null,
        open: false,
      })),
      ...feedback.map((item) => ({
        kind: item.kind as 'QUESTION' | 'DIFFICULTY_REPORT',
        at: item.createdAt.toISOString(),
        student: toStudent(item.student),
        title: preview(item.body),
        reviewId: null,
        open: item.resolvedAt === null,
      })),
      // Запрос консультации — активность студента, только если отправил его сам студент.
      ...consultations
        .filter((item) => item.requestedById === item.student.userId)
        .map((item) => ({
          kind: 'CONSULTATION_REQUEST' as const,
          at: item.createdAt.toISOString(),
          student: toStudent(item.student),
          title: item.topic,
          reviewId: null,
          open: item.status === 'REQUESTED',
        })),
      ...reflections.map((item) => ({
        kind: 'REFLECTION' as const,
        at: item.createdAt.toISOString(),
        student: toStudent(item.student),
        title: item.checkpoint?.title ?? null,
        reviewId: null,
        open: false,
      })),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
  }

  /** Ближайшие контрольные точки маршрутов в работе и назначенные консультации. */
  private async upcoming(
    scope: AccessScope,
    context: Context,
    students: Prisma.StudentWhereInput,
    today: string,
    now: Date,
  ): Promise<DashboardUpcomingDto[]> {
    const take = DASHBOARD_LIST_LIMIT;
    const [checkpoints, consultations] = await Promise.all([
      this.prisma.trajectoryCheckpoint.findMany({
        where: {
          status: 'PENDING',
          dueDate: { gte: new Date(`${today}T00:00:00Z`) },
          stage: {
            archivedAt: null,
            trajectory: {
              AND: [
                trajectoryScopeWhere(scope),
                { status: { in: IN_WORK } },
                {
                  student: {
                    archivedAt: null,
                    ...(context.groupId ? { currentGroupId: context.groupId } : {}),
                  },
                },
                context.disciplineId ? { disciplineId: context.disciplineId } : {},
              ],
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take,
        select: {
          id: true,
          title: true,
          dueDate: true,
          stage: {
            select: {
              title: true,
              trajectory: {
                select: { id: true, discipline: { select: { name: true } }, student: studentName },
              },
            },
          },
        },
      }),
      this.prisma.consultation.findMany({
        where: { status: 'SCHEDULED', scheduledAt: { gte: now }, student: students },
        orderBy: { scheduledAt: 'asc' },
        take,
        select: {
          id: true,
          topic: true,
          scheduledAt: true,
          trajectoryId: true,
          student: studentName,
          trajectory: { select: { discipline: { select: { name: true } } } },
        },
      }),
    ]);
    const items: (DashboardUpcomingDto & { sortKey: string })[] = [
      ...checkpoints.map((item) => {
        const date = item.dueDate!.toISOString().slice(0, 10);
        return {
          kind: 'CHECKPOINT' as const,
          id: item.id,
          date,
          title: item.title,
          stageTitle: item.stage.title,
          trajectoryId: item.stage.trajectory.id,
          student: toStudent(item.stage.trajectory.student),
          discipline: item.stage.trajectory.discipline.name,
          sortKey: date,
        };
      }),
      ...consultations.map((item) => {
        const date = item.scheduledAt!.toISOString();
        return {
          kind: 'CONSULTATION' as const,
          id: item.id,
          date,
          title: item.topic,
          stageTitle: null,
          trajectoryId: item.trajectoryId,
          student: toStudent(item.student),
          discipline: item.trajectory?.discipline.name ?? null,
          sortKey: `${localDate(date)}T${date}`,
        };
      }),
    ];
    return items
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(0, take)
      .map(({ sortKey: _, ...item }) => item);
  }
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BODY_PREVIEW ? `${flat.slice(0, BODY_PREVIEW - 1)}…` : flat;
}
