// Перечисления предметной области. Значения совпадают с enum в apps/api/prisma/schema.prisma
// (совпадение проверяет тест apps/api/src/prisma/enums.spec.ts). Объекты `as const`, а не TS enum:
// пакет загружается и в браузере. Русские подписи используются в интерфейсе и отчётах.

type ValueOf<T> = T[keyof T];

export const UserStatus = { ACTIVE: 'ACTIVE', BLOCKED: 'BLOCKED', ARCHIVED: 'ARCHIVED' } as const;
export type UserStatus = ValueOf<typeof UserStatus>;
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Активна',
  BLOCKED: 'Заблокирована',
  ARCHIVED: 'В архиве',
};

export const SupportStatus = {
  STANDARD: 'STANDARD',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  ADDITIONAL_SUPPORT: 'ADDITIONAL_SUPPORT',
} as const;
export type SupportStatus = ValueOf<typeof SupportStatus>;
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  STANDARD: 'Обычное сопровождение',
  NEEDS_ATTENTION: 'Требует внимания',
  ADDITIONAL_SUPPORT: 'Нужно дополнительное сопровождение',
};

export const Visibility = { STUDENT_VISIBLE: 'STUDENT_VISIBLE', INTERNAL: 'INTERNAL' } as const;
export type Visibility = ValueOf<typeof Visibility>;
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  STUDENT_VISIBLE: 'Видно студенту',
  INTERNAL: 'Внутренняя заметка',
};

export const QuestionnaireStatus = { ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
export type QuestionnaireStatus = ValueOf<typeof QuestionnaireStatus>;
export const QUESTIONNAIRE_STATUS_LABELS: Record<QuestionnaireStatus, string> = {
  ACTIVE: 'Действует',
  ARCHIVED: 'В архиве',
};

export const QuestionnaireVersionStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  RETIRED: 'RETIRED',
} as const;
export type QuestionnaireVersionStatus = ValueOf<typeof QuestionnaireVersionStatus>;
export const QUESTIONNAIRE_VERSION_STATUS_LABELS: Record<QuestionnaireVersionStatus, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликована',
  RETIRED: 'Выведена из использования',
};

export const QuestionType = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  LIKERT: 'LIKERT',
  NUMBER: 'NUMBER',
  SHORT_TEXT: 'SHORT_TEXT',
} as const;
export type QuestionType = ValueOf<typeof QuestionType>;
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Один вариант',
  MULTIPLE_CHOICE: 'Несколько вариантов',
  LIKERT: 'Шкала Лайкерта',
  NUMBER: 'Числовой ответ',
  SHORT_TEXT: 'Короткий текстовый ответ',
};

/** Способ расчёта балла шкалы: сумма баллов по ключам или среднее по пунктам шкалы. */
export const ScaleAggregation = { SUM: 'SUM', MEAN: 'MEAN' } as const;
export type ScaleAggregation = ValueOf<typeof ScaleAggregation>;
export const SCALE_AGGREGATION_LABELS: Record<ScaleAggregation, string> = {
  SUM: 'Сумма баллов',
  MEAN: 'Среднее по пунктам',
};

/** Роль шкалы в мотивационном профиле (этап 24): уровень методики считается по внутренним шкалам. */
export const ScaleMotivationRole = {
  INTRINSIC: 'INTRINSIC',
  EXTRINSIC: 'EXTRINSIC',
  REFERENCE: 'REFERENCE',
} as const;
export type ScaleMotivationRole = ValueOf<typeof ScaleMotivationRole>;
export const SCALE_MOTIVATION_ROLE_LABELS: Record<ScaleMotivationRole, string> = {
  INTRINSIC: 'Внутренняя мотивация',
  EXTRINSIC: 'Внешняя мотивация',
  REFERENCE: 'Справочная',
};

export const MeasurementType = {
  PRIMARY: 'PRIMARY',
  INTERMEDIATE: 'INTERMEDIATE',
  REPEATED: 'REPEATED',
} as const;
export type MeasurementType = ValueOf<typeof MeasurementType>;
export const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  PRIMARY: 'Первичный',
  INTERMEDIATE: 'Промежуточный',
  REPEATED: 'Повторный',
};

