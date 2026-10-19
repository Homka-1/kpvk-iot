// Аналитика преподавателя (ТЗ, п. 4.10; FR-069, FR-070, FR-073, FR-074): семь видов отчётов
// раздела «Аналитика» по студентам области пользователя. Расчёты — чистые функции.
import type { ScaleResultDto } from './diagnostic-sessions.js';
import { MeasurementType, type TrajectoryStatus } from './enums.js';
import type { MonitoringDynamicsPointDto, MonitoringPeriodDto } from './monitoring.js';
import type { ProfileDistributionDto } from './motivation-profiles.js';
import { type DescriptiveStats, descriptiveStats } from './statistics.js';
import type { GroupRef } from './students.js';

/** Строк в таблице результативности заданий: самые часто назначаемые. */
export const ANALYTICS_ASSIGNMENTS_LIMIT = 20;

// ── Сравнение групп (FR-070) ──

/** Показатель по всем наблюдениям и отдельно по каждой учебной группе. */
export interface GroupComparisonDto {
  total: DescriptiveStats;
  groups: { group: GroupRef; stats: DescriptiveStats }[];
}

/**
 * Таблица сравнения групп: статистики по всем наблюдениям и по каждой учебной группе
 * (группы по названию). Наблюдения без группы входят только в общий итог.
 */
export function compareGroups<T>(
  items: readonly T[],
  groupOf: (item: T) => GroupRef | null,
  valueOf: (item: T) => number | null,
): GroupComparisonDto {
  const byGroup = new Map<string, { group: GroupRef; values: (number | null)[] }>();
  for (const item of items) {
    const group = groupOf(item);
    if (!group) continue;
    const entry = byGroup.get(group.id) ?? { group, values: [] };
    entry.values.push(valueOf(item));
    byGroup.set(group.id, entry);
  }
  return {
    total: descriptiveStats(items.map(valueOf)),
    groups: [...byGroup.values()]
      .sort((a, b) => a.group.name.localeCompare(b.group.name, 'ru'))
      .map((entry) => ({ group: entry.group, stats: descriptiveStats(entry.values) })),
  };
}

// ── Динамика и сравнение до/после сопровождения по диагностике ──

/** Завершённое прохождение студента — исходные данные аналитики мотивации. */
export interface MotivationSessionInput {
  studentId: string;
  measurementType: MeasurementType;
  completedAt: string;
  scores: ScaleResultDto[];
}

export interface MotivationScaleAnalyticsDto {
  code: string;
  name: string;
  /** Статистики по типам замеров (первичный, промежуточный, повторный), где есть прохождения. */
  measurements: { measurementType: MeasurementType; stats: DescriptiveStats }[];
  /**
   * До и после сопровождения: разность «повторный − первичный» у студентов, прошедших оба замера.
   * `missing` — студенты, у которых одного из значений нет. null — повторных замеров нет.
   */
  change: DescriptiveStats | null;
}

const MEASUREMENT_ORDER: readonly MeasurementType[] = [
  MeasurementType.PRIMARY,
  MeasurementType.INTERMEDIATE,
  MeasurementType.REPEATED,
];

/**
 * Статистики шкал по типам замеров и изменение «до и после» (п. 4.10). От каждого студента —
 * одно значение на тип замера: самый ранний первичный, самые поздние промежуточный и повторный
 * (повторный — только после первичного). Пропуск балла — пропуск, не ноль (FR-074).
 */
