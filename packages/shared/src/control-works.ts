// Академические достижения: контрольные работы (этап 28; FR-074, п. 4.10 ТЗ).
// Одна работа назначается нескольким группам: одинаковые входные и итоговые задания с единой
// рубрикой позволяют сравнить экспериментальную и контрольную группы. Результат — балл 0–100
// или отметка (отсутствовал, не выполнил, освобождён); отметка не превращается в ноль.
import type { NamedRef } from './grades.js';
import { GRADE_SCORE_MAX, GRADE_SCORE_MIN } from './grades.js';
import { type DescriptiveStats, descriptiveStats } from './statistics.js';
import type { PersonRef } from './students.js';

/** Вид контроля. */
export const ControlKind = { ENTRY: 'ENTRY', CURRENT: 'CURRENT', FINAL: 'FINAL' } as const;
export type ControlKind = (typeof ControlKind)[keyof typeof ControlKind];

export const CONTROL_KIND_LABELS: Record<ControlKind, string> = {
  ENTRY: 'Входной контроль',
  CURRENT: 'Текущий контроль',
  FINAL: 'Итоговый контроль',
};

/** Порядок видов контроля в списках и графиках. */
export const CONTROL_KINDS: readonly ControlKind[] = ['ENTRY', 'CURRENT', 'FINAL'];

/** Отметка вместо балла: работа не оценивалась, в средние не входит (FR-074). */
export const ControlMark = {
  ABSENT: 'ABSENT',
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  EXEMPT: 'EXEMPT',
} as const;
export type ControlMark = (typeof ControlMark)[keyof typeof ControlMark];

export const CONTROL_MARK_LABELS: Record<ControlMark, string> = {
  ABSENT: 'Отсутствовал',
  NOT_SUBMITTED: 'Не выполнил работу',
  EXEMPT: 'Освобождён',
};

export const CONTROL_MARKS: readonly ControlMark[] = ['ABSENT', 'NOT_SUBMITTED', 'EXEMPT'];

/** Балл по единой 100-балльной шкале, с точностью до 0,1. */
export const CONTROL_SCORE_MIN = GRADE_SCORE_MIN;
export const CONTROL_SCORE_MAX = GRADE_SCORE_MAX;
export const CONTROL_TOPIC_MAX = 300;
export const CONTROL_CRITERIA_MAX = 5000;

/** Допустимый балл: число 0–100 с не более чем одним знаком после запятой. */
export function isControlScore(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= CONTROL_SCORE_MIN &&
    value <= CONTROL_SCORE_MAX &&
    Math.abs(Math.round(value * 10) - value * 10) < 1e-9
  );
}

/** Результат студента: балл, отметка или ничего («нет данных»). */
export interface ControlResultValue {
  score: number | null;
  mark: ControlMark | null;
}

const MARK_ALIASES: Record<ControlMark, readonly string[]> = {
  ABSENT: ['отсутствовал', 'отсутствовала', 'отсутствует', 'н', 'нб', 'н/б', 'не был', 'не была'],
  NOT_SUBMITTED: [
    'не выполнил',
    'не выполнила',
    'не выполнил работу',
    'не выполнила работу',
    'не выполнено',
    'не сдал',
    'не сдала',
    'нв',
  ],
  EXEMPT: ['освобожден', 'освобождена', 'осв'],
};

/**
 * Значение ячейки «Результат» из файла: балл («85», «85,5»), отметка («Отсутствовал», «н»,
 * «Не выполнил», «Освобождён») или пусто — нет данных. Нераспознанное значение — `invalid`.
 */
export function parseControlResult(value: string): ControlResultValue | 'invalid' {
  const text = value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  if (!text) return { score: null, mark: null };
  for (const mark of CONTROL_MARKS) {
    if (MARK_ALIASES[mark].includes(text)) return { score: null, mark };
  }
  if (!/^\d{1,3}([.,]\d+)?$/.test(text)) return 'invalid';
  const score = Number(text.replace(',', '.'));
  return isControlScore(score) ? { score, mark: null } : 'invalid';
}

/**
 * Колонки файла результатов (CSV или XLSX, первая строка — заголовки): `ФИО | Результат`.
 * Файл загружается в ведомость одной группы; колонка «Группа», если есть, не используется.
 */
export const CONTROL_IMPORT_COLUMNS = [
  {
    key: 'studentName',
    title: 'ФИО',
    required: true,
    aliases: ['фио', 'фио студента', 'студент', 'обучающийся'],
  },
  {
    key: 'result',
    title: 'Результат',
    required: true,
    aliases: ['результат', 'балл', 'баллы', 'оценка'],
  },
] as const;
export type ControlImportField = (typeof CONTROL_IMPORT_COLUMNS)[number]['key'];
export const CONTROL_IMPORT_MAX_ROWS = 500;
export const CONTROL_IMPORT_MAX_BYTES = 1024 * 1024;

