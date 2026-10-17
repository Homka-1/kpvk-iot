import { Injectable } from '@nestjs/common';
import { type CurrentUser, Permission } from '@iot/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Область данных пользователя (FR-002): какие группы и дисциплины ему доступны.
 * `all` — все группы (администратор справочников); `assigned` — только группы и дисциплины
 * из действующих закреплений преподавателя (teacher_assignments).
 */
export type AccessScope =
  | { kind: 'all' }
  | {
      kind: 'assigned';
      groupIds: string[];
      disciplineIds: string[];
      pairs: { groupId: string; disciplineId: string }[];
    };

/** Действующие закрепления преподавателей на момент `now`. */
export function activeAssignmentWhere(now = new Date()): Prisma.TeacherAssignmentWhereInput {
  return { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

@Injectable()
export class AccessScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(user: CurrentUser, now = new Date()): Promise<AccessScope> {
    if (user.permissions.includes(Permission.GROUPS_MANAGE)) return { kind: 'all' };
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { teacherId: user.id, ...activeAssignmentWhere(now) },
      select: { groupId: true, disciplineId: true },
    });
    return {
      kind: 'assigned',
      groupIds: [...new Set(assignments.map((item) => item.groupId))],
      disciplineIds: [...new Set(assignments.map((item) => item.disciplineId))],
      pairs: assignments,
    };
  }

  /** Условие отбора студентов, доступных в рамках области. */
  studentsWhere(scope: AccessScope): Prisma.StudentWhereInput {
    return scope.kind === 'all' ? {} : { currentGroupId: { in: scope.groupIds } };
  }
}
