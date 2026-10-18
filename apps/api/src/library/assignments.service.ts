import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AssignmentTypeDto,
  type CurrentUser,
  type LibraryAssignmentDto,
  SYSTEM_ASSIGNMENT_TYPES,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService, toFileDto } from './files.service.js';
import type {
  AssignmentTypeInputDto,
  LibraryAssignmentInputDto,
  LibraryAssignmentListQueryDto,
} from './library.dto.js';
import { assertLibraryDiscipline, assignmentScopeWhere } from './library-scope.js';
import { loadPeople, textSearch } from './materials.service.js';

const assignmentInclude = {
  discipline: { select: { id: true, name: true } },
  type: true,
  criteria: { orderBy: { sortOrder: 'asc' } },
  attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.AssignmentInclude;

type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

const SYSTEM_ORDER = new Map<string, number>(
  SYSTEM_ASSIGNMENT_TYPES.map((type, index) => [type.code, index]),
);

function toTypeDto(row: {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}): AssignmentTypeDto {
  return { id: row.id, code: row.code, name: row.name, isSystem: row.isSystem };
}

function auditSnapshot(row: AssignmentRow) {
  return {
    title: row.title,
    disciplineId: row.disciplineId,
    topic: row.topic,
    difficulty: row.difficulty,
    typeId: row.typeId,
    submissionFormats: row.submissionFormats,
    criteria: row.criteria.map((criterion) => ({
      title: criterion.title,
      maxScore: Number(criterion.maxScore),
    })),
    attachments: row.attachments.map((attachment) => attachment.fileId ?? attachment.url),
  };
}

/**
 * Библиотека заданий (FR-046, FR-047, FR-049): карточки п. 4.7 без полей конкретного назначения,
 * типы заданий (стандартные и свои), критерии оценивания, файлы и ссылки. Назначение студентам —
 * этап 12. Мотивационный профиль уровень сложности не ограничивает (FR-033).
 */
@Injectable()
export class LibraryAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly files: FilesService,
  ) {}

  async listTypes(): Promise<AssignmentTypeDto[]> {
    const rows = await this.prisma.assignmentType.findMany({ orderBy: { name: 'asc' } });
    return rows
      .sort(
        (a, b) => (SYSTEM_ORDER.get(a.code) ?? Infinity) - (SYSTEM_ORDER.get(b.code) ?? Infinity),
      )
      .map(toTypeDto);
  }

  async createType(dto: AssignmentTypeInputDto): Promise<AssignmentTypeDto> {
    const duplicate = await this.prisma.assignmentType.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (duplicate) {
      throw new ConflictException({
        message: 'Такой тип задания уже есть',
        fields: { name: 'Такой тип задания уже есть' },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.assignmentType.create({
        data: { code: `custom_${randomUUID()}`, name: dto.name, isSystem: false },
      });
      await this.audit.log(
        {
          action: 'assignment_type.created',
          entityType: 'assignment_type',
          entityId: row.id,
          after: { name: row.name },
        },
        tx,
      );
      return toTypeDto(row);
    });
  }

  async list(
    user: CurrentUser,
    query: LibraryAssignmentListQueryDto,
  ): Promise<LibraryAssignmentDto[]> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.assignment.findMany({
      where: {
        AND: [assignmentScopeWhere(scope), { OR: textSearch(query.q, ['title', 'goal', 'topic']) }],
        disciplineId: query.disciplineId ?? undefined,
        topic: query.topic ? { contains: query.topic, mode: 'insensitive' } : undefined,
        difficulty: query.difficulty ?? undefined,
        typeId: query.typeId ?? undefined,
        archivedAt: query.includeArchived ? undefined : null,
      },
      include: assignmentInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return this.toDtos(rows);
  }

  async get(user: CurrentUser, id: string): Promise<LibraryAssignmentDto> {
    const [dto] = await this.toDtos([await this.findVisible(user, id)]);
    return dto!;
  }

  async create(user: CurrentUser, dto: LibraryAssignmentInputDto): Promise<LibraryAssignmentDto> {
    await this.validate(user, dto, null);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: { ...this.fields(dto), createdById: user.id, ...this.children(dto) },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: 'assignment.created',
          entityType: 'assignment',
          entityId: created.id,
          after: auditSnapshot(created),
        },
        tx,
      );
      return created;
    });
    const [result] = await this.toDtos([row]);
    return result!;
  }

  async update(
    user: CurrentUser,
    id: string,
    dto: LibraryAssignmentInputDto,
  ): Promise<LibraryAssignmentDto> {
    const existing = await this.findVisible(user, id);
    if (existing.archivedAt) {
      throw new ConflictException('Задание в архиве. Верните его из архива, чтобы изменить');
    }
    await this.validate(user, dto, existing);
    const scored = await this.prisma.assessmentCriterionScore.count({
      where: { criterion: { assignmentId: id } },
    });
    if (scored > 0 && this.criteriaChanged(existing, dto)) {
      throw new ConflictException(
        'По критериям этого задания уже выставлены оценки, изменить критерии нельзя. Создайте новое задание',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.assignmentAttachment.deleteMany({ where: { assignmentId: id } });
      if (scored === 0) await tx.assessmentCriterion.deleteMany({ where: { assignmentId: id } });
      const updated = await tx.assignment.update({
        where: { id },
        data: { ...this.fields(dto), ...this.children(dto, scored === 0) },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: 'assignment.updated',
          entityType: 'assignment',
          entityId: id,
          before: auditSnapshot(existing),
          after: auditSnapshot(updated),
        },
        tx,
      );
      return updated;
    });
    const [result] = await this.toDtos([row]);
    return result!;
  }

  async setArchived(
    user: CurrentUser,
    id: string,
    archived: boolean,
    reason?: string,
  ): Promise<LibraryAssignmentDto> {
    const existing = await this.findVisible(user, id);
    if (archived === (existing.archivedAt !== null)) {
      throw new ConflictException(archived ? 'Задание уже в архиве' : 'Задание не в архиве');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.assignment.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: archived ? 'assignment.archived' : 'assignment.restored',
          entityType: 'assignment',
          entityId: id,
          reason: reason ?? null,
        },
        tx,
      );
      return updated;
    });
    const [result] = await this.toDtos([row]);
    return result!;
  }

  private async validate(
    user: CurrentUser,
    dto: LibraryAssignmentInputDto,
    existing: AssignmentRow | null,
  ) {
    const scope = await this.scopes.forUser(user);
    if (dto.disciplineId !== existing?.disciplineId) {
      await assertLibraryDiscipline(this.prisma, scope, dto.disciplineId);
    }
    const type = await this.prisma.assignmentType.findUnique({ where: { id: dto.typeId } });
    if (!type) {
      throw new BadRequestException({
        message: 'Проверьте правильность заполнения формы',
        fields: { typeId: 'Выберите тип задания' },
      });
    }
    const attachedFiles = new Set(
      existing?.attachments.map((attachment) => attachment.fileId) ?? [],
    );
    for (const [index, attachment] of dto.attachments.entries()) {
      if (!attachment.fileId === !attachment.url) {
        throw new BadRequestException({
          message: 'Проверьте правильность заполнения формы',
          fields: { [`attachments.${index}.url`]: 'Укажите либо файл, либо ссылку' },
        });
      }
      if (attachment.fileId && !attachedFiles.has(attachment.fileId)) {
        await this.files.assertOwnUpload(attachment.fileId, user.id, `attachments.${index}.fileId`);
      }
    }
  }

  private criteriaChanged(existing: AssignmentRow, dto: LibraryAssignmentInputDto): boolean {
    const before = existing.criteria.map((criterion) => [
      criterion.title,
      criterion.description,
      Number(criterion.maxScore),
    ]);
    const after = dto.criteria.map((criterion) => [
      criterion.title,
      criterion.description ?? null,
      criterion.maxScore,
    ]);
    return JSON.stringify(before) !== JSON.stringify(after);
  }

  private fields(dto: LibraryAssignmentInputDto) {
    const maxScore = dto.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
    return {
      title: dto.title,
      disciplineId: dto.disciplineId,
      topic: dto.topic ?? null,
      goal: dto.goal ?? null,
      difficulty: dto.difficulty,
      typeId: dto.typeId,
      instruction: dto.instruction ?? null,
      submissionFormats: dto.submissionFormats,
      maxScore: dto.criteria.length > 0 ? Math.round(maxScore * 1000) / 1000 : null,
    };
  }

  private children(dto: LibraryAssignmentInputDto, withCriteria = true) {
    return {
      criteria: withCriteria
        ? {
            create: dto.criteria.map((criterion, index) => ({
              sortOrder: index,
              title: criterion.title,
              description: criterion.description ?? null,
              maxScore: criterion.maxScore,
            })),
          }
        : undefined,
      attachments: {
        create: dto.attachments.map((attachment, index) => ({
          sortOrder: index,
          title: attachment.title ?? null,
          fileId: attachment.fileId ?? null,
          url: attachment.url ?? null,
        })),
      },
    };
  }

  /** Задание в области пользователя; чужое — 404. */
  private async findVisible(user: CurrentUser, id: string): Promise<AssignmentRow> {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.assignment.findFirst({
      where: { id, ...assignmentScopeWhere(scope) },
      include: assignmentInclude,
    });
    if (!row) throw new NotFoundException('Задание не найдено');
    return row;
  }

  private async toDtos(rows: AssignmentRow[]): Promise<LibraryAssignmentDto[]> {
    const people = await loadPeople(
      this.prisma,
      rows.map((row) => row.createdById),
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      discipline: row.discipline,
      topic: row.topic,
      goal: row.goal,
      difficulty: row.difficulty,
      type: toTypeDto(row.type),
      instruction: row.instruction,
      submissionFormats: row.submissionFormats,
      maxScore: row.maxScore === null ? null : Number(row.maxScore),
      criteria: row.criteria.map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        description: criterion.description,
        maxScore: Number(criterion.maxScore),
      })),
      attachments: row.attachments.map((attachment) => ({
        id: attachment.id,
        title: attachment.title,
        file: attachment.file ? toFileDto(attachment.file) : null,
        url: attachment.url,
      })),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdBy: row.createdById ? (people.get(row.createdById) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