export function buildMotivationAnalytics(
  scales: readonly { code: string; name: string }[],
  sessions: readonly MotivationSessionInput[],
): MotivationScaleAnalyticsDto[] {
  const byStudent = new Map<string, MotivationSessionInput[]>();
  for (const session of sessions) {
    const list = byStudent.get(session.studentId) ?? [];
    list.push(session);
    byStudent.set(session.studentId, list);
  }
  const picked = [...byStudent.values()].map((list) => {
    const ordered = [...list].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    const primary = ordered.find((item) => item.measurementType === MeasurementType.PRIMARY);
    const latest = (type: MeasurementType) =>
      ordered
        .filter(
          (item) =>
            item.measurementType === type && (!primary || item.completedAt > primary.completedAt),
        )
        .at(-1);
    return {
      PRIMARY: primary,
      INTERMEDIATE: latest(MeasurementType.INTERMEDIATE),
      REPEATED: latest(MeasurementType.REPEATED),
    } as Record<MeasurementType, MotivationSessionInput | undefined>;
  });
  const scoreOf = (session: MotivationSessionInput | undefined, code: string) =>
    session?.scores.find((score) => score.code === code)?.rawScore ?? null;

  return scales.map((scale) => {
    const measurements = MEASUREMENT_ORDER.flatMap((type) => {
      const taken = picked.filter((student) => student[type]);
      return taken.length === 0
        ? []
        : [
            {
              measurementType: type,
              stats: descriptiveStats(taken.map((student) => scoreOf(student[type], scale.code))),
            },
          ];
    });
    const withRepeated = picked.filter((student) => student.REPEATED);
    const change =
      withRepeated.length === 0
        ? null
        : descriptiveStats(
            picked
              .filter((student) => student.PRIMARY || student.REPEATED)
              .map((student) => {
                const before = scoreOf(student.PRIMARY, scale.code);
                const after = scoreOf(student.REPEATED, scale.code);
                return before === null || after === null ? null : after - before;
              }),
          );
    return { code: scale.code, name: scale.name, measurements, change };
  });
}

/** Версия методики, по которой можно построить аналитику: есть завершённые прохождения. */
export interface AnalyticsQuestionnaireOptionDto {
  versionId: string;
  questionnaireId: string;
  title: string;
  versionNumber: number;
  isDemo: boolean;
}

export interface MotivationAnalyticsDto {
  options: AnalyticsQuestionnaireOptionDto[];
  /** Выбранная версия; в расчёт входят и версии, сопоставимость которых с ней утверждена. */
  selected: (AnalyticsQuestionnaireOptionDto & { comparableVersions: number[] }) | null;
  /** Завершённые прохождения в расчёте. */
  completed: number;
  /** Назначенные, но не завершённые прохождения: исключены из расчёта (FR-073). */
  incomplete: number;
  scales: MotivationScaleAnalyticsDto[];
}

// ── Результативность заданий ──

export interface AssignmentEffectivenessDto {
  assignmentId: string;
  title: string;
  discipline: string;
  /** Назначений студентам (без отменённых). */
  assigned: number;
  /** Назначений, по которым есть хотя бы одна сдача. */
  submitted: number;
  /** Принятых. */
  completed: number;
  /** Возвращённых на доработку попыток. */
  returned: number;
  /** Результат принятых, % от максимума; без оценки — пропуск. */
  score: DescriptiveStats;
}

// ── Ответ API ──

export interface AnalyticsDto {
  period: MonitoringPeriodDto;
  /** Выполнение ИОТ: маршруты по статусам, прогресс % и доля завершённых этапов %. */
  trajectories: {
    statuses: Partial<Record<TrajectoryStatus, number>>;
    progress: GroupComparisonDto;
    stagesCompleted: GroupComparisonDto;
  };
  /** Академическая успешность: средний результат проверенных заданий маршрута, %. */
  academic: { averageScore: GroupComparisonDto };
  /** Учебная активность: сданные ответы и обращения за помощью (входы не учитываются, FR-062). */
  activity: {
    submissions: GroupComparisonDto;
    helpRequests: GroupComparisonDto;
  };
  /** Динамика по неделям (как в мониторинге): принятые задания, ответы, средний результат. */
  dynamics: MonitoringDynamicsPointDto[];
  /** Распределение мотивационных профилей: все студенты и по группам. */
  profiles: {
    total: ProfileDistributionDto;
    groups: { group: GroupRef; distribution: ProfileDistributionDto }[];
  };
  assignments: AssignmentEffectivenessDto[];
  motivation: MotivationAnalyticsDto;
  /** Маршрутов больше предела мониторинга — показатели ИОТ по первым из них. */
  truncated: boolean;
}
