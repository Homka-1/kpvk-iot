// Индивидуальные образовательные траектории (ТЗ, п. 4.6; FR-034–FR-039, FR-045; UC-03).
// Конечный автомат статусов, стандартный пятиэтапный шаблон, предложение шаблона по профилю
// и проверка маршрута перед утверждением — чистые функции: их применяют и сервер, и интерфейс.
// Система предлагает шаблон, утверждает маршрут только преподаватель с правом (FR-039).
import {
  type AssignmentStatus,
  type CheckpointStatus,
  type DifficultyLevel,
  type MaterialKind,
  type MotivationLevel,
  type StageStatus,
  TrajectoryStatus,
} from './enums.js';
import type { GroupRef, PersonRef } from './students.js';

export const TRAJECTORY_TEXT_MAX = 4000;
export const TRAJECTORY_TITLE_MAX = 300;
export const TRAJECTORY_REASON_MAX = 1000;
export const TRAJECTORY_STAGES_MAX = 10;
export const STAGE_CHECKPOINTS_MAX = 5;
export const STAGE_MATERIALS_MAX = 30;
export const STAGE_ASSIGNMENTS_MAX = 30;

// ── Статусы (п. 4.6; docs/architecture/data-model.md, п. 3.4) ──

/**
 * Допустимые переходы статуса ИОТ. «На утверждении» — только при дополнительном согласовании;
 * обязательный утверждающий — преподаватель (п. 4.6). Переходы активной ИОТ (корректировка,
 * завершение) используются с этапа 14.
 */
export const TRAJECTORY_TRANSITIONS: Readonly<
  Record<TrajectoryStatus, readonly TrajectoryStatus[]>
> = {
  DRAFT: [TrajectoryStatus.PENDING_APPROVAL, TrajectoryStatus.ACTIVE, TrajectoryStatus.ARCHIVED],
  PENDING_APPROVAL: [TrajectoryStatus.ACTIVE, TrajectoryStatus.DRAFT],
  ACTIVE: [TrajectoryStatus.NEEDS_CORRECTION, TrajectoryStatus.COMPLETED],
  NEEDS_CORRECTION: [TrajectoryStatus.ACTIVE],
  COMPLETED: [TrajectoryStatus.ARCHIVED],
  ARCHIVED: [],
};

export function canTransition(from: TrajectoryStatus, to: TrajectoryStatus): boolean {
  return TRAJECTORY_TRANSITIONS[from].includes(to);
}

/** Статусы, в которых содержимое маршрута редактируется без новой версии. */
export const TRAJECTORY_EDITABLE_STATUSES: readonly TrajectoryStatus[] = [TrajectoryStatus.DRAFT];

/** Статусы действующего маршрута: у студента не более одного такого по дисциплине (FR-045). */
export const TRAJECTORY_CURRENT_STATUSES: readonly TrajectoryStatus[] = [
  TrajectoryStatus.DRAFT,
  TrajectoryStatus.PENDING_APPROVAL,
  TrajectoryStatus.ACTIVE,
  TrajectoryStatus.NEEDS_CORRECTION,
];

// ── Шаблоны (FR-034, FR-035) ──

export interface TemplateStageContent {
  title: string;
  goal: string | null;
  description: string | null;
  plannedResults: string | null;
  durationDays: number | null;
}

/** Пятиэтапная модель — дословно п. 4.6 ТЗ. Преподаватель адаптирует содержание и сроки. */
export const STANDARD_TRAJECTORY_STAGES: readonly TemplateStageContent[] = [
  {
    title: 'Адаптационный',
    goal: 'Знакомство с образовательными задачами, выявление затруднений, постановка достижимых целей',
    description: null,
    plannedResults: null,
    durationDays: null,
  },
  {
    title: 'Развитие учебной самостоятельности',
    goal: 'Планирование деятельности, выбор заданий, освоение способов самоконтроля',
    description: null,
    plannedResults: null,
    durationDays: null,
  },
  {
    title: 'Практико-ориентированная деятельность',
    goal: 'Решение профессиональных и прикладных задач',
    description: null,
    plannedResults: null,
    durationDays: null,
  },
  {
    title: 'Проектная деятельность',
    goal: 'Индивидуальные или групповые проекты, представление результатов',
    description: null,
    plannedResults: null,
    durationDays: null,
  },
  {
    title: 'Профессиональное развитие',
    goal: 'Самооценка компетенций, дальнейшее образовательное планирование, развитие профессиональных интересов',
    description: null,
    plannedResults: null,
    durationDays: null,
  },
];

