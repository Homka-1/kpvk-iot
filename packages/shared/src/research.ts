// Исследовательский режим (ТЗ, п. 2.4, 4.10; UC-07; FR-069–FR-075; огр. 4): исследования,
// коды участников, экспериментальная и контрольная группы, замеры, сравнение по одинаковым шкалам
// и версиям методик, обезличенная выгрузка. Расчёт данных и таблицы выгрузки — чистые функции.
import { z } from 'zod';
import { versionsComparable, type ExportCell, type ExportTable } from './diagnostic-results.js';
import type { QuestionnaireVersionLabel, ScaleResultDto } from './diagnostic-sessions.js';
import {
  MEASUREMENT_TYPE_LABELS,
  MeasurementType,
  RESEARCH_GROUP_LABELS,
  ResearchGroup,
  ResearchProjectStatus,
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

export interface ResearchDataDto {
  measurements: ResearchMeasurementDto[];
  scales: ResearchScaleDto[];
  observations: ResearchObservationCountsDto[];
  stats: ResearchStatsRowDto[];
  changes: ResearchChangeDto[];
  /** Участники, исключённые из исследования: в расчёт не входят. */
  excludedParticipants: number;
  /** Исходные обезличенные данные по участникам (для выгрузки). */
  rows: ResearchParticipantRowDto[];
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
  versionScales: ReadonlyMap<string, readonly { code: string; name: string }[]>;
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
export function buildResearchData(input: ResearchDataInput): ResearchDataDto {
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
    observations,
    stats,
    changes,
    excludedParticipants: input.participants.length - included.length,
    rows,
  };
}

// ── Выгрузка (FR-071, FR-075) ──

export const ResearchDataset = { RAW: 'raw', AGGREGATE: 'aggregate' } as const;
export type ResearchDataset = (typeof ResearchDataset)[keyof typeof ResearchDataset];

export const RESEARCH_DATASET_LABELS: Record<ResearchDataset, string> = {
  raw: 'Исходные данные по участникам',
  aggregate: 'Сводные показатели',
};

const measurementLabel = (measurement: ResearchMeasurementDto) =>
  `${measurement.title} (${MEASUREMENT_TYPE_LABELS[measurement.measurementType].toLowerCase()}, ${measurement.questionnaire.title}, версия ${measurement.questionnaire.versionNumber})`;

/**
 * Исходные обезличенные данные (FR-075): строка — участник (код и группа ЭГ/КГ, без ФИО и учётных
 * данных); по каждому замеру — версия методики, дата прохождения и баллы шкал. Пропуск — пустая
 * ячейка (FR-074), признак полноты наблюдения — отдельная колонка (FR-073).
 */
export function buildResearchRawTable(data: ResearchDataDto): ExportTable {
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
 * затем изменение между первым и последним замером. В каждой строке — методика и версия.
 */
export function buildResearchAggregateTable(data: ResearchDataDto): ExportTable {
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
  return { header, rows: [...statsRows, ...changeRows] };
}
