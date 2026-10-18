// Назначение заданий студентам и кабинет студента: траектория и задания (ТЗ, п. 2.3, п. 4.6,
// п. 4.7, п. 6.4; FR-040, FR-041, FR-048, FR-054; AT-06). Студент видит только утверждённые
// маршруты и свои задания; проверка — на сервере (AT-12).
import {
  AssignmentStatus,
  type DifficultyLevel,
  type SubmissionFormat,
  TrajectoryStatus,
} from './enums.js';
import type { AssessmentCriterionDto, FileDto, MaterialDto } from './library.js';
import type { PersonRef } from './students.js';
import type { AssignmentResultDto } from './submissions.js';
import type { TrajectoryStageDto } from './trajectories.js';

/** За один раз назначается не больше заданий и студентов (FR-048). */
export const ASSIGN_TASKS_MAX = 10;
export const ASSIGN_STUDENTS_MAX = 200;
export const CHOICE_TITLE_MAX = 300;
export const ROUTE_PROPOSAL_MAX = 2000;

/**
 * Статусы ИОТ, которые видит студент (FR-040): утверждённый маршрут. Черновик и маршрут
 * на согласовании студенту не показываются — как и их задания.
 */
export const STUDENT_VISIBLE_TRAJECTORY_STATUSES: readonly TrajectoryStatus[] = [
  TrajectoryStatus.ACTIVE,
  TrajectoryStatus.NEEDS_CORRECTION,
  TrajectoryStatus.COMPLETED,
];

/** Статусы ИОТ, по которым студент может предложить изменение маршрута (п. 2.3). */
export const ROUTE_PROPOSAL_STATUSES: readonly TrajectoryStatus[] = [
  TrajectoryStatus.ACTIVE,
  TrajectoryStatus.NEEDS_CORRECTION,
];

/** Назначения, которые не действуют: не показываются студенту и не мешают назначить задание снова. */
export const ASSIGNMENT_INACTIVE_STATUSES: readonly AssignmentStatus[] = [
  AssignmentStatus.DECLINED,
  AssignmentStatus.CANCELLED,
];

/** Ещё не начатые назначения: преподаватель может их отменить. */
export const ASSIGNMENT_CANCELLABLE_STATUSES: readonly AssignmentStatus[] = [
  AssignmentStatus.OFFERED,
  AssignmentStatus.ASSIGNED,
];

/** Раздел списка «Мои задания»: предложенные на выбор, текущие и выполненные. */
export type StudentAssignmentSection = 'choice' | 'current' | 'done';

export function studentAssignmentSection(status: AssignmentStatus): StudentAssignmentSection {
  if (status === AssignmentStatus.OFFERED) return 'choice';
  if (status === AssignmentStatus.COMPLETED) return 'done';
  return 'current';
}

// ── Контракты API ──

/** Назначенное студенту задание (строка списков «Мои задания» и вкладки «Задания» профиля). */
export interface StudentAssignmentDto {
  id: string;
  status: AssignmentStatus;
  dueAt: string | null;
  assignedAt: string;
  assignment: {
    id: string;
    title: string;
    typeName: string;
    difficulty: DifficultyLevel;
    topic: string | null;
  };
  discipline: { id: string; name: string };
  /** Этап ИОТ, к которому относится задание; null — задание назначено вне маршрута. */
  trajectory: { id: string; stage: { id: string; title: string; sortOrder: number } | null } | null;
  /** Набор равнозначных заданий, из которого студент выбирает (FR-054). */
  choiceGroup: { id: string; title: string; requiredCount: number; chosenAt: string | null } | null;
  assignedBy: PersonRef | null;
  /** Последнее решение преподавателя по заданию; null — ещё не проверялось. */
  result: AssignmentResultDto | null;
}

/** Карточка задания для студента (п. 4.7): инструкция, критерии, ресурсы, формат сдачи. */
export interface CabinetAssignmentDetailDto extends StudentAssignmentDto {
  goal: string | null;
  instruction: string | null;
  submissionFormats: SubmissionFormat[];
  maxScore: number | null;
  criteria: AssessmentCriterionDto[];
  attachments: { id: string; title: string | null; file: FileDto | null; url: string | null }[];
}

/** Невыбранный набор равнозначных заданий (FR-054). */
export interface AssignmentChoiceDto {
  id: string;
  title: string;
  /** Сколько заданий нужно выбрать. */
  requiredCount: number;
  discipline: { id: string; name: string };
  options: StudentAssignmentDto[];
}

/** «Мои задания»: наборы на выбор и назначенные задания. */
export interface CabinetAssignmentsDto {
  choices: AssignmentChoiceDto[];
  items: StudentAssignmentDto[];
}

/** Итог назначения (FR-048): кому назначено и кого пропустили с причиной. */
export interface AssignTasksResultDto {
  assigned: { id: string; fullName: string }[];
  skipped: { student: { id: string; fullName: string }; reason: string }[];
}

/** Предложение студента изменить маршрут (п. 2.3). Обязательные этапы студент не меняет. */
export interface RouteProposalDto {
  id: string;
  stage: { id: string; title: string } | null;
  body: string;
  author: PersonRef | null;
  createdAt: string;
}

/** Материал этапа в кабинете студента: содержимое, чтобы открыть его без библиотеки. */
export type CabinetStageMaterialDto = TrajectoryStageDto['materials'][number] &
  Pick<MaterialDto, 'description' | 'file' | 'url' | 'body'>;

export interface CabinetStageDto extends Omit<TrajectoryStageDto, 'materials'> {
  materials: CabinetStageMaterialDto[];
}

/**
 * Утверждённая ИОТ в кабинете студента (FR-040): паспорт и карта этапов. Без служебных полей
 * (история версий, причины, метка редакции).
 */
export interface CabinetTrajectoryDto {
  id: string;
  status: TrajectoryStatus;
  version: number;
  discipline: { id: string; name: string };
  teacher: PersonRef | null;
  goals: string | null;
  plannedResults: string | null;
  supportMethods: string | null;
  startDate: string | null;
  plannedEndDate: string | null;
  currentStageId: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  /** Итоговая оценка достижения целей (FR-044), когда маршрут завершён. */
  finalAssessment: string | null;
  stages: CabinetStageDto[];
  /** Собственные предложения студента по этому маршруту. */
  proposals: RouteProposalDto[];
}
