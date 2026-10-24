import { formatNumber } from '@/utils/format';

/** Балл 0–100 или «Нет данных» вместо пропуска (FR-074). */
export function gradeText(value: number | null): string {
  return value === null ? 'Нет данных' : formatNumber(value);
}

/** Изменение балла между семестрами: знак, текст и иконка (не только цвет — п. 6.1). */
export function deltaView(value: number | null): { text: string; icon: string } {
  if (value === null) return { text: 'Нет данных', icon: 'pi pi-minus' };
  if (value === 0) return { text: 'Без изменений', icon: 'pi pi-equals' };
  const formatted = formatNumber(Math.abs(value));
  return value > 0
    ? { text: `+${formatted}`, icon: 'pi pi-arrow-up-right' }
    : { text: `−${formatted}`, icon: 'pi pi-arrow-down-right' };
}