export interface TrajectoryTemplateDto {
  id: string;
  title: string;
  description: string | null;
  /** Профиль, для которого шаблон предлагается; null — стандартный или общий шаблон. */
  motivationLevel: MotivationLevel | null;
  isStandard: boolean;
  stages: TemplateStageContent[];
}

/**
 * Предложение шаблона по утверждённому профилю (FR-035): шаблон этого уровня, иначе стандартный.
 * Это подсказка: преподаватель может выбрать другой шаблон или начать с нуля.
 */
export function suggestTemplate<
  T extends Pick<TrajectoryTemplateDto, 'motivationLevel' | 'isStandard'>,
>(templates: readonly T[], level: MotivationLevel | null): T | null {
  return (
    (level ? templates.find((template) => template.motivationLevel === level) : undefined) ??
    templates.find((template) => template.isStandard) ??
    null
  );
}

// ── Содержимое маршрута (FR-036, FR-037) ──

export interface CheckpointContent {
  id?: string | null;
  title: string;
  description?: string | null;
  /** Дата `YYYY-MM-DD`. */
  dueDate?: string | null;
}

export interface StageAssignmentContent {
  /** id назначения (trajectory_assignments); у нового — пусто. */
  id?: string | null;
  /** Задание библиотеки. */
  assignmentId: string;
  /** Срок сдачи — момент времени ISO 8601 (конец выбранного дня по местному времени). */
  dueAt?: string | null;
}

export interface StageContent {
  id?: string | null;
  title: string;
  goal?: string | null;
  description?: string | null;
  plannedResults?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  checkpoints: CheckpointContent[];
  materialIds: string[];
  assignments: StageAssignmentContent[];
}

/** Редактируемое содержимое ИОТ: паспорт и этапы. */
export interface TrajectoryContent {
  goals?: string | null;
  plannedResults?: string | null;
  supportMethods?: string | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
  stages: StageContent[];
}

