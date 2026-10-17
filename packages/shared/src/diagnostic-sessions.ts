// Назначение и проведение диагностики (ТЗ, п. 4.4; UC-01; FR-013, FR-018–FR-020, FR-022, FR-023).
// Студент получает методику в виде формы (`DiagnosticForm`) — без значений вариантов, ключей и
// правил интерпретации. Проверка ответов — общие чистые функции: одни и те же правила работают
// в интерфейсе и на сервере.
import { z } from 'zod';
import {
  type AnswerMap,
  type AnswerValue,
  answerError,
  type FormQuestion,
  isAnswered,
  type QuestionContent,
  type QuestionnaireContent,
} from './diagnostics.js';
import type {
  DiagnosticRevisionKind,
  DiagnosticSessionStatus,
  DiagnosticSource,
  MeasurementType,
} from './enums.js';
import type { GroupRef, PersonRef } from './students.js';

/** Наибольшая длина периода прохождения, дней. */
export const ASSIGNMENT_MAX_DAYS = 366;
export const CORRECTION_REASON_MAX = 1000;

// ── Форма для прохождения ──

export interface DiagnosticForm {
  title: string;
  instruction: string | null;
  /** Можно ли сохранять черновик ответов и вернуться к ним позже (UC-01, альтернативный сценарий). */
  allowDraft: boolean;
  questions: FormQuestion[];
}

export function toFormQuestion(question: QuestionContent): FormQuestion {
  return {
    key: question.key,
    text: question.text,
    type: question.type,
    isRequired: question.isRequired,
    minValue: question.minValue,
    maxValue: question.maxValue,
    minLabel: question.minLabel,
    maxLabel: question.maxLabel,
    options: question.options.map((option) => ({ key: option.key, text: option.text })),
  };
}

export function toDiagnosticForm(content: QuestionnaireContent): DiagnosticForm {
  return {
    title: content.title,
    instruction: content.instruction,
    allowDraft: content.allowDraft,
    questions: content.questions.map(toFormQuestion),
  };
}

/**
 * Замечания к ответам: ключ — `answers.<id вопроса>`. Неизвестные вопросы и недопустимые
 * значения — всегда ошибка; без ответа на обязательный вопрос — только при `complete`
 * (проверка полноты перед завершением, UC-01, шаг 9).
 */
export function answersIssues(
  questions: readonly FormQuestion[],
  answers: AnswerMap,
  complete: boolean,
): Record<string, string> {
  const issues: Record<string, string> = {};
  const known = new Set(questions.map((question) => question.key));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) issues[`answers.${key}`] = 'Такого вопроса нет в методике';
  }
  for (const question of questions) {
    const value = answers[question.key];
    const error = answerError(question, value);
    if (error) issues[`answers.${question.key}`] = error;
    else if (complete && question.isRequired && !isAnswered(question, value)) {
      issues[`answers.${question.key}`] = 'Ответьте на этот вопрос';
    }
  }
  return issues;
}

/** Только ответы на вопросы формы, без пропусков (пустой текст — пропуск). */
export function answeredOnly(
  questions: readonly FormQuestion[],
  answers: AnswerMap,
): Record<string, Exclude<AnswerValue, null>> {
  const result: Record<string, Exclude<AnswerValue, null>> = {};
  for (const question of questions) {
    const value = answers[question.key];
    if (value !== null && value !== undefined && isAnswered(question, value)) {
      result[question.key] = typeof value === 'string' ? value.trim() : value;
    }
  }
  return result;
}

// ── Назначения ──

/** Состояние назначения по периоду: рассчитывается, в БД не хранится. */
export const AssignmentState = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
} as const;
export type AssignmentState = (typeof AssignmentState)[keyof typeof AssignmentState];
export const ASSIGNMENT_STATE_LABELS: Record<AssignmentState, string> = {
  PLANNED: 'Запланирована',
  ACTIVE: 'Идёт прохождение',
  FINISHED: 'Период завершён',
  CANCELLED: 'Отменена',
};

export function assignmentState(
  period: { startsAt: string; endsAt: string; cancelledAt: string | null },
  now = new Date(),
): AssignmentState {
  if (period.cancelledAt) return AssignmentState.CANCELLED;
  if (now < new Date(period.startsAt)) return AssignmentState.PLANNED;
  return now < new Date(period.endsAt) ? AssignmentState.ACTIVE : AssignmentState.FINISHED;
}

export interface StudentRef {
  id: string;
  fullName: string;
  participantCode: string;
}

