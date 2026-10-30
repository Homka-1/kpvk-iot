import { describe, expect, it } from 'vitest';
import { TrajectoryStatus } from './enums.js';
import {
  canTransition,
  PROFILE_STAGE_DIFFICULTY,
  STANDARD_TRAJECTORY_STAGES,
  type StageContent,
  stageDurationDays,
  suggestTemplate,
  TRAJECTORY_TRANSITIONS,
  type TrajectoryContent,
  trajectoryDiff,
  trajectoryIssues,
  type TrajectorySnapshot,
  type TrajectoryStageDto,
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

  it('п. 4.5: рекомендуемая сложность — на каждый этап, по уровням не убывает', () => {
    const rank = { BASIC: 0, INTERMEDIATE: 1, ADVANCED: 2 } as const;
    for (const levels of Object.values(PROFILE_STAGE_DIFFICULTY)) {
      expect(levels).toHaveLength(STANDARD_TRAJECTORY_STAGES.length);
    }
    STANDARD_TRAJECTORY_STAGES.forEach((_, index) => {
      const [low, medium, high] = (['LOW', 'MEDIUM', 'HIGH'] as const).map(
        (level) => rank[PROFILE_STAGE_DIFFICULTY[level][index]!],
      );
      expect(low).toBeLessThanOrEqual(medium!);
      expect(medium).toBeLessThanOrEqual(high!);
    });
    expect(STANDARD_TRAJECTORY_STAGES.every((stage) => stage.recommendedDifficulty === null)).toBe(
      true,
    );
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

describe('сравнение версий ИОТ', () => {
  const stageDto = (id: string, sortOrder: number, title: string): TrajectoryStageDto => ({
    id,
    sortOrder,
    title,
    goal: 'Цель',
    description: null,
    plannedResults: null,
    recommendedDifficulty: null,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    status: 'NOT_STARTED',
    checkpoints: [
      { id: `${id}-c`, title: 'КТ', description: null, dueDate: '2026-09-30', status: 'PENDING' },
    ],
    materials: [],
    assignments: [
      {
        id: `${id}-a`,
        assignment: {
          id: 'lib',
          title: 'Задача',
          typeName: 'Практическая',
          difficulty: 'BASIC',
          archived: false,
        },
        dueAt: '2026-09-20T12:00:00.000Z',
        status: 'ASSIGNED',
      },
    ],
  });
  const snapshot = (stages: TrajectoryStageDto[], goals = 'Освоить тему') =>
    ({
      goals,
      plannedResults: null,
      supportMethods: null,
      startDate: '2026-09-01',
      plannedEndDate: '2026-12-25',
      stages,
    }) as TrajectorySnapshot;

  it('FR-043: одинаковые версии не отличаются', () => {
    const version = snapshot([stageDto('s1', 0, 'Первый')]);
    expect(trajectoryDiff(version, version)).toEqual([]);
  });

  it('UC-05: видны изменения целей, сроков, заданий, порядка и состава этапов', () => {
    const before = snapshot([
      stageDto('s1', 0, 'Первый'),
      stageDto('s2', 1, 'Второй'),
      stageDto('s3', 2, 'Третий'),
    ]);
    const second = stageDto('s2', 0, 'Второй');
    second.endDate = '2026-10-05';
    second.assignments = [];
    const first = stageDto('s1', 1, 'Первый');
    first.assignments[0]!.dueAt = '2026-09-25T12:00:00.000Z';
    const after = snapshot([second, first, stageDto('s4', 2, 'Новый')], 'Освоить тему глубже');

    const changes = trajectoryDiff(before, after);
    const expected = [
      [
        'Паспорт маршрута',
        'changed',
        'Образовательные цели',
        'Освоить тему',
        'Освоить тему глубже',
      ],
      ['Этапы', 'removed', 'Этап «Третий»', 'Третий', null],
      ['Этап «Второй»', 'moved', 'Место в маршруте', '№ 2', '№ 1'],
      ['Этап «Второй»', 'changed', 'Окончание этапа', '30.09.2026', '05.10.2026'],
      ['Этап «Второй»', 'removed', 'Задание «Задача»', '20.09.2026', null],
      ['Этап «Первый»', 'moved', 'Место в маршруте', '№ 1', '№ 2'],
      ['Этап «Первый»', 'changed', 'Задание «Задача»: срок', '20.09.2026', '25.09.2026'],
      ['Этапы', 'added', 'Этап «Новый»', null, 'Новый'],
    ].map(([scope, kind, subject, from, to]) => ({
      scope,
      kind,
      subject,
      before: from,
      after: to,
    }));
    expect(changes).toEqual(expected);
  });
});
