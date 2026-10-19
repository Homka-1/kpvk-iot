// Главная панель преподавателя и главная страница студента (ТЗ, п. 4.1, 6.2, 6.5; FR-001–FR-005).
// Показатели считаются на сервере только по студентам области пользователя (FR-002). Пустая
// база показателя — null («Нет данных»), а не ноль (FR-005).
import type { CabinetDiagnosticDto } from './diagnostic-sessions.js';
import type { AssignmentStatus, StageStatus, TrajectoryStatus } from './enums.js';
import type { ProfileDistributionDto } from './motivation-profiles.js';
import type { CabinetTrajectoryDto, StudentAssignmentDto } from './student-assignments.js';
import type { PersonRef } from './students.js';
import { type AssignmentProgress, assignmentProgress } from './submissions.js';
import type { MonitoringPeriodDto } from './monitoring.js';

/** Сколько записей показывают списки панели: последние задания, активность, ближайшие события. */
export const DASHBOARD_LIST_LIMIT = 6;
/** Как часто главная панель перечитывает данные, мс (FR-001). */
export const DASHBOARD_REFRESH_MS = 60_000;

// ── Период наблюдения (FR-004) ──

export const DashboardPeriod = {
  ACADEMIC_YEAR: 'ACADEMIC_YEAR',
  MONTHS_3: 'MONTHS_3',
  WEEKS_4: 'WEEKS_4',
  ALL: 'ALL',
} as const;
export type DashboardPeriod = (typeof DashboardPeriod)[keyof typeof DashboardPeriod];

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  ACADEMIC_YEAR: 'Учебный год',
  MONTHS_3: 'Последние 3 месяца',
  WEEKS_4: 'Последние 4 недели',
  ALL: 'Всё время',
};

/** Учебный год начинается 1 сентября. */
const ACADEMIC_YEAR_START_MONTH = 9;

const pad = (value: number) => String(value).padStart(2, '0');
const isoOf = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/**
 * Границы периода панели для даты `today` (`YYYY-MM-DD`). Конец не ограничен: в период входят
 * и будущие сроки — их показывают предстоящие контрольные точки.
 */
export function dashboardPeriodRange(period: DashboardPeriod, today: string): MonitoringPeriodDto {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  switch (period) {
    case 'ALL':
      return { from: null, to: null };
    case 'WEEKS_4':
      return { from: isoOf(year, month, day - 27), to: null };
    case 'MONTHS_3':
      return { from: isoOf(year, month - 3, day + 1), to: null };
    case 'ACADEMIC_YEAR':
      return {
        from: isoOf(month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1, 9, 1),
        to: null,
      };
  }
}

// ── Панель преподавателя: контракт API ──

/**
 * Карточки панели (п. 4.1). null — показателю не на чем строиться (нет студентов, маршрутов
 * или назначенных заданий): «Нет данных», а не 0.
 */
export interface DashboardCardsDto {
  students: number | null;
  /** ИОТ в статусе «Активна». */
  activeTrajectories: number | null;
  /** Средний % выполнения маршрутов (как в мониторинге). */
  averageProgress: number | null;
  /** Ответы студентов, ожидающие проверки. */
  toReview: number | null;
  overdueAssignments: number | null;
  /** Студенты с отметкой о сопровождении или с нерассмотренным сообщением о затруднении. */
  needsAttention: number | null;
}

/** Столбец диаграммы выполнения ИОТ: этап с этим номером во всех маршрутах в работе. */
export interface DashboardStageBarDto {
  position: number;
  counts: Record<StageStatus, number>;
}

export interface DashboardRecentAssignmentDto {
  /** Назначение студенту (trajectory_assignments). */
  id: string;
  title: string;
  status: AssignmentStatus;
  assignedAt: string;
  dueAt: string | null;
  student: { id: string; fullName: string };
  discipline: string;
}

export type DashboardActivityKind =
  | 'SUBMISSION'
  | 'DIAGNOSTIC'
  | 'QUESTION'
  | 'DIFFICULTY_REPORT'
  | 'CONSULTATION_REQUEST'
  | 'REFLECTION';

/** Событие ленты «Последняя активность»: что сделал студент. Учитываются действия, не входы. */
export interface DashboardActivityDto {
  kind: DashboardActivityKind;
  at: string;
  student: { id: string; fullName: string };
  /** Название задания, методики, контрольной точки или тема консультации. */
  title: string | null;
  /** Назначение задания для перехода к проверке (только SUBMISSION, ответ ещё на проверке). */
  reviewId: string | null;
  /** Обращение ещё не рассмотрено (QUESTION, DIFFICULTY_REPORT, CONSULTATION_REQUEST). */
  open: boolean;
}

export type DashboardUpcomingKind = 'CHECKPOINT' | 'CONSULTATION';

/** Предстоящее событие: контрольная точка маршрута или назначенная консультация. */
export interface DashboardUpcomingDto {
  kind: DashboardUpcomingKind;
  id: string;
  /** Дата `YYYY-MM-DD` у контрольной точки, момент ISO у консультации. */
  date: string;
  title: string;
  /** Этап маршрута контрольной точки. */
  stageTitle: string | null;
  trajectoryId: string | null;
  student: { id: string; fullName: string };
  discipline: string | null;
}

export interface DashboardDto {
  period: MonitoringPeriodDto;
  cards: DashboardCardsDto;
  /** Пусто — нет маршрутов в работе. */
  stages: DashboardStageBarDto[];
  profiles: ProfileDistributionDto;
  recentAssignments: DashboardRecentAssignmentDto[];
  activity: DashboardActivityDto[];
  upcoming: DashboardUpcomingDto[];
}

// ── Главная студента (п. 6.5) ──

