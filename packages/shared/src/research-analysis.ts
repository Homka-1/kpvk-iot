// Сводный анализ педагогического эксперимента (этап 29): по каждому показателю отдельно —
// мотивация, саморегуляция, академические достижения, наблюдения — описательные статистики
// «до» и «после», изменение, доля студентов с ростом, снижением и без изменений, критерий
// Вилкоксона внутри групп, критерий Манна — Уитни между ЭГ и КГ, корреляции Спирмена. Баллы разных
// методик и шкал не объединяются: каждая шкала — отдельный показатель. Перед расчётом — проверки
// полноты пар, версии методики и шкал; несопоставимые данные не сравниваются (FR-072).
import { CONTROL_KIND_LABELS } from './control-works.js';
import type { ExportCell, ExportSheet } from './diagnostic-results.js';
import { MEASUREMENT_TYPE_LABELS, ResearchGroup, SCALE_AGGREGATION_LABELS } from './enums.js';
import {
  formatDateRange,
  isResearchControlsKey,
  RESEARCH_GRADES_KEY,
  RESEARCH_GROUP_SHORT,
  RESEARCH_GROUPS,
  type ResearchDataDto,
  type ResearchMeasurementDto,
  type ResearchOutcomesDto,
} from './research.js';
import {
  EFFECT_MAGNITUDE_LABELS,
  formatPValue,
  mannWhitneyU,
  P_VALUE_METHOD_LABELS,
  significant,
  spearmanCorrelation,
  STATISTICAL_TEST_MIN_N,
  type StatisticalTestResult,
  wilcoxonSignedRank,
} from './statistical-tests.js';
import { type DescriptiveStats, descriptiveStats } from './statistics.js';
import { formatDateRu } from './reports.js';

/** Разделы анализа: показатели разных разделов не объединяются и не смешиваются. */
export const ResearchDomain = {
  MOTIVATION: 'motivation',
  SELF_REGULATION: 'self_regulation',
  ACADEMIC: 'academic',
  OBSERVATIONS: 'observations',
  OTHER: 'other',
} as const;
export type ResearchDomain = (typeof ResearchDomain)[keyof typeof ResearchDomain];

export const RESEARCH_DOMAINS: readonly ResearchDomain[] = Object.values(ResearchDomain);

export const RESEARCH_DOMAIN_LABELS: Record<ResearchDomain, string> = {
  motivation: 'Мотивация',
  self_regulation: 'Саморегуляция',
  academic: 'Академические достижения',
  observations: 'Педагогические наблюдения на занятиях',
  other: 'Другие методики',
};

/** Методика попадает в раздел по своему диагностическому направлению. */
const DIRECTION_DOMAINS: Record<string, ResearchDomain> = {
  LEARNING_MOTIVATION: ResearchDomain.MOTIVATION,
  SELF_REGULATION: ResearchDomain.SELF_REGULATION,
};

export const researchDomainOf = (measurement: Pick<ResearchMeasurementDto, 'direction'>) =>
  DIRECTION_DOMAINS[measurement.direction?.code ?? ''] ?? ResearchDomain.OTHER;

export type ResearchCheckStatus = 'ok' | 'warning' | 'error';

export const RESEARCH_CHECK_STATUS_LABELS: Record<ResearchCheckStatus, string> = {
  ok: 'Пройдена',
  warning: 'Предупреждение',
  error: 'Не пройдена',
};

/** Проверка данных перед статистическим анализом. */
export interface ResearchCheckDto {
  /** Что проверялось: «Версия методики», «Шкала», «Парные измерения», «Замеры». */
  name: string;
  status: ResearchCheckStatus;
  text: string;
}

/** Число студентов с ростом, снижением и без изменений среди тех, у кого есть оба значения. */
export interface ResearchDynamicsDto {
  pairs: number;
  positive: number;
  negative: number;
  zero: number;
}

/** Доля от числа пар в процентах с точностью 0,1; пар нет — null (FR-074). */
export const dynamicsShare = (count: number, pairs: number) =>
  pairs ? Math.round((count / pairs) * 1000) / 10 : null;

export interface ResearchGroupAnalysisDto {
  group: ResearchGroup;
  participants: number;
  before: DescriptiveStats;
  after: DescriptiveStats;
  /** null — пары несопоставимы, изменение не рассчитывается (FR-072). */
  change: DescriptiveStats | null;
  dynamics: ResearchDynamicsDto | null;
  wilcoxon: (StatisticalTestResult & { pairs: number; zeros: number }) | null;
}