/** Подпись работы: «Входной контроль: Создание веб-страниц». */
export function controlWorkLabel(work: { kind: ControlKind; topic: string }): string {
  return `${CONTROL_KIND_LABELS[work.kind]}: ${work.topic}`;
}

/** Сводка результатов группы: статистики баллов и число отметок; «нет данных» — отдельно. */
export interface ControlResultsSummary {
  stats: DescriptiveStats;
  marks: Record<ControlMark, number>;
  /** Студентов без балла и без отметки. */
  noData: number;
}

export function summarizeControlResults(
  results: readonly ControlResultValue[],
): ControlResultsSummary {
  const marks = Object.fromEntries(CONTROL_MARKS.map((mark) => [mark, 0])) as Record<
    ControlMark,
    number
  >;
  let noData = 0;
  for (const result of results) {
    if (result.mark) marks[result.mark] += 1;
    else if (result.score === null) noData += 1;
  }
  // Пропуском в статистиках считается любой студент без балла: отметка или нет данных.
  return { stats: descriptiveStats(results.map((result) => result.score)), marks, noData };
}

const roundTenth = (value: number) => Math.round(value * 10) / 10;

/** Среднее баллов с округлением до 0,1; без баллов — null (FR-074). */
export function controlMean(values: readonly number[]): number | null {
  return values.length
    ? roundTenth(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

/** Входной и итоговый результат по дисциплине: средние баллов работ этого вида. */
export interface ControlProgress {
  disciplineId: string;
  entry: number | null;
  final: number | null;
  /** Итоговый − входной; нет одного из них — null. */
  delta: number | null;
}

export function controlProgress(
  results: readonly { disciplineId: string; kind: ControlKind; score: number | null }[],
): ControlProgress[] {
  const disciplineIds = [...new Set(results.map((result) => result.disciplineId))];
  return disciplineIds.map((disciplineId) => {
    const scores = (kind: ControlKind) =>
      results.flatMap((result) =>
        result.disciplineId === disciplineId && result.kind === kind && result.score !== null
          ? [result.score]
          : [],
      );
    const entry = controlMean(scores('ENTRY'));
    const final = controlMean(scores('FINAL'));
    return {
      disciplineId,
      entry,
      final,
      delta: entry === null || final === null ? null : roundTenth(final - entry),
    };
  });
}

// ── DTO ──

export interface ControlWorkGroupDto {
  group: NamedRef;
  /** Дата проведения в группе, `YYYY-MM-DD`. */
  date: string;
  /** Студентов с баллом. */
  scored: number;
  /** Средний балл группы; нет баллов — null. */
  mean: number | null;
}

export interface ControlWorkDto {
  id: string;
  discipline: NamedRef;
  topic: string;
  kind: ControlKind;
  /** Критерии оценивания (рубрика) текстом. */
  criteria: string | null;
  groups: ControlWorkGroupDto[];
  author: PersonRef | null;
  createdAt: string;
  /** Пользователь может менять работу и вносить результаты во всех её группах. */
  canEdit: boolean;
}

export interface ControlWorkListDto {
  items: ControlWorkDto[];
}

/** Сравнение групп по работе: одинаковое задание и рубрика у всех групп. */
export interface ControlWorkGroupStatsDto extends ControlResultsSummary {
  group: NamedRef;
  date: string;
}

export interface ControlWorkDetailDto {
  work: ControlWorkDto;
  groups: ControlWorkGroupStatsDto[];
}

export interface ControlSheetRowDto extends ControlResultValue {
  student: PersonRef;
}

/** Ведомость группы по работе: все студенты группы и те, у кого уже есть результат. */
export interface ControlSheetDto {
  work: ControlWorkDto;
  group: NamedRef;
  date: string;
  rows: ControlSheetRowDto[];
  canEdit: boolean;
}

export interface ControlImportRowDto {
  line: number;
  studentName: string;
  result: string;
  resolved: (ControlResultValue & { student: PersonRef }) | null;
  errors: string[];
}

/** Разбор файла результатов: строки сопоставлены со студентами ведомости, ничего не сохранено. */
export interface ControlImportPreviewDto {
  rows: ControlImportRowDto[];
  validCount: number;
  invalidCount: number;
  fileErrors: string[];
}

export interface ControlOptionsDto {
  groups: NamedRef[];
  disciplines: NamedRef[];
  /** Пары группа — дисциплина, в которых пользователь ведёт работы; null — любые. */
  pairs: { groupId: string; disciplineId: string }[] | null;
}

/** Результат студента в профиле и кабинете. */
export interface StudentControlResultDto extends ControlResultValue {
  work: { id: string; topic: string; kind: ControlKind; discipline: NamedRef };
  date: string;
}

export interface StudentControlProgressDto {
  discipline: NamedRef;
  entry: number | null;
  final: number | null;
  delta: number | null;
}

/** Академические достижения студента: результаты по дате и входной → итоговый по дисциплинам. */
export interface StudentControlResultsDto {
  results: StudentControlResultDto[];
  progress: StudentControlProgressDto[];
}
