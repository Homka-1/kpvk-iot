// Повторная диагностика и сравнение замеров (ТЗ, п. 4.4, 4.10; UC-06; FR-015, FR-024, FR-025, FR-074).
// Сравнение и таблица выгрузки — чистые функции: одни и те же правила работают на сервере
// и проверяются модульными тестами.
import type {
  QuestionnaireVersionLabel,
  ScaleResultDto,
  StudentRef,
} from './diagnostic-sessions.js';
import {
  DIAGNOSTIC_SOURCE_LABELS,
  type DiagnosticSource,
  MEASUREMENT_TYPE_LABELS,
  MeasurementType,
  type QuestionnaireVersionStatus,
} from './enums.js';
import type { PersonRef } from './students.js';

export const COMPARABILITY_NOTE_MAX = 1000;

// ── Сопоставимость версий ──

/** Ключ пары версий без учёта порядка. */
export function comparabilityKey(versionA: string, versionB: string): string {
  return versionA < versionB ? `${versionA}:${versionB}` : `${versionB}:${versionA}`;
}

/**
 * Сопоставимы ли две версии методики: одна и та же версия либо пара, сопоставимость которой
 * утвердил исследователь (UC-06). Сопоставимость не транзитивна: каждая пара утверждается явно.
 */
export function versionsComparable(
  versionA: string,
  versionB: string,
  approved: ReadonlySet<string>,
): boolean {
  return versionA === versionB || approved.has(comparabilityKey(versionA, versionB));
}

export interface ComparabilityVersionDto {
  id: string;
  versionNumber: number;
  title: string;
  status: QuestionnaireVersionStatus;
  publishedAt: string | null;
}

export interface VersionComparabilityDto {
  id: string;
  versionA: { id: string; versionNumber: number };
  versionB: { id: string; versionNumber: number };
  note: string | null;
  approvedAt: string;
  approvedBy: PersonRef | null;
}

/** Методика с опубликованными версиями и утверждёнными парами сопоставимых версий. */
export interface ComparabilityQuestionnaireDto {
  id: string;
  title: string;
  isDemo: boolean;
  /** Версии, которые публиковались (их можно назначать и сравнивать), от новой к старой. */
  versions: ComparabilityVersionDto[];
  comparabilities: VersionComparabilityDto[];
}

// ── Сравнение замеров студента ──

/** Завершённое прохождение — исходные данные для сравнения. */
export interface ComparisonSessionInput {
  id: string;
  questionnaire: QuestionnaireVersionLabel;
  measurementType: MeasurementType;
  source: DiagnosticSource;
  completedAt: string;
  scores: ScaleResultDto[];
}

export interface ComparisonMeasurementDto {
  sessionId: string;
  measurementType: MeasurementType;
  source: DiagnosticSource;
  versionId: string;
  versionNumber: number;
  completedAt: string;
  /** Результат по коду шкалы; null — шкалы нет в этой версии методики. */
  values: Record<string, ScaleResultDto | null>;
}

export interface ExcludedMeasurementDto {
  sessionId: string;
  measurementType: MeasurementType;
  versionNumber: number;
  completedAt: string;
  reason: string;
}

/** Сравнение замеров по одной методике (FR-024): базовый замер и сопоставимые с ним. */
export interface DiagnosticComparisonDto {
  questionnaireId: string;
  title: string;
  isDemo: boolean;
  /** Шкалы базового замера в порядке методики. */
  scales: { code: string; name: string }[];
  /** От ранних к поздним; первый — базовый замер. */
  measurements: ComparisonMeasurementDto[];
  /**
   * Изменение по шкале: последний замер минус базовый. null — нет данных
   * (замер один или в одном из замеров нет балла), а не ноль (FR-074).
   */
  changes: Record<string, number | null>;
  /** Замеры по версиям, несопоставимым с версией базового замера. */
  excluded: ExcludedMeasurementDto[];
}

const byCompletion = (a: ComparisonSessionInput, b: ComparisonSessionInput) =>
  a.completedAt.localeCompare(b.completedAt);

/** Округление разности баллов до сотых, чтобы избежать хвостов двоичной арифметики. */
const roundScore = (value: number) => Math.round(value * 100) / 100;

/**
 * Сравнение замеров студента по каждой методике (FR-015, FR-024; UC-06).
 * Базовый замер — самый ранний первичный, а если первичного нет — самый ранний из завершённых.
 * В сравнение входят замеры той же версии или версии, сопоставимость которой с версией базового
 * замера утвердил исследователь; остальные перечисляются отдельно с причиной. Шкалы сравниваются
 * по коду. Пропуски остаются пропусками (FR-074). Методики — от последнего замера к раннему.
 */
