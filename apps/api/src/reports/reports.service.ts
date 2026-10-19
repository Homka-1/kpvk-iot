import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CurrentUser,
  DASHBOARD_PERIOD_LABELS,
  DashboardPeriod,
  dashboardPeriodRange,
  descriptiveStats,
  formatDateRu,
  formatFullName,
  localDate,
  MEASUREMENT_TYPE_LABELS,
  MOTIVATION_LEVEL_LABELS,
  MOTIVATION_PROFILE_STATUS_LABELS,
  type MonitoringDto,
  type MonitoringRowDto,
  NO_DATA,
  REPORT_KIND_LABELS,
  ReportKind,
  type ReportCell,
  type ReportDocument,
  type ReportFormat,
  reportFileName,
  reportPeriodText,
  statsTable,
  SUPPORT_STATUS_LABELS,
  TRAJECTORY_STATUS_LABELS,
} from '@iot/shared';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { DiagnosticSessionsService } from '../diagnostics/sessions.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MotivationProfilesService } from '../profiles/motivation-profiles.service.js';
import { StudentsService } from '../students/students.service.js';
import { REPORT_CONTENT_TYPES, renderReport } from './report-renderer.js';
import type { ReportQueryDto } from './reports.dto.js';

export interface ReportFile {
  content: Buffer;
  contentType: string;
  fileName: string;
}

const percent = (value: number | null): ReportCell => (value === null ? null : `${value} %`);

/** Таблица ИОТ для отчётов по группе и по реализации ИОТ (п. 4.8). */
function trajectoryTable(rows: readonly MonitoringRowDto[]) {
  return {
    header: [
      'Код участника',
      'Студент',
      'Группа',
      'Дисциплина',
      'Статус ИОТ',
      'Версия',
      'Прогресс',
      'Этапы (пройдено / всего)',
      'Контрольные точки (пройдено / пропущено / всего)',
      'Средний результат',
      'Сдано ответов',
      'Обращения за помощью',
      'Корректировки',
    ],
    rows: rows.map((row): ReportCell[] => [
      row.student.participantCode,
      row.student.fullName,
      row.student.group?.name ?? null,
      row.discipline.name,
      TRAJECTORY_STATUS_LABELS[row.status],
      row.version,
      percent(row.progress.percent),
      `${row.stages.completed} / ${row.stages.total}`,
      `${row.checkpoints.passed} / ${row.checkpoints.missed} / ${row.checkpoints.total}`,
      percent(row.averageScore),
      row.activity.submissions,
      row.helpRequests,
      row.corrections,
    ]),
  };
}

function monitoringFacts(summary: MonitoringDto['summary']): [string, ReportCell][] {
  return [
    ['Маршрутов ИОТ', summary.trajectories],
    ['Средний прогресс', percent(summary.averageProgress)],
    ['Просроченные задания', summary.overdueAssignments],
    ['Пропущенные контрольные точки', summary.missedCheckpoints],
    ['Студентов, нужно дополнительное сопровождение', summary.needsSupport],
    ['ИОТ, требующих корректировки', summary.needsCorrection],
  ];
}

const truncatedNote = (monitoring: MonitoringDto) =>
  monitoring.truncated
    ? 'Маршрутов больше предела выборки: в отчёт вошли первые из них. Сузьте отбор по группе или дисциплине.'
    : undefined;