export type ResearchComparisonPhase = 'before' | 'after' | 'change';

export const RESEARCH_PHASE_LABELS: Record<ResearchComparisonPhase, string> = {
  before: 'До',
  after: 'После',
  change: 'Изменение (после − до)',
};

export interface ResearchVariableValueDto {
  before: number | null;
  after: number | null;
  /** После − до; нет одного из значений или пары несопоставимы — null. */
  change: number | null;
}

/** Показатель анализа: одна шкала одной методики или один показатель успеваемости. */
export interface ResearchAnalysisVariableDto {
  key: string;
  name: string;
  domain: ResearchDomain;
  /** Откуда значения: методика и версии, семестры, периоды, контрольные работы. */
  source: string;
  beforeLabel: string;
  afterLabel: string;
  checks: ResearchCheckDto[];
  /** Значения «до» и «после» сопоставимы: изменение, динамика и критерии рассчитываются. */
  paired: boolean;
  groups: ResearchGroupAnalysisDto[];
  /** Сравнение ЭГ и КГ (критерий Манна — Уитни) «до», «после» и по изменению. */
  between: Record<
    ResearchComparisonPhase,
    (StatisticalTestResult & { n1: number; n2: number }) | null
  >;
  /** Значения участников по коду. */
  values: Record<string, ResearchVariableValueDto>;
}

export interface ResearchAnalysisDto {
  participants: { code: string; group: ResearchGroup }[];
  variables: ResearchAnalysisVariableDto[];
}

const roundChange = (value: number) => Math.round(value * 1000) / 1000;

function pairCheck(
  participants: readonly { code: string; group: ResearchGroup }[],
  values: Record<string, ResearchVariableValueDto>,
): ResearchCheckDto {
  const counts = RESEARCH_GROUPS.map((group) => {
    const own = participants.filter((participant) => participant.group === group);
    const pairs = own.filter((participant) => {
      const value = values[participant.code];
      return value && value.before !== null && value.after !== null;
    }).length;
    return { group, total: own.length, pairs };
  });
  const text = counts
    .map((count) => `${RESEARCH_GROUP_SHORT[count.group]} — ${count.pairs} из ${count.total}`)
    .join(', ');
  if (counts.some((count) => count.pairs < STATISTICAL_TEST_MIN_N)) {
    return {
      name: 'Парные измерения',
      status: 'error',
      text: `Пар «до — после»: ${text}. Для критериев нужно не менее ${STATISTICAL_TEST_MIN_N} пар в каждой группе.`,
    };
  }
  if (counts.some((count) => count.pairs < count.total)) {
    return {
      name: 'Парные измерения',
      status: 'warning',
      text: `Неполные пары исключены из парного анализа. Полных пар: ${text}.`,
    };
  }
  return { name: 'Парные измерения', status: 'ok', text: `Все пары полные: ${text}.` };
}

function analyseVariable(
  base: Omit<ResearchAnalysisVariableDto, 'groups' | 'between' | 'values' | 'checks'> & {
    checks: ResearchCheckDto[];
  },
  participants: readonly { code: string; group: ResearchGroup }[],
  valueOf: (code: string) => { before: number | null; after: number | null },
): ResearchAnalysisVariableDto {
  const values: Record<string, ResearchVariableValueDto> = {};
  for (const participant of participants) {
    const { before, after } = valueOf(participant.code);
    values[participant.code] = {
      before,
      after,
      change: base.paired && before !== null && after !== null ? roundChange(after - before) : null,
    };
  }
  const checks = [...base.checks];
  if (base.paired) checks.push(pairCheck(participants, values));
  const ofGroup = (group: ResearchGroup) =>
    participants
      .filter((participant) => participant.group === group)
      .map((participant) => values[participant.code]!);

  const groups = RESEARCH_GROUPS.map((group): ResearchGroupAnalysisDto => {
    const own = ofGroup(group);
    const changes = own.flatMap((value) => (value.change === null ? [] : [value.change]));
    return {
      group,
      participants: own.length,
      before: descriptiveStats(own.map((value) => value.before)),
      after: descriptiveStats(own.map((value) => value.after)),
      change: base.paired ? descriptiveStats(own.map((value) => value.change)) : null,
      dynamics: base.paired
        ? {
            pairs: changes.length,
            positive: changes.filter((change) => change > 0).length,
            negative: changes.filter((change) => change < 0).length,
            zero: changes.filter((change) => change === 0).length,
          }
        : null,
      wilcoxon: base.paired ? wilcoxonSignedRank(own) : null,
    };
  });
  const compare = (phase: ResearchComparisonPhase) =>
    mannWhitneyU(
      ofGroup(ResearchGroup.EXPERIMENTAL).map((value) => value[phase]),
      ofGroup(ResearchGroup.CONTROL).map((value) => value[phase]),
    );
  return {
    ...base,
    checks,
    groups,
    between: {
      before: compare('before'),
      after: compare('after'),
      change: base.paired ? compare('change') : null,
    },
    values,
  };
}

