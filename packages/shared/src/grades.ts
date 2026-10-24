// Академическая успешность по семестрам (этап 26; FR-006 по аналогии, FR-074, п. 4.10 ТЗ).
// Оценки 0–100 загружаются из файла; по дисциплине может быть несколько оценок за семестр.
import type { PersonRef } from './students.js';

/** Оценка за семестр: шкала колледжа 0–100. */
export const GRADE_SCORE_MIN = 0;
export const GRADE_SCORE_MAX = 100;
/** Знаков после запятой у средних баллов. */
export const GRADE_MEAN_DECIMALS = 1;
/** Импорт оценок: строк и байт в файле. */
export const GRADE_IMPORT_MAX_ROWS = 5000;
export const GRADE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Колонки файла оценок (CSV или XLSX, первая строка — заголовки), формат утверждён заказчиком:
 * `ФИО | Группа | Учебный год | Семестр | Дисциплина | Оценка`. Заголовки — без учёта регистра.
 */
export const GRADE_IMPORT_COLUMNS = [
  {
    key: 'studentName',
    title: 'ФИО',
    required: true,
    aliases: ['фио', 'фио студента', 'студент', 'обучающийся'],
  },
  { key: 'groupName', title: 'Группа', required: true, aliases: ['группа', 'group'] },
  {
    key: 'academicYear',
    title: 'Учебный год',
    required: true,
    aliases: ['учебный год', 'год', 'academic year'],
  },
  { key: 'semester', title: 'Семестр', required: true, aliases: ['семестр', 'semester'] },
  {
    key: 'disciplineName',
    title: 'Дисциплина',
    required: true,
    aliases: ['дисциплина', 'предмет', 'discipline'],
  },
  { key: 'score', title: 'Оценка', required: true, aliases: ['оценка', 'балл', 'score'] },
] as const;
export type GradeImportField = (typeof GRADE_IMPORT_COLUMNS)[number]['key'];

/**
 * Учебный год: «2025/2026», «2025-2026», «2025–2026», «2025/26». Второй год — следующий за первым.
 * Возвращает «гггг/гггг» или null.
 */
export function parseAcademicYear(value: string): string | null {
  const match = /^(\d{4})\s*[/\-–—]\s*(\d{2}|\d{4})(?:\s*(?:уч\.?\s*)?(?:г\.?|гг\.?|год))?$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const start = Number(match[1]);
  const end =
    match[2]!.length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) : Number(match[2]);
  if (end !== start + 1 || start < 2000 || start > 2099) return null;
  return `${start}/${end}`;
}

/** Семестр учебного года: «1», «2», «I», «II», «1 семестр». Возвращает 1, 2 или null. */
export function parseSemester(value: string): 1 | 2 | null {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s*(-?й)?\s*(семестр|сем\.?)?$/, '');
  if (text === '1' || text === 'i') return 1;
  if (text === '2' || text === 'ii') return 2;
  return null;
}

/** Оценка 0–100: целое или дробное число («85», «85,5»). Возвращает число или null. */
export function parseGradeScore(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const score = Number(text);
  return score >= GRADE_SCORE_MIN && score <= GRADE_SCORE_MAX ? score : null;
}

export interface AcademicPeriodRef {
  academicYear: string;
  semester: number;
}

/** Подпись периода: «2025/2026, 1 семестр». */
export function formatAcademicPeriod(period: AcademicPeriodRef): string {
  return `${period.academicYear}, ${period.semester} семестр`;
}

/** Порядок периодов по времени: сначала ранние. */
export function compareAcademicPeriods(a: AcademicPeriodRef, b: AcademicPeriodRef): number {
  return a.academicYear.localeCompare(b.academicYear) || a.semester - b.semester;
}

const roundMean = (value: number) => {
  const factor = 10 ** GRADE_MEAN_DECIMALS;
  return Math.round(value * factor) / factor;
};

/** Среднее с округлением до 0,1; пустой список — null («нет данных», не ноль — FR-074). */
export function gradeMean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return roundMean(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Разность средних (текущий − прежний); нет одного из значений — null. */
export function gradeDelta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : roundMean(current - previous);
}

export interface DisciplineMean {
  disciplineId: string;
  mean: number;
  count: number;
}

/**
 * Средние баллы студента за семестр: по каждой дисциплине — среднее её оценок, общий балл —
 * среднее средних по дисциплинам (каждая дисциплина весит одинаково, сколько бы ни было оценок;
 * решение заказчика 2026-10-25). Без оценок общий балл — null.
 */
