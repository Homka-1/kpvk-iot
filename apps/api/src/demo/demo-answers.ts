import {
  type AnswerValue,
  methodologyLevel,
  type MotivationLevel,
  type QuestionContent,
  type QuestionnaireContent,
  type ScaleContent,
  type ScaleMotivationRole,
  scaleScoreRange,
  scoreQuestionnaire,
} from '@iot/shared';
import { clamp, noise, pick, type Random } from './demo-random.js';

/**
 * Склонность студента отвечать «в сторону» шкал каждой роли: 0 — минимум, 1 — максимум.
 * Внутренняя мотивация определяет уровень профиля; остальные роли — фон.
 */
export type Disposition = Record<ScaleMotivationRole, number>;

const ANSWER_NOISE = 0.12;
const LEVEL_RANK: Record<MotivationLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const SEARCH_STEP = 0.05;
const SEARCH_ATTEMPTS = 20;

/** Уровень, к которому тяготеет студент с данной склонностью к внутренней мотивации. */
export function levelFor(intrinsic: number): MotivationLevel {
  return intrinsic >= 0.72 ? 'HIGH' : intrinsic >= 0.4 ? 'MEDIUM' : 'LOW';
}

/**
 * Ответы, по которым правило методики (этап 24) даёт целевой уровень: склонность сдвигается
 * шагами, пока уровень по внутренним шкалам не совпадёт с целевым. Так распределение уровней не
 * зависит от формата шкал методики (Лайкерт, «да/нет», сумма или среднее). Для методики без
 * внутренних шкал подбор не нужен.
 */
export function answersForLevel(
  content: QuestionnaireContent,
  disposition: Disposition,
  target: MotivationLevel,
  random: Random,
): Record<string, Exclude<AnswerValue, null>> {
  let intrinsic = disposition.INTRINSIC;
  let answers = generateAnswers(content, disposition, random);
  for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt += 1) {
    const level = intrinsicLevel(content, answers);
    if (level === null || level === target) break;
    intrinsic = clamp(
      intrinsic + (LEVEL_RANK[target] > LEVEL_RANK[level] ? SEARCH_STEP : -SEARCH_STEP),
      0,
      1,
    );
    answers = generateAnswers(content, { ...disposition, INTRINSIC: intrinsic }, random);
  }
  return answers;
}

/** Уровень методики по внутренним шкалам — тем же расчётом, что и в профиле. */
export function intrinsicLevel(
  content: QuestionnaireContent,
  answers: Record<string, AnswerValue>,
): MotivationLevel | null {
  if (!content.scales.some((scale) => scale.motivationRole === 'INTRINSIC')) return null;
  const scores = new Map(
    scoreQuestionnaire(content, answers).map((score) => [score.scaleKey, score.rawScore]),
  );
  return methodologyLevel(
    content.scales.map((scale) => ({
      name: scale.name,
      role: scale.motivationRole,
      aggregation: scale.aggregation,
      rawScore: scores.get(scale.key) ?? null,
      maxScore: scaleScoreRange(content, scale)?.max ?? null,
    })),
  ).level;
}
const TEXT_ANSWERS = [
  'Интересно разбираться в новом',
  'Хочу хорошо освоить специальность',
  'Нравится решать практические задачи',
  'Важно получить хорошие оценки',
];

/**
 * Ответы на методику, согласованные с расположением студента: для каждого вопроса варианты
 * упорядочиваются по вкладу в шкалы (через движок расчёта, с учётом обратных ключей и баллов
 * вариантов), и выбирается вариант на уровне склонности с небольшим разбросом. Так уровень
 * профиля, который затем рассчитают настоящие правила интерпретации, следует склонности.
 */
export function generateAnswers(
  content: QuestionnaireContent,
  disposition: Disposition,
  random: Random,
): Record<string, Exclude<AnswerValue, null>> {
  const answers: Record<string, Exclude<AnswerValue, null>> = {};
  for (const question of content.questions) {
    if (question.type === 'SHORT_TEXT') {
      answers[question.key] = pick(random, TEXT_ANSWERS);
      continue;
    }
    const keyed = keyedScales(content.scales, question.key);
    const role = (['INTRINSIC', 'EXTRINSIC', 'REFERENCE'] as const).find((item) =>
      keyed.some((scale) => scale.motivationRole === item),
    );
    const scales = role ? keyed.filter((scale) => scale.motivationRole === role) : [];
    const target = clamp((role ? disposition[role] : random()) + noise(random, ANSWER_NOISE), 0, 1);

    if (question.type === 'MULTIPLE_CHOICE') {
      const ranked = rank(
        question,
        scales,
        question.options.map((option) => [option.key]),
        random,
      );
      const count = Math.max(1, Math.round(target * ranked.length));
      answers[question.key] = ranked.slice(-count).flat();
      continue;
    }
    const candidates: Exclude<AnswerValue, null>[] =
      question.type === 'SINGLE_CHOICE'
        ? question.options.map((option) => option.key)
        : numberCandidates(question);
    if (candidates.length === 0) continue;
    const ranked = rank(question, scales, candidates, random);
    answers[question.key] = ranked[Math.round(target * (ranked.length - 1))]!;
  }
  return answers;
}

/** Шкалы, в ключах которых есть вопрос; ключи оставлены только этого вопроса. */
function keyedScales(scales: readonly ScaleContent[], questionKey: string): ScaleContent[] {
  return scales
    .map((scale) => ({
      ...scale,
      aggregation: 'SUM' as const,
      rules: [],
      keys: scale.keys.filter((key) => key.questionKey === questionKey),
    }))
    .filter((scale) => scale.keys.length > 0);
}

/** Кандидаты по возрастанию вклада в шкалы; при равном вкладе — в случайном порядке. */
function rank<T extends Exclude<AnswerValue, null>>(
  question: QuestionContent,
  scales: ScaleContent[],
  candidates: T[],
  random: Random,
): T[] {
  const content = {
    questions: [question],
    scales,
  } as unknown as QuestionnaireContent;
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreQuestionnaire(content, { [question.key]: candidate }).reduce(
        (sum, item) => sum + (item.rawScore ?? 0),
        0,
      ),
      tie: random(),
    }))
    .sort((a, b) => a.score - b.score || a.tie - b.tie)
    .map((item) => item.candidate);
}

function numberCandidates(question: QuestionContent): number[] {
  const min = question.minValue ?? 0;
  const max = question.maxValue ?? (question.type === 'LIKERT' ? 5 : 10);
  if (max < min) return [min];
  const steps = Math.min(Math.round(max - min), 50);
  if (steps <= 0) return [min];
  return Array.from({ length: steps + 1 }, (_, index) =>
    Math.round(min + ((max - min) * index) / steps),
  );
}