const versionText = (measurement: ResearchMeasurementDto) =>
  `${measurement.questionnaire.title}, версия ${measurement.questionnaire.versionNumber}`;

/** Показатели диагностики: каждая шкала методики — первый и последний замер методики. */
function diagnosticVariables(
  data: ResearchDataDto,
  participants: readonly { code: string; group: ResearchGroup }[],
): ResearchAnalysisVariableDto[] {
  const questionnaireIds = [
    ...new Set(data.measurements.map((measurement) => measurement.questionnaire.questionnaireId)),
  ];
  const rowByCode = new Map(data.rows.map((row) => [row.code, row]));
  return questionnaireIds.flatMap((questionnaireId) => {
    const own = data.measurements.filter(
      (measurement) => measurement.questionnaire.questionnaireId === questionnaireId,
    );
    const from = own[0]!;
    const to = own.length > 1 ? own[own.length - 1]! : null;
    const change = data.changes.find((item) => item.questionnaireId === questionnaireId);
    // Сопоставимость версий уже проверена при построении данных (FR-072).
    const comparable = Boolean(to && change?.comparable);
    const commonChecks: ResearchCheckDto[] = [];
    if (from.questionnaire.isDemo) {
      commonChecks.push({
        name: 'Методика',
        status: 'warning',
        text: 'Демо-методика — не для исследования.',
      });
    }
    if (!to) {
      commonChecks.push({
        name: 'Замеры',
        status: 'error',
        text: `Есть только один замер методики («${from.title}»): сравнение «до — после» невозможно.`,
      });
    } else {
      const typesOk = from.measurementType === 'PRIMARY' && to.measurementType === 'REPEATED';
      commonChecks.push({
        name: 'Замеры',
        status: typesOk ? 'ok' : 'warning',
        text: `«${from.title}» (${MEASUREMENT_TYPE_LABELS[from.measurementType].toLowerCase()}) → «${to.title}» (${MEASUREMENT_TYPE_LABELS[to.measurementType].toLowerCase()})${typesOk ? '.' : ': сравниваются не первичный и повторный замеры.'}`,
      });
      const sameVersion = from.questionnaire.versionId === to.questionnaire.versionId;
      commonChecks.push({
        name: 'Версия методики',
        status: comparable ? 'ok' : 'error',
        text: sameVersion
          ? `Одна версия методики: ${versionText(from)}.`
          : comparable
            ? `Версии ${from.questionnaire.versionNumber} и ${to.questionnaire.versionNumber} утверждены как сопоставимые.`
            : (change?.reason ??
              `Версии ${from.questionnaire.versionNumber} и ${to.questionnaire.versionNumber} не утверждены как сопоставимые: изменение не рассчитывается.`),
      });
    }
    return data.scales
      .filter((scale) => scale.questionnaireId === questionnaireId)
      .map((scale) => {
        const checks = [...commonChecks];
        let scaleOk = true;
        if (to) {
          const a = data.versionScales[from.questionnaire.versionId]?.find(
            (item) => item.code === scale.code,
          );
          const b = data.versionScales[to.questionnaire.versionId]?.find(
            (item) => item.code === scale.code,
          );
          if (!a || !b) {
            scaleOk = false;
            const missing = !a ? from : to;
            checks.push({
              name: 'Шкала',
              status: 'error',
              text: `Шкалы ${scale.code} нет в версии ${missing.questionnaire.versionNumber}: сравнение невозможно.`,
            });
          } else if (a.aggregation !== b.aggregation) {
            scaleOk = false;
            checks.push({
              name: 'Шкала',
              status: 'error',
              text: `Способ расчёта шкалы различается: ${SCALE_AGGREGATION_LABELS[a.aggregation].toLowerCase()} и ${SCALE_AGGREGATION_LABELS[b.aggregation].toLowerCase()}.`,
            });
          } else {
            checks.push({
              name: 'Шкала',
              status: a.name === b.name ? 'ok' : 'warning',
              text:
                a.name === b.name
                  ? `Код ${scale.code} и способ расчёта (${SCALE_AGGREGATION_LABELS[a.aggregation].toLowerCase()}) совпадают в обоих замерах.`
                  : `Название шкалы различается в версиях: «${a.name}» и «${b.name}»; код и способ расчёта совпадают.`,
            });
          }
        }
        const measured = (measurementId: string, code: string) =>
          rowByCode.get(code)?.values[measurementId]?.scores[scale.key] ?? null;
        return analyseVariable(
          {
            key: scale.key,
            name: scale.name,
            domain: researchDomainOf(from),
            source: to
              ? from.questionnaire.versionId === to.questionnaire.versionId
                ? versionText(from)
                : `${from.questionnaire.title}, версии ${from.questionnaire.versionNumber} → ${to.questionnaire.versionNumber}`
              : versionText(from),
            beforeLabel: from.title,
            afterLabel: to?.title ?? '—',
            checks,
            paired: Boolean(to) && comparable && scaleOk,
          },
          participants,
          (code) => ({ before: measured(from.id, code), after: to ? measured(to.id, code) : null }),
        );
      });
  });
}

