import { describe, expect, it } from 'vitest';
import {
  compareAcademicPeriods,
  formatAcademicPeriod,
  gradeDelta,
  gradeMean,
  parseAcademicYear,
  parseGradeScore,
  parseSemester,
  summarizeSemester,
} from './grades.js';

describe('Оценки за семестр: разбор файла', () => {
  it('FR-006: учебный год в разных записях приводится к «гггг/гггг»', () => {
    expect(parseAcademicYear('2025/2026')).toBe('2025/2026');
    expect(parseAcademicYear('2025-2026')).toBe('2025/2026');
    expect(parseAcademicYear('2025 – 2026')).toBe('2025/2026');
    expect(parseAcademicYear('2025/26')).toBe('2025/2026');
    expect(parseAcademicYear('2025-2026 уч. г.')).toBe('2025/2026');
    expect(parseAcademicYear('2025/2027')).toBeNull();
    expect(parseAcademicYear('2025')).toBeNull();
    expect(parseAcademicYear('')).toBeNull();
  });

  it('FR-006: семестр — 1 или 2', () => {
    expect(parseSemester('1')).toBe(1);
    expect(parseSemester('II')).toBe(2);
    expect(parseSemester('2 семестр')).toBe(2);
    expect(parseSemester('1-й семестр')).toBe(1);
    expect(parseSemester('3')).toBeNull();
    expect(parseSemester('')).toBeNull();
  });

  it('FR-006: оценка 0–100, дробная через запятую или точку', () => {
    expect(parseGradeScore('85')).toBe(85);
    expect(parseGradeScore('85,5')).toBe(85.5);
    expect(parseGradeScore('0')).toBe(0);
    expect(parseGradeScore('100')).toBe(100);
    expect(parseGradeScore('101')).toBeNull();
    expect(parseGradeScore('-5')).toBeNull();
    expect(parseGradeScore('отл')).toBeNull();
    expect(parseGradeScore('')).toBeNull();
  });

  it('подпись и порядок периодов', () => {
    const first = { academicYear: '2025/2026', semester: 1 };
    const second = { academicYear: '2025/2026', semester: 2 };
    const next = { academicYear: '2026/2027', semester: 1 };
    expect(formatAcademicPeriod(second)).toBe('2025/2026, 2 семестр');
    expect([next, second, first].sort(compareAcademicPeriods)).toEqual([first, second, next]);
  });
});

describe('Оценки за семестр: средние', () => {
  it('FR-074: нет оценок — нет данных, а не ноль', () => {
    expect(gradeMean([])).toBeNull();
    expect(summarizeSemester([])).toEqual({ disciplines: [], overall: null });
    expect(gradeDelta(null, 80)).toBeNull();
    expect(gradeDelta(80, null)).toBeNull();
  });

  it('средний по дисциплине — среднее её оценок, общий — среднее средних дисциплин', () => {
    const summary = summarizeSemester([
      { disciplineId: 'math', score: 70 },
      { disciplineId: 'math', score: 80 },
      { disciplineId: 'math', score: 90 },
      { disciplineId: 'it', score: 60 },
    ]);
    expect(summary.disciplines).toEqual([
      { disciplineId: 'math', mean: 80, count: 3 },
      { disciplineId: 'it', mean: 60, count: 1 },
    ]);
    // Среднее всех оценок было бы 75; каждая дисциплина весит одинаково — 70.
    expect(summary.overall).toBe(70);
  });

  it('округление до 0,1 и разность семестров', () => {
    expect(gradeMean([85, 86, 86])).toBe(85.7);
    const summary = summarizeSemester([
      { disciplineId: 'a', score: 85 },
      { disciplineId: 'a', score: 86 },
      { disciplineId: 'a', score: 86 },
      { disciplineId: 'b', score: 70 },
    ]);
    // (85,666… + 70) / 2 = 77,833… → 77,8 (по неокруглённым средним).
    expect(summary.overall).toBe(77.8);
    expect(gradeDelta(77.8, 72.5)).toBe(5.3);
    expect(gradeDelta(70, 72.5)).toBe(-2.5);
  });
});
