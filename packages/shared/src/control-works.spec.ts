import { describe, expect, it } from 'vitest';
import {
  controlProgress,
  controlWorkLabel,
  isControlScore,
  parseControlResult,
  summarizeControlResults,
} from './control-works.js';

describe('Контрольные работы (этап 28)', () => {
  it('FR-074: балл 0–100 с точностью до 0,1', () => {
    expect([0, 100, 85.5, 72].every(isControlScore)).toBe(true);
    expect([-1, 100.1, 85.55, Number.NaN].some(isControlScore)).toBe(false);
  });

  it('разбор ячейки «Результат»: балл, отметка, пусто, ошибка', () => {
    expect(parseControlResult('85,5')).toEqual({ score: 85.5, mark: null });
    expect(parseControlResult(' 100 ')).toEqual({ score: 100, mark: null });
    expect(parseControlResult('Отсутствовал')).toEqual({ score: null, mark: 'ABSENT' });
    expect(parseControlResult('н')).toEqual({ score: null, mark: 'ABSENT' });
    expect(parseControlResult('Не выполнила работу')).toEqual({
      score: null,
      mark: 'NOT_SUBMITTED',
    });
    expect(parseControlResult('Освобождён')).toEqual({ score: null, mark: 'EXEMPT' });
    expect(parseControlResult('')).toEqual({ score: null, mark: null });
    expect(parseControlResult('101')).toBe('invalid');
    expect(parseControlResult('хорошо')).toBe('invalid');
  });

  it('FR-074: отметки и пропуски не входят в статистики и не становятся нулями', () => {
    const summary = summarizeControlResults([
      { score: 80, mark: null },
      { score: 60, mark: null },
      { score: null, mark: 'ABSENT' },
      { score: null, mark: 'EXEMPT' },
      { score: null, mark: null },
    ]);
    expect(summary.stats).toMatchObject({ n: 2, missing: 3, mean: 70, min: 60 });
    expect(summary.marks).toEqual({ ABSENT: 1, NOT_SUBMITTED: 0, EXEMPT: 1 });
    expect(summary.noData).toBe(1);
  });

  it('входной и итоговый контроль по дисциплине: средние и разность', () => {
    expect(
      controlProgress([
        { disciplineId: 'web', kind: 'ENTRY', score: 40 },
        { disciplineId: 'web', kind: 'CURRENT', score: 99 },
        { disciplineId: 'web', kind: 'FINAL', score: 70 },
        { disciplineId: 'web', kind: 'FINAL', score: 75 },
        { disciplineId: 'it', kind: 'ENTRY', score: null },
      ]),
    ).toEqual([
      { disciplineId: 'web', entry: 40, final: 72.5, delta: 32.5 },
      { disciplineId: 'it', entry: null, final: null, delta: null },
    ]);
  });

  it('подпись работы', () => {
    expect(controlWorkLabel({ kind: 'ENTRY', topic: 'Создание веб-страниц' })).toBe(
      'Входной контроль: Создание веб-страниц',
    );
  });
});
