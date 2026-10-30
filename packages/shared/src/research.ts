// Исследовательский режим (ТЗ, п. 2.4, 4.10; UC-07; FR-069–FR-075; огр. 4): исследования,
// коды участников, экспериментальная и контрольная группы, замеры, сравнение по одинаковым шкалам
// и версиям методик, обезличенная выгрузка. Расчёт данных и таблицы выгрузки — чистые функции.
import { z } from 'zod';
import { versionsComparable, type ExportCell, type ExportTable } from './diagnostic-results.js';
import { type ControlKind, controlMean, controlProgress } from './control-works.js';
import { type AcademicPeriodDto, type NamedRef, summarizeSemester } from './grades.js';
import type { QuestionnaireVersionLabel, ScaleResultDto } from './diagnostic-sessions.js';
import {
  MEASUREMENT_TYPE_LABELS,
  MeasurementType,
  RESEARCH_GROUP_LABELS,
  ResearchGroup,
  ResearchProjectStatus,
  type ScaleAggregation,
} from './enums.js';
import {
  DESCRIPTIVE_STATS_COLUMNS,
  type DescriptiveStats,
  descriptiveStats,
} from './statistics.js';
import { localDate } from './trajectories.js';

export const RESEARCH_TITLE_MAX = 200;
export const RESEARCH_DESCRIPTION_MAX = 2000;

/** Допустимые переходы статуса исследования. */
export const RESEARCH_STATUS_TRANSITIONS: Record<
  ResearchProjectStatus,
  readonly ResearchProjectStatus[]
> = {
  DRAFT: [ResearchProjectStatus.ACTIVE, ResearchProjectStatus.ARCHIVED],
  ACTIVE: [ResearchProjectStatus.COMPLETED],
  COMPLETED: [ResearchProjectStatus.ARCHIVED],
  ARCHIVED: [],
};

/** Состав участников и замеры меняются, пока исследование готовится или проводится. */
export const RESEARCH_EDITABLE_STATUSES: readonly ResearchProjectStatus[] = [
  ResearchProjectStatus.DRAFT,
  ResearchProjectStatus.ACTIVE,
];

export const RESEARCH_TRANSITION_LABELS: Partial<Record<ResearchProjectStatus, string>> = {
  ACTIVE: 'Начать исследование',
  COMPLETED: 'Завершить исследование',
  ARCHIVED: 'Перенести в архив',
};

/** Короткие обозначения групп для таблиц и выгрузки. */
export const RESEARCH_GROUP_SHORT: Record<ResearchGroup, string> = {
  EXPERIMENTAL: 'ЭГ',
  CONTROL: 'КГ',
};

export const RESEARCH_GROUPS: readonly ResearchGroup[] = [
  ResearchGroup.EXPERIMENTAL,
  ResearchGroup.CONTROL,
];

/** Код участника исследования: «R» и порядковый номер в исследовании, например R007. */
export function researchCode(number: number): string {
  return `R${String(number).padStart(3, '0')}`;
}

// ── Формы (zod) ──

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = z.string().regex(DATE, 'Укажите дату в формате дд/мм/гггг').nullable();

function periodRefine(
  value: { startsOn: string | null; endsOn: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: 'Дата окончания не раньше даты начала',
    });
  }
}

export const researchProjectFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Название не короче 3 символов')
      .max(RESEARCH_TITLE_MAX, `Не более ${RESEARCH_TITLE_MAX} символов`),
    description: z
      .string()
      .trim()
      .max(RESEARCH_DESCRIPTION_MAX, `Не более ${RESEARCH_DESCRIPTION_MAX} символов`)
      .nullable(),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .superRefine(periodRefine);
export type ResearchProjectFormValues = z.infer<typeof researchProjectFormSchema>;

export const researchParticipantsFormSchema = z.object({
  groupId: z.string({ message: 'Выберите учебную группу' }).min(1, 'Выберите учебную группу'),
  group: z.nativeEnum(ResearchGroup, { message: 'Выберите группу исследования' }),
});
export type ResearchParticipantsFormValues = z.infer<typeof researchParticipantsFormSchema>;

