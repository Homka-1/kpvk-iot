import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  type FeedbackStudentRef,
  type FeedbackTrajectoryRef,
  formatFullName,
  type PersonRef,
  STUDENT_VISIBLE_TRAJECTORY_STATUSES,
} from '@iot/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Общие выборки и привязки записей обратной связи, консультаций и рефлексии. */

export const studentSelect = {
  id: true,
  userId: true,
  lastName: true,
  firstName: true,
  middleName: true,
  currentGroup: { select: { name: true } },
} satisfies Prisma.StudentSelect;

export const trajectorySelect = {
  id: true,
  discipline: { select: { name: true } },
} satisfies Prisma.TrajectorySelect;

export const stageSelect = {
  id: true,
  title: true,
  sortOrder: true,
} satisfies Prisma.TrajectoryStageSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;
type TrajectoryRow = Prisma.TrajectoryGetPayload<{ select: typeof trajectorySelect }>;

export const toStudentRef = (row: StudentRow): FeedbackStudentRef => ({
  id: row.id,
  fullName: formatFullName(row),
  groupName: row.currentGroup?.name ?? null,
});

export const toTrajectoryRef = (row: TrajectoryRow | null): FeedbackTrajectoryRef | null =>
  row ? { id: row.id, disciplineName: row.discipline.name } : null;

export const unknownPerson = (id: string): PersonRef => ({ id, fullName: 'Нет данных' });

export const isoDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

/** Дата и время для текста уведомления: дд.мм.гггг чч:мм по местному времени сервера. */
export function formatDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()} ${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}`;
}

export interface BindingInput {
  trajectoryId?: string | null;
  stageId?: string | null;
  trajectoryAssignmentId?: string | null;
}

export interface Binding {
  trajectoryId: string | null;
  stageId: string | null;
  trajectoryAssignmentId: string | null;
}

/**
 * Проверка привязки к заданию, этапу или ИОТ студента (FR-064). Привязка уточняется сверху
 * вниз: задание задаёт свои этап и ИОТ, этап — свою ИОТ. Привязать можно только утверждённый
 * маршрут, который видит студент: черновик ещё может быть переписан целиком.
 */
export async function resolveBinding(
  prisma: PrismaService,
  studentId: string,
  input: BindingInput,
): Promise<Binding> {
  const visible = { in: [...STUDENT_VISIBLE_TRAJECTORY_STATUSES] };
  const fail = (field: string, message: string): never => {
    throw new BadRequestException({ message, fields: { [field]: message } });
  };
  if (input.trajectoryAssignmentId) {
    const item = await prisma.trajectoryAssignment.findFirst({
      where: {
        id: input.trajectoryAssignmentId,
        studentId,
        OR: [{ trajectoryId: null }, { trajectory: { status: visible } }],
      },
      select: { id: true, trajectoryId: true, stageId: true },
    });
    if (!item) return fail('trajectoryAssignmentId', 'Задание не относится к студенту');
    return {
      trajectoryId: item.trajectoryId,
      stageId: item.stageId,
      trajectoryAssignmentId: item.id,
    };
  }
  if (input.stageId) {
    const stage = await prisma.trajectoryStage.findFirst({
      where: {
        id: input.stageId,
        archivedAt: null,
        trajectory: { studentId, status: visible },
      },
      select: { id: true, trajectoryId: true },
    });
    if (!stage || (input.trajectoryId && input.trajectoryId !== stage.trajectoryId)) {
      return fail('stageId', 'Этап не относится к маршруту студента');
    }
    return { trajectoryId: stage.trajectoryId, stageId: stage.id, trajectoryAssignmentId: null };
  }
  if (input.trajectoryId) {
    const trajectory = await prisma.trajectory.findFirst({
      where: { id: input.trajectoryId, studentId, status: visible },
      select: { id: true },
    });
    if (!trajectory)
      return fail('trajectoryId', 'ИОТ не относится к студенту или ещё не утверждена');
    return { trajectoryId: trajectory.id, stageId: null, trajectoryAssignmentId: null };
  }
  return { trajectoryId: null, stageId: null, trajectoryAssignmentId: null };
}

/** Студент в области пользователя (FR-002); студент в архиве — только для чтения. */
export async function findStudentInScope(
  prisma: PrismaService,
  where: Prisma.StudentWhereInput,
  studentId: string,
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, ...where },
    select: { ...studentSelect, archivedAt: true },
  });
  if (!student) throw new NotFoundException('Студент не найден');
  return student;
}
