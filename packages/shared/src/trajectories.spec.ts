import { describe, expect, it } from 'vitest';
import { TrajectoryStatus } from './enums.js';
import {
  canTransition,
  STANDARD_TRAJECTORY_STAGES,
  type StageContent,
  stageDurationDays,
  suggestTemplate,
  TRAJECTORY_TRANSITIONS,
  type TrajectoryContent,
  trajectoryIssues,
} from './trajectories.js';

const stage = (overrides: Partial<StageContent> = {}): StageContent => ({
  title: 'Адаптационный',
  goal: 'Цель',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  checkpoints: [{ title: 'КТ', dueDate: '2026-09-30' }],
  materialIds: [],
  assignments: [],
  ...overrides,
});

const complete = (overrides: Partial<TrajectoryContent> = {}): TrajectoryContent => ({
  goals: 'Освоить тему',
  startDate: '2026-09-01',
  plannedEndDate: '2026-12-25',
  stages: [
    stage(),
    stage({
      title: 'Второй',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      checkpoints: [{ title: 'КТ', dueDate: '2026-10-31' }],
    }),
  ],
  ...overrides,
});

describe('trajectories', () => {
  it('FR-039: утверждение возможно из черновика и из «На утверждении», не из архива', () => {
    expect(canTransition('DRAFT', 'ACTIVE')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'ACTIVE')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'DRAFT')).toBe(true);
    expect(canTransition('ARCHIVED', 'ACTIVE')).toBe(false);
    expect(canTransition('ACTIVE', 'DRAFT')).toBe(false);
    expect(Object.keys(TRAJECTORY_TRANSITIONS).sort()).toEqual(
      Object.values(TrajectoryStatus).sort(),
    );
  });

  it('п. 4.6: стандартный шаблон — пять этапов в порядке ТЗ', () => {
    expect(STANDARD_TRAJECTORY_STAGES.map((item) => item.title)).toEqual([
      'Адаптационный',
      'Развитие учебной самостоятельности',
      'Практико-ориентированная деятельность',
      'Проектная деятельность',
      'Профессиональное развитие',
    ]);
  });

  it('FR-035: предлагается шаблон уровня профиля, иначе стандартный', () => {
    const templates = [
      { id: 'std', motivationLevel: null, isStandard: true },
      { id: 'low', motivationLevel: 'LOW' as const, isStandard: false },
    ];
    expect(suggestTemplate(templates, 'LOW')?.id).toBe('low');
    expect(suggestTemplate(templates, 'HIGH')?.id).toBe('std');
    expect(suggestTemplate(templates, null)?.id).toBe('std');
    expect(suggestTemplate([], 'LOW')).toBeNull();
  });

  it('FR-038: полный маршрут проходит проверку перед утверждением', () => {
    expect(trajectoryIssues(complete(), 'approve')).toEqual([]);
  });

  it('FR-038: без целей, дат и этапов утвердить нельзя; черновик сохранить можно', () => {
    const empty: TrajectoryContent = { stages: [] };
    expect(trajectoryIssues(empty, 'draft')).toEqual([]);
    expect(trajectoryIssues(empty, 'approve').map((issue) => issue.path)).toEqual([
      'goals',
      'startDate',
      'plannedEndDate',
      'stages',
    ]);
  });

  it('FR-036: сроки этапов, контрольных точек и заданий проверяются в обоих режимах', () => {
    const content = complete({
      stages: [
        stage({
          endDate: '2026-08-01',
          checkpoints: [{ title: '', dueDate: '2027-01-01' }],
          assignments: [{ assignmentId: 'a', dueAt: new Date(2027, 0, 1, 23, 59).toISOString() }],
        }),
        stage({ title: 'Второй', startDate: '2026-09-15', endDate: '2026-12-31' }),
      ],
    });
    const paths = trajectoryIssues(content, 'draft').map((issue) => issue.path);
    expect(paths).toEqual([
      'stages.0.endDate',
      'stages.0.checkpoints.0.title',
      'stages.0.checkpoints.0.dueDate',
      'stages.0.assignments.0.dueAt',
      'stages.1.endDate',
    ]);
  });

  it('этапы не пересекаются: следующий начинается не раньше окончания предыдущего', () => {
    const content = complete({
      stages: [
        stage(),
        stage({ title: 'Второй', startDate: '2026-09-15', endDate: '2026-10-15', checkpoints: [] }),
      ],
    });
    expect(trajectoryIssues(content, 'draft')).toEqual([
      {
        path: 'stages.1.startDate',
        message: 'Этап 2 начинается раньше окончания предыдущего этапа',
      },
    ]);
  });

  it('длительность этапа считается включительно, без дат — null', () => {
    expect(stageDurationDays('2026-09-01', '2026-09-30')).toBe(30);
    expect(stageDurationDays('2026-09-01', null)).toBeNull();
  });
});
