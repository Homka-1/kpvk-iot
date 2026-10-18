// Мониторинг выполнения ИОТ (ТЗ, п. 4.8; FR-056–FR-062; UC-05, AT-08).
// Правила — чистые функции: пропущенная контрольная точка, недели графика динамики, средний
// результат. Учебная активность (сдача заданий, оценки) и результаты психолого-педагогической
// диагностики считаются раздельно (FR-062); отсутствие входа в систему не учитывается вовсе.
import {
  type CheckpointStatus,
  FeedbackKind,
  type MeasurementType,
  type SupportStatus,
  type StageStatus,
  type TrajectoryStatus,
} from './enums.js';
import type { AssignmentProgress } from './submissions.js';
import type {
  TrajectoryCheckpointDto,
  TrajectoryStudentRef,
  TrajectoryVersionSummaryDto,
} from './trajectories.js';

/** Сколько недель показывает график динамики, если период не выбран. */
export const MONITORING_DEFAULT_WEEKS = 12;
/** Предел недель на графике: длинный период сворачивается к последним неделям. */
export const MONITORING_MAX_WEEKS = 53;
/** Предел строк мониторинга за один запрос; при превышении нужно сузить фильтр. */
export const MONITORING_ROWS_LIMIT = 500;
export const SUPPORT_REASON_MAX = 1000;

