import { LESSON_SCORE_MAX, LESSON_SCORE_MIN, type LessonScore } from '@iot/shared';

/** Клетка журнала: '' — нет данных, '1'–'5' — оценка, NOT_OBSERVED — «Не наблюдалось». */
export const NOT_OBSERVED = 'NOT_OBSERVED';
export type ScoreCell = string;

export const SCORE_OPTIONS = [
  { value: '', label: '— нет данных' },
  ...Array.from({ length: LESSON_SCORE_MAX - LESSON_SCORE_MIN + 1 }, (_value, index) => {
    const score = String(LESSON_SCORE_MAX - index);
    return { value: score, label: score };
  }),
  { value: NOT_OBSERVED, label: 'Не наблюдалось' },
];

export function toCell(ratings: Record<string, LessonScore>, criterionId: string): ScoreCell {
  if (!(criterionId in ratings)) return '';
  const score = ratings[criterionId];
  return score === null || score === undefined ? NOT_OBSERVED : String(score);
}

export function toScore(cell: ScoreCell): LessonScore {
  return cell === NOT_OBSERVED ? null : Number(cell);
}

/** Текст оценки для истории: нет записи — «нет данных», а не ноль (FR-074). */
export function scoreLabel(ratings: Record<string, LessonScore>, criterionId: string): string {
  if (!(criterionId in ratings)) return '—';
  const score = ratings[criterionId];
  return score === null || score === undefined ? 'Не набл.' : String(score);
}
