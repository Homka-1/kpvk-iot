// Мотивационные профили (ТЗ, п. 4.5; FR-027–FR-033; UC-02). Правило предложения уровня —
// чистая функция: сервер применяет его к результатам диагностики, тесты проверяют на примерах.
// Профиль — предложение системы; уровень присваивает только преподаватель (принцип 2).
import { z } from 'zod';
import type { QuestionnaireVersionLabel } from './diagnostic-sessions.js';
import { roundScore } from './diagnostics.js';
import {
  MOTIVATION_LEVEL_LABELS,
  MotivationLevel,
  type MeasurementType,
  type MotivationProfileStatus,
  type ScaleAggregation,
  type ScaleMotivationRole,
} from './enums.js';
import type { PersonRef } from './students.js';

export const PROFILE_REASON_MAX = 1000;
export const PROFILE_STUDENT_SUMMARY_MAX = 2000;
export const STRATEGY_ITEM_MAX = 300;
export const STRATEGY_ITEMS_MAX = 12;

/** Уровни от высокого к низкому — порядок карточек и подсчёта. */
export const MOTIVATION_LEVELS: readonly MotivationLevel[] = [
  MotivationLevel.HIGH,
  MotivationLevel.MEDIUM,
  MotivationLevel.LOW,
];

// ── Стратегии сопровождения (FR-030) ──

/** Стратегии сопровождения для трёх уровней: пункты списка рекомендаций. */
export type MotivationStrategiesDto = Record<MotivationLevel, string[]>;

/**
 * Исходные формулировки — дословно п. 4.5 ТЗ. Редактируются в «Настройках»
 * (open-questions, вопрос 11: утверждение текстов заказчиком).
 */
export const DEFAULT_MOTIVATION_STRATEGIES: MotivationStrategiesDto = {
  HIGH: [
    'Самостоятельность',
    'Исследовательские задания',
    'Проекты повышенной сложности',
    'Профессиональные конкурсы',
  ],
  MEDIUM: [
    'Развитие самостоятельности',
    'Постепенное усложнение',
    'Практические задания',
    'Предоставление выбора',
  ],
  LOW: [
    'Небольшие достижимые цели',
    'Пошаговая работа',
    'Регулярная поддержка',
    'Обратная связь',
    'Создание ситуации успеха',
  ],
};

const strategyItems = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Пустой пункт')
      .max(STRATEGY_ITEM_MAX, `Не более ${STRATEGY_ITEM_MAX} символов`),
  )
  .min(1, 'Нужен хотя бы один пункт')
  .max(STRATEGY_ITEMS_MAX, `Не более ${STRATEGY_ITEMS_MAX} пунктов`);

export const motivationStrategiesSchema = z.object({
  HIGH: strategyItems,
  MEDIUM: strategyItems,
  LOW: strategyItems,
});

// ── Основания профиля (FR-028) ──

/** Показатель шкалы, участвующей в профиле: у её правил интерпретации задан уровень профиля. */
export interface ProfileBasisItemDto {
  sessionId: string;
  questionnaire: QuestionnaireVersionLabel;
  measurementType: MeasurementType;
  completedAt: string;
  scaleCode: string;
  scaleName: string;
  /** null — балл не рассчитан (пропуски ответов), показывается «Нет данных». */
  rawScore: number | null;
  /** Уровень шкалы по правилу интерпретации; null — балл не попал ни в один диапазон. */
  levelLabel: string | null;
  /** Описание уровня шкалы из правила интерпретации (характеристика для преподавателя). */
  description: string | null;
  /** Понятная студенту интерпретация из правила (FR-016). */
  studentText: string | null;
  /** Вклад в профиль по правилу интерпретации (прежнее правило); null — шкала не голосует. */
  motivationLevel: MotivationLevel | null;
  /** Роль шкалы в профиле (правило этапа 24); нет поля — профиль сформирован прежним правилом. */
  motivationRole?: ScaleMotivationRole;
}

/** Как считается уровень методики по её внутренним шкалам. */
export const MethodologyLevelMethod = {
  /** Среднее внутренних шкал (шкалы — средние по пунктам, ответ 1–5; Реан — Якунин). */
  INTRINSIC_MEAN: 'INTRINSIC_MEAN',
  /** Процент суммы баллов внутренних шкал от их максимума (Ильина). */
  INTRINSIC_PERCENT: 'INTRINSIC_PERCENT',
} as const;
export type MethodologyLevelMethod =
  (typeof MethodologyLevelMethod)[keyof typeof MethodologyLevelMethod];

/**
 * Рабочие нормы исследования, утверждённые заказчиком 2026-10-23: нижние границы высокого и
 * среднего уровня. Среднее сравнивается после округления до 0,1, процент — до целого.
 */
export const METHODOLOGY_LEVEL_THRESHOLDS: Record<
  MethodologyLevelMethod,
  { high: number; medium: number }
