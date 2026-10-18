import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CurrentUser,
  formatFullName,
  MaterialKind,
  type MaterialDto,
  type PersonRef,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService, toFileDto } from './files.service.js';
import type { MaterialInputDto, MaterialListQueryDto } from './library.dto.js';
import { assertLibraryDiscipline, materialScopeWhere } from './library-scope.js';

const materialInclude = {
  file: true,
  discipline: { select: { id: true, name: true } },
} satisfies Prisma.MaterialInclude;

type MaterialRow = Prisma.MaterialGetPayload<{ include: typeof materialInclude }>;

/** Авторы записей библиотеки по id (у таблиц библиотеки нет связи с users в схеме). */
export async function loadPeople(
  prisma: PrismaService,
  ids: (string | null)[],
): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });
  return new Map(users.map((user) => [user.id, { id: user.id, fullName: formatFullName(user) }]));
}

/** Поиск по нескольким текстовым полям без учёта регистра. */
export function textSearch<T extends string>(q: string | null | undefined, fields: T[]) {
  return q
    ? fields.map((field) => ({ [field]: { contains: q, mode: 'insensitive' as const } }))
    : undefined;
}

/** Поля вида материала: остальные очищаются, чтобы у файла не осталось «скрытой» ссылки и т. п. */
function kindFields(dto: MaterialInputDto) {
  const fields: Record<string, string> = {};
  if (dto.kind === MaterialKind.FILE && !dto.fileId) fields.fileId = 'Загрузите файл';
  if (dto.kind === MaterialKind.LINK && !dto.url) fields.url = 'Укажите ссылку';
  if (dto.kind === MaterialKind.TEXT && !dto.body) fields.body = 'Введите текст материала';
  if (Object.keys(fields).length > 0) {
    throw new BadRequestException({ message: 'Проверьте правильность заполнения формы', fields });
  }
  return {
    fileId: dto.kind === MaterialKind.FILE ? dto.fileId! : null,
    url: dto.kind === MaterialKind.LINK ? dto.url! : null,
    body: dto.kind === MaterialKind.TEXT ? dto.body! : null,
  };
}

function auditSnapshot(row: {
  title: string;
  kind: string;
  disciplineId: string | null;
  topic: string | null;
  fileId: string | null;
  url: string | null;
}) {
  return {
    title: row.title,
    kind: row.kind,
    disciplineId: row.disciplineId,
    topic: row.topic,
    fileId: row.fileId,
    url: row.url,
  };
}

/** Библиотека материалов: файлы, ссылки и тексты по дисциплинам и темам (раздел «Библиотека материалов»). */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly files: FilesService,
  ) {}

  async list(user: CurrentUser, query: MaterialListQueryDto): Promise<MaterialDto[]> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.material.findMany({
      where: {
        AND: [
          materialScopeWhere(scope),
          { OR: textSearch(query.q, ['title', 'description', 'topic']) },
        ],
        disciplineId: query.disciplineId ?? undefined,
        topic: query.topic ? { contains: query.topic, mode: 'insensitive' } : undefined,
        kind: query.kind ?? undefined,
        archivedAt: query.includeArchived ? undefined : null,
      },
      include: materialInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return this.toDtos(rows);
  }

  async get(user: CurrentUser, id: string): Promise<MaterialDto> {
    const [dto] = await this.toDtos([await this.findVisible(user, id)]);
    return dto!;
  }

  async create(user: CurrentUser, dto: MaterialInputDto): Promise<MaterialDto> {
    const scope = await this.scopes.forUser(user);
    const fields = kindFields(dto);
    if (dto.disciplineId) await assertLibraryDiscipline(this.prisma, scope, dto.disciplineId);
    if (fields.fileId) await this.files.assertOwnUpload(fields.fileId, user.id, 'fileId');
    const row = await this.prisma.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          kind: dto.kind,
          ...fields,
          disciplineId: dto.disciplineId ?? null,
          topic: dto.topic ?? null,
          createdById: user.id,
        },
        include: materialInclude,
      });
      await this.audit.log(
        {
          action: 'material.created',
          entityType: 'material',
          entityId: material.id,
          after: auditSnapshot(material),
        },
        tx,
      );
      return material;
    });
    const [result] = await this.toDtos([row]);
    return result!;
  }

  async update(user: CurrentUser, id: string, dto: MaterialInputDto): Promise<MaterialDto> {
    const existing = await this.findVisible(user, id);
    if (existing.archivedAt) {
      throw new ConflictException('Материал в архиве. Верните его из архива, чтобы изменить');
    }
    const scope = await this.scopes.forUser(user);
    const fields = kindFields(dto);
    if (dto.disciplineId && dto.disciplineId !== existing.disciplineId) {
      await assertLibraryDiscipline(this.prisma, scope, dto.disciplineId);
    }
    if (fields.fileId && fields.fileId !== existing.fileId) {
      await this.files.assertOwnUpload(fields.fileId, user.id, 'fileId');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const material = await tx.material.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description ?? null,
          kind: dto.kind,
          ...fields,
          disciplineId: dto.disciplineId ?? null,
          topic: dto.topic ?? null,
        },
        include: materialInclude,
      });
      await this.audit.log(
        {
          action: 'material.updated',
          entityType: 'material',
          entityId: id,
          before: auditSnapshot(existing),
          after: auditSnapshot(material),
        },
        tx,
      );
      return material;
    });
    const [result] = await this.toDtos([row]);
    return result!;
  }

  async setArchived(
    user: CurrentUser,
    id: string,
    archived: boolean,
    reason?: string,
  ): Promise<MaterialDto> {
    const existing = await this.findVisible(user, id);
    if (archived === (existing.archivedAt !== null)) {
      throw new ConflictException(archived ? 'Материал уже в архиве' : 'Материал не в архиве');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const material = await tx.material.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        include: materialInclude,
      });
      await this.audit.log(
        {
          action: archived ? 'material.archived' : 'material.restored',
          entityType: 'material',
          entityId: id,
          reason: reason ?? null,
        },
        tx,
      );
      return material;
    });
    const [result] = await this.toDtos([row]);
    return result!;
  }

  /** Материал в области пользователя; чужой — 404, чтобы не раскрывать его существование. */
  private async findVisible(user: CurrentUser, id: string): Promise<MaterialRow> {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.material.findFirst({
      where: { id, ...materialScopeWhere(scope) },
      include: materialInclude,
    });
    if (!row) throw new NotFoundException('Материал не найден');
    return row;
  }

  private async toDtos(rows: MaterialRow[]): Promise<MaterialDto[]> {
    const people = await loadPeople(
      this.prisma,
      rows.map((row) => row.createdById),
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      file: row.file ? toFileDto(row.file) : null,
      url: row.url,
      body: row.body,
      discipline: row.discipline,
      topic: row.topic,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdBy: row.createdById ? (people.get(row.createdById) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
