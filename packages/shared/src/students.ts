// Справочники и студенты (ТЗ, п. 4.2; FR-006–FR-011). Схемы форм используются интерфейсом,
// сервер проверяет те же правила своими DTO.
import { z } from 'zod';
import type {
  MotivationLevel,
  MotivationProfileStatus,
  SupportStatus,
  TrajectoryStatus,
} from './enums.js';

/** Код участника исследования: латинские буквы, цифры и дефис (хранится в верхнем регистре). */
export const PARTICIPANT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const PARTICIPANT_CODE_HINT =
  'Код участника: 3–32 символа, латинские буквы, цифры и дефис, начинается с буквы или цифры';

/** Максимум строк в одном файле импорта студентов. */
export const STUDENT_IMPORT_MAX_ROWS = 300;
/** Максимальный размер файла импорта, байт. */
export const STUDENT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Колонки файла импорта (CSV или XLSX, первая строка — заголовки). Формат принят по умолчанию
 * до ответа заказчика (open-questions, вопрос 7). Заголовки сравниваются без учёта регистра.
 */
export const STUDENT_IMPORT_COLUMNS = [
  { key: 'lastName', title: 'Фамилия', required: true },
  { key: 'firstName', title: 'Имя', required: true },
  { key: 'middleName', title: 'Отчество', required: false },
  { key: 'groupName', title: 'Группа', required: true },
  { key: 'participantCode', title: 'Код участника', required: false },
  { key: 'login', title: 'Логин', required: false },
] as const;
export type StudentImportField = (typeof STUDENT_IMPORT_COLUMNS)[number]['key'];

/** Значения фильтра «Мотивационный профиль» (FR-008): уровень или «требуется дополнительная диагностика». */
export const PROFILE_FILTER_VALUES = ['HIGH', 'MEDIUM', 'LOW', 'NEEDS_MORE_DIAGNOSTICS'] as const;
export type ProfileFilterValue = (typeof PROFILE_FILTER_VALUES)[number];

// ── Контракты API ──

export interface GroupRef {
  id: string;
  name: string;
  course: number;
  specialty: string;
}

export interface GroupDto extends GroupRef {
  archivedAt: string | null;
  /** Студентов в группе (без архивных). */
  studentCount: number;
}

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface DisciplineDto {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  archivedAt: string | null;
  /** Группы и преподаватели из действующих закреплений в пределах доступной области. */
  groups: Pick<GroupRef, 'id' | 'name'>[];
  teachers: PersonRef[];
}

export interface TeacherAssignmentDto {
  id: string;
  teacher: PersonRef;
  group: Pick<GroupRef, 'id' | 'name'>;
  discipline: { id: string; name: string };
  startsAt: string;
  endsAt: string | null;
}

/** Строка списка студентов: поля карточки п. 4.2. `null` — данных пока нет (FR-005). */
export interface StudentSummaryDto {
  id: string;
  participantCode: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  login: string | null;
  group: GroupRef | null;
  supportStatus: SupportStatus;
  archivedAt: string | null;
  motivationProfile: { status: MotivationProfileStatus; level: MotivationLevel | null } | null;
  currentTrajectory: {
    id: string;
    status: TrajectoryStatus;
    disciplineName: string;
    /** Прогресс маршрута, %; появится вместе с выполнением заданий (этап 13). */
    progress: number | null;
  } | null;
  averageScore: number | null;
  completedAssignments: number | null;
  lastActivityAt: string | null;
}

export interface StudentPageDto {
  items: StudentSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EnrollmentDto {
  id: string;
  group: Pick<GroupRef, 'id' | 'name'>;
  startsAt: string;
  endsAt: string | null;
  reason: string | null;
}

export interface StudentDetailsDto extends StudentSummaryDto {
  archiveReason: string | null;
  createdAt: string;
  /** История групп: текущая запись без даты окончания (FR-010). */
  enrollments: EnrollmentDto[];
}

/** Результат создания студента. Временный пароль показывается один раз; при повторе запроса — null. */
export interface StudentCreatedDto {
  student: StudentDetailsDto;
  login: string;
  temporaryPassword: string | null;
}

export interface StudentImportRowDto {
  /** Номер строки в файле (с учётом строки заголовков). */
  line: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  groupName: string;
  participantCode: string | null;
  login: string | null;
  /** Пустой список — строка готова к импорту. */
  errors: string[];
}

export interface StudentImportPreviewDto {
  rows: StudentImportRowDto[];
  validCount: number;
  invalidCount: number;
  /** Ошибки файла целиком (нет обязательных колонок и т. п.). */
  fileErrors: string[];
}

export interface StudentImportResultDto {
  created: StudentCreatedDto[];
  /** true — ответ на повторную отправку того же импорта: новых записей не создано. */
  replayed: boolean;
}

// ── Схемы форм (zod) ──

const name = (message: string) =>
  z.string().trim().min(1, message).max(100, 'Не более 100 символов');
const optionalText = z.string().trim().max(100, 'Не более 100 символов').optional();

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название группы').max(50, 'Не более 50 символов'),
  course: z.coerce
    .number({ invalid_type_error: 'Укажите курс' })
    .int('Курс — целое число')
    .min(1, 'Курс от 1 до 6')
    .max(6, 'Курс от 1 до 6'),
  specialty: z.string().trim().min(1, 'Укажите специальность').max(200, 'Не более 200 символов'),
});
export type GroupFormValues = z.infer<typeof groupFormSchema>;

export const disciplineFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название дисциплины').max(200, 'Не более 200 символов'),
  code: z.string().trim().max(50, 'Не более 50 символов').optional(),
  description: z.string().trim().max(2000, 'Не более 2000 символов').optional(),
});
export type DisciplineFormValues = z.infer<typeof disciplineFormSchema>;

export const studentFormSchema = z.object({
  lastName: name('Укажите фамилию'),
  firstName: name('Укажите имя'),
  middleName: optionalText,
  groupId: z.string().min(1, 'Выберите группу'),
  participantCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PARTICIPANT_CODE_PATTERN, PARTICIPANT_CODE_HINT)
    .optional()
    .or(z.literal('')),
});
export type StudentFormValues = z.infer<typeof studentFormSchema>;

export const studentEditFormSchema = studentFormSchema.pick({
  lastName: true,
  firstName: true,
  middleName: true,
});
export type StudentEditFormValues = z.infer<typeof studentEditFormSchema>;

export const reasonFormSchema = z.object({
  reason: z.string().trim().min(1, 'Укажите причину').max(500, 'Не более 500 символов'),
});

export const transferFormSchema = reasonFormSchema.extend({
  groupId: z.string().min(1, 'Выберите группу'),
});
export type TransferFormValues = z.infer<typeof transferFormSchema>;