/** Показатели вне диагностики: средний балл за семестр, контрольные работы, наблюдения. */
function outcomeVariables(
  outcomes: ResearchOutcomesDto,
  participants: readonly { code: string; group: ResearchGroup }[],
): ResearchAnalysisVariableDto[] {
  return outcomes.indicators.map((indicator) => {
    const checks: ResearchCheckDto[] = [];
    let domain: ResearchDomain = ResearchDomain.OBSERVATIONS;
    let source: string;
    let beforeLabel: string;
    let afterLabel: string;
    if (indicator.key === RESEARCH_GRADES_KEY) {
      domain = ResearchDomain.ACADEMIC;
      beforeLabel = outcomes.gradesBefore?.label ?? 'не выбран';
      afterLabel = outcomes.gradesAfter?.label ?? 'не выбран';
      source = `Семестры: ${beforeLabel} → ${afterLabel}`;
      if (!outcomes.gradesBefore || !outcomes.gradesAfter) {
        checks.push({
          name: 'Периоды',
          status: 'error',
          text: 'Не выбраны оба семестра «до» и «после».',
        });
      }
    } else if (isResearchControlsKey(indicator.key)) {
      domain = ResearchDomain.ACADEMIC;
      beforeLabel = CONTROL_KIND_LABELS.ENTRY;
      afterLabel = CONTROL_KIND_LABELS.FINAL;
      source = `${beforeLabel} → ${afterLabel} (средний балл работ; отметки не учитываются)`;
    } else {
      beforeLabel = outcomes.observationsBefore
        ? formatDateRange(outcomes.observationsBefore)
        : 'не задан';
      afterLabel = outcomes.observationsAfter
        ? formatDateRange(outcomes.observationsAfter)
        : 'не задан';
      source = `Периоды наблюдений: ${beforeLabel} → ${afterLabel}`;
      if (!outcomes.observationsBefore || !outcomes.observationsAfter) {
        checks.push({
          name: 'Периоды',
          status: 'error',
          text: 'Не заданы оба периода наблюдений «до» и «после».',
        });
      }
    }
    return analyseVariable(
      {
        key: indicator.key,
        name: indicator.name,
        domain,
        source,
        beforeLabel,
        afterLabel,
        checks,
        paired: checks.every((check) => check.status !== 'error'),
      },
      participants,
      (code) => {
        const value = outcomes.values[code]?.[indicator.key];
        return { before: value?.before ?? null, after: value?.after ?? null };
      },
    );
  });
}

/**
 * Сводный анализ эксперимента по данным исследования: показатели по разделам, проверки,
 * статистики, динамика и критерии. Исключённые участники в данных уже не участвуют.
 */
export function buildResearchAnalysis(data: ResearchDataDto): ResearchAnalysisDto {
  const participants = data.rows.map((row) => ({ code: row.code, group: row.group }));
  const variables = [
    ...diagnosticVariables(data, participants),
    ...outcomeVariables(data.outcomes, participants),
  ];
  const order = (variable: ResearchAnalysisVariableDto) =>
    RESEARCH_DOMAINS.indexOf(variable.domain);
  return {
    participants,
    variables: variables
      .map((variable, index) => ({ variable, index }))
      .sort((a, b) => order(a.variable) - order(b.variable) || a.index - b.index)
      .map((item) => item.variable),
  };
}

// ── Корреляции Спирмена ──

