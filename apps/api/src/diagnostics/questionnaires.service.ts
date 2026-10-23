import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ContentIssue,
  DEMO_MARK,
  type DiagnosticDirectionDto,
  publishIssues,
  type QuestionnaireContent,
  type QuestionnaireDetailDto,
  type QuestionnaireStatus,
  type QuestionnaireSummaryDto,
  type QuestionnaireVersionDto,
  type QuestionnaireVersionInfoDto,
  type QuestionnaireVersionRef,
  type QuestionnaireVersionStatus,
  structuralIssues,
} from '@iot/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  passportData,
  readContent,
  replaceContent,
  versionContentInclude,
} from './questionnaire-content.js';
import type {
  CreateQuestionnaireDto,
  DirectionInputDto,
  QuestionnaireContentDto,
} from './questionnaires.dto.js';

type VersionRow = {
  id: string;
  versionNumber: number;
  status: string;
  title: string;
  changeNote: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

const versionInfoSelect = {
  id: true,
  versionNumber: true,
  status: true,
  title: true,
  changeNote: true,
  createdAt: true,
  publishedAt: true,
} satisfies Prisma.QuestionnaireVersionSelect;

function toVersionRef(row: VersionRow): QuestionnaireVersionRef {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status as QuestionnaireVersionStatus,
  };
}

