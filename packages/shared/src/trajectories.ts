// Индивидуальные образовательные траектории (ТЗ, п. 4.6; FR-034–FR-039, FR-045; UC-03).
// Конечный автомат статусов, стандартный пятиэтапный шаблон, предложение шаблона по профилю
// и проверка маршрута перед утверждением — чистые функции: их применяют и сервер, и интерфейс.
// Система предлагает шаблон, утверждает маршрут только преподаватель с правом (FR-039).
import {
  type AssignmentStatus,
  type CheckpointStatus,
  DifficultyLevel,
  type MaterialKind,
  type MotivationLevel,
  type StageStatus,
  TrajectoryStatus,
} from './enums.js';
import type { RouteProposalDto } from './student-assignments.js';
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
 * обязательный утверждающий — преподаватель (п. 4.6). Активная ИОТ отмечается «Требует
 * корректировки» по итогам мониторинга, корректируется новой версией (UC-05) и завершается
 * с итоговой оценкой (FR-044). Корректировка оставляет статус «Активна», поэтому это не переход.
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

/**
 * Статусы, в которых утверждённый маршрут корректируется (FR-043, UC-05): каждая корректировка
 * создаёт новую версию с причиной, прежняя версия сохраняется, маршрут снова «Активна».
 */
export const TRAJECTORY_CORRECTABLE_STATUSES: readonly TrajectoryStatus[] = [
  TrajectoryStatus.ACTIVE,
  TrajectoryStatus.NEEDS_CORRECTION,
];

/** Итоговая оценка достижения целей при завершении маршрута (FR-044). */
export const TRAJECTORY_FINAL_ASSESSMENT_MAX = 4000;

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
  /**
   * Рекомендуемая сложность заданий этапа: по ней изначально фильтруется выбор заданий
   * в конструкторе. Это подсказка, а не ограничение (FR-033); null — без рекомендации.
   */
  recommendedDifficulty: DifficultyLevel | null;
}

/** Пятиэтапная модель — дословно п. 4.6 ТЗ. Преподаватель адаптирует содержание и сроки. */
export const STANDARD_TRAJECTORY_STAGES: readonly TemplateStageContent[] = [
  {
    title: 'Адаптационный',
    goal: 'Знакомство с образовательными задачами, выявление затруднений, постановка достижимых целей',
    description: null,
    plannedResults: null,
    durationDays: null,
    recommendedDifficulty: null,
  },
  {
    title: 'Развитие учебной самостоятельности',
    goal: 'Планирование деятельности, выбор заданий, освоение способов самоконтроля',
    description: null,
    plannedResults: null,
    durationDays: null,
    recommendedDifficulty: null,
  },
  {
    title: 'Практико-ориентированная деятельность',
    goal: 'Решение профессиональных и прикладных задач',
    description: null,
    plannedResults: null,
    durationDays: null,
    recommendedDifficulty: null,
  },
  {
    title: 'Проектная деятельность',
    goal: 'Индивидуальные или групповые проекты, представление результатов',
    description: null,
    plannedResults: null,
    durationDays: null,
    recommendedDifficulty: null,
  },
  {
    title: 'Профессиональное развитие',
    goal: 'Самооценка компетенций, дальнейшее образовательное планирование, развитие профессиональных интересов',
    description: null,
    plannedResults: null,
    durationDays: null,
    recommendedDifficulty: null,
  },
];

const { BASIC, INTERMEDIATE, ADVANCED } = DifficultyLevel;

/**
 * Рекомендуемая сложность заданий по этапам шаблонов уровней профиля (п. 4.5): низкий —
 * достижимые цели и пошаговая работа, средний — постепенное усложнение, высокий — задания
 * повышенной сложности. Индекс — номер этапа пятиэтапной модели (п. 4.6).
 */
