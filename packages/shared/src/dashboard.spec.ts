import { describe, expect, it } from 'vitest';
import {
  type CabinetDiagnosticDto,
  type CabinetTrajectoryDto,
  dashboardPeriodRange,
  type StudentAssignmentDto,
  studentAchievements,
  studentGoals,
  studentTeachers,
  studentTodos,
} from './index.js';

const teacher = { id: 't1', fullName: 'Иванова Анна' };

const stage = (
  id: string,
  sortOrder: number,
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED',
  extra: Partial<CabinetTrajectoryDto['stages'][number]> = {},
): CabinetTrajectoryDto['stages'][number] => ({
  id,
  sortOrder,
  title: `Этап ${sortOrder}`,
  goal: `Цель ${sortOrder}`,
  description: null,
  plannedResults: null,
  recommendedDifficulty: null,
  startDate: null,
  endDate: null,
  status,
  checkpoints: [],
  materials: [],
  assignments: [],
  ...extra,
});

const trajectory = (
  id: string,
  status: CabinetTrajectoryDto['status'],
  stages: CabinetTrajectoryDto['stages'],
  currentStageId: string | null = null,
): CabinetTrajectoryDto => ({
  id,
  status,
  version: 1,
  discipline: { id: `d-${id}`, name: `Дисциплина ${id}` },
  teacher,
  goals: 'Общая цель',
  plannedResults: null,
  supportMethods: null,
  startDate: null,
  plannedEndDate: null,
  currentStageId,
  approvedAt: null,
  completedAt: null,
  finalAssessment: null,
  stages,
  proposals: [],
});

const assignment = (
  id: string,
  status: StudentAssignmentDto['status'],
  dueAt: string | null,
): StudentAssignmentDto => ({
  id,
  status,
  dueAt,
  assignedAt: '2026-10-01T00:00:00Z',
  assignment: {
    id: `a-${id}`,
    title: `Задание ${id}`,
    typeName: 'Эссе',
    difficulty: 'BASIC',
    topic: null,
  },
  discipline: { id: 'd1', name: 'Математика' },
  trajectory: null,
  choiceGroup: null,
  assignedBy: null,
  result: null,
});

const diagnostic = (
  id: string,
  status: CabinetDiagnosticDto['status'],
  endsAt: string | null,
): CabinetDiagnosticDto => ({
  id,
  title: `Методика ${id}`,
  isDemo: true,
  status,
  startsAt: null,
  endsAt,
  completedAt: status === 'COMPLETED' ? '2026-10-10T10:00:00Z' : null,
  results: [],
});

describe('FR-004: период наблюдения главной панели', () => {
  it('учебный год начинается 1 сентября', () => {
    expect(dashboardPeriodRange('ACADEMIC_YEAR', '2026-10-19')).toEqual({
      from: '2026-09-01',
      to: null,
    });
    expect(dashboardPeriodRange('ACADEMIC_YEAR', '2027-03-05')).toEqual({
      from: '2026-09-01',
      to: null,
    });
  });

  it('последние недели и месяцы считаются от сегодняшнего дня, «всё время» — без границ', () => {
    expect(dashboardPeriodRange('WEEKS_4', '2026-10-19').from).toBe('2026-09-22');
    expect(dashboardPeriodRange('MONTHS_3', '2026-10-19').from).toBe('2026-07-20');
    expect(dashboardPeriodRange('WEEKS_4', '2026-03-03').from).toBe('2026-02-04');
    expect(dashboardPeriodRange('ALL', '2026-10-19')).toEqual({ from: null, to: null });
  });
});