export type AssignmentTarget =
  { kind: 'group'; group: GroupRef } | { kind: 'student'; student: StudentRef };

export interface QuestionnaireVersionLabel {
  questionnaireId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  isDemo: boolean;
}

/** Сколько прохождений назначения в каждом статусе (только доступные пользователю студенты). */
export type SessionCounts = Record<DiagnosticSessionStatus, number> & { total: number };

export interface DiagnosticAssignmentDto {
  id: string;
  questionnaire: QuestionnaireVersionLabel;
  target: AssignmentTarget;
  measurementType: MeasurementType;
  startsAt: string;
  /** Конец периода (не включительно): прохождение доступно до этого момента. */
  endsAt: string;
  cancelledAt: string | null;
  state: AssignmentState;
  assignedBy: PersonRef;
  createdAt: string;
  counts: SessionCounts;
}

export interface DiagnosticSessionRowDto {
  id: string;
  student: StudentRef & { group: { id: string; name: string } | null };
  status: DiagnosticSessionStatus;
  source: DiagnosticSource;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
}

export interface DiagnosticAssignmentDetailDto extends DiagnosticAssignmentDto {
  sessions: DiagnosticSessionRowDto[];
}

// ── Результаты ──

export interface ScaleResultDto {
  scaleId: string;
  code: string;
  name: string;
  /** null — нет данных (пропущены ответы), а не ноль (FR-074). */
  rawScore: number | null;
  missingAnswers: number;
  level: { code: string; label: string } | null;
}

/** Прохождение методики студентом: вкладка «Диагностика» профиля (FR-023). */
export interface StudentDiagnosticDto {
  id: string;
  questionnaire: QuestionnaireVersionLabel;
  measurementType: MeasurementType;
  status: DiagnosticSessionStatus;
  source: DiagnosticSource;
  startsAt: string | null;
  endsAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  /** Действующая ревизия результатов; 0 — результатов нет. */
  revision: number;
  /** Результаты по шкалам действующей ревизии; пусто, если прохождение не завершено. */
  scores: ScaleResultDto[];
}

export interface DiagnosticRevisionDto {
  revision: number;
  kind: DiagnosticRevisionKind;
  reason: string | null;
  createdAt: string;
  createdBy: PersonRef | null;
  answers: Record<string, AnswerValue>;
  scores: ScaleResultDto[];
}

/** Исходные ответы и все ревизии (только с разрешением `diagnostics.answers.read`). */
export interface DiagnosticAnswersDto {
  sessionId: string;
  student: StudentRef;
  form: DiagnosticForm;
  /** От новой ревизии к первой. */
  revisions: DiagnosticRevisionDto[];
}

// ── Кабинет студента ──

export interface CabinetDiagnosticDto {
  id: string;
  title: string;
  isDemo: boolean;
  status: DiagnosticSessionStatus;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  /** Понятная студенту интерпретация по шкалам (FR-016); только шкалы, для уровня которых она задана. */
  results: { scale: string; text: string }[];
}

export interface CabinetDiagnosticSessionDto extends CabinetDiagnosticDto {
  form: DiagnosticForm;
  /** Сохранённый черновик ответов; null — черновика нет. */
  draft: Record<string, AnswerValue> | null;
}

// ── Формы (zod) ──

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Начало местных суток даты `YYYY-MM-DD`. */
export function localDayStart(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export const assignmentFormSchema = z
  .object({
    questionnaireId: z.string({ message: 'Выберите методику' }).min(1, 'Выберите методику'),
    targetKind: z.enum(['group', 'student']),
    groupId: z.string().nullable(),
    studentId: z.string().nullable(),
    startsOn: z.string().regex(DATE, 'Укажите дату начала'),
    endsOn: z.string().regex(DATE, 'Укажите дату окончания'),
  })
  .superRefine((value, ctx) => {
    if (value.targetKind === 'group' && !value.groupId) {
      ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Выберите группу' });
    }
    if (value.targetKind === 'student' && !value.studentId) {
      ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'Выберите студента' });
    }
    if (DATE.test(value.startsOn) && DATE.test(value.endsOn) && value.endsOn < value.startsOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: 'Дата окончания не раньше даты начала',
      });
    }
  });
export type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

export const correctionReasonSchema = z
  .string()
  .trim()
  .min(5, 'Опишите причину исправления (не короче 5 символов)')
  .max(CORRECTION_REASON_MAX, `Не более ${CORRECTION_REASON_MAX} символов`);
