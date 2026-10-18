import { BadRequestException } from '@nestjs/common';
import { ASSIGNMENT_INACTIVE_STATUSES, STUDENT_VISIBLE_TRAJECTORY_STATUSES } from '@iot/shared';
import type { AccessScope } from '../auth/access-scope.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Область библиотеки (FR-002): преподаватель видит и изменяет материалы и задания своих
 * дисциплин, а также общие материалы без дисциплины. Библиотека общая для преподавателей
 * одной дисциплины — так материалы переиспользуются (ADR-016).
 */
export function libraryDisciplineFilter(scope: AccessScope): Prisma.StringFilter | undefined {
  return scope.kind === 'all' ? undefined : { in: scope.disciplineIds };
}

export function materialScopeWhere(scope: AccessScope): Prisma.MaterialWhereInput {
  return scope.kind === 'all'
    ? {}
    : { OR: [{ disciplineId: null }, { disciplineId: { in: scope.disciplineIds } }] };
}

export function assignmentScopeWhere(scope: AccessScope): Prisma.AssignmentWhereInput {
  return scope.kind === 'all' ? {} : { disciplineId: { in: scope.disciplineIds } };
}

/**
 * Действующие назначения (не отменённые и не отклонённые при выборе) — вне маршрута или в
 * утверждённой ИОТ. Задания черновика ИОТ ещё не назначены студенту.
 */
export function publishedAssignmentWhere(): Prisma.TrajectoryAssignmentWhereInput {
  return {
    status: { notIn: [...ASSIGNMENT_INACTIVE_STATUSES] },
    OR: [
      { trajectoryId: null },
      { trajectory: { status: { in: [...STUDENT_VISIBLE_TRAJECTORY_STATUSES] } } },
    ],
  };
}

/** Задания, которые видит студент (AT-06, AT-12): только свои действующие назначения. */
export function cabinetAssignmentWhere(userId: string): Prisma.TrajectoryAssignmentWhereInput {
  return { ...publishedAssignmentWhere(), student: { userId, archivedAt: null } };
}

/** Дисциплина для новой записи библиотеки: существует, не в архиве и доступна пользователю. */
export async function assertLibraryDiscipline(
  prisma: PrismaService,
  scope: AccessScope,
  disciplineId: string,
): Promise<void> {
  const allowed = scope.kind === 'all' || scope.disciplineIds.includes(disciplineId);
  const discipline = allowed
    ? await prisma.discipline.findFirst({
        where: { id: disciplineId, archivedAt: null },
        select: { id: true },
      })
    : null;
  if (!discipline) {
    throw new BadRequestException({
      message: 'Выберите одну из своих дисциплин',
      fields: { disciplineId: 'Дисциплина недоступна или в архиве' },
    });
  }
}
