import {
  ASSIGNMENT_CANCELLABLE_STATUSES,
  ASSIGNMENT_INACTIVE_STATUSES,
  type AssignmentStatus,
  CHECKPOINT_STATUS_LABELS,
  type CheckpointStatus,
  STAGE_STATUS_LABELS,
  type StageAssignmentDto,
  type StageMaterialDto,
  type StageStatus,
  type TrajectoryContent,
  type TrajectoryDto,
  type TrajectoryStageDto,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import type { Badge } from '@/views/students/labels';

/** Форма маршрута в конструкторе: пустые поля — пустые строки, у новых строк — локальный ключ. */
export interface CheckpointForm {
  key: string;
  id: string | null;
  title: string;
  description: string;
  dueDate: string;
  /** Отметка сохранённой точки; у новой — null. */
  status: CheckpointStatus | null;
}

export interface StageAssignmentForm {
  key: string;
  id: string | null;
  assignment: StageAssignmentDto['assignment'];
  dueDate: string;
  /** Статус сохранённого назначения; у нового — null. */
  status: AssignmentStatus | null;
}

export interface StageForm {
  key: string;
  id: string | null;
  title: string;
  goal: string;
  description: string;
  plannedResults: string;
  startDate: string;
  endDate: string;
  checkpoints: CheckpointForm[];
  materials: StageMaterialDto[];
  assignments: StageAssignmentForm[];
}

export interface TrajectoryForm {
  goals: string;
  plannedResults: string;
  supportMethods: string;
  startDate: string;
  plannedEndDate: string;
  stages: StageForm[];
}

/** Шаги конструктора ИОТ (UC-03). Шаг 0 — создание черновика, остальные — его наполнение. */
export const STEPS = [
  'Дисциплина и шаблон',
  'Цели',
  'Этапы',
  'Задания и материалы',
  'Сроки и контрольные точки',
  'Сопровождение',
  'Предпросмотр',
] as const;

let counter = 0;
export const newKey = () => `new-${++counter}`;

const pad = (value: number) => String(value).padStart(2, '0');

/** Срок задания — конец выбранного дня по местному времени пользователя. */
export function dueAtFromDate(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
    999,
  ).toISOString();
}

/** Дата `YYYY-MM-DD` срока задания по местному времени. */
export function dateFromDueAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toForm(dto: TrajectoryDto): TrajectoryForm {
  return {
    goals: dto.goals ?? '',
    plannedResults: dto.plannedResults ?? '',
    supportMethods: dto.supportMethods ?? '',
    startDate: dto.startDate ?? '',
    plannedEndDate: dto.plannedEndDate ?? '',
    stages: dto.stages.map((stage) => ({
      key: stage.id,
      id: stage.id,
      title: stage.title,
      goal: stage.goal ?? '',
      description: stage.description ?? '',
      plannedResults: stage.plannedResults ?? '',
      startDate: stage.startDate ?? '',
      endDate: stage.endDate ?? '',
      checkpoints: stage.checkpoints.map((checkpoint) => ({
        key: checkpoint.id,
        id: checkpoint.id,
        title: checkpoint.title,
        description: checkpoint.description ?? '',
        dueDate: checkpoint.dueDate ?? '',
        status: checkpoint.status,
      })),
      materials: [...stage.materials],
      assignments: stage.assignments.map((item) => ({
        key: item.id,
        id: item.id,
        assignment: item.assignment,
        dueDate: dateFromDueAt(item.dueAt),
        status: item.status,
      })),
    })),
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** Содержимое для сохранения и для проверки тем же правилом, что на сервере. */
export function toContent(form: TrajectoryForm): TrajectoryContent {
  return {
    goals: orNull(form.goals),
    plannedResults: orNull(form.plannedResults),
    supportMethods: orNull(form.supportMethods),
    startDate: orNull(form.startDate),
    plannedEndDate: orNull(form.plannedEndDate),
    stages: form.stages.map((stage) => ({
      id: stage.id,
      title: stage.title.trim(),
      goal: orNull(stage.goal),
      description: orNull(stage.description),
      plannedResults: orNull(stage.plannedResults),
      startDate: orNull(stage.startDate),
      endDate: orNull(stage.endDate),
      checkpoints: stage.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        title: checkpoint.title.trim(),
        description: orNull(checkpoint.description),
        dueDate: orNull(checkpoint.dueDate),
      })),
      materialIds: stage.materials.map((material) => material.id),
      assignments: stage.assignments.map((item) => ({
        id: item.id,
        assignmentId: item.assignment.id,
        dueAt: dueAtFromDate(item.dueDate),
      })),
    })),
  };
}

/** Этапы формы в виде этапов маршрута — для карты на шаге предпросмотра. */
export function formStages(form: TrajectoryForm, saved: TrajectoryDto): TrajectoryStageDto[] {
  return form.stages.map((stage, index) => ({
    id: stage.key,
    sortOrder: index,
    title: stage.title,
    goal: orNull(stage.goal),
    description: orNull(stage.description),
    plannedResults: orNull(stage.plannedResults),
    startDate: orNull(stage.startDate),
    endDate: orNull(stage.endDate),
    status: saved.stages.find((item) => item.id === stage.id)?.status ?? 'NOT_STARTED',
    checkpoints: stage.checkpoints.map((checkpoint) => ({
      id: checkpoint.key,
      title: checkpoint.title,
      description: orNull(checkpoint.description),
      dueDate: orNull(checkpoint.dueDate),
      status: checkpoint.status ?? 'PENDING',
    })),
    materials: stage.materials,
    assignments: stage.assignments.map((item) => ({
      id: item.key,
      assignment: item.assignment,
      dueAt: dueAtFromDate(item.dueDate),
      status: item.status ?? 'ASSIGNED',
    })),
  }));
}

/**
 * При корректировке убрать можно только задание, к которому студент ещё не приступал
 * (FR-043: история выполнения сохраняется); новое, ещё не сохранённое — всегда.
 */
export function assignmentRemovable(item: StageAssignmentForm): boolean {
  return (
    item.status === null ||
    ASSIGNMENT_CANCELLABLE_STATUSES.includes(item.status) ||
    ASSIGNMENT_INACTIVE_STATUSES.includes(item.status)
  );
}

/** Отмеченная контрольная точка при корректировке не удаляется. */
export const checkpointRemovable = (item: CheckpointForm) =>
  item.status === null || item.status === 'PENDING';

export const stageRemovable = (stage: StageForm) => stage.assignments.every(assignmentRemovable);

const STAGE_TONES: Record<StageStatus, StatusTone> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
};
const STAGE_ICONS: Record<StageStatus, string> = {
  NOT_STARTED: 'pi pi-circle',
  IN_PROGRESS: 'pi pi-spinner',
  COMPLETED: 'pi pi-check-circle',
};

export function stageBadge(status: StageStatus): Badge & { icon: string } {
  return {
    label: STAGE_STATUS_LABELS[status],
    tone: STAGE_TONES[status],
    icon: STAGE_ICONS[status],
  };
}

const CHECKPOINT_TONES: Record<CheckpointStatus, StatusTone> = {
  PENDING: 'neutral',
  PASSED: 'success',
  MISSED: 'danger',
};

export function checkpointBadge(status: CheckpointStatus): Badge {
  return { label: CHECKPOINT_STATUS_LABELS[status], tone: CHECKPOINT_TONES[status] };
}