/** Обращения студента за помощью (п. 4.8): вопросы и сообщения о затруднениях. */
export const HELP_REQUEST_KINDS: readonly FeedbackKind[] = [
  FeedbackKind.QUESTION,
  FeedbackKind.DIFFICULTY_REPORT,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Пропущенная контрольная точка (FR-058): отмечена пропущенной или её дата прошла, а точка
 * не отмечена пройденной. `today` — `YYYY-MM-DD`; в день контрольной точки она ещё не пропущена.
 */
export function isCheckpointMissed(
  checkpoint: { status: CheckpointStatus; dueDate: string | null },
  today: string,
): boolean {
  if (checkpoint.status === 'MISSED') return true;
  return (
    checkpoint.status === 'PENDING' && checkpoint.dueDate !== null && checkpoint.dueDate < today
  );
}

/** Понедельник недели даты `YYYY-MM-DD`. */
export function weekStart(date: string): string {
  const time = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const weekday = (new Date(time).getUTCDay() + 6) % 7;
  return new Date(time - weekday * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Недели графика динамики (FR-059) — понедельники от недели `from` до недели `to`.
 * Слишком длинный период сокращается до последних `MONITORING_MAX_WEEKS` недель.
 */
export function weekBuckets(from: string, to: string): string[] {
  const first = Date.parse(`${weekStart(from)}T00:00:00Z`);
  const last = Date.parse(`${weekStart(to)}T00:00:00Z`);
  const weeks: string[] = [];
  for (let time = last; time >= first && weeks.length < MONITORING_MAX_WEEKS; time -= 7 * DAY_MS) {
    weeks.unshift(new Date(time).toISOString().slice(0, 10));
  }
  return weeks;
}

/**
 * Средний результат в процентах от максимума (одна цифра после запятой). Нет оценок — null
 * («Нет данных», а не 0 %; FR-005).
 */
export function averagePercent(
  results: readonly { score: number; maxScore: number }[],
): number | null {
  const counted = results.filter((item) => item.maxScore > 0);
  if (counted.length === 0) return null;
  const sum = counted.reduce((total, item) => total + (item.score / item.maxScore) * 100, 0);
  return Math.round((sum / counted.length) * 10) / 10;
}

/** Среднее непустых значений (одна цифра после запятой); пусто — null. */
export function averageOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10;
}

// ── Контракты API ──

export interface MonitoringStudentRef extends TrajectoryStudentRef {
  supportStatus: SupportStatus;
}

/** Показатели одной ИОТ (п. 4.8). Пропуски — null, а не 0 (FR-005). */
export interface MonitoringRowDto {
  trajectoryId: string;
  status: TrajectoryStatus;
  version: number;
  student: MonitoringStudentRef;
  discipline: { id: string; name: string };
  /** Доля выполненных заданий и прогресс в процентах (FR-056). */
  progress: AssignmentProgress;
  /** Выполнение образовательных целей: завершённые этапы маршрута. */
  stages: { total: number; completed: number };
  /** Достижение контрольных точек. */
  checkpoints: { total: number; passed: number; missed: number };
  /** Академическая успешность за период: средний результат проверенных заданий, %. */
  averageScore: number | null;
  scoredCount: number;
  /** Учебная активность за период: отправленные ответы (не входы в систему, FR-062). */
  activity: { submissions: number; lastSubmissionAt: string | null };
  /** Обращения за помощью за период. */
  helpRequests: number;
  /** Количество корректировок маршрута (версии после первой). */
  corrections: number;
  /** Психолого-педагогическая диагностика — отдельно от учебной активности (FR-062). */
  diagnostics: {
    completed: number;
    lastCompletedAt: string | null;
    lastMeasurementType: MeasurementType | null;
  };
}

export type MonitoringWarningKind = 'OVERDUE_ASSIGNMENT' | 'MISSED_CHECKPOINT';

/** Предупреждение о просроченном задании или пропущенной контрольной точке (FR-058). */
export interface MonitoringWarningDto {
  kind: MonitoringWarningKind;
  trajectoryId: string;
  student: { id: string; fullName: string };
  discipline: string;
  stageTitle: string | null;
  title: string;
  /** Срок: момент ISO у задания, дата `YYYY-MM-DD` у контрольной точки. */
  dueAt: string;
}

/** Точка графика динамики (FR-059): неделя с понедельника. */
export interface MonitoringDynamicsPointDto {
  weekStart: string;
  /** Принятые задания за неделю. */
  completedAssignments: number;
  /** Отправленные ответы за неделю. */
  submissions: number;
  /** Средний результат оценённых за неделю заданий, %; оценок нет — null. */
  averageScore: number | null;
}

export interface MonitoringSummaryDto {
  trajectories: number;
  /** Средний прогресс по маршрутам, где есть задания; заданий нет нигде — null. */
  averageProgress: number | null;
  overdueAssignments: number;
  missedCheckpoints: number;
  /** Студенты с отметкой о дополнительном сопровождении или особом внимании (FR-060). */
  needsSupport: number;
  needsCorrection: number;
}

export interface MonitoringPeriodDto {
  /** Границы периода `YYYY-MM-DD`; null — без ограничения. */
  from: string | null;
  to: string | null;
}

export interface MonitoringDto {
  period: MonitoringPeriodDto;
  summary: MonitoringSummaryDto;
  rows: MonitoringRowDto[];
  warnings: MonitoringWarningDto[];
  dynamics: MonitoringDynamicsPointDto[];
  /** Строк больше предела — показаны первые `MONITORING_ROWS_LIMIT`, нужно сузить фильтр. */
  truncated: boolean;
}

export interface MonitoringStageDto {
  id: string;
  title: string;
  status: StageStatus;
  startDate: string | null;
  endDate: string | null;
  progress: AssignmentProgress;
  checkpoints: (TrajectoryCheckpointDto & { missed: boolean })[];
}

/** Оценённое задание — точка динамики академической успешности студента. */
export interface MonitoringResultDto {
  recordedAt: string;
  title: string | null;
  score: number;
  maxScore: number;
  percent: number;
}

/** Мониторинг одной ИОТ: показатели, этапы, предупреждения, динамика, корректировки. */
export interface MonitoringDetailDto {
  period: MonitoringPeriodDto;
  row: MonitoringRowDto;
  stages: MonitoringStageDto[];
  warnings: MonitoringWarningDto[];
  results: MonitoringResultDto[];
  dynamics: MonitoringDynamicsPointDto[];
  versions: TrajectoryVersionSummaryDto[];
}

/** Отметка о необходимости дополнительного сопровождения (FR-060). */
export interface SupportStatusDto {
  studentId: string;
  supportStatus: SupportStatus;
}