export const researchMeasurementFormSchema = z
  .object({
    versionId: z.string({ message: 'Выберите версию методики' }).min(1, 'Выберите версию методики'),
    measurementType: z.nativeEnum(MeasurementType),
    title: z
      .string()
      .trim()
      .min(3, 'Название не короче 3 символов')
      .max(RESEARCH_TITLE_MAX, `Не более ${RESEARCH_TITLE_MAX} символов`),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .superRefine(periodRefine);
export type ResearchMeasurementFormValues = z.infer<typeof researchMeasurementFormSchema>;

// ── Контракты API ──

export interface ResearchGroupCountsDto {
  EXPERIMENTAL: number;
  CONTROL: number;
}

export interface ResearchProjectDto {
  id: string;
  title: string;
  description: string | null;
  status: ResearchProjectStatus;
  startsOn: string | null;
  endsOn: string | null;
  /** Включённые (не исключённые) участники по группам. */
  participants: ResearchGroupCountsDto;
  measurements: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchMeasurementDto {
  id: string;
  title: string;
  measurementType: MeasurementType;
  questionnaire: QuestionnaireVersionLabel;
  /** Диагностическое направление методики (мотивация, саморегуляция…); null — не указано. */
  direction: { code: string; name: string } | null;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
}

export interface ResearchProjectDetailDto extends ResearchProjectDto {
  measurementList: ResearchMeasurementDto[];
  /** Можно ли менять участников и замеры (подготовка или проведение). */
  editable: boolean;
}

/**
 * Участник исследования. ФИО (`fullName`) приходит только пользователю с отдельным разрешением
 * на персональные данные участников (п. 2.4); иначе null.
 */
export interface ResearchParticipantDto {
  id: string;
  code: string;
  group: ResearchGroup;
  academicGroup: string | null;
  includedAt: string;
  excludedAt: string | null;
  fullName: string | null;
}

/** Учебная группа, из которой можно включить студентов в исследование. */
export interface ResearchCandidateGroupDto {
  id: string;
  name: string;
  course: number;
  specialty: string;
  students: number;
}

export interface ResearchAddParticipantsResultDto {
  added: number;
  /** Уже участвовали в исследовании и пропущены. */
  skipped: number;
}

// ── Данные исследования (UC-07) ──

export interface ResearchScaleDto {
  /** Ключ шкалы: методика и код шкалы. Шкалы разных версий одной методики сравниваются по коду. */
  key: string;
  questionnaireId: string;
  questionnaireTitle: string;
  code: string;
  name: string;
}

export interface ResearchObservationCountsDto {
  group: ResearchGroup;
  participants: number;
  /** Есть балл по каждой выбранной шкале в каждом выбранном замере. */
  complete: number;
  incomplete: number;
}

export interface ResearchStatsRowDto {
  measurementId: string;
  scaleKey: string;
  group: ResearchGroup;
  stats: DescriptiveStats;
}

/** Изменение между первым и последним выбранными замерами одной методики. */
export interface ResearchChangeDto {
  questionnaireId: string;
  fromMeasurementId: string;
  toMeasurementId: string;
  /** Версии замеров совпадают или их сопоставимость утверждена (FR-072). */
  comparable: boolean;
  reason: string | null;
  /** Разность «последний − первый» у участников с обоими значениями; пусто, если несопоставимы. */
  rows: { scaleKey: string; group: ResearchGroup; stats: DescriptiveStats }[];
}

/** Шкала версии методики: код, название и способ расчёта балла. */
export interface ResearchVersionScaleDto {
  code: string;
  name: string;
  aggregation: ScaleAggregation;
}

/** Значения участника в замере; null — участник не прошёл замер (неполное наблюдение). */
export interface ResearchObservationValueDto {
  completedAt: string;
  versionNumber: number;
  scores: Record<string, number | null>;
}

export interface ResearchParticipantRowDto {
  code: string;
  group: ResearchGroup;
  values: Record<string, ResearchObservationValueDto | null>;
  complete: boolean;
}

/** Данные диагностических замеров исследования. */
export interface ResearchDiagnosticDataDto {
  measurements: ResearchMeasurementDto[];
  scales: ResearchScaleDto[];
  /** Шкалы каждой версии замеров (по id версии) — для проверки корректности шкал перед анализом. */
  versionScales: Record<string, ResearchVersionScaleDto[]>;
  observations: ResearchObservationCountsDto[];
  stats: ResearchStatsRowDto[];
  changes: ResearchChangeDto[];
  /** Участники, исключённые из исследования: в расчёт не входят. */
  excludedParticipants: number;
  /** Исходные обезличенные данные по участникам (для выгрузки). */
  rows: ResearchParticipantRowDto[];
}

/** Данные исследования: диагностические замеры, успеваемость и наблюдения на занятиях. */
export interface ResearchDataDto extends ResearchDiagnosticDataDto {
  outcomes: ResearchOutcomesDto;
}

/** Завершённое прохождение участника — исходные данные исследования. */
export interface ResearchSessionInput {
  studentId: string;
  versionId: string;
  measurementType: MeasurementType;
  completedAt: string;
  scores: ScaleResultDto[];
}

export interface ResearchDataInput {
  participants: readonly {
    studentId: string;
    code: string;
    group: ResearchGroup;
    excluded: boolean;
  }[];
  /** Замеры исследования: выбранные пользователем. */
  measurements: readonly ResearchMeasurementDto[];
  /** Шкалы версий замеров по id версии, в порядке методики. */
  versionScales: ReadonlyMap<string, readonly ResearchVersionScaleDto[]>;
  sessions: readonly ResearchSessionInput[];
  /** Утверждённые пары сопоставимых версий (`comparabilityKey`). */
  approved: ReadonlySet<string>;
  /** Выбранные шкалы (ключи); пусто — все шкалы замеров. */
  scaleKeys?: readonly string[];
}

const scaleKey = (questionnaireId: string, code: string) => `${questionnaireId}:${code}`;

const MEASUREMENT_ORDER: Record<MeasurementType, number> = {
  PRIMARY: 0,
  INTERMEDIATE: 1,
  REPEATED: 2,
};

/** Замеры по порядку проведения: первичный, промежуточный, повторный; внутри — по датам. */
export function sortMeasurements<T extends ResearchMeasurementDto>(
  measurements: readonly T[],
): T[] {
  return [...measurements].sort(
    (a, b) =>
      MEASUREMENT_ORDER[a.measurementType] - MEASUREMENT_ORDER[b.measurementType] ||
      (a.startsOn ?? '').localeCompare(b.startsOn ?? '') ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Прохождение участника, которое относится к замеру: та же версия методики и тот же тип замера,
 * дата завершения (по местному времени) в периоде замера. Если таких несколько — самое раннее.
 */
function sessionFor(
  sessions: readonly ResearchSessionInput[],
  measurement: ResearchMeasurementDto,
): ResearchSessionInput | undefined {
  return sessions
    .filter((session) => {
      if (session.versionId !== measurement.questionnaire.versionId) return false;
      if (session.measurementType !== measurement.measurementType) return false;
      const day = localDate(session.completedAt);
      if (measurement.startsOn && day < measurement.startsOn) return false;
      if (measurement.endsOn && day > measurement.endsOn) return false;
      return true;
    })
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))[0];
}

/**
 * Данные исследования (UC-07): по каждому участнику и замеру — баллы по шкалам; описательные
 * статистики по замерам, шкалам и группам ЭГ/КГ (FR-069, FR-070); полные и неполные наблюдения
 * (FR-073); изменение между первым и последним замером методики — только для одинаковых или
 * утверждённых сопоставимыми версий (FR-072). Незавершённые прохождения в расчёт не входят;
 * пропуск — пропуск, а не ноль (FR-074). Исключённые участники не учитываются.
 */
export function buildResearchData(input: ResearchDataInput): ResearchDiagnosticDataDto {
  const measurements = sortMeasurements(input.measurements);
  const allScales: ResearchScaleDto[] = [];
  for (const measurement of measurements) {
    for (const scale of input.versionScales.get(measurement.questionnaire.versionId) ?? []) {
      const key = scaleKey(measurement.questionnaire.questionnaireId, scale.code);
      if (!allScales.some((item) => item.key === key)) {
        allScales.push({
          key,
          questionnaireId: measurement.questionnaire.questionnaireId,
          questionnaireTitle: measurement.questionnaire.title,
          code: scale.code,
          name: scale.name,
        });
      }
    }
  }
  const scales = input.scaleKeys?.length
    ? allScales.filter((scale) => input.scaleKeys!.includes(scale.key))
    : allScales;
  const scalesOf = (measurement: ResearchMeasurementDto) =>
    scales.filter((scale) => scale.questionnaireId === measurement.questionnaire.questionnaireId);

  const sessionsByStudent = new Map<string, ResearchSessionInput[]>();
  for (const session of input.sessions) {
    const list = sessionsByStudent.get(session.studentId) ?? [];
    list.push(session);
    sessionsByStudent.set(session.studentId, list);
  }

  const included = input.participants
    .filter((participant) => !participant.excluded)
    .sort((a, b) => a.code.localeCompare(b.code));
  const rows: ResearchParticipantRowDto[] = included.map((participant) => {
    const own = sessionsByStudent.get(participant.studentId) ?? [];
    const values: Record<string, ResearchObservationValueDto | null> = {};
    let complete = measurements.length > 0;
    for (const measurement of measurements) {
      const session = sessionFor(own, measurement);
      if (!session) {
        values[measurement.id] = null;
        complete = false;
        continue;
      }
      const scores = Object.fromEntries(
        scalesOf(measurement).map((scale) => [
          scale.key,
          session.scores.find((score) => score.code === scale.code)?.rawScore ?? null,
        ]),
      );
      if (Object.values(scores).some((value) => value === null)) complete = false;
      values[measurement.id] = {
        completedAt: session.completedAt,
        versionNumber: measurement.questionnaire.versionNumber,
        scores,
      };
    }
    return { code: participant.code, group: participant.group, values, complete };
  });

  const inGroup = (group: ResearchGroup) => rows.filter((row) => row.group === group);
  const observations = RESEARCH_GROUPS.map((group) => {
    const groupRows = inGroup(group);
    const complete = groupRows.filter((row) => row.complete).length;
    return {
      group,
      participants: groupRows.length,
      complete,
      incomplete: groupRows.length - complete,
    };
  });

  const valueOf = (row: ResearchParticipantRowDto, measurementId: string, key: string) =>
    row.values[measurementId]?.scores[key] ?? null;
  const stats = measurements.flatMap((measurement) =>
    scalesOf(measurement).flatMap((scale) =>
      RESEARCH_GROUPS.map((group) => ({
        measurementId: measurement.id,
        scaleKey: scale.key,
        group,
        stats: descriptiveStats(
          inGroup(group).map((row) => valueOf(row, measurement.id, scale.key)),
        ),
      })),
    ),
  );

  const questionnaireIds = [
    ...new Set(measurements.map((measurement) => measurement.questionnaire.questionnaireId)),
  ];
  const changes = questionnaireIds.flatMap((questionnaireId): ResearchChangeDto[] => {
    const own = measurements.filter(
      (measurement) => measurement.questionnaire.questionnaireId === questionnaireId,
    );
    if (own.length < 2) return [];
    const from = own[0]!;
    const to = own[own.length - 1]!;
    const comparable = versionsComparable(
      from.questionnaire.versionId,
      to.questionnaire.versionId,
      input.approved,
    );
    return [
      {
        questionnaireId,
        fromMeasurementId: from.id,
        toMeasurementId: to.id,
        comparable,
        reason: comparable
          ? null
          : `Версия ${to.questionnaire.versionNumber} не утверждена как сопоставимая с версией ${from.questionnaire.versionNumber}: изменение не рассчитывается`,
        rows: comparable
          ? scalesOf(from).flatMap((scale) =>
              RESEARCH_GROUPS.map((group) => ({
                scaleKey: scale.key,
                group,
                stats: descriptiveStats(
                  inGroup(group).map((row) => {
                    const before = valueOf(row, from.id, scale.key);
                    const after = valueOf(row, to.id, scale.key);
                    return before === null || after === null ? null : after - before;
                  }),
                ),
              })),
            )
          : [],
      },
    ];
  });

  return {
    measurements,
    scales,
    versionScales: Object.fromEntries(
      [...new Set(measurements.map((measurement) => measurement.questionnaire.versionId))].map(
        (versionId) => [versionId, [...(input.versionScales.get(versionId) ?? [])]],
      ),
    ),
    observations,
    stats,
    changes,
    excludedParticipants: input.participants.length - included.length,
    rows,
  };
}

// ── Успеваемость и наблюдения ЭГ и КГ (этап 27) ──

/** Период дат включительно; пустая граница — без ограничения с этой стороны. */
export interface ResearchDateRange {
  from: string | null;
  to: string | null;
}

/** Ключи показателей: средний балл за семестр, средняя по наблюдениям, отдельный критерий. */
export const RESEARCH_GRADES_KEY = 'grades';
export const RESEARCH_OBSERVATIONS_KEY = 'observations';
export const researchCriterionKey = (criterionId: string) =>
  `${RESEARCH_OBSERVATIONS_KEY}:${criterionId}`;
/** Контрольные работы по дисциплине (этап 28): «до» — входной контроль, «после» — итоговый. */
export const RESEARCH_CONTROLS_KEY = 'controls';
export const researchControlsKey = (disciplineId: string) =>
  `${RESEARCH_CONTROLS_KEY}:${disciplineId}`;
export const isResearchControlsKey = (key: string) => key.startsWith(`${RESEARCH_CONTROLS_KEY}:`);

export interface ResearchIndicatorDto {
  key: string;
  name: string;
}

/**
 * Значения показателя у участника «до» и «после»; null — нет данных (FR-074). Для контрольных
 * работ `current` — средний балл текущего контроля по дисциплине (в сравнение «до/после» не входит).
 */
export interface ResearchOutcomeValueDto {
  before: number | null;
  after: number | null;
  current?: number | null;
}

/** Контрольная работа в ряду дисциплины; `date` — самая ранняя дата проведения в группах. */
export interface ResearchControlWorkDto {
  id: string;
  topic: string;
  kind: ControlKind;
  date: string;
}

/**
 * Ряд контрольных работ дисциплины (этап 29): входной, текущий и итоговый контроль по датам и
 * описательные статистики баллов ЭГ и КГ по каждой работе. Отметки и отсутствие результата — пропуск.
 */
export interface ResearchControlSeriesDto {
  discipline: NamedRef;
  works: ResearchControlWorkDto[];
  stats: { workId: string; group: ResearchGroup; stats: DescriptiveStats }[];
}

/** Статистики показателя по группе: «до», «после» и разность у участников с обоими значениями. */
export interface ResearchOutcomeStatsDto {
  indicatorKey: string;
  group: ResearchGroup;
  before: DescriptiveStats;
  after: DescriptiveStats;
  change: DescriptiveStats;
}

export interface ResearchOutcomesDto {
  /** Семестры, по которым у участников есть оценки; сначала последние. */
  periods: AcademicPeriodDto[];
  gradesBefore: AcademicPeriodDto | null;
  gradesAfter: AcademicPeriodDto | null;
  observationsBefore: ResearchDateRange | null;
  observationsAfter: ResearchDateRange | null;
  indicators: ResearchIndicatorDto[];
  stats: ResearchOutcomeStatsDto[];
  /** По коду участника и ключу показателя. Исключённых участников нет. */
  values: Record<string, Record<string, ResearchOutcomeValueDto>>;
  /** Контрольные работы по дисциплинам: входной, текущий и итоговый контроль. */
  controlSeries: ResearchControlSeriesDto[];
}

export interface ResearchOutcomesInput {
  participants: ResearchDataInput['participants'];
  periods: AcademicPeriodDto[];
  gradesBefore: AcademicPeriodDto | null;
  gradesAfter: AcademicPeriodDto | null;
  /** Оценки за семестр (0–100) участников по выбранным семестрам. */
  grades: readonly { studentId: string; periodId: string; disciplineId: string; score: number }[];
  observationsBefore: ResearchDateRange | null;
  observationsAfter: ResearchDateRange | null;
  /** Критерии наблюдения в порядке списка из настроек. */
  criteria: readonly { id: string; name: string }[];
  /** Оценки 1–5 на занятиях (без «Не наблюдалось»); `date` — дата занятия `YYYY-MM-DD`. */
  ratings: readonly { studentId: string; date: string; criterionId: string; score: number }[];
  /** Баллы участников за контрольные работы всех видов (отметки сюда не попадают). */
  controls?: readonly {
    studentId: string;
    discipline: NamedRef;
    kind: ControlKind;
    score: number;
    work: ResearchControlWorkDto;
  }[];
}

const roundTenth = (value: number) => Math.round(value * 10) / 10;
const exactMean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/** Период задан хотя бы одной границей; период без границ считается не заданным. */
export const dateRangeSet = (range: ResearchDateRange | null): range is ResearchDateRange =>
  Boolean(range && (range.from || range.to));

/** Дата попадает в период (границы включительно). */
export function inDateRange(date: string, range: ResearchDateRange): boolean {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

/** Периоды пересекаются (пустая граница — без ограничения). */
export function dateRangesOverlap(a: ResearchDateRange, b: ResearchDateRange): boolean {
  return (!a.from || !b.to || a.from <= b.to) && (!b.from || !a.to || b.from <= a.to);
}

/** Подпись периода дат: «01.09.2025 – 31.12.2025», «с 01.09.2025», «по 31.12.2025». */
export function formatDateRange(range: ResearchDateRange): string {
  const ru = (value: string) => value.split('-').reverse().join('.');
  if (range.from && range.to) return `${ru(range.from)} – ${ru(range.to)}`;
  if (range.from) return `с ${ru(range.from)}`;
  return range.to ? `по ${ru(range.to)}` : 'весь период';
}

/**
 * Наблюдения за период: по каждому критерию — средняя оценок 1–5; общая — среднее неокруглённых
 * средних по критериям (каждый критерий весит одинаково, как дисциплины в общем балле за семестр).
 * Округление до 0,1. Нет оценок — показателя нет (FR-074).
 */
function observationValues(
  ratings: readonly { criterionId: string; score: number }[],
): Map<string, number> {
  const byCriterion = new Map<string, number[]>();
  for (const rating of ratings) {
    byCriterion.set(rating.criterionId, [
      ...(byCriterion.get(rating.criterionId) ?? []),
      rating.score,
    ]);
  }
  const result = new Map<string, number>();
  const exact: number[] = [];
  for (const [criterionId, scores] of byCriterion) {
    const mean = exactMean(scores)!;
    exact.push(mean);
    result.set(researchCriterionKey(criterionId), roundTenth(mean));
  }
  const overall = exactMean(exact);
  if (overall !== null) result.set(RESEARCH_OBSERVATIONS_KEY, roundTenth(overall));
  return result;
}

/**
 * Показатели ЭГ и КГ вне диагностики (этап 27): средний балл за семестры «до» и «после» (общий
 * балл за семестр, как в разделе успеваемости — ADR-032) и средние оценки педагогических
 * наблюдений на занятиях за периоды «до» и «после» — общая и по критериям; по каждой дисциплине
 * с контрольными работами (этап 28) — средний балл входного («до») и итогового («после») контроля.
 * По каждому показателю
 * и группе — описательные статистики «до», «после» и разности у участников с обоими значениями
 * (парные данные для внешнего расчёта критериев). Пропуск — пропуск, не ноль (FR-074);
 * исключённые участники не учитываются.
 */
export function buildResearchOutcomes(input: ResearchOutcomesInput): ResearchOutcomesDto {
  const included = input.participants
    .filter((participant) => !participant.excluded)
    .sort((a, b) => a.code.localeCompare(b.code));
  const observationsBefore = dateRangeSet(input.observationsBefore)
    ? input.observationsBefore
    : null;
  const observationsAfter = dateRangeSet(input.observationsAfter) ? input.observationsAfter : null;
  const ratedCriteria = new Set(input.ratings.map((rating) => rating.criterionId));
  const controls = input.controls ?? [];
  const indicators: ResearchIndicatorDto[] = [
    { key: RESEARCH_GRADES_KEY, name: 'Средний балл за семестр' },
    { key: RESEARCH_OBSERVATIONS_KEY, name: 'Наблюдения: средняя по критериям' },
    ...input.criteria
      .filter((criterion) => ratedCriteria.has(criterion.id))
      .map((criterion) => ({
        key: researchCriterionKey(criterion.id),
        name: `Наблюдения: ${criterion.name}`,
      })),
    ...[
      ...new Map(
        controls
          .filter((item) => item.kind !== 'CURRENT')
          .map((item) => [item.discipline.id, item.discipline]),
      ).values(),
    ]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((discipline) => ({
        key: researchControlsKey(discipline.id),
        name: `Контрольные работы: ${discipline.name}`,
      })),
  ];

  const semester = (studentId: string, period: AcademicPeriodDto | null) =>
    period
      ? summarizeSemester(
          input.grades.filter(
            (grade) => grade.studentId === studentId && grade.periodId === period.id,
          ),
        ).overall
      : null;
  const observed = (studentId: string, range: ResearchDateRange | null) =>
    range
      ? observationValues(
          input.ratings.filter(
            (rating) => rating.studentId === studentId && inDateRange(rating.date, range),
          ),
        )
      : new Map<string, number>();

  const values: ResearchOutcomesDto['values'] = {};
  for (const participant of included) {
    const before = observed(participant.studentId, observationsBefore);
    const after = observed(participant.studentId, observationsAfter);
    const progress = new Map(
      controlProgress(
        controls
          .filter((item) => item.studentId === participant.studentId)
          .map((item) => ({
            disciplineId: item.discipline.id,
            kind: item.kind,
            score: item.score,
          })),
      ).map((item) => [researchControlsKey(item.disciplineId), item]),
    );
    values[participant.code] = Object.fromEntries(
      indicators.map((indicator): [string, ResearchOutcomeValueDto] => {
        if (indicator.key === RESEARCH_GRADES_KEY) {
          return [
            indicator.key,
            {
              before: semester(participant.studentId, input.gradesBefore),
              after: semester(participant.studentId, input.gradesAfter),
            },
          ];
        }
        if (isResearchControlsKey(indicator.key)) {
          const item = progress.get(indicator.key);
          const current = controlMean(
            controls
              .filter(
                (control) =>
                  control.studentId === participant.studentId &&
                  control.kind === 'CURRENT' &&
                  researchControlsKey(control.discipline.id) === indicator.key,
              )
              .map((control) => control.score),
          );
          return [
            indicator.key,
            { before: item?.entry ?? null, after: item?.final ?? null, current },
          ];
        }
        return [
          indicator.key,
          { before: before.get(indicator.key) ?? null, after: after.get(indicator.key) ?? null },
        ];
      }),
    );
  }

  const stats = indicators.flatMap((indicator) =>
    RESEARCH_GROUPS.map((group): ResearchOutcomeStatsDto => {
      const own = included
        .filter((participant) => participant.group === group)
        .map((participant) => values[participant.code]![indicator.key]!);
      return {
        indicatorKey: indicator.key,
        group,
        before: descriptiveStats(own.map((value) => value.before)),
        after: descriptiveStats(own.map((value) => value.after)),
        change: descriptiveStats(
          own.map((value) =>
            value.before === null || value.after === null
              ? null
              : roundTenth(value.after - value.before),
          ),
        ),
      };
    }),
  );

  const kindOrder: Record<ControlKind, number> = { ENTRY: 0, CURRENT: 1, FINAL: 2 };
  const controlSeries = indicators
    .filter((indicator) => isResearchControlsKey(indicator.key))
    .map((indicator): ResearchControlSeriesDto => {
      const own = controls.filter(
        (item) => researchControlsKey(item.discipline.id) === indicator.key,
      );
      const works = [...new Map(own.map((item) => [item.work.id, item.work])).values()].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          kindOrder[a.kind] - kindOrder[b.kind] ||
          a.topic.localeCompare(b.topic, 'ru'),
      );
      return {
        discipline: own[0]!.discipline,
        works,
        stats: works.flatMap((work) =>
          RESEARCH_GROUPS.map((group) => ({
            workId: work.id,
            group,
            stats: descriptiveStats(
              included
                .filter((participant) => participant.group === group)
                .map(
                  (participant) =>
                    own.find(
                      (item) =>
                        item.work.id === work.id && item.studentId === participant.studentId,
                    )?.score ?? null,
                ),
            ),
          })),
        ),
      };
    });

  return {
    periods: input.periods,
    gradesBefore: input.gradesBefore,
    gradesAfter: input.gradesAfter,
    observationsBefore,
    observationsAfter,
    indicators,
    stats,
    values,
    controlSeries,
  };
}

// ── Выгрузка (FR-071, FR-075) ──

export const ResearchDataset = {
  RAW: 'raw',
  AGGREGATE: 'aggregate',
  WIDE: 'wide',
  ANALYSIS: 'analysis',
} as const;
export type ResearchDataset = (typeof ResearchDataset)[keyof typeof ResearchDataset];

export const RESEARCH_DATASET_LABELS: Record<ResearchDataset, string> = {
  raw: 'Исходные данные по участникам',
  aggregate: 'Сводные показатели',
  wide: 'Широкая таблица «до/после» (строка — участник)',
  analysis: 'Статистический анализ: таблицы для ВКР',
};

const measurementLabel = (measurement: ResearchMeasurementDto) =>
  `${measurement.title} (${MEASUREMENT_TYPE_LABELS[measurement.measurementType].toLowerCase()}, ${measurement.questionnaire.title}, версия ${measurement.questionnaire.versionNumber})`;

/**
 * Исходные обезличенные данные (FR-075): строка — участник (код и группа ЭГ/КГ, без ФИО и учётных
 * данных); по каждому замеру — версия методики, дата прохождения и баллы шкал. Пропуск — пустая
 * ячейка (FR-074), признак полноты наблюдения — отдельная колонка (FR-073).
 */
export function buildResearchRawTable(data: ResearchDiagnosticDataDto): ExportTable {
  const columns = data.measurements.map((measurement) => {
    const scales = data.scales.filter(
      (scale) => scale.questionnaireId === measurement.questionnaire.questionnaireId,
    );
    return { measurement, scales };
  });
  const header = [
    'Код участника',
    'Группа исследования',
    'Наблюдение',
    ...columns.flatMap(({ measurement, scales }) => [
      `${measurementLabel(measurement)}: версия методики`,
      `${measurementLabel(measurement)}: дата прохождения`,
      ...scales.map((scale) => `${measurementLabel(measurement)}: ${scale.name} (${scale.code})`),
    ]),
  ];
  return {
    header,
    rows: data.rows.map((row) => [
      row.code,
      RESEARCH_GROUP_SHORT[row.group],
      row.complete ? 'полное' : 'неполное',
      ...columns.flatMap(({ measurement, scales }): ExportCell[] => {
        const value = row.values[measurement.id];
        return [
          value ? value.versionNumber : null,
          value ? localDate(value.completedAt) : null,
          ...scales.map((scale) => value?.scores[scale.key] ?? null),
        ];
      }),
    ]),
  };
}

/**
 * Сводные показатели (FR-069–FR-072): по замерам, шкалам и группам — описательные статистики,
 * затем изменение между первым и последним замером. В каждой строке — методика и версия. Затем
 * успеваемость и наблюдения на занятиях ЭГ и КГ: «до», «после» и изменение (этап 27).
 */
export function buildResearchAggregateTable(
  data: ResearchDiagnosticDataDto & { outcomes?: ResearchOutcomesDto },
): ExportTable {
  const scale = (key: string) => data.scales.find((item) => item.key === key)!;
  const measurement = (id: string) => data.measurements.find((item) => item.id === id)!;
  const statsCells = (stats: DescriptiveStats): ExportCell[] =>
    DESCRIPTIVE_STATS_COLUMNS.map((column) => stats[column.key]);
  const header = [
    'Показатель',
    'Замер',
    'Методика',
    'Версия методики',
    'Шкала',
    'Группа исследования',
    ...DESCRIPTIVE_STATS_COLUMNS.map((column) => column.label),
  ];
  const statsRows = data.stats.map((row): ExportCell[] => {
    const item = measurement(row.measurementId);
    return [
      'Значение шкалы',
      `${item.title} (${MEASUREMENT_TYPE_LABELS[item.measurementType].toLowerCase()})`,
      item.questionnaire.title,
      item.questionnaire.versionNumber,
      `${scale(row.scaleKey).name} (${scale(row.scaleKey).code})`,
      RESEARCH_GROUP_LABELS[row.group],
      ...statsCells(row.stats),
    ];
  });
  const changeRows = data.changes.flatMap((change) => {
    const from = measurement(change.fromMeasurementId);
    const to = measurement(change.toMeasurementId);
    return change.rows.map((row): ExportCell[] => [
      'Изменение (последний − первый замер)',
      `${from.title} → ${to.title}`,
      from.questionnaire.title,
      `${from.questionnaire.versionNumber} → ${to.questionnaire.versionNumber}`,
      `${scale(row.scaleKey).name} (${scale(row.scaleKey).code})`,
      RESEARCH_GROUP_LABELS[row.group],
      ...statsCells(row.stats),
    ]);
  });
  const outcomes = data.outcomes;
  const outcomeRows = outcomes
    ? outcomes.stats.flatMap((row): ExportCell[][] => {
        const indicator = outcomes.indicators.find((item) => item.key === row.indicatorKey)!;
        const [before, after] = outcomePhases(outcomes, row.indicatorKey);
        const cells = (label: string, period: string, stats: DescriptiveStats): ExportCell[] => [
          `${indicator.name} — ${label}`,
          period,
          null,
          null,
          null,
          RESEARCH_GROUP_LABELS[row.group],
          ...statsCells(stats),
        ];
        return [
          cells('до', before, row.before),
          cells('после', after, row.after),
          cells('изменение (после − до)', `${before} → ${after}`, row.change),
        ];
      })
    : [];
  return { header, rows: [...statsRows, ...changeRows, ...outcomeRows] };
}

/** Подписи периодов «до» и «после» показателя: семестры или периоды наблюдений. */
function outcomePhases(outcomes: ResearchOutcomesDto, indicatorKey: string): [string, string] {
  const unset = 'не задан';
  if (isResearchControlsKey(indicatorKey)) return ['входной контроль', 'итоговый контроль'];
  if (indicatorKey === RESEARCH_GRADES_KEY) {
    return [outcomes.gradesBefore?.label ?? unset, outcomes.gradesAfter?.label ?? unset];
  }
  return [
    outcomes.observationsBefore ? formatDateRange(outcomes.observationsBefore) : unset,
    outcomes.observationsAfter ? formatDateRange(outcomes.observationsAfter) : unset,
  ];
}

const MEASUREMENT_PHASE: Record<MeasurementType, string> = {
  PRIMARY: 'до',
  INTERMEDIATE: 'промежуточный',
  REPEATED: 'после',
};

/**
 * «Широкая» обезличенная таблица для внешнего расчёта критериев Манна — Уитни, Вилкоксона и
 * Спирмена (этап 27; FR-071, FR-075): одна строка на участника — код и группа ЭГ/КГ, баллы шкал
 * по замерам («до» — первичный, «после» — повторный), средний балл за семестры «до» и «после»,
 * средние наблюдений на занятиях «до» и «после» — общая и по критериям, средний балл входного и
 * итогового контроля по дисциплинам (этап 28). Ф. И. О., учебная группа и учётные данные не
 * выгружаются; пропуск — пустая ячейка (FR-074).
 */
export function buildResearchWideTable(data: ResearchDataDto): ExportTable {
  const { outcomes } = data;
  // Замер одной методики одного типа может быть не один: тогда к подписи добавляется название.
  const phaseCount = new Map<string, number>();
  const phaseKey = (measurement: ResearchMeasurementDto) =>
    `${measurement.questionnaire.questionnaireId}:${measurement.measurementType}`;
  for (const measurement of data.measurements) {
    phaseCount.set(phaseKey(measurement), (phaseCount.get(phaseKey(measurement)) ?? 0) + 1);
  }
  const diagnostics = data.measurements.flatMap((measurement) => {
    const phase = MEASUREMENT_PHASE[measurement.measurementType];
    const suffix =
      phaseCount.get(phaseKey(measurement))! > 1 ? `${phase}: ${measurement.title}` : phase;
    return data.scales
      .filter((scale) => scale.questionnaireId === measurement.questionnaire.questionnaireId)
      .map((scale) => ({
        label: `${scale.name} (${scale.code}; ${measurement.questionnaire.title}, версия ${measurement.questionnaire.versionNumber}) — ${suffix}`,
        value: (row: ResearchParticipantRowDto) =>
          row.values[measurement.id]?.scores[scale.key] ?? null,
      }));
  });
  const indicators = outcomes.indicators.flatMap((indicator) => {
    const [before, after] = outcomePhases(outcomes, indicator.key);
    const unit = indicator.key === RESEARCH_GRADES_KEY ? 'семестр: ' : 'период: ';
    const prefix = isResearchControlsKey(indicator.key) ? '' : unit;
    return [
      {
        label: `${indicator.name} — до (${prefix}${before})`,
        value: (code: string) => outcomes.values[code]?.[indicator.key]?.before ?? null,
      },
      {
        label: `${indicator.name} — после (${prefix}${after})`,
        value: (code: string) => outcomes.values[code]?.[indicator.key]?.after ?? null,
      },
      // Текущий контроль (этап 29) — справочно, в сравнение «до/после» не входит.
      ...(isResearchControlsKey(indicator.key)
        ? [
            {
              label: `${indicator.name} — текущий контроль (средний балл)`,
              value: (code: string) => outcomes.values[code]?.[indicator.key]?.current ?? null,
            },
          ]
        : []),
    ];
  });
  return {
    header: [
      'Код участника',
      'Группа исследования',
      ...diagnostics.map((column) => column.label),
      ...indicators.map((column) => column.label),
    ],
    rows: data.rows.map((row) => [
      row.code,
      RESEARCH_GROUP_SHORT[row.group],
      ...diagnostics.map((column) => column.value(row)),
      ...indicators.map((column) => column.value(row.code)),
    ]),
  };
}