export interface ResearchCorrelationDto {
  rowKey: string;
  columnKey: string;
  result: StatisticalTestResult;
}

/**
 * Корреляции Спирмена между показателями (каждый — отдельная шкала, без объединения) у участников
 * выбранной группы (null — все участники) по значениям «до», «после» или по изменению. Для
 * изменения берутся только показатели с сопоставимыми парами.
 */
export function researchCorrelations(
  analysis: ResearchAnalysisDto,
  phase: ResearchComparisonPhase,
  group: ResearchGroup | null,
  keys?: readonly string[],
): { variables: ResearchAnalysisVariableDto[]; cells: ResearchCorrelationDto[] } {
  const codes = analysis.participants
    .filter((participant) => group === null || participant.group === group)
    .map((participant) => participant.code);
  const variables = analysis.variables.filter(
    (variable) =>
      (!keys?.length || keys.includes(variable.key)) && (phase !== 'change' || variable.paired),
  );
  const cells: ResearchCorrelationDto[] = [];
  variables.forEach((row, rowIndex) => {
    variables.slice(rowIndex + 1).forEach((column) => {
      cells.push({
        rowKey: row.key,
        columnKey: column.key,
        result: spearmanCorrelation(
          codes.map((code) => ({ x: row.values[code]?.[phase], y: column.values[code]?.[phase] })),
        ),
      });
    });
  });
  return { variables, cells };
}

// ── Таблицы для ВКР (выгрузка) ──

const num = (value: number | null | undefined): ExportCell => value ?? null;
const testCells = (result: StatisticalTestResult | null): ExportCell[] =>
  result
    ? [
        num(result.statistic),
        num(result.z),
        result.p === null ? null : formatPValue(result.p),
        num(result.effectSize),
        result.effectMagnitude ? EFFECT_MAGNITUDE_LABELS[result.effectMagnitude] : null,
        result.p === null ? (result.note ?? null) : significant(result) ? 'да' : 'нет',
        result.method ? P_VALUE_METHOD_LABELS[result.method] : null,
      ]
    : [null, null, null, null, null, 'не рассчитывается: пары несопоставимы', null];

const variableLabel = (variable: ResearchAnalysisVariableDto) =>
  `${variable.name} (${variable.source})`;

/**
 * Таблицы для магистерской ВКР (этап 29): проверки данных, описательные статистики и динамика
 * внутри групп с критерием Вилкоксона, сравнение ЭГ и КГ критерием Манна — Уитни, корреляции
 * Спирмена, ряды контрольных работ. Только коды и группы ЭГ/КГ; пропуски — пустые ячейки (FR-074).
 */