export const DiagnosticSessionStatus = {
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type DiagnosticSessionStatus = ValueOf<typeof DiagnosticSessionStatus>;
export const DIAGNOSTIC_SESSION_STATUS_LABELS: Record<DiagnosticSessionStatus, string> = {
  ASSIGNED: 'Назначена',
  IN_PROGRESS: 'В процессе',
  COMPLETED: 'Завершена',
  EXPIRED: 'Срок истёк',
  CANCELLED: 'Отменена',
};

export const DiagnosticSource = { ONLINE: 'ONLINE', PAPER: 'PAPER' } as const;
export type DiagnosticSource = ValueOf<typeof DiagnosticSource>;
export const DIAGNOSTIC_SOURCE_LABELS: Record<DiagnosticSource, string> = {
  ONLINE: 'Онлайн',
  PAPER: 'Бумажный бланк',
};

export const DiagnosticRevisionKind = {
  INITIAL: 'INITIAL',
  CORRECTION: 'CORRECTION',
  RECALCULATION: 'RECALCULATION',
} as const;
export type DiagnosticRevisionKind = ValueOf<typeof DiagnosticRevisionKind>;
export const DIAGNOSTIC_REVISION_KIND_LABELS: Record<DiagnosticRevisionKind, string> = {
  INITIAL: 'Первичный расчёт',
  CORRECTION: 'Исправление ошибочного ввода',
  RECALCULATION: 'Пересчёт по новой версии ключей',
};

export const MotivationLevel = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' } as const;
export type MotivationLevel = ValueOf<typeof MotivationLevel>;
export const MOTIVATION_LEVEL_LABELS: Record<MotivationLevel, string> = {
  HIGH: 'Высокий уровень',
  MEDIUM: 'Средний уровень',
  LOW: 'Низкий уровень',
};

export const MotivationProfileStatus = {
  PROPOSED: 'PROPOSED',
  NEEDS_MORE_DIAGNOSTICS: 'NEEDS_MORE_DIAGNOSTICS',
  CONFIRMED: 'CONFIRMED',
  CORRECTED: 'CORRECTED',
} as const;
export type MotivationProfileStatus = ValueOf<typeof MotivationProfileStatus>;
export const MOTIVATION_PROFILE_STATUS_LABELS: Record<MotivationProfileStatus, string> = {
  PROPOSED: 'Предложен системой',
  NEEDS_MORE_DIAGNOSTICS: 'Требуется дополнительная диагностика',
  CONFIRMED: 'Подтверждён преподавателем',
  CORRECTED: 'Скорректирован преподавателем',
};

export const TrajectoryStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  NEEDS_CORRECTION: 'NEEDS_CORRECTION',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type TrajectoryStatus = ValueOf<typeof TrajectoryStatus>;
export const TRAJECTORY_STATUS_LABELS: Record<TrajectoryStatus, string> = {
  DRAFT: 'Черновик',
  PENDING_APPROVAL: 'На утверждении',
  ACTIVE: 'Активна',
  NEEDS_CORRECTION: 'Требует корректировки',
  COMPLETED: 'Завершена',
  ARCHIVED: 'Архивирована',
};

export const StageStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;
export type StageStatus = ValueOf<typeof StageStatus>;
export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  NOT_STARTED: 'Не начат',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершён',
};

export const CheckpointStatus = { PENDING: 'PENDING', PASSED: 'PASSED', MISSED: 'MISSED' } as const;
export type CheckpointStatus = ValueOf<typeof CheckpointStatus>;
export const CHECKPOINT_STATUS_LABELS: Record<CheckpointStatus, string> = {
  PENDING: 'Ожидается',
  PASSED: 'Пройдена',
  MISSED: 'Пропущена',
};

export const DifficultyLevel = {
  BASIC: 'BASIC',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
} as const;
export type DifficultyLevel = ValueOf<typeof DifficultyLevel>;
export const DIFFICULTY_LEVEL_LABELS: Record<DifficultyLevel, string> = {
  BASIC: 'Базовый',
  INTERMEDIATE: 'Средний',
  ADVANCED: 'Повышенный',
};

export const SubmissionFormat = { TEXT: 'TEXT', FILE: 'FILE', LINK: 'LINK' } as const;
export type SubmissionFormat = ValueOf<typeof SubmissionFormat>;
export const SUBMISSION_FORMAT_LABELS: Record<SubmissionFormat, string> = {
  TEXT: 'Текст',
  FILE: 'Файл',
  LINK: 'Ссылка',
};

