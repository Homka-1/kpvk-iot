import { describe, expect, it } from 'vitest';
import { AssignmentStatus, StageStatus, SubmissionFormat } from './enums.js';
import {
  assignmentProgress,
  checkAssessment,
  isAssignmentOverdue,
  nextStageStatus,
  submissionIssues,
} from './submissions.js';

const now = new Date('2026-10-18T12:00:00Z');
const past = '2026-10-17T20:59:59Z';
const future = '2026-10-20T20:59:59Z';

describe('Сдача и проверка заданий', () => {
  it('FR-053: просрочка — срок прошёл, а ответ не отправлен', () => {
    expect(isAssignmentOverdue({ status: AssignmentStatus.ASSIGNED, dueAt: past }, now)).toBe(true);
    expect(isAssignmentOverdue({ status: AssignmentStatus.RETURNED, dueAt: past }, now)).toBe(true);
    expect(isAssignmentOverdue({ status: AssignmentStatus.SUBMITTED, dueAt: past }, now)).toBe(
      false,
    );
    expect(isAssignmentOverdue({ status: AssignmentStatus.COMPLETED, dueAt: past }, now)).toBe(
      false,
    );
    expect(isAssignmentOverdue({ status: AssignmentStatus.ASSIGNED, dueAt: future }, now)).toBe(
      false,
    );
    expect(isAssignmentOverdue({ status: AssignmentStatus.ASSIGNED, dueAt: null }, now)).toBe(
      false,
    );
  });

  it('FR-050: ответ текстом, файлом или ссылкой — только в разрешённых форматах', () => {
    const formats = [SubmissionFormat.TEXT, SubmissionFormat.FILE];
    expect(submissionIssues(formats, { text: 'Решение' })).toEqual([]);
    expect(submissionIssues(formats, { fileIds: ['f1'] })).toEqual([]);
    expect(submissionIssues(formats, { url: 'https://example.org' })).toEqual([
      { field: 'url', message: 'Это задание не принимает ответ ссылкой' },
    ]);
    expect(submissionIssues(formats, { text: '  ' })).toEqual([
      { field: 'text', message: 'Добавьте ответ: текст, файл или ссылку' },
    ]);
    expect(submissionIssues([SubmissionFormat.LINK], {})[0]!.field).toBe('url');
    expect(submissionIssues([], { url: 'https://example.org' })).toEqual([]);
  });

  it('FR-052: принятое задание оценивается по каждому критерию, итог — сумма', () => {
    const criteria = [
      { id: 'a', maxScore: 5 },
      { id: 'b', maxScore: 2.5 },
    ];
    const ok = checkAssessment(criteria, {
      decision: 'ACCEPTED',
      criterionScores: [
        { criterionId: 'a', score: 4 },
        { criterionId: 'b', score: 2.5 },
      ],
    });
    expect(ok).toEqual({ issues: [], score: 6.5, maxScore: 7.5 });

    const missing = checkAssessment(criteria, {
      decision: 'ACCEPTED',
      criterionScores: [{ criterionId: 'a', score: 6 }],
    });
    expect(missing.score).toBeNull();
    expect(missing.issues).toEqual([
      { field: 'criterionScores.0', message: 'Балл от 0 до 5' },
      { field: 'criterionScores.1', message: 'Поставьте балл по критерию' },
    ]);

    const foreign = checkAssessment(criteria, {
      decision: 'ACCEPTED',
      criterionScores: [
        { criterionId: 'a', score: 1 },
        { criterionId: 'b', score: 1 },
        { criterionId: 'x', score: 1 },
      ],
    });
    expect(foreign.issues[0]!.field).toBe('criterionScores');
  });

  it('FR-052: без критериев — без балла; FR-051: возврат требует комментария', () => {
    expect(checkAssessment([], { decision: 'ACCEPTED' })).toEqual({
      issues: [],
      score: null,
      maxScore: null,
    });
    expect(checkAssessment([{ id: 'a', maxScore: 5 }], { decision: 'RETURNED' }).issues).toEqual([
      { field: 'comment', message: 'Напишите студенту, что доработать' },
    ]);
    expect(
      checkAssessment([{ id: 'a', maxScore: 5 }], {
        decision: 'RETURNED',
        comment: 'Добавьте вывод',
      }).issues,
    ).toEqual([]);
  });

  it('FR-055: статистика этапа; без заданий — «Нет данных», а не 0 %', () => {
    const progress = assignmentProgress(
      [
        { status: AssignmentStatus.COMPLETED, dueAt: past },
        { status: AssignmentStatus.SUBMITTED, dueAt: past },
        { status: AssignmentStatus.RETURNED, dueAt: past },
        { status: AssignmentStatus.ASSIGNED, dueAt: future },
        { status: AssignmentStatus.CANCELLED, dueAt: past },
        { status: AssignmentStatus.DECLINED, dueAt: null },
      ],
      now,
    );
    expect(progress).toEqual({
      total: 4,
      completed: 1,
      submitted: 1,
      returned: 1,
      inProgress: 0,
      notStarted: 1,
      overdue: 1,
      percent: 25,
    });
    expect(assignmentProgress([], now).percent).toBeNull();
  });

  it('FR-042: этап завершается, когда выполнены все его задания', () => {
    const { ASSIGNED, SUBMITTED, COMPLETED, CANCELLED } = AssignmentStatus;
    expect(nextStageStatus(StageStatus.NOT_STARTED, [ASSIGNED, ASSIGNED])).toBe(
      StageStatus.NOT_STARTED,
    );
    expect(nextStageStatus(StageStatus.NOT_STARTED, [ASSIGNED, SUBMITTED])).toBe(
      StageStatus.IN_PROGRESS,
    );
    expect(nextStageStatus(StageStatus.IN_PROGRESS, [COMPLETED, CANCELLED])).toBe(
      StageStatus.COMPLETED,
    );
    expect(nextStageStatus(StageStatus.IN_PROGRESS, [])).toBe(StageStatus.IN_PROGRESS);
    expect(nextStageStatus(StageStatus.COMPLETED, [ASSIGNED])).toBe(StageStatus.COMPLETED);
  });

  it('FR-042: этап без заданий завершается, когда пройдены все контрольные точки', () => {
    expect(nextStageStatus(StageStatus.IN_PROGRESS, [], ['PASSED', 'PASSED'])).toBe(
      StageStatus.COMPLETED,
    );
    expect(
      nextStageStatus(StageStatus.IN_PROGRESS, [AssignmentStatus.CANCELLED], ['PASSED', 'PENDING']),
    ).toBe(StageStatus.IN_PROGRESS);
    // С заданиями этап завершают задания, а не точки.
    expect(nextStageStatus(StageStatus.IN_PROGRESS, [AssignmentStatus.ASSIGNED], ['PASSED'])).toBe(
      StageStatus.IN_PROGRESS,
    );
  });
});