export function buildResearchAnalysisSheets(data: ResearchDataDto): ExportSheet[] {
  const analysis = buildResearchAnalysis(data);
  const { variables } = analysis;
  const domain = (variable: ResearchAnalysisVariableDto) => RESEARCH_DOMAIN_LABELS[variable.domain];
  const stats = (value: DescriptiveStats | null): ExportCell[] =>
    value ? [num(value.mean), num(value.median), num(value.sd)] : [null, null, null];

  const checks: ExportSheet = {
    name: 'Проверка данных',
    title: 'Таблица 1. Проверка данных перед статистическим анализом',
    table: {
      header: ['Раздел', 'Показатель', 'Источник', 'Проверка', 'Результат', 'Пояснение'],
      rows: variables.flatMap((variable) =>
        variable.checks.map((check) => [
          domain(variable),
          variable.name,
          variable.source,
          check.name,
          RESEARCH_CHECK_STATUS_LABELS[check.status],
          check.text,
        ]),
      ),
    },
  };

  const within: ExportSheet = {
    name: 'Внутри групп',
    title:
      'Таблица 2. Описательные статистики, динамика и критерий Вилкоксона (сравнение «до — после» внутри группы)',
    table: {
      header: [
        'Раздел',
        'Показатель',
        'Группа',
        'Участников',
        'До: n',
        'До: среднее',
        'До: медиана',
        'До: стандартное отклонение',
        'После: n',
        'После: среднее',
        'После: медиана',
        'После: стандартное отклонение',
        'Пар',
        'Изменение: среднее',
        'Изменение: медиана',
        'Изменение: стандартное отклонение',
        'Рост, чел.',
        'Рост, %',
        'Без изменений, чел.',
        'Без изменений, %',
        'Снижение, чел.',
        'Снижение, %',
        'Вилкоксон: T',
        'Z',
        'p',
        'Размер эффекта r',
        'Эффект',
        'Значимо при p < 0,05',
        'Метод расчёта p',
      ],
      rows: variables.flatMap((variable) =>
        variable.groups.map((group) => {
          const dynamics = group.dynamics;
          return [
            domain(variable),
            variableLabel(variable),
            RESEARCH_GROUP_SHORT[group.group],
            group.participants,
            group.before.n,
            ...stats(group.before),
            group.after.n,
            ...stats(group.after),
            dynamics?.pairs ?? null,
            ...stats(group.change),
            ...(dynamics
              ? [
                  dynamics.positive,
                  dynamicsShare(dynamics.positive, dynamics.pairs),
                  dynamics.zero,
                  dynamicsShare(dynamics.zero, dynamics.pairs),
                  dynamics.negative,
                  dynamicsShare(dynamics.negative, dynamics.pairs),
                ]
              : [null, null, null, null, null, null]),
            ...testCells(group.wilcoxon),
          ];
        }),
      ),
    },
  };

  const between: ExportSheet = {
    name: 'ЭГ и КГ',
    title: 'Таблица 3. Сравнение ЭГ и КГ: критерий Манна — Уитни',
    table: {
      header: [
        'Раздел',
        'Показатель',
        'Сравнение',
        'n ЭГ',
        'n КГ',
        'Медиана ЭГ',
        'Медиана КГ',
        'U',
        'Z',
        'p',
        'Размер эффекта r',
        'Эффект',
        'Значимо при p < 0,05',
        'Метод расчёта p',
      ],
      rows: variables.flatMap((variable) =>
        (['before', 'after', 'change'] as const).map((phase) => {
          const median = (group: ResearchGroup) => {
            const own = variable.groups.find((item) => item.group === group)!;
            return num((phase === 'change' ? own.change : own[phase])?.median);
          };
          const result = variable.between[phase];
          return [
            domain(variable),
            variableLabel(variable),
            RESEARCH_PHASE_LABELS[phase],
            result?.n1 ?? null,
            result?.n2 ?? null,
            median(ResearchGroup.EXPERIMENTAL),
            median(ResearchGroup.CONTROL),
            ...testCells(result),
          ];
        }),
      ),
    },
  };

  const correlationRows = (['after', 'change'] as const).flatMap((phase) =>
    [null, ...RESEARCH_GROUPS].flatMap((group) => {
      const { variables: used, cells } = researchCorrelations(analysis, phase, group);
      const label = (key: string) => variableLabel(used.find((item) => item.key === key)!);
      return cells.map((cell) => [
        RESEARCH_PHASE_LABELS[phase],
        group ? RESEARCH_GROUP_SHORT[group] : 'Все участники',
        label(cell.rowKey),
        label(cell.columnKey),
        cell.result.n,
        num(cell.result.statistic),
        cell.result.p === null ? null : formatPValue(cell.result.p),
        cell.result.effectMagnitude ? EFFECT_MAGNITUDE_LABELS[cell.result.effectMagnitude] : null,
        cell.result.p === null ? cell.result.note : significant(cell.result) ? 'да' : 'нет',
      ]);
    }),
  );
  const correlations: ExportSheet = {
    name: 'Корреляции',
    title: 'Таблица 4. Ранговые корреляции Спирмена между показателями',
    table: {
      header: [
        'Значения',
        'Группа',
        'Показатель 1',
        'Показатель 2',
        'n',
        'ρ',
        'p',
        'Сила связи',
        'Значимо при p < 0,05',
      ],
      rows: correlationRows,
    },
  };

  const controls: ExportSheet = {
    name: 'Контрольные работы',
    title: 'Таблица 5. Контрольные работы: входной, текущий и итоговый контроль ЭГ и КГ',
    table: {
      header: [
        'Дисциплина',
        'Дата',
        'Вид контроля',
        'Тема',
        'Группа',
        'n',
        'Нет результата',
        'Среднее',
        'Медиана',
        'Стандартное отклонение',
      ],
      rows: data.outcomes.controlSeries.flatMap((series) =>
        series.works.flatMap((work) =>
          series.stats
            .filter((row) => row.workId === work.id)
            .map((row) => [
              series.discipline.name,
              formatDateRu(work.date),
              CONTROL_KIND_LABELS[work.kind],
              work.topic,
              RESEARCH_GROUP_SHORT[row.group],
              row.stats.n,
              row.stats.missing,
              ...stats(row.stats),
            ]),
        ),
      ),
    },
  };

  return [checks, within, between, correlations, controls];
}
