// Занятия по расписанию и журнал педагогических наблюдений на занятии (этап 25; FR-014, FR-074).
import { z } from 'zod';
import type { PersonRef } from './students.js';

/** Оценка по критерию наблюдения. */
export const LESSON_SCORE_MIN = 1;
export const LESSON_SCORE_MAX = 5;
/** Знаков после запятой у средней оценки по критерию. */
export const LESSON_MEAN_DECIMALS = 1;
/** Активных критериев наблюдения не больше этого числа: журнал должен помещаться на экране. */
export const OBSERVATION_CRITERIA_MAX = 12;
export const OBSERVATION_CRITERION_NAME_MAX = 120;
/** Занятий в списке раздела не больше: остальные — сузить период или группу. */
export const LESSONS_LIST_LIMIT = 300;
/** Импорт расписания: строк и байт в файле. */
export const LESSON_IMPORT_MAX_ROWS = 2000;
export const LESSON_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Колонки файла расписания (CSV или XLSX, первая строка — заголовки), формат утверждён заказчиком:
 * `Дата | Время | Группа | Дисциплина | Преподаватель`. Заголовки сравниваются без учёта регистра.
 */
export const LESSON_IMPORT_COLUMNS = [
  { key: 'date', title: 'Дата', required: true, aliases: ['дата', 'date'] },
  { key: 'time', title: 'Время', required: true, aliases: ['время', 'время начала', 'time'] },
  { key: 'groupName', title: 'Группа', required: true, aliases: ['группа', 'group'] },
  {
    key: 'disciplineName',
    title: 'Дисциплина',
    required: true,
    aliases: ['дисциплина', 'предмет', 'discipline'],
  },
  {
    key: 'teacherName',
    title: 'Преподаватель',
    required: true,
    aliases: ['преподаватель', 'фио преподавателя', 'teacher'],
  },
] as const;
export type LessonImportField = (typeof LESSON_IMPORT_COLUMNS)[number]['key'];

/**
 * Дата из файла расписания: «дд.мм.гггг», «дд/мм/гггг», «дд-мм-гггг», «гггг-мм-дд»
 * (двузначный год — 20xx). Возвращает «гггг-мм-дд» или null, если дата не существует.
 */
