import { describe, expect, it } from 'vitest';
import { AssignmentStatus, TrajectoryStatus } from './enums.js';
import {
  ASSIGNMENT_INACTIVE_STATUSES,
  STUDENT_VISIBLE_TRAJECTORY_STATUSES,
  studentAssignmentSection,
} from './student-assignments.js';

describe('Кабинет студента: траектория и задания', () => {
  it('FR-040: студент видит только утверждённый маршрут, не черновик и не согласование', () => {
    expect(STUDENT_VISIBLE_TRAJECTORY_STATUSES).not.toContain(TrajectoryStatus.DRAFT);
    expect(STUDENT_VISIBLE_TRAJECTORY_STATUSES).not.toContain(TrajectoryStatus.PENDING_APPROVAL);
    expect(STUDENT_VISIBLE_TRAJECTORY_STATUSES).toContain(TrajectoryStatus.ACTIVE);
  });

  it('FR-054: предложенные на выбор задания — отдельный раздел «Мои задания»', () => {
    expect(studentAssignmentSection(AssignmentStatus.OFFERED)).toBe('choice');
    expect(studentAssignmentSection(AssignmentStatus.ASSIGNED)).toBe('current');
    expect(studentAssignmentSection(AssignmentStatus.RETURNED)).toBe('current');
    expect(studentAssignmentSection(AssignmentStatus.COMPLETED)).toBe('done');
  });

  it('FR-048: отменённые и невыбранные назначения не действуют', () => {
    expect(ASSIGNMENT_INACTIVE_STATUSES).toEqual([
      AssignmentStatus.DECLINED,
      AssignmentStatus.CANCELLED,
    ]);
  });
});