> = {
  INTRINSIC_MEAN: { high: 4, medium: 3 },
  INTRINSIC_PERCENT: { high: 67, medium: 34 },
};

/** Уровень одной методики по последнему завершённому прохождению. */
export interface MethodologyLevelDto {
  sessionId: string;
  questionnaire: QuestionnaireVersionLabel;
  measurementType: MeasurementType;
  completedAt: string;
  method: MethodologyLevelMethod;
  /** Среднее (до 0,1) или процент (целый) внутренних шкал; null — нет данных. */
  intrinsic: number | null;
  /** То же для внешних шкал; null — внешних шкал нет или нет данных. */
  extrinsic: number | null;
  level: MotivationLevel | null;
  /** Внешняя мотивация выше внутренней — предупреждение преподавателю; уровень не повышает. */
  extrinsicPrevails: boolean;
  /** Почему уровень методики не определён; null — определён. */
  reason: string | null;
}

/** Итог сведения уровней методик. */
export const ProfileRuleOutcome = {
  /** Уровни методик совпали. */
  MATCH: 'MATCH',
  /** Уровни различаются на одну ступень — предложен более низкий. */
  ONE_STEP_LOWER: 'ONE_STEP_LOWER',
  /** Высокий и низкий — требуется дополнительная диагностика. */
  CONFLICT: 'CONFLICT',
  /** Уровень определён только по одной методике — недостаточно данных. */
  SINGLE_METHODOLOGY: 'SINGLE_METHODOLOGY',
  /** Ни одна методика не дала уровень. */
  NO_DATA: 'NO_DATA',
} as const;
export type ProfileRuleOutcome = (typeof ProfileRuleOutcome)[keyof typeof ProfileRuleOutcome];

/**
 * Основания профиля. Профили, сформированные до этапа 24, хранят только поля прежнего правила
 * (голосование шкал), поэтому поля нового правила необязательны.
 */
export interface ProfileBasisDto {
  /** Нет поля — прежнее правило: голосование шкал по уровням в правилах интерпретации. */
  rule?: 'SCALE_VOTES' | 'METHODOLOGIES';
  /** Минимум шкал с определённым уровнем (настройка `profiles.minScales`, прежнее правило). */
  minScales: number;
  items: ProfileBasisItemDto[];
  /** Сколько шкал (прежнее правило) или методик (новое) указали на каждый уровень. */
  counts: Record<MotivationLevel, number>;
  /** Пояснение, почему уровень не предложен; null — уровень предложен. */
  reason: string | null;
  /** Уровни методик (новое правило). */
  methodologies?: MethodologyLevelDto[];
  outcome?: ProfileRuleOutcome;
  /** Как получен итог — показывается преподавателю (FR-028). */
  explanation?: string;
}

export interface MotivationProposal {
  level: MotivationLevel | null;
  counts: Record<MotivationLevel, number>;
  reason: string | null;
}

/**
 * Предложение уровня по показателям-основаниям (FR-027). Правило принято до ответа заказчика
 * (open-questions, вопрос 3): уровень, на который указало большинство шкал, если шкал с
 * определённым уровнем не меньше `minScales`. Равенство голосов или недостаток данных —
 * уровень не предлагается («Требуется дополнительная диагностика», п. 4.5).
 */
export function proposeMotivationLevel(
  items: readonly Pick<ProfileBasisItemDto, 'motivationLevel'>[],
  minScales: number,
): MotivationProposal {
  const counts: Record<MotivationLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const item of items) if (item.motivationLevel) counts[item.motivationLevel] += 1;
  const total = counts.HIGH + counts.MEDIUM + counts.LOW;
  if (total === 0) {
    return {
      level: null,
      counts,
      reason: 'Нет завершённой диагностики с правилами интерпретации для мотивационного профиля.',
    };
  }
  if (total < minScales) {
    return {
      level: null,
      counts,
      reason: `Уровень определён по ${total} из минимально необходимых ${minScales} шкал.`,
    };
  }
  const best = Math.max(...MOTIVATION_LEVELS.map((level) => counts[level]));
  const leaders = MOTIVATION_LEVELS.filter((level) => counts[level] === best);
  if (leaders.length > 1) {
    return {
      level: null,
      counts,
      reason: `Показатели шкал расходятся: ${leaders
        .map((level) => `${MOTIVATION_LEVEL_LABELS[level].toLowerCase()} — ${best}`)
        .join(', ')}.`,
    };
  }
  return { level: leaders[0]!, counts, reason: null };
}

/** Балл шкалы для расчёта уровня методики. */
export interface MethodologyScaleInput {
  name: string;
  role: ScaleMotivationRole;
  aggregation: ScaleAggregation;
  /** null — балл не рассчитан (пропуски ответов). */
  rawScore: number | null;
  /** Максимум балла шкалы по ключам; null — не определяется. */
  maxScore: number | null;
}