export interface TrajectoryIssue {
  /** Путь к полю: `goals`, `stages.1.endDate`, `stages.0.checkpoints.0.dueDate`. */
  path: string;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const blank = (value: string | null | undefined) => !value || value.trim() === '';

/** Дата `YYYY-MM-DD` момента `iso` по местному времени. */
function localDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Проверка маршрута. Режим `draft` — только то, без чего черновик противоречив (порядок дат,
 * названия). Режим `approve` — ещё и полнота паспорта и этапов перед утверждением (FR-038, FR-039).
 * Даты сравниваются строками `YYYY-MM-DD`.
 */
export function trajectoryIssues(
  content: TrajectoryContent,
  mode: 'draft' | 'approve',
): TrajectoryIssue[] {
  const issues: TrajectoryIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const strict = mode === 'approve';
  const { startDate, plannedEndDate } = content;

  if (strict && blank(content.goals)) add('goals', 'Укажите образовательные цели');
  if (strict && !startDate) add('startDate', 'Укажите дату начала');
  if (strict && !plannedEndDate) add('plannedEndDate', 'Укажите планируемую дату завершения');
  if (startDate && plannedEndDate && plannedEndDate < startDate) {
    add('plannedEndDate', 'Дата завершения раньше даты начала');
  }
  if (content.stages.length === 0) {
    if (strict) add('stages', 'Добавьте хотя бы один этап');
  }

  let previousEnd: string | null = null;
  content.stages.forEach((stage, index) => {
    const at = `stages.${index}`;
    const number = index + 1;
    if (blank(stage.title)) add(`${at}.title`, `Этап ${number}: укажите название`);
    if (strict && blank(stage.goal)) add(`${at}.goal`, `Этап ${number}: укажите цель`);
    if (strict && !stage.startDate) add(`${at}.startDate`, `Этап ${number}: укажите дату начала`);
    if (strict && !stage.endDate) add(`${at}.endDate`, `Этап ${number}: укажите дату окончания`);
    if (stage.startDate && stage.endDate && stage.endDate < stage.startDate) {
      add(`${at}.endDate`, `Этап ${number}: дата окончания раньше даты начала`);
    }
    if (stage.startDate && startDate && stage.startDate < startDate) {
      add(`${at}.startDate`, `Этап ${number} начинается раньше маршрута`);
    }
    if (stage.endDate && plannedEndDate && stage.endDate > plannedEndDate) {
      add(`${at}.endDate`, `Этап ${number} заканчивается позже маршрута`);
    }
    if (stage.startDate && previousEnd && stage.startDate < previousEnd) {
      add(`${at}.startDate`, `Этап ${number} начинается раньше окончания предыдущего этапа`);
    }
    previousEnd = stage.endDate ?? previousEnd;

    stage.checkpoints.forEach((checkpoint, item) => {
      const path = `${at}.checkpoints.${item}`;
      if (blank(checkpoint.title)) {
        add(`${path}.title`, `Этап ${number}: укажите название контрольной точки`);
      }
      if (strict && !checkpoint.dueDate) {
        add(`${path}.dueDate`, `Этап ${number}: укажите дату контрольной точки`);
      }
      const due = checkpoint.dueDate;
      if (
        due &&
        ((stage.startDate && due < stage.startDate) || (stage.endDate && due > stage.endDate))
      ) {
        add(`${path}.dueDate`, `Этап ${number}: контрольная точка вне сроков этапа`);
      }
    });

    stage.assignments.forEach((assignment, item) => {
      const path = `${at}.assignments.${item}.dueAt`;
      if (strict && !assignment.dueAt) add(path, `Этап ${number}: укажите срок задания`);
      if (!assignment.dueAt) return;
      const due = localDate(assignment.dueAt);
      if ((stage.startDate && due < stage.startDate) || (stage.endDate && due > stage.endDate)) {
        add(path, `Этап ${number}: срок задания вне сроков этапа`);
      }
    });
  });
  return issues;
}

/** Длительность в днях между датами `YYYY-MM-DD` включительно; без дат — null. */
export function stageDurationDays(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
}

// ── Контракты API ──

export interface TrajectoryProfileRef {
  id: string;
  level: MotivationLevel;
  decidedAt: string;
}

export interface TrajectoryStudentRef {
  id: string;
  fullName: string;
  participantCode: string;
  group: GroupRef | null;
}

export interface StageMaterialDto {
  id: string;
  title: string;
  kind: MaterialKind;
  archived: boolean;
}

export interface StageAssignmentDto {
  id: string;
  assignment: {
    id: string;
    title: string;
    typeName: string;
    difficulty: DifficultyLevel;
    archived: boolean;
  };
  dueAt: string | null;
  status: AssignmentStatus;
}

export interface TrajectoryCheckpointDto {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: CheckpointStatus;
}

export interface TrajectoryStageDto {
  id: string;
  sortOrder: number;
  title: string;
  goal: string | null;
  description: string | null;
  plannedResults: string | null;
  startDate: string | null;
  endDate: string | null;
  status: StageStatus;
  checkpoints: TrajectoryCheckpointDto[];
  materials: StageMaterialDto[];
  assignments: StageAssignmentDto[];
}

export interface TrajectoryVersionSummaryDto {
  versionNumber: number;
  status: TrajectoryStatus;
  reason: string | null;
  createdBy: PersonRef | null;
  createdAt: string;
}

/** Паспорт ИОТ (п. 4.6) с этапами. */
export interface TrajectoryDto {
  id: string;
  status: TrajectoryStatus;
  /** Номер последней зафиксированной версии; 0 — маршрут ещё не утверждался. */
  version: number;
  student: TrajectoryStudentRef;
  discipline: { id: string; name: string };
  teacher: PersonRef | null;
  template: { id: string; title: string } | null;
  /** Профиль на момент назначения (при утверждении) или текущий утверждённый для черновика. */
  motivationProfile: TrajectoryProfileRef | null;
  goals: string | null;
  plannedResults: string | null;
  supportMethods: string | null;
  startDate: string | null;
  plannedEndDate: string | null;
  currentStageId: string | null;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  /** Метка редакции: передаётся при сохранении и утверждении, чтобы не затереть чужие изменения. */
  updatedAt: string;
  stages: TrajectoryStageDto[];
  versions: TrajectoryVersionSummaryDto[];
}

/** Неизменяемый снимок версии (trajectory_versions.snapshot). */
export type TrajectorySnapshot = Omit<TrajectoryDto, 'versions'>;

export interface TrajectorySummaryDto {
  id: string;
  status: TrajectoryStatus;
  version: number;
  student: TrajectoryStudentRef;
  discipline: { id: string; name: string };
  teacher: PersonRef | null;
  startDate: string | null;
  plannedEndDate: string | null;
  stageCount: number;
  updatedAt: string;
}

export interface TrajectoryPageDto {
  items: TrajectorySummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** Данные для начала конструктора (UC-03): дисциплины, профиль, шаблоны и предложение. */
export interface TrajectoryOptionsDto {
  student: TrajectoryStudentRef;
  /** Последний утверждённый профиль; null — профиль не утверждался. */
  profile: TrajectoryProfileRef | null;
  /** Дисциплины, которые пользователь ведёт в группе студента. */
  disciplines: { id: string; name: string; currentTrajectoryId: string | null }[];
  templates: TrajectoryTemplateDto[];
  suggestedTemplateId: string | null;
  /** Причина, по которой ИОТ создать нельзя (например, контрольная группа исследования). */
  blockedReason: string | null;
}
