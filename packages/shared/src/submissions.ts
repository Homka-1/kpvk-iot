// Сдача и проверка заданий (ТЗ, п. 4.7; FR-042, FR-050–FR-053, FR-055; UC-04, AT-07).
// Правила сдачи, оценивания по критериям, просрочки и прогресса этапа — чистые функции:
// их применяют и сервер, и интерфейс. Оценку ставит преподаватель (п. 1.1 CLAUDE.md).
import {
  type AssessmentDecision,
  AssignmentStatus,
  type CheckpointStatus,
  StageStatus,
  SubmissionFormat,
} from './enums.js';
import type { FileDto } from './library.js';
import type { CabinetAssignmentDetailDto, StudentAssignmentDto } from './student-assignments.js';
import type { GroupRef, PersonRef } from './students.js';

export const SUBMISSION_TEXT_MAX = 10000;
export const SUBMISSION_URL_MAX = 2000;
export const SUBMISSION_FILES_MAX = 5;
export const ASSESSMENT_COMMENT_MAX = 4000;

/** Статусы, в которых студент может отправить ответ: назначено, выполняется, на доработке. */
export const ASSIGNMENT_SUBMITTABLE_STATUSES: readonly AssignmentStatus[] = [
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.IN_PROGRESS,
  AssignmentStatus.RETURNED,
];

/**
 * Просрочка (FR-053) не хранится, а вычисляется: срок прошёл, а ответ не отправлен
 * (задание назначено, выполняется или возвращено на доработку).
 */
export function isAssignmentOverdue(
  item: { status: AssignmentStatus; dueAt: string | null },
  now: Date = new Date(),
): boolean {
  return (
    item.dueAt !== null &&
    ASSIGNMENT_SUBMITTABLE_STATUSES.includes(item.status) &&
    Date.parse(item.dueAt) < now.getTime()
  );
}

// ── Сдача (FR-050, FR-051) ──

export interface SubmissionInput {
  text?: string | null;
  url?: string | null;
  fileIds?: readonly string[] | null;
}

export interface SubmissionIssue {
  field: 'text' | 'url' | 'fileIds';
  message: string;
}

const filled = (value: string | null | undefined) => !!value && value.trim() !== '';

/**
 * Проверка ответа: хотя бы одна часть заполнена, и только в форматах, которые допускает задание.
 * Задание без указанных форматов принимает любой.
 */
export function submissionIssues(
  formats: readonly SubmissionFormat[],
  input: SubmissionInput,
): SubmissionIssue[] {
  const allowed = (format: SubmissionFormat) => formats.length === 0 || formats.includes(format);
  const issues: SubmissionIssue[] = [];
  const hasText = filled(input.text);
  const hasUrl = filled(input.url);
  const hasFiles = (input.fileIds?.length ?? 0) > 0;
  if (hasText && !allowed(SubmissionFormat.TEXT)) {
    issues.push({ field: 'text', message: 'Это задание не принимает ответ текстом' });
  }
  if (hasUrl && !allowed(SubmissionFormat.LINK)) {
    issues.push({ field: 'url', message: 'Это задание не принимает ответ ссылкой' });
  }
  if (hasFiles && !allowed(SubmissionFormat.FILE)) {
    issues.push({ field: 'fileIds', message: 'Это задание не принимает файлы' });
  }
  if (!hasText && !hasUrl && !hasFiles) {
    const field = !allowed(SubmissionFormat.TEXT)
      ? allowed(SubmissionFormat.FILE)
        ? 'fileIds'
        : 'url'
      : 'text';
    issues.push({ field, message: 'Добавьте ответ: текст, файл или ссылку' });
  }
  return issues;
}

// ── Проверка (FR-052) ──

export interface AssessmentCriterionRef {
  id: string;
  maxScore: number;
}

export interface AssessmentInput {
  decision: AssessmentDecision;
  comment?: string | null;
  criterionScores?: readonly { criterionId: string; score: number }[] | null;
}

