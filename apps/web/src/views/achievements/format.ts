import {
  CONTROL_KIND_LABELS,
  CONTROL_KINDS,
  CONTROL_MARK_LABELS,
  CONTROL_MARKS,
  type ControlKind,
  type ControlMark,
} from '@iot/shared';
import { formatNumber } from '@/utils/format';

export const KIND_OPTIONS = CONTROL_KINDS.map((value) => ({
  value,
  label: CONTROL_KIND_LABELS[value],
}));

export const MARK_OPTIONS = CONTROL_MARKS.map((value) => ({
  value,
  label: CONTROL_MARK_LABELS[value],
}));

/** Иконка вида контроля: статус не только цветом (п. 6.1). */
export const KIND_ICONS: Record<ControlKind, string> = {
  ENTRY: 'pi pi-sign-in',
  CURRENT: 'pi pi-pencil',
  FINAL: 'pi pi-flag',
};

/** Результат студента: балл, отметка или «Нет данных» — не ноль (FR-074). */
export function resultText(result: { score: number | null; mark: ControlMark | null }): string {
  if (result.score !== null) return formatNumber(result.score);
  return result.mark ? CONTROL_MARK_LABELS[result.mark] : 'Нет данных';
}

/** Балл или «Нет данных». */
export function scoreText(value: number | null): string {
  return value === null ? 'Нет данных' : formatNumber(value);
}