export function parseScheduleDate(value: string): string | null {
  const text = value.trim();
  let day: number;
  let month: number;
  let year: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(text);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (local) {
    [day, month, year] = [Number(local[1]), Number(local[2]), Number(local[3])];
    if (year < 100) year += 2000;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
  if (date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Время начала занятия: «8:30», «08.30», «08:30–10:00» (берётся начало). Возвращает «ЧЧ:ММ»
 * или null.
 */
export function parseScheduleTime(value: string): string | null {
  const match = /^(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*\d{1,2}[:.]\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** ФИО для сравнения: нижний регистр, «ё» = «е», без точек и лишних пробелов. */
export function normalizePersonName(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Варианты записи ФИО преподавателя в расписании: полностью, «Фамилия И. О.», «Фамилия И.»,
 * только фамилия. Все варианты нормализованы (`normalizePersonName`).
 */
export function personNameKeys(person: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string[] {
  const last = normalizePersonName(person.lastName);
  const first = normalizePersonName(person.firstName);
  const middle = normalizePersonName(person.middleName ?? '');
  const initials = [first[0], middle[0]].filter(Boolean).join(' ');
  return [
    ...new Set([
      [last, first, middle].filter(Boolean).join(' '),
      [last, first].join(' '),
      `${last} ${initials}`,
      `${last} ${first[0] ?? ''}`.trim(),
      last,
    ]),
  ];
}

// ── Журнал занятия ──

/** Оценка в журнале: 1–5, «Не наблюдалось» (null). Отсутствие оценки — «нет данных». */
export type LessonScore = number | null;

export type LessonJournalStatus = 'EMPTY' | 'PARTIAL' | 'COMPLETE';

export const LESSON_JOURNAL_STATUS_LABELS: Record<LessonJournalStatus, string> = {
  EMPTY: 'Журнал не заполнен',
  PARTIAL: 'Журнал заполнен частично',
  COMPLETE: 'Журнал заполнен',
};

/**
 * Заполненность журнала: студент учтён, если отмечен отсутствующим или по каждому активному
 * критерию стоит оценка или «Не наблюдалось».
 */
export function lessonJournalStatus(done: number, total: number): LessonJournalStatus {
  if (done === 0) return 'EMPTY';
  return done >= total ? 'COMPLETE' : 'PARTIAL';
}

/** Средние оценки по критериям за период: только поставленные оценки, без «Не наблюдалось». */
export interface CriterionSummaryDto {
  criterionId: string;
  /** null — оценок нет («нет данных»), не ноль (FR-074). */
  mean: number | null;
  /** Число оценок 1–5. */
  rated: number;
  /** Сколько раз отмечено «Не наблюдалось». */
  notObserved: number;
}

export function summarizeCriteria(
  criterionIds: readonly string[],
  ratings: readonly { criterionId: string; score: LessonScore }[],
): CriterionSummaryDto[] {
  return criterionIds.map((criterionId) => {
    const own = ratings.filter((rating) => rating.criterionId === criterionId);
    const scores = own.map((rating) => rating.score).filter((score) => score !== null);
    const sum = scores.reduce((total, score) => total + score, 0);
    const factor = 10 ** LESSON_MEAN_DECIMALS;
    return {
      criterionId,
      mean: scores.length ? Math.round((sum / scores.length) * factor) / factor : null,
      rated: scores.length,
      notObserved: own.length - scores.length,
    };
  });
}

// ── Контракты API ──

export interface ObservationCriterionDto {
  id: string;
  name: string;
  /** Архивный критерий не предлагается в новых журналах, его оценки сохраняются. */
  archived: boolean;
}

export const observationCriteriaSchema = z
  .array(
    z.object({
      id: z.string().uuid().optional(),
      name: z
        .string()
        .trim()
        .min(1, 'Укажите название критерия')
        .max(OBSERVATION_CRITERION_NAME_MAX, `Не более ${OBSERVATION_CRITERION_NAME_MAX} символов`),
      archived: z.boolean(),
    }),
  )
  .refine(
    (items) => items.some((item) => !item.archived),
    'Нужен хотя бы один действующий критерий',
  )
  .refine(
    (items) => items.filter((item) => !item.archived).length <= OBSERVATION_CRITERIA_MAX,
    `Не более ${OBSERVATION_CRITERIA_MAX} действующих критериев`,
  )
  .refine(
    (items) => new Set(items.map((item) => item.name.trim().toLowerCase())).size === items.length,
    'Названия критериев не должны повторяться',
  );
export type ObservationCriteriaInput = z.input<typeof observationCriteriaSchema>;

export interface LessonDto {
  id: string;
  /** «гггг-мм-дд». */
  date: string;
  /** «ЧЧ:ММ». */
  startTime: string;
  group: { id: string; name: string };
  discipline: { id: string; name: string };
  teacher: PersonRef;
  journal: { status: LessonJournalStatus; done: number; total: number };
  /** Можно заполнять журнал (наблюдения ведёт преподаватель группы и дисциплины). */
  canObserve: boolean;
  /** Можно удалить: есть право на расписание и журнал пуст. */
  canDelete: boolean;
}

export interface LessonListDto {
  items: LessonDto[];
  /** Занятий больше `LESSONS_LIST_LIMIT` — показаны последние, нужно сузить фильтр. */
  truncated: boolean;
}

export interface LessonJournalStudentDto {
  student: PersonRef;
  /** null — студент ещё не отмечен в журнале. */
  absent: boolean | null;
  /** Оценки по id критерия; нет ключа — «нет данных». */
  ratings: Record<string, LessonScore>;
}

export interface LessonJournalDto {
  lesson: LessonDto;
  /** Действующие критерии и архивные, по которым на занятии уже есть оценки. */
  criteria: ObservationCriterionDto[];
  students: LessonJournalStudentDto[];
}

export interface LessonJournalInput {
  entries: {
    studentId: string;
    absent: boolean;
    ratings: { criterionId: string; score: LessonScore }[];
  }[];
}

export interface StudentLessonRecordDto {
  lessonId: string;
  date: string;
  startTime: string;
  discipline: { id: string; name: string };
  teacher: PersonRef;
  absent: boolean;
  ratings: Record<string, LessonScore>;
}

/** История наблюдений на занятиях в профиле студента. */
export interface StudentLessonJournalDto {
  criteria: ObservationCriterionDto[];
  records: StudentLessonRecordDto[];
  summary: CriterionSummaryDto[];
  /** Занятий, на которых студент отмечен (присутствовал или отсутствовал). */
  lessons: number;
  absences: number;
}

export interface LessonImportRowDto {
  line: number;
  date: string;
  time: string;
  groupName: string;
  disciplineName: string;
  teacherName: string;
  /** Распознанные значения (если строка корректна). */
  resolved: {
    date: string;
    startTime: string;
    group: { id: string; name: string };
    discipline: { id: string; name: string };
    teacher: PersonRef;
  } | null;
  /** Такое занятие уже есть — строка будет пропущена. */
  duplicate: boolean;
  errors: string[];
}

export interface LessonImportPreviewDto {
  rows: LessonImportRowDto[];
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  fileErrors: string[];
}

export interface LessonImportResultDto {
  created: number;
  skipped: number;
  replayed: boolean;
}

/** Списки для формы занятия в пределах доступной области. */
export interface LessonOptionsDto {
  groups: { id: string; name: string }[];
  disciplines: { id: string; name: string }[];
  teachers: PersonRef[];
  /** Допустимые пары группа — дисциплина; null — любые (администратор). */
  pairs: { groupId: string; disciplineId: string }[] | null;
}
