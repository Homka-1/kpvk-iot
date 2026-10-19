// Отчёты (ТЗ, п. 4.10, 6.1; FR-076–FR-080). Отчёт — документ из реквизитов, показателей и таблиц;
// один и тот же документ выводится в PDF и XLSX. Пропуск — «Нет данных», а не ноль (FR-005, FR-074).
import { type DescriptiveStats, DESCRIPTIVE_STATS_COLUMNS } from './statistics.js';
import { localDate } from './trajectories.js';

export const ReportKind = {
  STUDENT: 'student',
  GROUP: 'group',
  TRAJECTORIES: 'trajectories',
  DIAGNOSTICS: 'diagnostics',
} as const;
export type ReportKind = (typeof ReportKind)[keyof typeof ReportKind];

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  student: 'Индивидуальный отчёт студента',
  group: 'Отчёт по группе',
  trajectories: 'Отчёт по реализации ИОТ',
  diagnostics: 'Отчёт по диагностике',
};

export const REPORT_KIND_DESCRIPTIONS: Record<ReportKind, string> = {
  student:
    'Профиль, ИОТ и их выполнение, результаты диагностики и динамика студента. Служебные заметки преподавателя в отчёт не попадают.',
  group:
    'Состав группы, распределение мотивационных профилей, выполнение ИОТ и академическая успешность.',
  trajectories:
    'Статус, прогресс, этапы, контрольные точки и оценки по каждой ИОТ, предупреждения о просрочках.',
  diagnostics:
    'Завершённые и незавершённые прохождения методики, статистики шкал по замерам и изменение до и после сопровождения.',
};

export const ReportFormat = { PDF: 'pdf', XLSX: 'xlsx' } as const;
export type ReportFormat = (typeof ReportFormat)[keyof typeof ReportFormat];

export const NO_DATA = 'Нет данных';

export type ReportCell = string | number | null;

export interface ReportTable {
  header: string[];
  rows: ReportCell[][];
}

export interface ReportSection {
  title: string;
  /** Показатели «название — значение». */
  facts?: [string, ReportCell][];
  table?: ReportTable;
  /** Пояснение под разделом: что исключено, чего не хватает. */
  note?: string;
}

export interface ReportDocument {
  kind: ReportKind;
  title: string;
  /** Момент формирования, ISO. */
  generatedAt: string;
  /** Период, например «Учебный год (01.09.2026 – 20.10.2026)». */
  period: string;
  /** Кто сформировал отчёт: Ф. И. О. пользователя. */
  author: string;
  /** Условия отбора: группа, дисциплина, студент. */
  scope: string[];
  sections: ReportSection[];
}

/** Значение для вывода: пропуск — «Нет данных». */
export function reportText(value: ReportCell | undefined): string {
  return value === null || value === undefined || value === '' ? NO_DATA : String(value);
}

/** Строка таблицы статистик: название и n, пропуски, среднее… (нет значений — «Нет данных»). */
export function statsTable(
  rows: readonly { label: string; stats: DescriptiveStats }[],
): ReportTable {
  return {
    header: ['Показатель', ...DESCRIPTIVE_STATS_COLUMNS.map((column) => column.label)],
    rows: rows.map(({ label, stats }) => [
      label,
      ...DESCRIPTIVE_STATS_COLUMNS.map((column) => stats[column.key]),
    ]),
  };
}

/** Имя файла отчёта без недопустимых символов: `<вид>-<дата>.<формат>`. */
export function reportFileName(kind: ReportKind, format: ReportFormat, date: string): string {
  return `report-${kind}-${date}.${format}`;
}

/** Дата в формате дд.мм.гггг (местное время; принимает ISO-момент или `YYYY-MM-DD`). */
export function formatDateRu(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDate(value);
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

/** Период отчёта: «Учебный год (01.09.2026 – 20.10.2026)»; без границ — только название. */
export function reportPeriodText(
  label: string,
  period: { from: string | null; to: string | null },
): string {
  if (!period.from && !period.to) return label;
  const from = period.from ? formatDateRu(period.from) : '…';
  const to = period.to ? formatDateRu(period.to) : '…';
  return `${label} (${from} – ${to})`;
}