export interface AssessmentCheck {
  issues: { field: string; message: string }[];
  /** Итоговый балл — сумма по критериям; null — критериев нет или задание возвращено. */
  score: number | null;
  maxScore: number | null;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Проверка решения преподавателя. Принятое задание с критериями оценивается по каждому
 * критерию от 0 до максимума, итог — сумма. Возврат на доработку требует комментария
 * для студента; баллы при возврате не ставятся.
 */
export function checkAssessment(
  criteria: readonly AssessmentCriterionRef[],
  input: AssessmentInput,
): AssessmentCheck {
  const issues: AssessmentCheck['issues'] = [];
  const scores = input.criterionScores ?? [];
  if (input.decision === 'RETURNED') {
    if (!filled(input.comment)) {
      issues.push({ field: 'comment', message: 'Напишите студенту, что доработать' });
    }
    if (scores.length > 0) {
      issues.push({ field: 'criterionScores', message: 'При возврате баллы не ставятся' });
    }
    return { issues, score: null, maxScore: null };
  }
  if (criteria.length === 0) {
    if (scores.length > 0) {
      issues.push({ field: 'criterionScores', message: 'У задания нет критериев оценивания' });
    }
    return { issues, score: null, maxScore: null };
  }
  const byId = new Map(scores.map((item) => [item.criterionId, item.score]));
  if (
    byId.size !== scores.length ||
    scores.some((item) => !criteria.some((c) => c.id === item.criterionId))
  ) {
    issues.push({ field: 'criterionScores', message: 'Оценки не соответствуют критериям задания' });
  }
  criteria.forEach((criterion, index) => {
    const score = byId.get(criterion.id);
    const field = `criterionScores.${index}`;
    if (score === undefined || !Number.isFinite(score)) {
      issues.push({ field, message: 'Поставьте балл по критерию' });
    } else if (score < 0 || score > criterion.maxScore) {
      issues.push({ field, message: `Балл от 0 до ${criterion.maxScore}` });
    }
  });
  const sum = (values: number[]) => round3(values.reduce((total, value) => total + value, 0));
  return {
    issues,
    score: issues.length ? null : sum(criteria.map((criterion) => byId.get(criterion.id)!)),
    maxScore: sum(criteria.map((criterion) => criterion.maxScore)),
  };
}

// ── Прогресс этапа и ИОТ (FR-042, FR-055, FR-056) ──

/** Статистика выполнения заданий этапа или маршрута. */
export interface AssignmentProgress {
  /** Действующие задания (без невыбранных, отменённых и ещё не выбранных). */
  total: number;
  completed: number;
  submitted: number;
  returned: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  /** Доля выполненных в процентах; null — заданий нет («Нет данных», не 0 %). */
  percent: number | null;
}

const NOT_COUNTED: readonly AssignmentStatus[] = [
  AssignmentStatus.OFFERED,
  AssignmentStatus.DECLINED,
  AssignmentStatus.CANCELLED,
];

export function assignmentProgress(
  items: readonly { status: AssignmentStatus; dueAt: string | null }[],
  now: Date = new Date(),
): AssignmentProgress {
  const counted = items.filter((item) => !NOT_COUNTED.includes(item.status));
  const count = (status: AssignmentStatus) =>
    counted.filter((item) => item.status === status).length;
  const completed = count(AssignmentStatus.COMPLETED);
  return {
    total: counted.length,
    completed,
    submitted: count(AssignmentStatus.SUBMITTED),
    returned: count(AssignmentStatus.RETURNED),
    inProgress: count(AssignmentStatus.IN_PROGRESS),
    notStarted: count(AssignmentStatus.ASSIGNED),
    overdue: counted.filter((item) => isAssignmentOverdue(item, now)).length,
    percent: counted.length ? Math.round((completed / counted.length) * 100) : null,
  };
}

/**
 * Статус этапа по его заданиям (FR-042): все выполнены — «Завершён», работа начата —
 * «В работе». Этап без заданий завершается, когда пройдены все его контрольные точки (их
 * отмечает преподаватель); без заданий и точек статус не меняется. Назад статус не откатывается.
 */
export function nextStageStatus(
  current: StageStatus,
  statuses: readonly AssignmentStatus[],
  checkpoints: readonly CheckpointStatus[] = [],
): StageStatus {
  const counted = statuses.filter((status) => !NOT_COUNTED.includes(status));
  if (current === StageStatus.COMPLETED) return current;
  if (counted.length === 0) {
    const passed = checkpoints.length > 0 && checkpoints.every((status) => status === 'PASSED');
    return passed ? StageStatus.COMPLETED : current;
  }
  if (counted.every((status) => status === AssignmentStatus.COMPLETED)) {
    return StageStatus.COMPLETED;
  }
  if (counted.some((status) => status !== AssignmentStatus.ASSIGNED)) {
    return StageStatus.IN_PROGRESS;
  }
  return current;
}

// ── Контракты API ──

export interface CriterionScoreDto {
  criterionId: string;
  title: string;
  maxScore: number;
  score: number;
  comment: string | null;
}

/** Проверка попытки (FR-052): решение, балл, комментарий для студента. */
export interface AssessmentDto {
  id: string;
  decision: AssessmentDecision;
  score: number | null;
  maxScore: number | null;
  comment: string | null;
  criterionScores: CriterionScoreDto[];
  assessor: PersonRef | null;
  createdAt: string;
}

/** Попытка сдачи (FR-050, FR-051). */
export interface SubmissionDto {
  id: string;
  attemptNumber: number;
  text: string | null;
  url: string | null;
  files: FileDto[];
  submittedAt: string;
  /** Отправлено после срока (FR-053). */
  late: boolean;
  assessment: AssessmentDto | null;
}

/** Итог задания для списков: последнее решение преподавателя. */
export interface AssignmentResultDto {
  decision: AssessmentDecision;
  score: number | null;
  maxScore: number | null;
  assessedAt: string;
}

/** Карточка задания с историей попыток (студент — своё, преподаватель — для проверки). */
export interface AssignmentWorkDto extends CabinetAssignmentDetailDto {
  completedAt: string | null;
  submissions: SubmissionDto[];
}

/** Карточка проверки у преподавателя: задание, студент, попытки (AT-07). */
export interface AssignmentReviewDto extends AssignmentWorkDto {
  student: { id: string; fullName: string; group: GroupRef | null };
}

/** Строка очереди «На проверке». */
export interface ReviewQueueItemDto extends StudentAssignmentDto {
  student: { id: string; fullName: string; group: GroupRef | null };
  attemptNumber: number;
  submittedAt: string;
  late: boolean;
}