export interface MethodologyLevelResult {
  method: MethodologyLevelMethod;
  intrinsic: number | null;
  extrinsic: number | null;
  level: MotivationLevel | null;
  extrinsicPrevails: boolean;
  reason: string | null;
}

/** Методика участвует в новом правиле, если у версии есть хотя бы одна внутренняя шкала. */
export function usesIntrinsicRule(scales: readonly { motivationRole: ScaleMotivationRole }[]) {
  return scales.some((scale) => scale.motivationRole === 'INTRINSIC');
}

function levelByThresholds(method: MethodologyLevelMethod, value: number): MotivationLevel {
  const { high, medium } = METHODOLOGY_LEVEL_THRESHOLDS[method];
  if (value >= high) return MotivationLevel.HIGH;
  if (value >= medium) return MotivationLevel.MEDIUM;
  return MotivationLevel.LOW;
}

/**
 * Показатель группы шкал: среднее шкал до 0,1 или процент суммы от максимума до целого.
 * null — у какой-то шкалы нет балла или максимума (FR-074: пропуск не заменяется нулём).
 */
function groupMeasure(
  method: MethodologyLevelMethod,
  scales: readonly MethodologyScaleInput[],
): number | null {
  if (scales.length === 0 || scales.some((scale) => scale.rawScore === null)) return null;
  const sum = scales.reduce((total, scale) => total + scale.rawScore!, 0);
  if (method === 'INTRINSIC_MEAN') {
    return Math.round(roundScore(sum / scales.length) * 10) / 10 + 0;
  }
  if (scales.some((scale) => scale.maxScore === null)) return null;
  const max = scales.reduce((total, scale) => total + scale.maxScore!, 0);
  if (max <= 0) return null;
  return Math.round(roundScore((sum / max) * 100)) + 0;
}

/**
 * Уровень методики (этап 24): считается только по внутренним шкалам. Если все внутренние и
 * внешние шкалы — средние по пунктам, уровень задаёт среднее внутренних шкал (≥ 4,0 — высокий,
 * 3,0–3,9 — средний, < 3,0 — низкий); иначе — процент от максимума внутренних шкал (≥ 67 % —
 * высокий, 34–66 % — средний, < 34 % — низкий). Внешние шкалы уровень не повышают: при их
 * преобладании выставляется предупреждение. Справочные шкалы не участвуют.
 */
export function methodologyLevel(scales: readonly MethodologyScaleInput[]): MethodologyLevelResult {
  const intrinsic = scales.filter((scale) => scale.role === 'INTRINSIC');
  const extrinsic = scales.filter((scale) => scale.role === 'EXTRINSIC');
  const method: MethodologyLevelMethod = [...intrinsic, ...extrinsic].every(
    (scale) => scale.aggregation === 'MEAN',
  )
    ? MethodologyLevelMethod.INTRINSIC_MEAN
    : MethodologyLevelMethod.INTRINSIC_PERCENT;
  const intrinsicValue = groupMeasure(method, intrinsic);
  const extrinsicValue = groupMeasure(method, extrinsic);
  let reason: string | null = null;
  if (intrinsic.length === 0) {
    reason = 'У методики нет шкал внутренней мотивации.';
  } else if (intrinsicValue === null) {
    const missing = intrinsic.filter((scale) => scale.rawScore === null).map((s) => s.name);
    reason =
      missing.length > 0
        ? `Нет данных по шкалам внутренней мотивации: ${missing.join(', ')}.`
        : 'Не удалось определить максимум баллов шкал внутренней мотивации.';
  }
  return {
    method,
    intrinsic: intrinsicValue,
    extrinsic: extrinsicValue,
    level: intrinsicValue === null ? null : levelByThresholds(method, intrinsicValue),
    extrinsicPrevails:
      intrinsicValue !== null && extrinsicValue !== null && extrinsicValue > intrinsicValue,
    reason,
  };
}

const LEVEL_RANK: Record<MotivationLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export interface CombinedProposal extends MotivationProposal {
  outcome: ProfileRuleOutcome;
  explanation: string;
}

const levelName = (level: MotivationLevel) => MOTIVATION_LEVEL_LABELS[level].toLowerCase();

/**
 * Сведение уровней методик (этап 24): совпали — этот уровень; разница в одну ступень — более
 * низкий; «высокий» и «низкий» — требуется дополнительная диагностика; уровень определён только
 * по одной методике — недостаточно данных. Решение остаётся за преподавателем (FR-029).
 */
