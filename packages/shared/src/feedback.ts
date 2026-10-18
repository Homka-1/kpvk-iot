import {
  CheckpointStatus,
  ConsultationStatus,
  FeedbackKind,
  type TrajectoryStatus,
  type Visibility,
} from './enums.js';
import type { PersonRef } from './students.js';

/** Обратная связь и сопровождение (п. 4.9 ТЗ, FR-063–FR-068). */

export const FEEDBACK_TEXT_MAX = 2000;
export const CONSULTATION_TOPIC_MAX = 300;
export const CONSULTATION_TEXT_MAX = 4000;
export const REFLECTION_TEXT_MAX = 2000;
/** Шкала самооценки в форме рефлексии: 1 — совсем не получилось, 5 — всё получилось. */
export const SELF_ASSESSMENT_MIN = 1;
export const SELF_ASSESSMENT_MAX = 5;
/** Сколько последних записей отдаёт список (раздел и кабинет); старое — в истории профиля. */
export const FEEDBACK_LIST_LIMIT = 200;
export const NOTIFICATIONS_LIST_LIMIT = 30;

/** Сообщения преподавателя студенту (п. 4.9: рекомендации, комментарии, цели, запрос самооценки). */
export const TEACHER_FEEDBACK_KINDS: readonly FeedbackKind[] = [
  FeedbackKind.RECOMMENDATION,
  FeedbackKind.COMMENT,
  FeedbackKind.SHORT_TERM_GOAL,
  FeedbackKind.SELF_ASSESSMENT_REQUEST,
];

/**
 * Обращения студента из раздела «Обратная связь». Предложение изменить маршрут отправляется
 * со страницы маршрута (этап 12) и попадает в тот же поток.
 */
export const STUDENT_FEEDBACK_KINDS: readonly FeedbackKind[] = [
  FeedbackKind.QUESTION,
  FeedbackKind.DIFFICULTY_REPORT,
];

/** Обращения студента, которые преподаватель отмечает рассмотренными. */
export const RESOLVABLE_FEEDBACK_KINDS: readonly FeedbackKind[] = [
  FeedbackKind.QUESTION,
  FeedbackKind.DIFFICULTY_REPORT,
  FeedbackKind.ROUTE_CHANGE_PROPOSAL,
];

/** Сообщения со сроком: цель — к какой дате, запрос самооценки — до какой даты ответить. */
export const DATED_FEEDBACK_KINDS: readonly FeedbackKind[] = [
  FeedbackKind.SHORT_TERM_GOAL,
  FeedbackKind.SELF_ASSESSMENT_REQUEST,
];

/** Консультации, которые ещё можно назначить, провести или отменить. */
export const CONSULTATION_OPEN_STATUSES: readonly ConsultationStatus[] = [
  ConsultationStatus.REQUESTED,
  ConsultationStatus.SCHEDULED,
];

/** Рефлексия заполняется после контрольной точки (FR-066): точка отмечена пройденной или пропущенной. */
export function isCheckpointReflectable(status: CheckpointStatus): boolean {
  return status === CheckpointStatus.PASSED || status === CheckpointStatus.MISSED;
}

/** Студент в списках обратной связи. */
export interface FeedbackStudentRef extends PersonRef {
  groupName: string | null;
}

export interface FeedbackTrajectoryRef {
  id: string;
  disciplineName: string;
}

/** Привязка записи к ИОТ, этапу или заданию (FR-064). Без привязки — к студенту в целом. */
export interface FeedbackBindingDto {
  trajectory: FeedbackTrajectoryRef | null;
  stage: { id: string; title: string; sortOrder: number } | null;
  /** Назначение задания (trajectory_assignments.id) и название задания. */
  assignment: { id: string; title: string } | null;
}

export interface FeedbackReplyDto {
  id: string;
  body: string;
  visibility: Visibility;
  author: PersonRef;
  /** Ответ написал сам студент. */
  fromStudent: boolean;
  createdAt: string;
}

/**
 * Сообщение обратной связи с ответами. Студенту отдаются только записи и ответы с видимостью
 * «Видно студенту» — внутренние заметки отсекает сервер (FR-068).
 */