export const AssignmentStatus = {
  OFFERED: 'OFFERED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  RETURNED: 'RETURNED',
  COMPLETED: 'COMPLETED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
} as const;
export type AssignmentStatus = ValueOf<typeof AssignmentStatus>;
export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  OFFERED: 'Предложено на выбор',
  ASSIGNED: 'Назначено',
  IN_PROGRESS: 'Выполняется',
  SUBMITTED: 'На проверке',
  RETURNED: 'Возвращено на доработку',
  COMPLETED: 'Выполнено',
  DECLINED: 'Не выбрано',
  CANCELLED: 'Отменено',
};

export const AssessmentDecision = { ACCEPTED: 'ACCEPTED', RETURNED: 'RETURNED' } as const;
export type AssessmentDecision = ValueOf<typeof AssessmentDecision>;
export const ASSESSMENT_DECISION_LABELS: Record<AssessmentDecision, string> = {
  ACCEPTED: 'Принято',
  RETURNED: 'Возвращено на доработку',
};

export const MaterialKind = { FILE: 'FILE', LINK: 'LINK', TEXT: 'TEXT' } as const;
export type MaterialKind = ValueOf<typeof MaterialKind>;
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  FILE: 'Файл',
  LINK: 'Ссылка',
  TEXT: 'Текст',
};

export const FeedbackKind = {
  RECOMMENDATION: 'RECOMMENDATION',
  COMMENT: 'COMMENT',
  SHORT_TERM_GOAL: 'SHORT_TERM_GOAL',
  SELF_ASSESSMENT_REQUEST: 'SELF_ASSESSMENT_REQUEST',
  QUESTION: 'QUESTION',
  DIFFICULTY_REPORT: 'DIFFICULTY_REPORT',
  ROUTE_CHANGE_PROPOSAL: 'ROUTE_CHANGE_PROPOSAL',
} as const;
export type FeedbackKind = ValueOf<typeof FeedbackKind>;
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  RECOMMENDATION: 'Рекомендация',
  COMMENT: 'Комментарий',
  SHORT_TERM_GOAL: 'Краткосрочная цель',
  SELF_ASSESSMENT_REQUEST: 'Запрос самооценки',
  QUESTION: 'Вопрос',
  DIFFICULTY_REPORT: 'Сообщение о затруднении',
  ROUTE_CHANGE_PROPOSAL: 'Предложение изменить маршрут',
};

export const ConsultationStatus = {
  REQUESTED: 'REQUESTED',
  SCHEDULED: 'SCHEDULED',
  HELD: 'HELD',
  CANCELLED: 'CANCELLED',
} as const;
export type ConsultationStatus = ValueOf<typeof ConsultationStatus>;
export const CONSULTATION_STATUS_LABELS: Record<ConsultationStatus, string> = {
  REQUESTED: 'Запрошена',
  SCHEDULED: 'Назначена',
  HELD: 'Проведена',
  CANCELLED: 'Отменена',
};

export const AcademicResultSource = {
  ASSIGNMENT: 'ASSIGNMENT',
  MANUAL: 'MANUAL',
  SEMESTER_IMPORT: 'SEMESTER_IMPORT',
} as const;
export type AcademicResultSource = ValueOf<typeof AcademicResultSource>;
export const ACADEMIC_RESULT_SOURCE_LABELS: Record<AcademicResultSource, string> = {
  ASSIGNMENT: 'Оценка за задание',
  MANUAL: 'Внесено вручную',
  SEMESTER_IMPORT: 'Оценка за семестр (импорт)',
};

export const ResearchProjectStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ResearchProjectStatus = ValueOf<typeof ResearchProjectStatus>;
export const RESEARCH_PROJECT_STATUS_LABELS: Record<ResearchProjectStatus, string> = {
  DRAFT: 'Подготовка',
  ACTIVE: 'Проводится',
  COMPLETED: 'Завершено',
  ARCHIVED: 'В архиве',
};

export const ResearchGroup = { EXPERIMENTAL: 'EXPERIMENTAL', CONTROL: 'CONTROL' } as const;
export type ResearchGroup = ValueOf<typeof ResearchGroup>;
export const RESEARCH_GROUP_LABELS: Record<ResearchGroup, string> = {
  EXPERIMENTAL: 'Экспериментальная группа',
  CONTROL: 'Контрольная группа',
};
