// Мотивационные профили (ТЗ, п. 4.5; FR-027–FR-033; UC-02). Правило предложения уровня —
// чистая функция: сервер применяет его к результатам диагностики, тесты проверяют на примерах.
// Профиль — предложение системы; уровень присваивает только преподаватель (принцип 2).
import { z } from 'zod';
import type { QuestionnaireVersionLabel } from './diagnostic-sessions.js';
import {
  MOTIVATION_LEVEL_LABELS,
  MotivationLevel,
  type MeasurementType,
  type MotivationProfileStatus,
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
  /** Вклад в профиль; null — показатель профиль не определяет. */
  motivationLevel: MotivationLevel | null;
}

export interface ProfileBasisDto {
  /** Минимум шкал с определённым уровнем (настройка `profiles.minScales`). */
  minScales: number;
  items: ProfileBasisItemDto[];
  /** Сколько шкал указали на каждый уровень. */
  counts: Record<MotivationLevel, number>;
  /** Пояснение, почему уровень не предложен; null — уровень предложен. */
  reason: string | null;
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

/** Текст для студента по умолчанию: интерпретации шкал-оснований без повторов. */
export function defaultStudentSummary(items: readonly ProfileBasisItemDto[]): string {
  const texts = items
    .filter((item) => item.motivationLevel && item.studentText)
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