function toVersionInfo(row: VersionRow): QuestionnaireVersionInfoDto {
  return {
    ...toVersionRef(row),
    title: row.title,
    changeNote: row.changeNote,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/** Замечания к содержимому в формате ошибок полей формы (NFR-005). */
function issuesException(message: string, issues: ContentIssue[]): BadRequestException {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.path] ??= issue.message;
  return new BadRequestException({ message, fields });
}

/** Необязательные поля документа приходят как undefined — приводим к null (полная замена). */
function normalize(dto: QuestionnaireContentDto): QuestionnaireContent {
  return {
    ...dto,
    author: dto.author ?? null,
    purpose: dto.purpose ?? null,
    instruction: dto.instruction ?? null,
    ageRestrictions: dto.ageRestrictions ?? null,
    source: dto.source ?? null,
    termsOfUse: dto.termsOfUse ?? null,
    changeNote: dto.changeNote ?? null,
    questions: dto.questions.map((question) => ({
      ...question,
      minLabel: question.minLabel ?? null,
      maxLabel: question.maxLabel ?? null,
    })),
    scales: dto.scales.map((scale) => ({
      ...scale,
      description: scale.description ?? null,
      aggregation: scale.aggregation ?? 'SUM',
      motivationRole: scale.motivationRole ?? 'REFERENCE',
      rules: scale.rules.map((rule) => ({
        ...rule,
        description: rule.description ?? null,
        studentText: rule.studentText ?? null,
      })),
    })),
  };
}

/**
 * Конструктор диагностических методик (FR-017, FR-021, FR-026). Методика — постоянная
 * сущность, содержимое и ключи живут в версиях. Черновик редактируется целиком; опубликованная
 * версия неизменяема (проверка здесь и триггеры БД). Изменение — только через новую версию,
 * прежняя версия и её результаты остаются как есть. Права — `diagnostics.manage`;
 * методики общие для всех преподавателей (справочник, а не данные студентов).
 */
@Injectable()
export class QuestionnairesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Диагностические направления ──

  async listDirections(): Promise<DiagnosticDirectionDto[]> {
    return this.prisma.diagnosticDirection.findMany({
      select: { id: true, code: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDirection(dto: DirectionInputDto): Promise<DiagnosticDirectionDto> {
    await this.assertDirectionUnique(dto);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.diagnosticDirection.create({
        data: { code: dto.code, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
        select: { id: true, code: true, name: true, sortOrder: true },
      });
      await this.audit.log(
        {
          action: 'diagnostic_direction.created',
          entityType: 'diagnostic_direction',
          entityId: row.id,
          after: row,
        },
        tx,
      );
      return row;
    });
  }

  async updateDirection(id: string, dto: DirectionInputDto): Promise<DiagnosticDirectionDto> {
    const existing = await this.prisma.diagnosticDirection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Направление не найдено');
    await this.assertDirectionUnique(dto, id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.diagnosticDirection.update({
        where: { id },
        data: { code: dto.code, name: dto.name, sortOrder: dto.sortOrder ?? existing.sortOrder },
        select: { id: true, code: true, name: true, sortOrder: true },
      });
      await this.audit.log(
        {
          action: 'diagnostic_direction.updated',
          entityType: 'diagnostic_direction',
          entityId: id,
          before: { code: existing.code, name: existing.name, sortOrder: existing.sortOrder },
          after: row,
        },
        tx,
      );
      return row;
    });
  }

  // ── Методики ──

  async list(includeArchived: boolean): Promise<QuestionnaireSummaryDto[]> {
    const rows = await this.prisma.questionnaire.findMany({
      where: includeArchived ? undefined : { status: 'ACTIVE' },
      include: {
        direction: { select: { id: true, name: true } },
        versions: {
          where: { status: { in: ['DRAFT', 'PUBLISHED'] } },
          select: { ...versionInfoSelect, _count: { select: { questions: true } } },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const summaries = rows.map((row) => {
      const latest = row.versions[0];
      const published = row.versions.find((version) => version.status === 'PUBLISHED') ?? null;
      const draft = row.versions.find((version) => version.status === 'DRAFT') ?? null;
      return {
        id: row.id,
        title: latest?.title ?? 'Без названия',
        status: row.status as QuestionnaireStatus,
        isDemo: row.isDemo,
        direction: row.direction,
        published: published && toVersionRef(published),
        draft: draft && toVersionRef(draft),
        questionCount: latest?._count.questions ?? 0,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
    return summaries.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }

  async get(id: string): Promise<QuestionnaireDetailDto> {
    const row = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: {
        direction: { select: { id: true, name: true } },
        copiedFrom: {
          select: {
            id: true,
            versions: { select: { title: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
          },
        },
        versions: {
          select: { ...versionInfoSelect, comparableAsA: { select: { versionBId: true } } },
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Методика не найдена');
    return {
      id: row.id,
      status: row.status as QuestionnaireStatus,
      isDemo: row.isDemo,
      direction: row.direction,
      copiedFrom: row.copiedFrom
        ? { id: row.copiedFrom.id, title: row.copiedFrom.versions[0]?.title ?? 'Без названия' }
        : null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      versions: row.versions.map(toVersionInfo),
      comparabilities: row.versions.flatMap((version) =>
        version.comparableAsA.map((pair) => ({
          versionAId: version.id,
          versionBId: pair.versionBId,
        })),
      ),
    };
  }

  /** Новая методика с первой версией-черновиком. */
  async create(dto: CreateQuestionnaireDto, actorId: string): Promise<QuestionnaireDetailDto> {
    const content = normalize(dto.content);
    this.assertStructure(content);
    if (dto.directionId) await this.assertDirection(dto.directionId);
    const id = await this.prisma.$transaction(async (tx) => {
      const questionnaire = await tx.questionnaire.create({
        data: { directionId: dto.directionId ?? null, createdById: actorId },
      });
      const version = await tx.questionnaireVersion.create({
        data: {
          questionnaireId: questionnaire.id,
          versionNumber: 1,
          ...passportData(content),
          createdById: actorId,
        },
      });
      await replaceContent(tx, version.id, content);
      await this.audit.log(
        {
          action: 'questionnaire.created',
          entityType: 'questionnaire',
          entityId: questionnaire.id,
          after: { title: content.title, versionId: version.id },
        },
        tx,
      );
      return questionnaire.id;
    });
    return this.get(id);
  }

  async updateDirectionOf(id: string, directionId: string | null): Promise<QuestionnaireDetailDto> {
    const existing = await this.findActive(id);
    if (directionId) await this.assertDirection(directionId);
    await this.prisma.$transaction(async (tx) => {
      await tx.questionnaire.update({ where: { id }, data: { directionId } });
      await this.audit.log(
        {
          action: 'questionnaire.updated',
          entityType: 'questionnaire',
          entityId: id,
          before: { directionId: existing.directionId },
          after: { directionId },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async getVersion(id: string, versionId: string): Promise<QuestionnaireVersionDto> {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { id: versionId, questionnaireId: id },
      include: versionContentInclude,
    });
    if (!version) throw new NotFoundException('Версия методики не найдена');
    return { ...toVersionInfo(version), questionnaireId: id, content: readContent(version) };
  }

  /** Сохранение черновика: полная замена содержимого (FR-017). */
  async saveDraft(
    id: string,
    versionId: string,
    dto: QuestionnaireContentDto,
  ): Promise<QuestionnaireVersionDto> {
    const content = normalize(dto);
    await this.findActive(id);
    const version = await this.findVersion(id, versionId);
    if (version.status !== 'DRAFT') {
      throw new ConflictException('Опубликованная версия не изменяется. Создайте новую версию');
    }
    this.assertStructure(content);
    await this.prisma.$transaction(async (tx) => {
      // Триггер БД отклонит запись, если параллельно версия уже опубликована.
      await tx.questionnaireVersion.update({
        where: { id: versionId },
        data: passportData(content),
      });
      await replaceContent(tx, versionId, content);
      await this.audit.log(
        {
          action: 'questionnaire_version.saved',
          entityType: 'questionnaire',
          entityId: id,
          after: { versionId, versionNumber: version.versionNumber, title: content.title },
        },
        tx,
      );
    });
    return this.getVersion(id, versionId);
  }

  /**
   * Публикация черновика после полной проверки. Предыдущая опубликованная версия выводится из
   * использования (новые назначения — только по действующей), её результаты не пересчитываются (FR-026).
   */
  async publish(id: string, versionId: string, actorId: string): Promise<QuestionnaireVersionDto> {
    const questionnaire = await this.findActive(id);
    const draft = await this.prisma.questionnaireVersion.findFirst({
      where: { id: versionId, questionnaireId: id },
      include: versionContentInclude,
    });
    if (!draft) throw new NotFoundException('Версия методики не найдена');
    if (draft.status !== 'DRAFT') throw new ConflictException('Версия уже опубликована');
    const issues = publishIssues(readContent(draft), questionnaire.isDemo);
    if (issues.length > 0) {
      throw issuesException('Версию нельзя опубликовать: исправьте замечания', issues);
    }
    await this.prisma.$transaction(async (tx) => {
      const retired = await tx.questionnaireVersion.updateManyAndReturn({
        where: { questionnaireId: id, status: 'PUBLISHED' },
        data: { status: 'RETIRED' },
        select: { id: true, versionNumber: true },
      });
      const published = await tx.questionnaireVersion.updateMany({
        where: { id: versionId, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: actorId },
      });
      if (published.count === 0) throw new ConflictException('Версия уже опубликована');
      await this.audit.log(
        {
          action: 'questionnaire_version.published',
          entityType: 'questionnaire',
          entityId: id,
          after: {
            versionId,
            versionNumber: draft.versionNumber,
            retiredVersionIds: retired.map((row) => row.id),
          },
        },
        tx,
      );
    });
    return this.getVersion(id, versionId);
  }

  /**
   * Новая версия-черновик — копия последней опубликованной (FR-026). Одновременно у методики
   * может быть только один черновик.
   */
  async createVersion(
    id: string,
    changeNote: string | null,
    actorId: string,
  ): Promise<QuestionnaireVersionDto> {
    await this.findActive(id);
    const versions = await this.prisma.questionnaireVersion.findMany({
      where: { questionnaireId: id },
      orderBy: { versionNumber: 'desc' },
      include: versionContentInclude,
    });
    if (versions.some((version) => version.status === 'DRAFT')) {
      throw new ConflictException('У методики уже есть черновик новой версии');
    }
    const base = versions.find((version) => version.status === 'PUBLISHED') ?? versions[0]!;
    const content = { ...readContent(base), changeNote };
    const versionNumber = versions[0]!.versionNumber + 1;
    const versionId = await this.prisma.$transaction(async (tx) => {
      // Уникальность (questionnaire_id, version_number) не даст создать два черновика параллельно.
      const version = await tx.questionnaireVersion.create({
        data: {
          questionnaireId: id,
          versionNumber,
          ...passportData(content),
          createdById: actorId,
        },
      });
      await replaceContent(tx, version.id, content);
      await this.audit.log(
        {
          action: 'questionnaire_version.created',
          entityType: 'questionnaire',
          entityId: id,
          after: { versionId: version.id, versionNumber, basedOn: base.versionNumber },
        },
        tx,
      );
      return version.id;
    });
    return this.getVersion(id, versionId);
  }

  /** Отказ от черновика новой версии. Первую версию не удаляют — методику архивируют. */
  async deleteDraft(id: string, versionId: string): Promise<void> {
    await this.findActive(id);
    const version = await this.findVersion(id, versionId);
    if (version.status !== 'DRAFT') {
      throw new ConflictException('Удалить можно только черновик');
    }
    if (version.versionNumber === 1) {
      throw new ConflictException('Первую версию удалить нельзя. Отправьте методику в архив');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.questionnaireVersion.delete({ where: { id: versionId } });
      await this.audit.log(
        {
          action: 'questionnaire_version.deleted',
          entityType: 'questionnaire',
          entityId: id,
          before: { versionId, versionNumber: version.versionNumber, title: version.title },
        },
        tx,
      );
    });
  }

  /**
   * Копия методики (FR-017): новая методика с черновиком версии 1 из последней версии источника.
   * Копия демо-методики остаётся демо-методикой (огр. 1).
   */
  async copy(id: string, actorId: string): Promise<QuestionnaireDetailDto> {
    const source = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, include: versionContentInclude },
      },
    });
    if (!source) throw new NotFoundException('Методика не найдена');
    const base = readContent(source.versions[0]!);
    const title = `Копия — ${base.title}`.slice(0, 300);
    const content: QuestionnaireContent = {
      ...base,
      title:
        source.isDemo && !title.includes(DEMO_MARK)
          ? `${DEMO_MARK}: ${title}`.slice(0, 300)
          : title,
      changeNote: null,
    };
    const copyId = await this.prisma.$transaction(async (tx) => {
      const questionnaire = await tx.questionnaire.create({
        data: {
          directionId: source.directionId,
          isDemo: source.isDemo,
          copiedFromId: source.id,
          createdById: actorId,
        },
      });
      const version = await tx.questionnaireVersion.create({
        data: {
          questionnaireId: questionnaire.id,
          versionNumber: 1,
          ...passportData(content),
          createdById: actorId,
        },
      });
      await replaceContent(tx, version.id, content);
      await this.audit.log(
        {
          action: 'questionnaire.copied',
          entityType: 'questionnaire',
          entityId: questionnaire.id,
          after: {
            copiedFromId: source.id,
            basedOn: source.versions[0]!.versionNumber,
            title: content.title,
          },
        },
        tx,
      );
      return questionnaire.id;
    });
    return this.get(copyId);
  }

  async archive(id: string, reason: string): Promise<QuestionnaireDetailDto> {
    const existing = await this.prisma.questionnaire.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Методика не найдена');
    if (existing.status === 'ARCHIVED') throw new ConflictException('Методика уже в архиве');
    return this.setArchived(id, true, reason);
  }

  async restore(id: string): Promise<QuestionnaireDetailDto> {
    const existing = await this.prisma.questionnaire.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Методика не найдена');
    if (existing.status !== 'ARCHIVED') throw new ConflictException('Методика не в архиве');
    return this.setArchived(id, false, null);
  }

  private async setArchived(id: string, archived: boolean, reason: string | null) {
    await this.prisma.$transaction(async (tx) => {
      await tx.questionnaire.update({
        where: { id },
        data: archived
          ? { status: 'ARCHIVED', archivedAt: new Date() }
          : { status: 'ACTIVE', archivedAt: null },
      });
      await this.audit.log(
        {
          action: archived ? 'questionnaire.archived' : 'questionnaire.restored',
          entityType: 'questionnaire',
          entityId: id,
          reason,
        },
        tx,
      );
    });
    return this.get(id);
  }

  private assertStructure(content: QuestionnaireContent): void {
    const issues = structuralIssues(content);
    if (issues.length > 0) throw issuesException('Проверьте структуру методики', issues);
  }

  /** Методика существует и не в архиве: архивную нельзя изменять. */
  private async findActive(id: string) {
    const questionnaire = await this.prisma.questionnaire.findUnique({ where: { id } });
    if (!questionnaire) throw new NotFoundException('Методика не найдена');
    if (questionnaire.status === 'ARCHIVED') {
      throw new ConflictException('Методика в архиве. Верните её из архива, чтобы изменить');
    }
    return questionnaire;
  }

  private async findVersion(id: string, versionId: string) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { id: versionId, questionnaireId: id },
    });
    if (!version) throw new NotFoundException('Версия методики не найдена');
    return version;
  }

  private async assertDirection(id: string): Promise<void> {
    if (!(await this.prisma.diagnosticDirection.findUnique({ where: { id } }))) {
      throw new NotFoundException('Диагностическое направление не найдено');
    }
  }

  private async assertDirectionUnique(dto: DirectionInputDto, exceptId?: string): Promise<void> {
    const clash = await this.prisma.diagnosticDirection.findFirst({
      where: { code: dto.code, id: exceptId ? { not: exceptId } : undefined },
    });
    if (clash) throw new ConflictException('Направление с таким кодом уже существует');
  }
}