export function combineMethodologyLevels(
  levels: readonly (MotivationLevel | null)[],
): CombinedProposal {
  const counts: Record<MotivationLevel, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const known = levels.filter((level): level is MotivationLevel => level !== null);
  for (const level of known) counts[level] += 1;
  if (known.length === 0) {
    const reason =
      'Нет данных: ни по одной пройденной методике не определён уровень внутренней мотивации.';
    return { level: null, counts, reason, outcome: 'NO_DATA', explanation: reason };
  }
  if (known.length === 1) {
    const reason = `Недостаточно данных: уровень определён только по одной методике (${levelName(
      known[0]!,
    )}). Для профиля нужны результаты двух методик.`;
    return { level: null, counts, reason, outcome: 'SINGLE_METHODOLOGY', explanation: reason };
  }
  const ranks = known.map((level) => LEVEL_RANK[level]);
  const spread = Math.max(...ranks) - Math.min(...ranks);
  const lowest = MOTIVATION_LEVELS.find((level) => LEVEL_RANK[level] === Math.min(...ranks))!;
  if (spread === 0) {
    return {
      level: lowest,
      counts,
      reason: null,
      outcome: 'MATCH',
      explanation: `Уровни методик совпали: ${levelName(lowest)}.`,
    };
  }
  if (spread === 1) {
    const other = MOTIVATION_LEVELS.find((level) => LEVEL_RANK[level] === Math.max(...ranks))!;
    return {
      level: lowest,
      counts,
      reason: null,
      outcome: 'ONE_STEP_LOWER',
      explanation: `Уровни методик различаются на одну ступень (${levelName(other)} и ${levelName(
        lowest,
      )}): предложен более низкий — ${levelName(lowest)}.`,
    };
  }
  const reason =
    'Требуется дополнительная диагностика: одна методика показала высокий уровень, другая — низкий.';
  return { level: null, counts, reason, outcome: 'CONFLICT', explanation: reason };
}

/**
 * Текст для студента по умолчанию: интерпретации шкал-оснований без повторов (голосующие шкалы
 * прежнего правила или внутренние шкалы нового).
 */
export function defaultStudentSummary(items: readonly ProfileBasisItemDto[]): string {
  const texts = items
    .filter(
      (item) => (item.motivationLevel || item.motivationRole === 'INTRINSIC') && item.studentText,
    )
    .map((item) => item.studentText!.trim());
  return [...new Set(texts)].join('\n');
}

// ── Контракты API ──

export interface MotivationProfileDto {
  id: string;
  studentId: string;
  status: MotivationProfileStatus;
  /** Уровень, предложенный системой; null — данных недостаточно. */
  proposedLevel: MotivationLevel | null;
  /** Уровень, утверждённый преподавателем; null — решения ещё нет. */
  level: MotivationLevel | null;
  basis: ProfileBasisDto | null;
  correctionReason: string | null;
  studentSummary: string | null;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface MotivationProfileHistoryDto {
  id: string;
  profileId: string;
  status: MotivationProfileStatus;
  fromLevel: MotivationLevel | null;
  toLevel: MotivationLevel | null;
  reason: string | null;
  changedBy: PersonRef | null;
  at: string;
}

/** Вкладка «Мотивационный профиль»: текущая запись и история (FR-032). */
export interface StudentMotivationDto {
  current: MotivationProfileDto | null;
  /** Последний утверждённый профиль (может отличаться от текущего, если новое предложение ждёт решения). */
  lastDecided: MotivationProfileDto | null;
  history: MotivationProfileHistoryDto[];
}

/** Распределение профилей в доступной области (раздел «Мотивационные профили»). */
export interface ProfileDistributionDto {
  total: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  /** Предложен системой, ждёт решения преподавателя. */
  PROPOSED: number;
  NEEDS_MORE_DIAGNOSTICS: number;
  /** Профиль не формировался. */
  NONE: number;
}

/** Профиль, который видит студент: только утверждённая интерпретация (FR-016). */
export interface OwnMotivationProfileDto {
  studentSummary: string | null;
  decidedAt: string;
}

// ── Схемы форм (zod) ──

/** Решение преподавателя (FR-029): другой уровень, чем предложен, — только с причиной. */
export function profileDecisionSchema(proposedLevel: MotivationLevel | null) {
  return z
    .object({
      level: z.enum(['HIGH', 'MEDIUM', 'LOW'], { message: 'Выберите уровень' }),
      reason: z
        .string()
        .trim()
        .max(PROFILE_REASON_MAX, `Не более ${PROFILE_REASON_MAX} символов`)
        .optional(),
      studentSummary: z
        .string()
        .trim()
        .max(PROFILE_STUDENT_SUMMARY_MAX, `Не более ${PROFILE_STUDENT_SUMMARY_MAX} символов`)
        .optional(),
    })
    .refine((value) => value.level === proposedLevel || !!value.reason, {
      path: ['reason'],
      message: 'Укажите причину корректировки',
    });
}
export type ProfileDecisionValues = z.infer<ReturnType<typeof profileDecisionSchema>>;
