import { describe, expect, it } from 'vitest';
import {
  averageOf,
  averagePercent,
  isCheckpointMissed,
  MONITORING_MAX_WEEKS,
  weekBuckets,
  weekStart,
} from './monitoring.js';

describe('мониторинг', () => {
  it('FR-058: контрольная точка пропущена, если дата прошла, а точка не пройдена', () => {
    const today = '2026-10-20';
    expect(isCheckpointMissed({ status: 'PENDING', dueDate: '2026-10-19' }, today)).toBe(true);
    expect(isCheckpointMissed({ status: 'PENDING', dueDate: '2026-10-20' }, today)).toBe(false);
    expect(isCheckpointMissed({ status: 'PENDING', dueDate: null }, today)).toBe(false);
    expect(isCheckpointMissed({ status: 'PASSED', dueDate: '2026-10-01' }, today)).toBe(false);
    expect(isCheckpointMissed({ status: 'MISSED', dueDate: '2026-12-01' }, today)).toBe(true);
  });

  it('FR-059: недели графика начинаются с понедельника', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // воскресенье
    expect(weekStart('2026-10-19')).toBe('2026-10-19'); // понедельник
    expect(weekBuckets('2026-10-01', '2026-10-20')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
    expect(weekBuckets('2020-01-01', '2026-10-20')).toHaveLength(MONITORING_MAX_WEEKS);
    expect(weekBuckets('2026-10-20', '2026-10-01')).toEqual([]);
  });

  it('FR-005: без оценок средний результат — «нет данных», а не 0', () => {
    expect(averagePercent([])).toBeNull();
    expect(
      averagePercent([
        { score: 5, maxScore: 10 },
        { score: 7.5, maxScore: 7.5 },
      ]),
    ).toBe(75);
    expect(averageOf([null, null])).toBeNull();
    expect(averageOf([50, null, 100])).toBe(75);
  });
});