export const PROFILE_STAGE_DIFFICULTY: Record<MotivationLevel, readonly DifficultyLevel[]> = {
  LOW: [BASIC, BASIC, BASIC, INTERMEDIATE, INTERMEDIATE],
  MEDIUM: [BASIC, INTERMEDIATE, INTERMEDIATE, INTERMEDIATE, ADVANCED],
  HIGH: [INTERMEDIATE, ADVANCED, ADVANCED, ADVANCED, ADVANCED],
};

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
export function localDate(iso: string): string {
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
  /** Из шаблона при создании маршрута; null — без рекомендации (этап добавлен вручную). */
  recommendedDifficulty: DifficultyLevel | null;
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
  completedAt: string | null;
  /** Итоговая оценка достижения целей при завершении (FR-044). */
  finalAssessment: string | null;
  archivedAt: string | null;
  createdAt: string;
  /** Метка редакции: передаётся при сохранении и утверждении, чтобы не затереть чужие изменения. */
  updatedAt: string;
  stages: TrajectoryStageDto[];
  versions: TrajectoryVersionSummaryDto[];
  /** Предложения студента изменить маршрут (п. 2.3); решение остаётся за преподавателем. */
  proposals: RouteProposalDto[];
}

/** Неизменяемый снимок версии (trajectory_versions.snapshot). */
export type TrajectorySnapshot = Omit<TrajectoryDto, 'versions' | 'proposals'>;

/** Зафиксированная версия маршрута со снимком (история версий, UC-05). */
export interface TrajectoryVersionDto extends TrajectoryVersionSummaryDto {
  snapshot: TrajectorySnapshot;
}

// ── Сравнение версий (FR-043, UC-05) ──

export type TrajectoryChangeKind = 'added' | 'removed' | 'changed' | 'moved';

/** Одно отличие между версиями маршрута. Значения подготовлены для показа человеку. */
export interface TrajectoryChange {
  /** Где изменение: «Паспорт маршрута», «Этапы» или «Этап «название»». */
  scope: string;
  kind: TrajectoryChangeKind;
  /** Что изменилось: поле, этап, контрольная точка, задание или материал. */
  subject: string;
  before: string | null;
  after: string | null;
}

const PASSPORT_FIELDS = [
  ['goals', 'Образовательные цели'],
  ['plannedResults', 'Планируемые результаты'],
  ['supportMethods', 'Способы сопровождения'],
  ['startDate', 'Дата начала'],
  ['plannedEndDate', 'Планируемая дата завершения'],
] as const;

const STAGE_FIELDS = [
  ['title', 'Название этапа'],
  ['goal', 'Цель этапа'],
  ['description', 'Содержание'],
  ['plannedResults', 'Планируемые результаты этапа'],
  ['startDate', 'Начало этапа'],
  ['endDate', 'Окончание этапа'],
] as const;

const DATE_FIELDS: ReadonlySet<string> = new Set(['startDate', 'plannedEndDate', 'endDate']);

/** `YYYY-MM-DD` → `ДД.ММ.ГГГГ`; пустое значение — null. */
function ruDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

const dueText = (dueAt: string | null) => (dueAt ? ruDate(localDate(dueAt)) : null);
const shown = (field: string, value: string | null) =>
  DATE_FIELDS.has(field) ? ruDate(value) : value || null;

/**
 * Отличия версии `after` от версии `before` (история версий, UC-05): паспорт, состав и порядок
 * этапов, поля этапов, контрольные точки, задания и материалы. Записи сопоставляются по id,
 * поэтому переименованный этап — изменение, а не удаление и добавление.
 */