/** «Моя текущая цель»: текущий этап маршрута, который выполняется. */
export interface StudentGoal {
  trajectoryId: string;
  discipline: string;
  stage: { id: string; title: string; position: number } | null;
  stagesTotal: number;
  goal: string | null;
  progress: AssignmentProgress;
}

/** «Что выполнить сейчас»: задание, набор на выбор или диагностика. */
export interface StudentTodo {
  kind: 'ASSIGNMENT' | 'CHOICE' | 'DIAGNOSTIC';
  id: string;
  title: string;
  status: AssignmentStatus | null;
  dueAt: string | null;
}

export interface StudentAchievements {
  completedTrajectories: CabinetTrajectoryDto[];
  completedStages: { id: string; title: string; discipline: string; endDate: string | null }[];
  passedCheckpoints: { id: string; title: string; stage: string; discipline: string }[];
  completedAssignments: StudentAssignmentDto[];
  completedDiagnostics: CabinetDiagnosticDto[];
}

const OPEN_TRAJECTORY: readonly TrajectoryStatus[] = ['ACTIVE', 'NEEDS_CORRECTION'];
const TODO_ASSIGNMENT: readonly AssignmentStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'RETURNED'];
const byDue = (a: { dueAt: string | null }, b: { dueAt: string | null }) =>
  (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999');

/** Текущие цели — по маршруту в работе: этап, отмеченный текущим, иначе первый незавершённый. */
export function studentGoals(trajectories: readonly CabinetTrajectoryDto[]): StudentGoal[] {
  return trajectories
    .filter((item) => OPEN_TRAJECTORY.includes(item.status))
    .map((item) => {
      const stages = [...item.stages].sort((a, b) => a.sortOrder - b.sortOrder);
      const current = stages.findIndex((stage) => stage.id === item.currentStageId);
      const index =
        current >= 0 ? current : stages.findIndex((stage) => stage.status !== 'COMPLETED');
      const stage = index >= 0 ? stages[index]! : null;
      return {
        trajectoryId: item.id,
        discipline: item.discipline.name,
        stage: stage ? { id: stage.id, title: stage.title, position: index + 1 } : null,
        stagesTotal: stages.length,
        goal: stage?.goal ?? item.goals,
        progress: assignmentProgress(stage?.assignments ?? []),
      };
    });
}

/**
 * Что выполнить сейчас: текущие задания (с доработкой), невыбранные наборы и доступная
 * диагностика — по сроку, без срока в конце.
 */
export function studentTodos(
  data: {
    assignments: readonly StudentAssignmentDto[];
    choices: readonly { id: string; title: string; options: readonly StudentAssignmentDto[] }[];
    diagnostics: readonly CabinetDiagnosticDto[];
  },
  now: Date = new Date(),
): StudentTodo[] {
  const open = (item: CabinetDiagnosticDto) =>
    (item.status === 'ASSIGNED' || item.status === 'IN_PROGRESS') &&
    (!item.startsAt || new Date(item.startsAt) <= now) &&
    (!item.endsAt || new Date(item.endsAt) >= now);
  return [
    ...data.assignments
      .filter((item) => TODO_ASSIGNMENT.includes(item.status))
      .map((item) => ({
        kind: 'ASSIGNMENT' as const,
        id: item.id,
        title: item.assignment.title,
        status: item.status,
        dueAt: item.dueAt,
      })),
    ...data.choices.map((item) => ({
      kind: 'CHOICE' as const,
      id: item.id,
      title: item.title,
      status: null,
      dueAt: [...item.options].sort(byDue)[0]?.dueAt ?? null,
    })),
    ...data.diagnostics.filter(open).map((item) => ({
      kind: 'DIAGNOSTIC' as const,
      id: item.id,
      title: item.title,
      status: null,
      dueAt: item.endsAt,
    })),
  ].sort(byDue);
}

/** «Мои достижения»: завершённые маршруты и этапы, пройденные точки, выполненные задания, диагностика. */
export function studentAchievements(data: {
  trajectories: readonly CabinetTrajectoryDto[];
  assignments: readonly StudentAssignmentDto[];
  diagnostics: readonly CabinetDiagnosticDto[];
}): StudentAchievements {
  const stages = data.trajectories.flatMap((trajectory) =>
    [...trajectory.stages]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((stage) => ({ stage, discipline: trajectory.discipline.name })),
  );
  return {
    completedTrajectories: data.trajectories.filter((item) => item.status === 'COMPLETED'),
    completedStages: stages
      .filter(({ stage }) => stage.status === 'COMPLETED')
      .map(({ stage, discipline }) => ({
        id: stage.id,
        title: stage.title,
        discipline,
        endDate: stage.endDate,
      })),
    passedCheckpoints: stages.flatMap(({ stage, discipline }) =>
      stage.checkpoints
        .filter((item) => item.status === 'PASSED')
        .map((item) => ({ id: item.id, title: item.title, stage: stage.title, discipline })),
    ),
    completedAssignments: data.assignments
      .filter((item) => item.status === 'COMPLETED')
      .sort((a, b) => (b.result?.assessedAt ?? '').localeCompare(a.result?.assessedAt ?? '')),
    completedDiagnostics: data.diagnostics
      .filter((item) => item.status === 'COMPLETED')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
  };
}

/** Преподаватели маршрутов студента — к кому обращаться за помощью (без повторов). */
export function studentTeachers(trajectories: readonly CabinetTrajectoryDto[]): PersonRef[] {
  const teachers = new Map<string, PersonRef>();
  for (const item of trajectories) {
    if (item.teacher && OPEN_TRAJECTORY.includes(item.status)) {
      teachers.set(item.teacher.id, item.teacher);
    }
  }
  return [...teachers.values()];
}
