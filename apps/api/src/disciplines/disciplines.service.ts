import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CurrentUser,
  type DisciplineDto,
  formatFullName,
  type PersonRef,
  RoleCode,
  type TeacherAssignmentDto,
} from '@iot/shared';
import { AccessScopeService, activeAssignmentWhere } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DisciplineInputDto, TeacherAssignmentInputDto } from './disciplines.dto.js';

const personSelect = { id: true, lastName: true, firstName: true, middleName: true } as const;

const assignmentInclude = {
  teacher: { select: personSelect },
  group: { select: { id: true, name: true } },
  discipline: { select: { id: true, name: true } },
} satisfies Prisma.TeacherAssignmentInclude;

type AssignmentRow = Prisma.TeacherAssignmentGetPayload<{ include: typeof assignmentInclude }>;

function toPerson(user: {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
}): PersonRef {
  return { id: user.id, fullName: formatFullName(user) };
}

function toAssignmentDto(row: AssignmentRow): TeacherAssignmentDto {
  return {
    id: row.id,
    teacher: toPerson(row.teacher),
    group: row.group,
    discipline: row.discipline,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}

function uniqueBy<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/**
 * Дисциплины и закрепление преподавателей за группами и дисциплинами. Закрепления —
 * основа области доступа преподавателя (FR-002); снятие закрепления сохраняет историю.
 */
@Injectable()
export class DisciplinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
  ) {}

  async list(user: CurrentUser, includeArchived: boolean): Promise<DisciplineDto[]> {
    const scope = await this.scopes.forUser(user);
    const assigned = scope.kind === 'assigned';
    const rows = await this.prisma.discipline.findMany({
      where: {
        id: assigned ? { in: scope.disciplineIds } : undefined,
        archivedAt: includeArchived ? undefined : null,
      },
      include: {
        teacherAssignments: {
          where: { ...activeAssignmentWhere(), teacherId: assigned ? user.id : undefined },
          include: assignmentInclude,
          orderBy: { group: { name: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toDto(row, row.teacherAssignments));
  }

  async create(dto: DisciplineInputDto, actorId: string): Promise<DisciplineDto> {
    await this.assertUnique(dto);
    return this.prisma.$transaction(async (tx) => {
      const discipline = await tx.discipline.create({
        data: {
          name: dto.name,
          code: dto.code ?? null,
          description: dto.description ?? null,
          createdById: actorId,
        },
      });
      await this.audit.log(
        {
          action: 'discipline.created',
          entityType: 'discipline',
          entityId: discipline.id,
          after: { name: discipline.name, code: discipline.code },
        },
        tx,
      );
      return this.toDto(discipline, []);
    });
  }

  async update(id: string, dto: DisciplineInputDto): Promise<DisciplineDto> {
    const existing = await this.findOrThrow(id);
    await this.assertUnique(dto, id);
    return this.prisma.$transaction(async (tx) => {
      const discipline = await tx.discipline.update({
        where: { id },
        data: { name: dto.name, code: dto.code ?? null, description: dto.description ?? null },
      });
      await this.audit.log(
        {
          action: 'discipline.updated',
          entityType: 'discipline',
          entityId: id,
          before: { name: existing.name, code: existing.code, description: existing.description },
          after: {
            name: discipline.name,
            code: discipline.code,
            description: discipline.description,
          },
        },
        tx,
      );
      return this.toDto(discipline, existing.teacherAssignments);
    });
  }

  /** Архивировать можно дисциплину без действующих закреплений. */
  async archive(id: string, reason: string): Promise<DisciplineDto> {
    const existing = await this.findOrThrow(id);
    if (existing.archivedAt) throw new ConflictException('Дисциплина уже в архиве');
    if (existing.teacherAssignments.length > 0) {
      throw new ConflictException('Сначала снимите действующие закрепления преподавателей');
    }
    return this.setArchived(id, new Date(), reason);
  }

  async restore(id: string): Promise<DisciplineDto> {
    const existing = await this.findOrThrow(id);
    if (!existing.archivedAt) throw new ConflictException('Дисциплина не в архиве');
    return this.setArchived(id, null, null);
  }

  // ── Закрепления преподавателей ──

  async listAssignments(includeEnded: boolean): Promise<TeacherAssignmentDto[]> {
    const rows = await this.prisma.teacherAssignment.findMany({
      where: includeEnded ? undefined : activeAssignmentWhere(),
      include: assignmentInclude,
      orderBy: [{ teacher: { lastName: 'asc' } }, { group: { name: 'asc' } }, { startsAt: 'desc' }],
    });
    return rows.map(toAssignmentDto);
  }

  /** Активные учётные записи с ролью преподавателя — для выбора при закреплении. */
  async listTeachers(): Promise<PersonRef[]> {
    const rows = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: RoleCode.TEACHER } } } },
      select: personSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(toPerson);
  }

  async createAssignment(
    dto: TeacherAssignmentInputDto,
    actorId: string,
  ): Promise<TeacherAssignmentDto> {
    const [teacher, group, discipline] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: dto.teacherId,
          status: 'ACTIVE',
          roles: { some: { role: { code: RoleCode.TEACHER } } },
        },
      }),
      this.prisma.group.findUnique({ where: { id: dto.groupId } }),
      this.prisma.discipline.findUnique({ where: { id: dto.disciplineId } }),
    ]);
    if (!teacher) throw new NotFoundException('Активный преподаватель не найден');
    if (!group || group.archivedAt) throw new NotFoundException('Действующая группа не найдена');
    if (!discipline || discipline.archivedAt)
      throw new NotFoundException('Действующая дисциплина не найдена');
    const duplicate = await this.prisma.teacherAssignment.findFirst({
      where: { ...dto, ...activeAssignmentWhere() },
    });
    if (duplicate) throw new ConflictException('Такое закрепление уже действует');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.teacherAssignment.create({
        data: { ...dto, createdById: actorId },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: 'teacher_assignment.created',
          entityType: 'teacher_assignment',
          entityId: row.id,
          after: { teacherId: dto.teacherId, groupId: dto.groupId, disciplineId: dto.disciplineId },
        },
        tx,
      );
      return toAssignmentDto(row);
    });
  }

  /** Снятие закрепления: запись сохраняется с датой окончания (история доступа). */
  async endAssignment(id: string, reason: string): Promise<TeacherAssignmentDto> {
    const existing = await this.prisma.teacherAssignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Закрепление не найдено');
    const now = new Date();
    if (existing.endsAt && existing.endsAt <= now)
      throw new ConflictException('Закрепление уже снято');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.teacherAssignment.update({
        where: { id },
        data: { endsAt: now },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: 'teacher_assignment.ended',
          entityType: 'teacher_assignment',
          entityId: id,
          after: { endsAt: now.toISOString() },
          reason,
        },
        tx,
      );
      return toAssignmentDto(row);
    });
  }

  private toDto(
    discipline: {
      id: string;
      name: string;
      code: string | null;
      description: string | null;
      archivedAt: Date | null;
    },
    assignments: AssignmentRow[],
  ): DisciplineDto {
    return {
      id: discipline.id,
      name: discipline.name,
      code: discipline.code,
      description: discipline.description,
      archivedAt: discipline.archivedAt?.toISOString() ?? null,
      groups: uniqueBy(assignments.map((row) => row.group)),
      teachers: uniqueBy(assignments.map((row) => toPerson(row.teacher))),
    };
  }

  private setArchived(id: string, archivedAt: Date | null, reason: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const discipline = await tx.discipline.update({ where: { id }, data: { archivedAt } });
      await this.audit.log(
        {
          action: archivedAt ? 'discipline.archived' : 'discipline.restored',
          entityType: 'discipline',
          entityId: id,
          reason,
        },
        tx,
      );
      return this.toDto(discipline, []);
    });
  }

  private async findOrThrow(id: string) {
    const discipline = await this.prisma.discipline.findUnique({
      where: { id },
      include: {
        teacherAssignments: { where: activeAssignmentWhere(), include: assignmentInclude },
      },
    });
    if (!discipline) throw new NotFoundException('Дисциплина не найдена');
    return discipline;
  }

  private async assertUnique(dto: DisciplineInputDto, exceptId?: string): Promise<void> {
    const conditions: Prisma.DisciplineWhereInput[] = [
      { name: { equals: dto.name, mode: 'insensitive' } },
    ];
    if (dto.code) conditions.push({ code: { equals: dto.code, mode: 'insensitive' } });
    const clash = await this.prisma.discipline.findFirst({
      where: { OR: conditions, id: exceptId ? { not: exceptId } : undefined },
    });
    if (!clash) return;
    throw new ConflictException(
      clash.name.toLowerCase() === dto.name.toLowerCase()
        ? 'Дисциплина с таким названием уже существует'
        : 'Дисциплина с таким кодом уже существует',
    );
  }
}