describe('п. 6.5: главная студента', () => {
  it('текущая цель — отмеченный текущим этап, иначе первый незавершённый; завершённые маршруты не цели', () => {
    const goals = studentGoals([
      trajectory('1', 'ACTIVE', [
        stage('s1', 1, 'COMPLETED'),
        stage('s2', 2, 'IN_PROGRESS', {
          assignments: [
            {
              id: 'x',
              assignment: {
                id: 'a',
                title: 'А',
                typeName: 'Т',
                difficulty: 'BASIC',
                archived: false,
              },
              dueAt: null,
              status: 'COMPLETED',
            },
            {
              id: 'y',
              assignment: {
                id: 'b',
                title: 'Б',
                typeName: 'Т',
                difficulty: 'BASIC',
                archived: false,
              },
              dueAt: null,
              status: 'ASSIGNED',
            },
          ],
        }),
      ]),
      trajectory(
        '2',
        'NEEDS_CORRECTION',
        [stage('s3', 1, 'IN_PROGRESS'), stage('s4', 2, 'NOT_STARTED')],
        's4',
      ),
      trajectory('3', 'COMPLETED', [stage('s5', 1, 'COMPLETED')]),
    ]);
    expect(goals.map((goal) => [goal.trajectoryId, goal.stage?.position, goal.goal])).toEqual([
      ['1', 2, 'Цель 2'],
      ['2', 2, 'Цель 2'],
    ]);
    expect(goals[0]!.progress.percent).toBe(50);
    // У этапа без заданий процента нет («Нет данных», не 0 %).
    expect(goals[1]!.progress.percent).toBeNull();
  });

  it('что выполнить сейчас: текущие задания, выбор и доступная диагностика по сроку', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    const todos = studentTodos(
      {
        assignments: [
          assignment('late', 'RETURNED', '2026-10-25T00:00:00Z'),
          assignment('soon', 'ASSIGNED', '2026-10-20T00:00:00Z'),
          assignment('free', 'IN_PROGRESS', null),
          assignment('done', 'COMPLETED', '2026-10-01T00:00:00Z'),
          assignment('wait', 'SUBMITTED', '2026-10-21T00:00:00Z'),
        ],
        choices: [
          {
            id: 'c',
            title: 'Выбор',
            options: [assignment('o', 'OFFERED', '2026-10-22T00:00:00Z')],
          },
        ],
        diagnostics: [
          diagnostic('open', 'ASSIGNED', '2026-10-23T00:00:00Z'),
          diagnostic('expired', 'ASSIGNED', '2026-10-18T00:00:00Z'),
          diagnostic('passed', 'COMPLETED', null),
        ],
      },
      now,
    );
    expect(todos.map((item) => item.id)).toEqual(['soon', 'c', 'open', 'late', 'free']);
  });

  it('достижения и к кому обращаться за помощью', () => {
    const trajectories = [
      trajectory('1', 'ACTIVE', [
        stage('s1', 1, 'COMPLETED', {
          checkpoints: [
            { id: 'k1', title: 'Тест', description: null, dueDate: null, status: 'PASSED' },
            { id: 'k2', title: 'Зачёт', description: null, dueDate: null, status: 'MISSED' },
          ],
        }),
        stage('s2', 2, 'IN_PROGRESS'),
      ]),
      trajectory('2', 'COMPLETED', [stage('s3', 1, 'COMPLETED')]),
    ];
    const achievements = studentAchievements({
      trajectories,
      assignments: [assignment('a', 'COMPLETED', null), assignment('b', 'ASSIGNED', null)],
      diagnostics: [diagnostic('d', 'COMPLETED', null), diagnostic('e', 'ASSIGNED', null)],
    });
    expect(achievements.completedTrajectories.map((item) => item.id)).toEqual(['2']);
    expect(achievements.completedStages.map((item) => item.id)).toEqual(['s1', 's3']);
    expect(achievements.passedCheckpoints.map((item) => item.id)).toEqual(['k1']);
    expect(achievements.completedAssignments.map((item) => item.id)).toEqual(['a']);
    expect(achievements.completedDiagnostics.map((item) => item.id)).toEqual(['d']);
    // Помощь — преподаватель действующего маршрута, без повторов.
    expect(studentTeachers([...trajectories, trajectory('3', 'ACTIVE', [])])).toEqual([teacher]);
  });
});
