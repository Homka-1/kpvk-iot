// Библиотека материалов и заданий (ТЗ, п. 4.7, п. 8.3; FR-046, FR-047, FR-049). Схемы форм
// используются интерфейсом, сервер проверяет те же правила своими DTO.
import { z } from 'zod';
import {
  DifficultyLevel,
  MaterialKind,
  SubmissionFormat,
  type DifficultyLevel as DifficultyLevelType,
  type MaterialKind as MaterialKindType,
  type SubmissionFormat as SubmissionFormatType,
} from './enums.js';
import type { PersonRef } from './students.js';

/** Максимальный размер загружаемого файла, байт (п. 8.3: контроль загрузки файлов). */
export const FILE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Разрешённые расширения файлов (белый список). Сервер дополнительно сверяет содержимое файла
 * с расширением: переименованный исполняемый файл не пройдёт.
 */
export const FILE_UPLOAD_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'txt',
  'png',
  'jpg',
  'jpeg',
] as const;
export type FileUploadExtension = (typeof FILE_UPLOAD_EXTENSIONS)[number];

/** Подсказка о допустимых файлах для форм. */
export const FILE_UPLOAD_HINT =
  'PDF, документы Word и OpenDocument, таблицы, презентации, TXT, PNG или JPG — до 20 МБ';

/** Ссылки — только http и https: другие схемы (javascript:, data:) небезопасны. */
export const SAFE_URL_PATTERN = /^https?:\/\/[^\s]+$/i;
export const SAFE_URL_HINT = 'Укажите адрес, начинающийся с http:// или https://';

/** Стандартные типы заданий (п. 4.7); API заносит их в БД при запуске, пользователи добавляют свои. */
export const SYSTEM_ASSIGNMENT_TYPES = [
  { code: 'practical', name: 'Практическая работа' },
  { code: 'laboratory', name: 'Лабораторная работа' },
  { code: 'case', name: 'Кейс' },
  { code: 'mini_project', name: 'Мини-проект' },
  { code: 'research', name: 'Исследовательское задание' },
  { code: 'presentation', name: 'Презентация' },
  { code: 'creative', name: 'Творческая работа' },
  { code: 'independent', name: 'Самостоятельная работа' },
] as const;

export const ASSIGNMENT_CRITERIA_MAX = 20;
/**
 * Шкала оценивания задания — 100 баллов, как шкала колледжа («4» — от 70, «5» — от 90):
 * сумма максимальных баллов критериев равна 100.
 */
export const ASSIGNMENT_SCORE_MAX = 100;
export const ASSIGNMENT_ATTACHMENTS_MAX = 20;

// ── Контракты API ──