export function trajectoryDiff(
  before: TrajectorySnapshot,
  after: TrajectorySnapshot,
): TrajectoryChange[] {
  const changes: TrajectoryChange[] = [];
  const add = (
    scope: string,
    kind: TrajectoryChangeKind,
    subject: string,
    from: string | null,
    to: string | null,
  ) => changes.push({ scope, kind, subject, before: from, after: to });

  for (const [field, label] of PASSPORT_FIELDS) {
    if ((before[field] ?? null) !== (after[field] ?? null)) {
      add(
        'Паспорт маршрута',
        'changed',
        label,
        shown(field, before[field]),
        shown(field, after[field]),
      );
    }
  }

  const oldStages = new Map(before.stages.map((stage) => [stage.id, stage]));
  const newStageIds = new Set(after.stages.map((stage) => stage.id));
  // Порядок сравнивается среди этапов, которые есть в обеих версиях: новый этап не сдвигает остальные.
  const oldOrder = before.stages.filter((stage) => newStageIds.has(stage.id)).map((s) => s.id);
  const newOrder = after.stages.filter((stage) => oldStages.has(stage.id)).map((s) => s.id);

  for (const stage of before.stages) {
    if (!newStageIds.has(stage.id))
      add('Этапы', 'removed', `Этап «${stage.title}»`, stage.title, null);
  }
  for (const stage of after.stages) {
    const old = oldStages.get(stage.id);
    if (!old) {
      add('Этапы', 'added', `Этап «${stage.title}»`, null, stage.title);
      continue;
    }
    const scope = `Этап «${stage.title}»`;
    if (oldOrder.indexOf(stage.id) !== newOrder.indexOf(stage.id)) {
      add(scope, 'moved', 'Место в маршруте', `№ ${old.sortOrder + 1}`, `№ ${stage.sortOrder + 1}`);
    }
    for (const [field, label] of STAGE_FIELDS) {
      if ((old[field] ?? null) !== (stage[field] ?? null)) {
        add(scope, 'changed', label, shown(field, old[field]), shown(field, stage[field]));
      }
    }

    const oldPoints = new Map(old.checkpoints.map((point) => [point.id, point]));
    const newPoints = new Set(stage.checkpoints.map((point) => point.id));
    for (const point of old.checkpoints) {
      if (!newPoints.has(point.id)) {
        add(scope, 'removed', `Контрольная точка «${point.title}»`, ruDate(point.dueDate), null);
      }
    }
    for (const point of stage.checkpoints) {
      const was = oldPoints.get(point.id);
      const subject = `Контрольная точка «${point.title}»`;
      const text = (item: { title: string; dueDate: string | null }) =>
        [item.title, ruDate(item.dueDate)].filter(Boolean).join(', ');
      if (!was) add(scope, 'added', subject, null, ruDate(point.dueDate));
      else if (was.title !== point.title || was.dueDate !== point.dueDate) {
        add(scope, 'changed', subject, text(was), text(point));
      }
    }

    const oldTasks = new Map(old.assignments.map((item) => [item.id, item]));
    const newTasks = new Set(stage.assignments.map((item) => item.id));
    for (const item of old.assignments) {
      if (!newTasks.has(item.id)) {
        add(scope, 'removed', `Задание «${item.assignment.title}»`, dueText(item.dueAt), null);
      }
    }
    for (const item of stage.assignments) {
      const was = oldTasks.get(item.id);
      const subject = `Задание «${item.assignment.title}»`;
      if (!was) add(scope, 'added', subject, null, dueText(item.dueAt));
      else if (dueText(was.dueAt) !== dueText(item.dueAt)) {
        add(scope, 'changed', `${subject}: срок`, dueText(was.dueAt), dueText(item.dueAt));
      }
    }

    const oldMaterials = new Set(old.materials.map((item) => item.id));
    const newMaterials = new Set(stage.materials.map((item) => item.id));
    for (const item of old.materials) {
      if (!newMaterials.has(item.id))
        add(scope, 'removed', `Материал «${item.title}»`, item.title, null);
    }
    for (const item of stage.materials) {
      if (!oldMaterials.has(item.id))
        add(scope, 'added', `Материал «${item.title}»`, null, item.title);
    }
  }
  return changes;
}

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
