import {
  EFFECT_MAGNITUDE_LABELS,
  formatPValue,
  RESEARCH_GROUP_SHORT,
  type ResearchAnalysisVariableDto,
  type ResearchCheckStatus,
  significant,
  type StatisticalTestResult,
} from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';
import { formatNumber } from '@/utils/format';

/** Число или «—» (не рассчитано, нет данных). */
export const numText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : formatNumber(value);

/** p-значение: «p = 0,012», «p < 0,001». */
export const pText = (p: number | null): string => {
  const text = formatPValue(p);
  return text.startsWith('<') ? `p ${text}` : `p = ${text}`;
};

/** Эффект: «r = 0,62 (большой)». */
export const effectText = (result: StatisticalTestResult, symbol = 'r'): string =>
  result.effectSize === null
    ? '—'
    : `${symbol} = ${formatNumber(Math.round(result.effectSize * 100) / 100)} (${EFFECT_MAGNITUDE_LABELS[result.effectMagnitude!]})`;

export const CHECK_TONES: Record<ResearchCheckStatus, StatusTone> = {
  ok: 'success',
  warning: 'warning',
  error: 'danger',
};

/** Значимо при p < 0,05 — текстом и иконкой, не только цветом (п. 6.1). */
export function significanceBadge(result: StatisticalTestResult | null): {
  label: string;
  tone: StatusTone;
  icon?: string;
} {
  if (!result || result.p === null)
    return { label: 'Не рассчитан', tone: 'neutral', icon: 'pi pi-minus' };
  return significant(result)
    ? { label: 'Значимо', tone: 'success' }
    : { label: 'Не значимо', tone: 'neutral', icon: 'pi pi-circle' };
}

/**
 * Краткий вывод по показателю обычным языком: изменения внутри ЭГ и КГ (Вилкоксон), различие
 * изменений между группами и исходная равноценность групп (Манн — Уитни). Только то, что
 * рассчитано; без утверждений сверх результата критерия.
 */
export function variableConclusion(variable: ResearchAnalysisVariableDto): string[] {
  if (!variable.paired) {
    return ['Сравнение «до — после» не выполняется: см. проверки данных.'];
  }
  const lines = variable.groups.map((group) => {
    const name = RESEARCH_GROUP_SHORT[group.group];
    const test = group.wilcoxon!;
    if (test.p === null) return `${name}: критерий Вилкоксона не рассчитан.`;
    if (!significant(test))
      return `${name}: статистически значимых изменений нет (${pText(test.p)}).`;
    const direction = (group.change?.median ?? 0) >= 0 ? 'рост' : 'снижение';
    return `${name}: значимый ${direction} (${pText(test.p)}, ${effectText(test)}).`;
  });
  const before = variable.between.before;
  if (before && significant(before)) {
    lines.push(`Группы различались уже «до» (${pText(before.p)}): учитывайте это при выводах.`);
  }
  const change = variable.between.change;
  if (change && change.p !== null) {
    lines.push(
      significant(change)
        ? `Изменение в ЭГ и КГ различается значимо (${pText(change.p)}, ${effectText(change)}).`
        : `Различие изменений ЭГ и КГ не значимо (${pText(change.p)}).`,
    );
  }
  return lines;
}