/**
 * Отчёты (п. 4.10; FR-076–FR-080): индивидуальный отчёт студента, по группе, по реализации ИОТ
 * и по диагностике. Данные берутся у модулей мониторинга, профилей, диагностики и аналитики,
 * поэтому подчиняются тем же правам и области пользователя (FR-002): студент или группа вне
 * области — 404. В отчёт не попадают служебные заметки преподавателя (FR-016) и ответы
 * диагностики. Пропуск — «Нет данных», не ноль (FR-005, FR-074). Каждое формирование
 * пишется в журнал аудита (п. 8.3: экспорты).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly students: StudentsService,
    private readonly monitoring: MonitoringService,
    private readonly profiles: MotivationProfilesService,
    private readonly sessions: DiagnosticSessionsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async studentReport(
    user: CurrentUser,
    studentId: string,
    query: ReportQueryDto,
  ): Promise<ReportFile> {
    const student = await this.students.get(user, studentId);
    const { label, range } = periodOf(query);
    const [monitoring, motivation, diagnostics] = await Promise.all([
      this.monitoring.overview(user, { studentId, ...range }),
      this.profiles.getForStudent(user, studentId),
      this.sessions.listForStudent(user, studentId),
    ]);
    const profile = motivation.lastDecided ?? motivation.current;
    const completed = diagnostics.filter(
      (item) =>
        item.status === 'COMPLETED' &&
        item.completedAt &&
        inPeriod(localDate(item.completedAt), range),
    );

    const document = this.document(user, ReportKind.STUDENT, label, range, [
      `Студент: ${formatFullName(student)} (${student.participantCode})`,
    ]);
    document.sections = [
      {
        title: 'Общие сведения',
        facts: [
          ['Группа', student.group ? `${student.group.name}, ${student.group.course} курс` : null],
          ['Специальность', student.group?.specialty ?? null],
          ['Статус сопровождения', SUPPORT_STATUS_LABELS[student.supportStatus]],
          [
            'Мотивационный профиль',
            profile
              ? [
                  MOTIVATION_PROFILE_STATUS_LABELS[profile.status],
                  profile.level ? MOTIVATION_LEVEL_LABELS[profile.level] : null,
                ]
                  .filter(Boolean)
                  .join(', ')
              : null,
          ],
        ],
      },
      {
        title: 'Индивидуальные образовательные траектории',
        table: trajectoryTable(monitoring.rows),
        note: monitoring.rows.length === 0 ? 'ИОТ в выбранном периоде нет.' : undefined,
      },
      {
        title: 'Результаты диагностики',
        table: {
          header: ['Дата', 'Методика', 'Версия', 'Замер', 'Шкала', 'Балл', 'Уровень', 'Пропуски'],
          rows: completed.flatMap((item) =>
            item.scores.map((score): ReportCell[] => [
              formatDateRu(item.completedAt!),
              item.questionnaire.title,
              item.questionnaire.versionNumber,
              MEASUREMENT_TYPE_LABELS[item.measurementType],
              score.name,
              score.rawScore,
              score.level?.label ?? null,
              score.missingAnswers,
            ]),
          ),
        },
        note:
          completed.length === 0
            ? 'Завершённых диагностик в выбранном периоде нет.'
            : 'Балл «Нет данных» — ответы пропущены; он не равен нулю.',
      },
    ];
    return this.deliver(user, document, query.format, studentId);
  }

  async groupReport(user: CurrentUser, query: ReportQueryDto): Promise<ReportFile> {
    if (!query.groupId) throw new BadRequestException('Выберите группу для отчёта');
    const scope = await this.scopes.forUser(user);
    const group = await this.prisma.group.findFirst({
      where: {
        id: query.groupId,
        ...(scope.kind === 'assigned' ? { AND: { id: { in: scope.groupIds } } } : {}),
      },
      select: { id: true, name: true, course: true, specialty: true },
    });
    if (!group) throw new NotFoundException('Группа не найдена');
    const { label, range } = periodOf(query);
    const context = { groupId: group.id, disciplineId: query.disciplineId ?? undefined };
    const [monitoring, distribution, studentCount] = await Promise.all([
      this.monitoring.overview(user, { ...context, ...range }),
      this.profiles.distribution(user, context),
      this.prisma.student.count({
        where: {
          AND: [this.scopes.studentsWhere(scope), { currentGroupId: group.id, archivedAt: null }],
        },
      }),
    ]);
    const rows = monitoring.rows;

    const document = this.document(user, ReportKind.GROUP, label, range, [
      `Группа: ${group.name}, ${group.course} курс, ${group.specialty}`,
      ...(await this.disciplineScope(query)),
    ]);
    document.sections = [
      {
        title: 'Состав и профили',
        facts: [
          ['Студентов в группе', studentCount],
          ['Профиль подтверждён: высокий', distribution.HIGH],
          ['Профиль подтверждён: средний', distribution.MEDIUM],
          ['Профиль подтверждён: низкий', distribution.LOW],
          ['Предложен системой, ждёт решения', distribution.PROPOSED],
          ['Требуется дополнительная диагностика', distribution.NEEDS_MORE_DIAGNOSTICS],
          ['Профиль не формировался', distribution.NONE],
        ],
      },
      { title: 'Выполнение ИОТ', facts: monitoringFacts(monitoring.summary) },
      {
        title: 'Статистики группы',
        table: statsTable([
          {
            label: 'Прогресс ИОТ, %',
            stats: descriptiveStats(rows.map((r) => r.progress.percent)),
          },
          {
            label: 'Средний результат, %',
            stats: descriptiveStats(rows.map((r) => r.averageScore)),
          },
          {
            label: 'Сдано ответов',
            stats: descriptiveStats(rows.map((r) => r.activity.submissions)),
          },
        ]),
        note: 'Маршруты без значения показателя считаются пропусками и в расчёт не входят.',
      },
      {
        title: 'ИОТ студентов',
        table: trajectoryTable(rows),
        note: truncatedNote(monitoring),
      },
    ];
    return this.deliver(user, document, query.format, group.id);
  }

  async trajectoriesReport(user: CurrentUser, query: ReportQueryDto): Promise<ReportFile> {
    const { label, range } = periodOf(query);
    const monitoring = await this.monitoring.overview(user, {
      groupId: query.groupId,
      disciplineId: query.disciplineId,
      ...range,
    });
    const document = this.document(user, ReportKind.TRAJECTORIES, label, range, [
      ...(await this.groupScope(query)),
      ...(await this.disciplineScope(query)),
    ]);
    document.sections = [
      { title: 'Сводка', facts: monitoringFacts(monitoring.summary) },
      {
        title: 'Прогресс по маршрутам',
        table: trajectoryTable(monitoring.rows),
        note: truncatedNote(monitoring),
      },
      {
        title: 'Предупреждения',
        table: {
          header: ['Студент', 'Дисциплина', 'Этап', 'Событие', 'Срок'],
          rows: monitoring.warnings.map((warning): ReportCell[] => [
            warning.student.fullName,
            warning.discipline,
            warning.stageTitle,
            warning.title,
            formatDateRu(warning.dueAt),
          ]),
        },
        note:
          monitoring.warnings.length === 0
            ? 'Просроченных заданий и пропущенных контрольных точек нет.'
            : 'Учебная активность учитывается по сдаче заданий; отсутствие входа в систему не считается признаком снижения мотивации.',
      },
    ];
    return this.deliver(user, document, query.format, query.groupId ?? null);
  }

  async diagnosticsReport(user: CurrentUser, query: ReportQueryDto): Promise<ReportFile> {
    const { label, range } = periodOf(query);
    const { motivation } = await this.analytics.motivationFor(user, query);
    const document = this.document(user, ReportKind.DIAGNOSTICS, label, range, [
      ...(await this.groupScope(query)),
      ...(await this.disciplineScope(query)),
      ...(motivation.selected
        ? [
            `Методика: ${motivation.selected.title}, версия ${motivation.selected.versionNumber}${
              motivation.selected.isDemo ? ' (демо)' : ''
            }`,
          ]
        : []),
    ]);
    document.sections = motivation.selected
      ? [
          {
            title: 'Прохождения',
            facts: [
              ['Завершено (вошли в расчёт)', motivation.completed],
              ['Назначено, не завершено (исключены)', motivation.incomplete],
              [
                'Сопоставимые версии методики',
                motivation.selected.comparableVersions.length > 0
                  ? motivation.selected.comparableVersions.join(', ')
                  : 'Нет',
              ],
            ],
            note: 'Незавершённые прохождения в статистику не входят (FR-073).',
          },
          ...motivation.scales.map((scale) => ({
            title: `Шкала «${scale.name}»`,
            table: statsTable([
              ...scale.measurements.map((item) => ({
                label: MEASUREMENT_TYPE_LABELS[item.measurementType],
                stats: item.stats,
              })),
              ...(scale.change
                ? [{ label: 'Изменение: повторный − первичный', stats: scale.change }]
                : []),
            ]),
            note:
              scale.measurements.length === 0
                ? NO_DATA
                : scale.change
                  ? undefined
                  : 'Повторных замеров нет: изменение не рассчитано.',
          })),
        ]
      : [
          {
            title: 'Прохождения',
            note: 'Завершённых диагностик в выбранном отборе нет.',
          },
        ];
    return this.deliver(user, document, query.format, query.versionId ?? null);
  }

  // ── Оформление ──

  private document(
    user: CurrentUser,
    kind: ReportKind,
    periodLabel: string,
    range: { from: string | null; to: string | null },
    scope: string[],
  ): ReportDocument {
    return {
      kind,
      title: REPORT_KIND_LABELS[kind],
      generatedAt: new Date().toISOString(),
      period: reportPeriodText(periodLabel, range),
      author: formatFullName(user),
      scope,
      sections: [],
    };
  }

  private async groupScope(query: ReportQueryDto): Promise<string[]> {
    if (!query.groupId) return [];
    const group = await this.prisma.group.findUnique({
      where: { id: query.groupId },
      select: { name: true },
    });
    return group ? [`Группа: ${group.name}`] : [];
  }

  private async disciplineScope(query: ReportQueryDto): Promise<string[]> {
    if (!query.disciplineId) return [];
    const discipline = await this.prisma.discipline.findUnique({
      where: { id: query.disciplineId },
      select: { name: true },
    });
    return discipline ? [`Дисциплина: ${discipline.name}`] : [];
  }

  /** Файл отчёта и запись в аудит (формирование отчёта — экспорт данных). */
  private async deliver(
    user: CurrentUser,
    document: ReportDocument,
    format: ReportFormat,
    subjectId: string | null,
  ): Promise<ReportFile> {
    const content = await renderReport(document, format);
    await this.audit.log({
      actorId: user.id,
      action: 'report.generated',
      entityType: 'report',
      entityId: subjectId,
      after: { kind: document.kind, format, period: document.period, scope: document.scope.length },
    });
    return {
      content,
      contentType: REPORT_CONTENT_TYPES[format],
      fileName: reportFileName(document.kind, format, localDate(document.generatedAt)),
    };
  }
}

function periodOf(query: Pick<ReportQueryDto, 'period'>) {
  const period = query.period ?? DashboardPeriod.ACADEMIC_YEAR;
  return {
    label: DASHBOARD_PERIOD_LABELS[period],
    range: dashboardPeriodRange(period, localDate(new Date().toISOString())),
  };
}

function inPeriod(date: string, range: { from: string | null; to: string | null }): boolean {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}