export interface FileDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MaterialDto {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKindType;
  file: FileDto | null;
  url: string | null;
  body: string | null;
  discipline: { id: string; name: string } | null;
  topic: string | null;
  archivedAt: string | null;
  createdBy: PersonRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentTypeDto {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}

export interface AssessmentCriterionDto {
  id: string;
  title: string;
  description: string | null;
  maxScore: number;
}

export interface AssignmentAttachmentDto {
  id: string;
  title: string | null;
  file: FileDto | null;
  url: string | null;
}

/** Задание библиотеки: поля карточки п. 4.7 без полей конкретного назначения (срок, статус и т. п.). */
export interface LibraryAssignmentDto {
  id: string;
  title: string;
  discipline: { id: string; name: string };
  topic: string | null;
  goal: string | null;
  difficulty: DifficultyLevelType;
  type: AssignmentTypeDto;
  instruction: string | null;
  submissionFormats: SubmissionFormatType[];
  /** Сумма максимальных баллов критериев; без критериев — null. */
  maxScore: number | null;
  criteria: AssessmentCriterionDto[];
  attachments: AssignmentAttachmentDto[];
  archivedAt: string | null;
  createdBy: PersonRef | null;
  createdAt: string;
  updatedAt: string;
}

// ── Формы ──

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не более ${max} символов`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const title = (message: string) =>
  z.string().trim().min(1, message).max(300, 'Не более 300 символов');

const safeUrl = z
  .string()
  .trim()
  .max(2000, 'Не более 2000 символов')
  .regex(SAFE_URL_PATTERN, SAFE_URL_HINT);

export const materialFormSchema = z
  .object({
    title: title('Укажите название материала'),
    description: optionalText(2000),
    kind: z.enum(Object.values(MaterialKind) as [MaterialKindType, ...MaterialKindType[]], {
      message: 'Выберите вид материала',
    }),
    fileId: z.string().nullable().optional(),
    url: z.string().trim().nullable().optional(),
    body: z.string().trim().max(20000, 'Не более 20 000 символов').nullable().optional(),
    disciplineId: z.string().nullable().optional(),
    topic: optionalText(200),
  })
  .superRefine((value, ctx) => {
    if (value.kind === MaterialKind.FILE && !value.fileId) {
      ctx.addIssue({ code: 'custom', path: ['fileId'], message: 'Загрузите файл' });
    }
    if (value.kind === MaterialKind.LINK) {
      const parsed = safeUrl.safeParse(value.url ?? '');
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: SAFE_URL_HINT });
      }
    }
    if (value.kind === MaterialKind.TEXT && !value.body) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'Введите текст материала' });
    }
  });
export type MaterialFormValues = z.infer<typeof materialFormSchema>;

export const assessmentCriterionSchema = z.object({
  title: title('Укажите название критерия'),
  description: optionalText(1000),
  maxScore: z.coerce
    .number({ message: 'Укажите максимальный балл' })
    .positive('Балл должен быть больше нуля')
    .max(ASSIGNMENT_SCORE_MAX, `Не более ${ASSIGNMENT_SCORE_MAX} баллов`),
});

/**
 * Сумма максимальных баллов критериев не равна шкале задания — текст ошибки; иначе null.
 * Задание без критериев проверяется без баллов (FR-005).
 */
export function criteriaScaleIssue(criteria: readonly { maxScore: number }[]): string | null {
  if (criteria.length === 0) return null;
  const total = Math.round(criteria.reduce((sum, item) => sum + item.maxScore, 0) * 1000) / 1000;
  if (total === ASSIGNMENT_SCORE_MAX) return null;
  return `Сумма максимальных баллов критериев должна быть ${ASSIGNMENT_SCORE_MAX}, сейчас ${String(total).replace('.', ',')}`;
}

export const assignmentAttachmentSchema = z
  .object({
    title: optionalText(300),
    fileId: z.string().nullable().optional(),
    url: z.string().trim().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.fileId === !value.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Укажите либо файл, либо ссылку' });
    } else if (value.url && !SAFE_URL_PATTERN.test(value.url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: SAFE_URL_HINT });
    }
  });

export const libraryAssignmentFormSchema = z.object({
  title: title('Укажите название задания'),
  disciplineId: z.string({ message: 'Выберите дисциплину' }).min(1, 'Выберите дисциплину'),
  topic: optionalText(200),
  goal: optionalText(2000),
  difficulty: z.enum(
    Object.values(DifficultyLevel) as [DifficultyLevelType, ...DifficultyLevelType[]],
    { message: 'Выберите уровень сложности' },
  ),
  typeId: z.string({ message: 'Выберите тип задания' }).min(1, 'Выберите тип задания'),
  instruction: optionalText(20000),
  submissionFormats: z
    .array(
      z.enum(Object.values(SubmissionFormat) as [SubmissionFormatType, ...SubmissionFormatType[]]),
    )
    .min(1, 'Выберите хотя бы один формат сдачи'),
  criteria: z
    .array(assessmentCriterionSchema)
    .max(ASSIGNMENT_CRITERIA_MAX, `Не более ${ASSIGNMENT_CRITERIA_MAX} критериев`),
  attachments: z
    .array(assignmentAttachmentSchema)
    .max(ASSIGNMENT_ATTACHMENTS_MAX, `Не более ${ASSIGNMENT_ATTACHMENTS_MAX} вложений`),
});
export type LibraryAssignmentFormValues = z.infer<typeof libraryAssignmentFormSchema>;

export const assignmentTypeFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название типа').max(100, 'Не более 100 символов'),
});

/** Размер файла для людей: «1,5 МБ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${units[unit]}`;
}
