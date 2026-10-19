import { Injectable } from '@nestjs/common';
import {
  ANALYTICS_ASSIGNMENTS_LIMIT,
  type AssignmentStatus,
  type AnalyticsDto,
  type AnalyticsQuestionnaireOptionDto,
  type AssignmentEffectivenessDto,
  buildMotivationAnalytics,
  compareGroups,
  type CurrentUser,
  DashboardPeriod,
  dashboardPeriodRange,
  descriptiveStats,
  localDate,
  type MeasurementType,
  type MotivationAnalyticsDto,
  type TrajectoryStatus,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import {
  scoreInclude,
  toScaleResults,
  toVersionLabel,
  versionLabelSelect,
} from '../diagnostics/sessions.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { teacherAssignmentWhere } from '../library/library-scope.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MotivationProfilesService } from '../profiles/motivation-profiles.service.js';
import { contextWhere } from '../students/students.service.js';
import type { AnalyticsQueryDto } from './analytics.dto.js';

/** Назначения, которые студент выполняет: не отменённые, не отклонённые варианты и не наборы. */
const COUNTED_ASSIGNMENTS: AssignmentStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'RETURNED',
  'COMPLETED',
];

interface Context {
  groupId?: string;
  disciplineId?: string;
}

/**
 * Аналитика преподавателя (п. 4.10; FR-069, FR-070, FR-073, FR-074): выполнение ИОТ, академическая
 * успешность и её динамика, учебная активность, распределение профилей, результативность заданий,
 * динамика мотивации и сравнение до и после сопровождения. Показатели ИОТ считаются по правилам
 * мониторинга, профили — модулем профилей; всё — по студентам области пользователя (FR-002)
 * и контексту шапки. По каждому показателю — описательные статистики в целом и по группам.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: AccessScopeService,
    private readonly monitoring: MonitoringService,
    private readonly profiles: MotivationProfilesService,
  ) {}

  async overview(user: CurrentUser, query: AnalyticsQueryDto): Promise<AnalyticsDto> {
    const scope = await this.scopes.forUser(user);
    const context: Context = {
      groupId: query.groupId ?? undefined,
      disciplineId: query.disciplineId ?? undefined,
    };
    const period = dashboardPeriodRange(
      query.period ?? DashboardPeriod.ACADEMIC_YEAR,
      localDate(new Date().toISOString()),
    );
    // Начало периода — начало местных суток, как в мониторинге.
    const since = period.from ? new Date(`${period.from}T00:00:00`) : undefined;
    const students: Prisma.StudentWhereInput = {
      AND: [
        this.scopes.studentsWhere(scope),
        { archivedAt: null },
        ...contextWhere(scope, user.id, context),
      ],
    };

    const [monitoring, profiles, assignments, motivation] = await Promise.all([
      this.monitoring.overview(user, { ...context, ...period }),
      this.profileDistribution(user, scope, context),
      this.assignmentEffectiveness(scope, context, since),
      this.motivation(students, since, query.versionId ?? null),
    ]);

    const rows = monitoring.rows;
    const groupOf = (row: (typeof rows)[number]) => row.student.group;
    const statuses: Partial<Record<TrajectoryStatus, number>> = {};
    for (const row of rows) statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    return {
      period,
      trajectories: {
        statuses,
        progress: compareGroups(rows, groupOf, (row) => row.progress.percent),
        stagesCompleted: compareGroups(rows, groupOf, (row) =>
          row.stages.total > 0
            ? Math.round((row.stages.completed / row.stages.total) * 1000) / 10
            : null,
        ),
      },
      academic: {
        averageScore: compareGroups(rows, groupOf, (row) => row.averageScore),
        dynamics: monitoring.dynamics.map((point) => ({
          weekStart: point.weekStart,
          averageScore: point.averageScore,
        })),
      },
      activity: {
        submissions: compareGroups(rows, groupOf, (row) => row.activity.submissions),
        helpRequests: compareGroups(rows, groupOf, (row) => row.helpRequests),
        dynamics: monitoring.dynamics.map((point) => ({
          weekStart: point.weekStart,
          submissions: point.submissions,
        })),
      },
      profiles,
      assignments,
      motivation,
      truncated: monitoring.truncated,
    };
  }

  /** Распределение профилей по всем студентам и по каждой учебной группе области. */
  private async profileDistribution(
    user: CurrentUser,
    scope: AccessScope,
    context: Context,
  ): Promise<AnalyticsDto['profiles']> {
    const allowed = scope.kind === 'assigned' ? scope.groupIds : null;
    const ids = context.groupId
      ? allowed && !allowed.includes(context.groupId)
        ? []
        : [context.groupId]
      : allowed;
    const groups = await this.prisma.group.findMany({
      where: { archivedAt: null, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, name: true, course: true, specialty: true },
      orderBy: { name: 'asc' },
    });
    const [total, ...perGroup] = await Promise.all([
      this.profiles.distribution(user, context),
      ...groups.map((group) => this.profiles.distribution(user, { ...context, groupId: group.id })),
    ]);
    return {
      total: total!,
      groups: groups
        .map((group, index) => ({ group, distribution: perGroup[index]! }))
        .filter((item) => item.distribution.total > 0),
    };
  }

  /** Результативность заданий библиотеки по назначениям студентам области (п. 4.10). */
  private async assignmentEffectiveness(
    scope: AccessScope,
    context: Context,
    since: Date | undefined,
  ): Promise<AssignmentEffectivenessDto[]> {
    const rows = await this.prisma.trajectoryAssignment.findMany({
      where: {
        AND: [teacherAssignmentWhere(scope)],
        status: { in: COUNTED_ASSIGNMENTS },
        student: {
          archivedAt: null,
          ...(context.groupId ? { currentGroupId: context.groupId } : {}),
        },
        ...(context.disciplineId ? { assignment: { disciplineId: context.disciplineId } } : {}),
        ...(since ? { assignedAt: { gte: since } } : {}),
      },
      select: {
        assignmentId: true,
        status: true,
        assignment: { select: { title: true, discipline: { select: { name: true } } } },
        submissions: { select: { assessment: { select: { decision: true } } } },
        academicResults: { select: { score: true, maxScore: true } },
      },
    });
    const byAssignment = new Map<
      string,
      { title: string; discipline: string; items: typeof rows }
    >();
    for (const row of rows) {
      const entry = byAssignment.get(row.assignmentId) ?? {
        title: row.assignment.title,
        discipline: row.assignment.discipline.name,
        items: [],
      };
      entry.items.push(row);
      byAssignment.set(row.assignmentId, entry);
    }
    return [...byAssignment.entries()]
      .map(([assignmentId, entry]) => {
        const completed = entry.items.filter((item) => item.status === 'COMPLETED');
        return {
          assignmentId,
          title: entry.title,
          discipline: entry.discipline,
          assigned: entry.items.length,
          submitted: entry.items.filter((item) => item.submissions.length > 0).length,
          completed: completed.length,
          returned: entry.items
            .flatMap((item) => item.submissions)
            .filter((submission) => submission.assessment?.decision === 'RETURNED').length,
          score: descriptiveStats(
            completed.map((item) => {
              const result = item.academicResults[0];
              return result && result.maxScore.toNumber() > 0
                ? Math.round((result.score.toNumber() / result.maxScore.toNumber()) * 1000) / 10
                : null;
            }),
          ),
        };
      })
      .sort((a, b) => b.assigned - a.assigned || a.title.localeCompare(b.title, 'ru'))
      .slice(0, ANALYTICS_ASSIGNMENTS_LIMIT);
  }

  /**
   * Динамика мотивации и сравнение до и после сопровождения по выбранной версии методики
   * и версиям, сопоставимость которых с ней утверждена (FR-072). Незавершённые прохождения
   * в расчёт не входят, их число показывается отдельно (FR-073).
   */
  private async motivation(
    students: Prisma.StudentWhereInput,
    since: Date | undefined,
    versionId: string | null,
  ): Promise<MotivationAnalyticsDto> {
    const completedWhere: Prisma.DiagnosticSessionWhereInput = {
      status: 'COMPLETED',
      student: students,
      ...(since ? { completedAt: { gte: since } } : {}),
    };
    const versions = await this.prisma.diagnosticSession.findMany({
      where: completedWhere,
      distinct: ['versionId'],
      select: { version: { select: versionLabelSelect } },
    });
    const options: AnalyticsQuestionnaireOptionDto[] = versions
      .map((row) => {
        const label = toVersionLabel(row.version);
        return {
          versionId: label.versionId,
          questionnaireId: label.questionnaireId,
          title: label.title,
          versionNumber: label.versionNumber,
          isDemo: label.isDemo,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'ru') || b.versionNumber - a.versionNumber);
    const selected = options.find((item) => item.versionId === versionId) ?? options[0];
    if (!selected) {
      return { options, selected: null, completed: 0, incomplete: 0, scales: [] };
    }

    const pairs = await this.prisma.versionComparability.findMany({
      where: { OR: [{ versionAId: selected.versionId }, { versionBId: selected.versionId }] },
      select: {
        versionA: { select: { id: true, versionNumber: true } },
        versionB: { select: { id: true, versionNumber: true } },
      },
    });
    const comparable = pairs.map((pair) =>
      pair.versionA.id === selected.versionId ? pair.versionB : pair.versionA,
    );
    const versionIds = [selected.versionId, ...comparable.map((version) => version.id)];
    const [scales, sessions, incomplete] = await Promise.all([
      this.prisma.questionnaireScale.findMany({
        where: { versionId: selected.versionId },
        select: { code: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.diagnosticSession.findMany({
        where: { ...completedWhere, versionId: { in: versionIds } },
        select: {
          studentId: true,
          measurementType: true,
          completedAt: true,
          currentRevision: true,
          scores: { include: scoreInclude },
        },
      }),
      this.prisma.diagnosticSession.count({
        where: {
          status: { in: ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'] },
          student: students,
          versionId: { in: versionIds },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      }),
    ]);
    return {
      options,
      selected: {
        ...selected,
        comparableVersions: comparable
          .map((version) => version.versionNumber)
          .sort((a, b) => a - b),
      },
      completed: sessions.length,
      incomplete,
      scales: buildMotivationAnalytics(
        scales,
        sessions.map((session) => ({
          studentId: session.studentId,
          measurementType: session.measurementType as MeasurementType,
          completedAt: session.completedAt!.toISOString(),
          scores: toScaleResults(session.scores, session.currentRevision),
        })),
      ),
    };
  }
}