export function buildDiagnosticComparisons(
  sessions: readonly ComparisonSessionInput[],
  approved: ReadonlySet<string>,
): DiagnosticComparisonDto[] {
  const byQuestionnaire = new Map<string, ComparisonSessionInput[]>();
  for (const session of sessions) {
    const list = byQuestionnaire.get(session.questionnaire.questionnaireId) ?? [];
    list.push(session);
    byQuestionnaire.set(session.questionnaire.questionnaireId, list);
  }
  const comparisons: { latest: string; comparison: DiagnosticComparisonDto }[] = [];
  for (const [questionnaireId, list] of byQuestionnaire) {
    const ordered = [...list].sort(byCompletion);
    const baseline =
      ordered.find((session) => session.measurementType === MeasurementType.PRIMARY) ?? ordered[0]!;
    const baseVersion = baseline.questionnaire.versionId;
    const scales = baseline.scores.map((score) => ({ code: score.code, name: score.name }));
    const included = ordered.filter(
      (session) =>
        session === baseline ||
        (session.completedAt >= baseline.completedAt &&
          versionsComparable(baseVersion, session.questionnaire.versionId, approved)),
    );
    const excluded = ordered
      .filter((session) => !included.includes(session))
      .map((session): ExcludedMeasurementDto => ({
        sessionId: session.id,
        measurementType: session.measurementType,
        versionNumber: session.questionnaire.versionNumber,
        completedAt: session.completedAt,
        reason:
          session.completedAt < baseline.completedAt
            ? 'Проведён раньше первичного замера'
            : `Версия ${session.questionnaire.versionNumber} не утверждена как сопоставимая с версией ${baseline.questionnaire.versionNumber}`,
      }));
    const measurements = included.map((session): ComparisonMeasurementDto => ({
      sessionId: session.id,
      measurementType: session.measurementType,
      source: session.source,
      versionId: session.questionnaire.versionId,
      versionNumber: session.questionnaire.versionNumber,
      completedAt: session.completedAt,
      values: Object.fromEntries(
        scales.map((scale) => [
          scale.code,
          session.scores.find((score) => score.code === scale.code) ?? null,
        ]),
      ),
    }));
    const first = measurements[0]!;
    const last = measurements[measurements.length - 1]!;
    const changes = Object.fromEntries(
      scales.map((scale) => {
        const from = first.values[scale.code]?.rawScore ?? null;
        const to = last.values[scale.code]?.rawScore ?? null;
        return [
          scale.code,
          measurements.length > 1 && from !== null && to !== null ? roundScore(to - from) : null,
        ];
      }),
    );
    comparisons.push({
      latest: ordered[ordered.length - 1]!.completedAt,
      comparison: {
        questionnaireId,
        title: baseline.questionnaire.title,
        isDemo: baseline.questionnaire.isDemo,
        scales,
        measurements,
        changes,
        excluded,
      },
    });
  }
  return comparisons
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .map((item) => item.comparison);
}

// ── Обезличенная выгрузка (FR-025) ──

export const DiagnosticExportFormat = { CSV: 'csv', XLSX: 'xlsx' } as const;
export type DiagnosticExportFormat =
  (typeof DiagnosticExportFormat)[keyof typeof DiagnosticExportFormat];

/** Завершённое прохождение для выгрузки: только код участника, без ФИО и учётных данных. */
export interface DiagnosticExportRow {
  participantCode: StudentRef['participantCode'];
  groupName: string | null;
  questionnaireTitle: string;
  versionNumber: number;
  measurementType: MeasurementType;
  source: DiagnosticSource;
  completedAt: string;
  durationSeconds: number | null;
  scores: ScaleResultDto[];
}

export type ExportCell = string | number | null;

export interface ExportTable {
  header: string[];
  rows: ExportCell[][];
}

/** Таблица выгрузки из нескольких: в XLSX — отдельный лист, в CSV — раздел с заголовком. */
export interface ExportSheet {
  /** Имя листа XLSX (до 31 символа). */
  name: string;
  title: string;
  table: ExportTable;
}

/**
 * Таблица обезличенной выгрузки результатов (FR-025): строка — прохождение, по каждой шкале —
 * балл, уровень и число вопросов без ответа. Отсутствующий балл — пустая ячейка (null), не ноль;
 * причина видна в колонке «без ответа» (FR-074). Колонки шкал — объединение шкал всех версий
 * в порядке первого появления; шкалы нет в версии — пустые ячейки.
 */
export function buildDiagnosticExportTable(rows: readonly DiagnosticExportRow[]): ExportTable {
  const scales: { code: string; name: string }[] = [];
  for (const row of rows) {
    for (const score of row.scores) {
      if (!scales.some((scale) => scale.code === score.code)) {
        scales.push({ code: score.code, name: score.name || score.code });
      }
    }
  }
  const header = [
    'Код участника',
    'Группа',
    'Методика',
    'Версия методики',
    'Замер',
    'Способ прохождения',
    'Дата прохождения',
    'Время прохождения, с',
    ...scales.flatMap((scale) => [
      `${scale.name} (${scale.code}): балл`,
      `${scale.name} (${scale.code}): уровень`,
      `${scale.name} (${scale.code}): без ответа`,
    ]),
  ];
  return {
    header,
    rows: rows.map((row) => [
      row.participantCode,
      row.groupName,
      row.questionnaireTitle,
      row.versionNumber,
      MEASUREMENT_TYPE_LABELS[row.measurementType],
      DIAGNOSTIC_SOURCE_LABELS[row.source],
      row.completedAt,
      row.durationSeconds,
      ...scales.flatMap((scale): ExportCell[] => {
        const score = row.scores.find((item) => item.code === scale.code);
        return score
          ? [score.rawScore, score.level?.label ?? null, score.missingAnswers]
          : [null, null, null];
      }),
    ]),
  };
}
