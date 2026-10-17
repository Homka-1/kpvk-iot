import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CurrentUser, GroupDto } from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GroupInputDto } from './groups.dto.js';

const withCount = {
  _count: { select: { currentStudents: { where: { archivedAt: null } } } },
} satisfies Prisma.GroupInclude;

type GroupRow = Prisma.GroupGetPayload<{ include: typeof withCount }>;

function toDto(group: GroupRow): GroupDto {
  return {
    id: group.id,
    name: group.name,
    course: group.course,
    specialty: group.specialty,
    archivedAt: group.archivedAt?.toISOString() ?? null,
    studentCount: group._count.currentStudents,
  };
}

function snapshot(group: { name: string; course: number; specialty: string }) {
  return { name: group.name, course: group.course, specialty: group.specialty };
}

/** Учебные группы (п. 2.1 ТЗ). Список ограничен областью доступа пользователя (FR-002). */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
  ) {}

  async list(user: CurrentUser, includeArchived: boolean): Promise<GroupDto[]> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.group.findMany({
      where: {
        id: scope.kind === 'all' ? undefined : { in: scope.groupIds },
        archivedAt: includeArchived ? undefined : null,
      },
      include: withCount,
      orderBy: [{ course: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(dto: GroupInputDto, actorId: string): Promise<GroupDto> {
    await this.assertNameFree(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: { ...dto, createdById: actorId },
        include: withCount,
      });
      await this.audit.log(
        {
          action: 'group.created',
          entityType: 'group',
          entityId: group.id,
          after: snapshot(group),
        },
        tx,
      );
      return toDto(group);
    });
  }

  async update(id: string, dto: GroupInputDto): Promise<GroupDto> {
    const existing = await this.findOrThrow(id);
    if (dto.name !== existing.name) await this.assertNameFree(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.update({ where: { id }, data: dto, include: withCount });
      await this.audit.log(
        {
          action: 'group.updated',
          entityType: 'group',
          entityId: id,
          before: snapshot(existing),
          after: snapshot(group),
        },
        tx,
      );
      return toDto(group);
    });
  }

  /** Архивировать можно только группу без действующих студентов: их сначала переводят. */
  async archive(id: string, reason: string): Promise<GroupDto> {
    const existing = await this.findOrThrow(id);
    if (existing.archivedAt) throw new ConflictException('Группа уже в архиве');
    if (existing._count.currentStudents > 0) {
      throw new ConflictException(
        'В группе есть студенты. Переведите их в другую группу или архивируйте, затем повторите',
      );
    }
    return this.setArchived(id, new Date(), reason);
  }

  async restore(id: string): Promise<GroupDto> {
    const existing = await this.findOrThrow(id);
    if (!existing.archivedAt) throw new ConflictException('Группа не в архиве');
    return this.setArchived(id, null, null);
  }

  private setArchived(id: string, archivedAt: Date | null, reason: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.update({
        where: { id },
        data: { archivedAt },
        include: withCount,
      });
      await this.audit.log(
        {
          action: archivedAt ? 'group.archived' : 'group.restored',
          entityType: 'group',
          entityId: id,
          reason,
        },
        tx,
      );
      return toDto(group);
    });
  }

  private async findOrThrow(id: string): Promise<GroupRow> {
    const group = await this.prisma.group.findUnique({ where: { id }, include: withCount });
    if (!group) throw new NotFoundException('Группа не найдена');
    return group;
  }

  private async assertNameFree(name: string): Promise<void> {
    const clash = await this.prisma.group.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (clash) throw new ConflictException('Группа с таким названием уже существует');
  }
}