export interface FeedbackDto extends FeedbackBindingDto {
  id: string;
  kind: FeedbackKind;
  visibility: Visibility;
  body: string;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  student: FeedbackStudentRef;
  author: PersonRef;
  fromStudent: boolean;
  replies: FeedbackReplyDto[];
}

export interface ConsultationDto {
  id: string;
  status: ConsultationStatus;
  topic: string;
  scheduledAt: string | null;
  heldAt: string | null;
  /** Итог консультации, видимый студенту. */
  summary: string | null;
  /** Внутренняя заметка педагога. Студенту не передаётся никогда (FR-068). */
  internalNote: string | null;
  teacher: PersonRef | null;
  /** Консультацию запросил сам студент. */
  requestedByStudent: boolean;
  student: FeedbackStudentRef;
  trajectory: FeedbackTrajectoryRef | null;
  createdAt: string;
}

/** Консультация в кабинете студента — без внутренней заметки. */
export type CabinetConsultationDto = Omit<ConsultationDto, 'internalNote'>;

export interface ReflectionDto {
  id: string;
  trajectory: FeedbackTrajectoryRef | null;
  stage: { id: string; title: string; sortOrder: number } | null;
  checkpoint: { id: string; title: string } | null;
  selfAssessment: number | null;
  achievements: string | null;
  difficulties: string | null;
  nextSteps: string | null;
  createdAt: string;
  student: FeedbackStudentRef;
}

/** Контрольная точка, после которой студент ещё не заполнил рефлексию. */
export interface PendingReflectionDto {
  checkpointId: string;
  title: string;
  dueDate: string | null;
  status: CheckpointStatus;
  stage: { id: string; title: string; sortOrder: number };
  trajectory: FeedbackTrajectoryRef;
}

/** История взаимодействия со студентом для преподавателя (FR-063, FR-067). */
export interface StudentSupportDto {
  feedback: FeedbackDto[];
  consultations: ConsultationDto[];
  reflections: ReflectionDto[];
  /** Утверждённые маршруты студента — варианты привязки нового сообщения (FR-064). */
  trajectories: CabinetFeedbackTrajectoryDto[];
}

/** Маршрут студента для привязки обращения к ИОТ и этапу. */
export interface CabinetFeedbackTrajectoryDto extends FeedbackTrajectoryRef {
  status: TrajectoryStatus;
  stages: { id: string; title: string; sortOrder: number }[];
}

/** Раздел «Обратная связь» кабинета студента. */
export interface CabinetFeedbackDto {
  feedback: FeedbackDto[];
  consultations: CabinetConsultationDto[];
  reflections: ReflectionDto[];
  pendingReflections: PendingReflectionDto[];
  trajectories: CabinetFeedbackTrajectoryDto[];
}

/** Запись ленты взаимодействия: сообщение, консультация или рефлексия. */
export type InteractionEntry<C extends CabinetConsultationDto = ConsultationDto> =
  | { type: 'feedback'; at: string; item: FeedbackDto }
  | { type: 'consultation'; at: string; item: C }
  | { type: 'reflection'; at: string; item: ReflectionDto };

/**
 * Единая лента взаимодействия (FR-063), новые записи сверху. Консультация стоит по дате
 * проведения, иначе по назначенной дате, иначе по дате запроса.
 */
export function interactionTimeline<C extends CabinetConsultationDto>(data: {
  feedback: FeedbackDto[];
  consultations: C[];
  reflections: ReflectionDto[];
}): InteractionEntry<C>[] {
  const entries: InteractionEntry<C>[] = [
    ...data.feedback.map((item) => ({ type: 'feedback' as const, at: item.createdAt, item })),
    ...data.consultations.map((item) => ({
      type: 'consultation' as const,
      at: item.heldAt ?? item.scheduledAt ?? item.createdAt,
      item,
    })),
    ...data.reflections.map((item) => ({ type: 'reflection' as const, at: item.createdAt, item })),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

// ── Уведомления (FR-065) ──

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Путь в приложении, куда ведёт уведомление. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsDto {
  items: NotificationDto[];
  unread: number;
}