export function summarizeSemester(grades: readonly { disciplineId: string; score: number }[]): {
  disciplines: DisciplineMean[];
  overall: number | null;
} {
  const byDiscipline = new Map<string, number[]>();
  for (const grade of grades) {
    byDiscipline.set(grade.disciplineId, [
      ...(byDiscipline.get(grade.disciplineId) ?? []),
      grade.score,
    ]);
  }
  const disciplines = [...byDiscipline].map(([disciplineId, scores]) => ({
    disciplineId,
    mean: gradeMean(scores)!,
    count: scores.length,
  }));
  // Общий балл — по неокруглённым средним дисциплин, чтобы не накапливать ошибку округления.
  const exact = [...byDiscipline.values()].map(
    (scores) => scores.reduce((sum, value) => sum + value, 0) / scores.length,
  );
  return { disciplines, overall: gradeMean(exact) };
}

// ── DTO ──

export interface AcademicPeriodDto extends AcademicPeriodRef {
  id: string;
  label: string;
}

/** Учебный период для ответа API: с подписью. */
export function academicPeriodDto(row: AcademicPeriodRef & { id: string }): AcademicPeriodDto {
  return {
    id: row.id,
    academicYear: row.academicYear,
    semester: row.semester,
    label: formatAcademicPeriod(row),
  };
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface StudentDisciplineGradesDto {
  discipline: NamedRef;
  /** Оценки в порядке загрузки. */
  scores: number[];
  mean: number;
}

/** Успеваемость студента за один семестр. */
export interface StudentSemesterDto {
  period: AcademicPeriodDto;
  /** Группы, указанные в файлах оценок за этот семестр. */
  groups: NamedRef[];
  disciplines: StudentDisciplineGradesDto[];
  overall: number | null;
}

/** Академическая успешность в профиле студента: семестры от последнего к первому. */
export interface StudentGradesDto {
  semesters: StudentSemesterDto[];
}

export interface GroupGradesStudentDto {
  student: PersonRef;
  /** Общий балл за выбранный семестр; null — нет оценок. */
  overall: number | null;
  disciplineCount: number;
  /** Общий балл за семестр сравнения; null — нет оценок или сравнение не выбрано. */
  compareOverall: number | null;
  delta: number | null;
}

export interface GroupGradesDisciplineDto {
  discipline: NamedRef;
  /** Средний балл группы по дисциплине: среднее средних студентов. */
  mean: number | null;
  /** Студентов с оценками по дисциплине. */
  students: number;
  compareMean: number | null;
  delta: number | null;
}

/** Успеваемость группы за семестр и, по желанию, сравнение с другим семестром. */
export interface GroupGradesDto {
  group: NamedRef;
  period: AcademicPeriodDto;
  comparePeriod: AcademicPeriodDto | null;
  /** Средний общий балл группы: среднее общих баллов студентов с оценками. */
  overall: number | null;
  compareOverall: number | null;
  delta: number | null;
  disciplines: GroupGradesDisciplineDto[];
  students: GroupGradesStudentDto[];
}

export interface GradeImportRowDto {
  line: number;
  studentName: string;
  groupName: string;
  academicYear: string;
  semester: string;
  disciplineName: string;
  score: string;
  resolved: {
    student: PersonRef;
    group: NamedRef;
    period: AcademicPeriodRef & { label: string };
    discipline: NamedRef;
    score: number;
  } | null;
  errors: string[];
}

export interface GradeImportPreviewDto {
  rows: GradeImportRowDto[];
  validCount: number;
  invalidCount: number;
  fileErrors: string[];
  /** Те же оценки уже загружены (файл загружается повторно) — импорт будет отклонён. */
  alreadyImported: { fileName: string; createdAt: string } | null;
}

export interface GradeImportResultDto {
  importId: string;
  created: number;
  replayed: boolean;
}

/** Загрузка оценок в списке «Загрузки»: отменённая хранится, её оценки удалены. */
export interface GradeImportDto {
  id: string;
  fileName: string;
  rowCount: number;
  createdAt: string;
  author: PersonRef;
  cancelledAt: string | null;
  periods: string[];
  groups: string[];
  canCancel: boolean;
}

export interface GradeOptionsDto {
  periods: AcademicPeriodDto[];
  groups: NamedRef[];
}
