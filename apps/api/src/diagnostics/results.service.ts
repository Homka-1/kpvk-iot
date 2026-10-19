import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildDiagnosticComparisons,
  buildDiagnosticExportTable,
  comparabilityKey,
  type ComparabilityQuestionnaireDto,
  type CurrentUser,
  type DiagnosticComparisonDto,
  type DiagnosticSource,
  formatFullName,
  type MeasurementType,
  type QuestionnaireVersionStatus,
} from '@iot/shared';
import { AuditService } from '../audit/audit.service.js';
import { type ExportFile, exportFile } from '../common/spreadsheet.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ApproveComparabilityDto, ExportResultsQueryDto } from './results.dto.js';
import {
  DiagnosticSessionsService,
  personSelect,
  scoreInclude,
  toScaleResults,
} from './sessions.service.js';

/** Версии, которые публиковались: только их можно назначать, сравнивать и выгружать. */
const EVER_PUBLISHED: QuestionnaireVersionStatus[] = ['PUBLISHED', 'RETIRED'];

/**
 * Повторная диагностика и сравнение замеров (UC-06; FR-015, FR-024, FR-025): сравнение замеров
 * студента, утверждение исследователем сопоставимости версий методики и обезличенная выгрузка
 * результатов. Сравнение строится по тем же данным и правам, что и вкладка «Диагностика»
 * профиля (FR-002); выгрузка не содержит ФИО и учётных данных и пишется в аудит (п. 8.3).
 */
@Injectable()
export class DiagnosticResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: DiagnosticSessionsService,
  ) {}

  /** Сравнение замеров студента по каждой методике (FR-015, FR-024). */
  async comparisonForStudent(
    user: CurrentUser,
    studentId: string,
  ): Promise<DiagnosticComparisonDto[]> {
    const completed = (await this.sessions.listForStudent(user, studentId)).filter(
      (item) => item.status === 'COMPLETED' && item.completedAt,
    );
    const versionIds = [...new Set(completed.map((item) => item.questionnaire.versionId))];
    const pairs = await this.prisma.versionComparability.findMany({
      where: { versionAId: { in: versionIds }, versionBId: { in: versionIds } },
      select: { versionAId: true, versionBId: true },
    });
    return buildDiagnosticComparisons(
      completed.map((item) => ({
        id: item.id,
        questionnaire: item.questionnaire,
        measurementType: item.measurementType,
        source: item.source,
        completedAt: item.completedAt!,
        scores: item.scores,
      })),
      new Set(pairs.map((pair) => comparabilityKey(pair.versionAId, pair.versionBId))),
    );
  }

  // ── Сопоставимость версий (UC-06) ──

  async listComparabilities(): Promise<ComparabilityQuestionnaireDto[]> {
    const rows = await this.prisma.questionnaire.findMany({
      where: { versions: { some: { status: { in: EVER_PUBLISHED } } } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.comparabilityQuestionnaire(row.id)));
  }

  async approveComparability(
    user: CurrentUser,
    dto: ApproveComparabilityDto,
  ): Promise<ComparabilityQuestionnaireDto> {
    if (dto.versionAId === dto.versionBId) {
      throw new BadRequestException({
        message: 'Выберите две разные версии',
        fields: { versionBId: 'Версия совпадает с первой' },
      });
    }
    const versions = await this.prisma.questionnaireVersion.findMany({
      where: { id: { in: [dto.versionAId, dto.versionBId] }, status: { in: EVER_PUBLISHED } },
      select: { id: true, questionnaireId: true, versionNumber: true },
    });
    if (versions.length !== 2 || versions[0]!.questionnaireId !== versions[1]!.questionnaireId) {
      throw new BadRequestException({
        message: 'Сопоставимость утверждается для опубликованных версий одной методики',
        fields: { versionBId: 'Выберите опубликованную версию той же методики' },
      });
    }
    const [older, newer] = versions.sort((a, b) => a.versionNumber - b.versionNumber) as [
      (typeof versions)[number],
      (typeof versions)[number],
    ];
    try {
      // Пара хранится упорядоченной (A — более ранняя версия), поэтому повтор отсекает
      // уникальное ограничение (NFR-006).
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.versionComparability.create({
          data: {
            versionAId: older.id,
            versionBId: newer.id,
            note: dto.note ?? null,
            approvedById: user.id,
          },
        });
        await this.audit.log(
          {
            action: 'questionnaire_comparability.approved',
            entityType: 'questionnaire_version_comparability',
            entityId: created.id,
            after: {
              questionnaireId: older.questionnaireId,
              versionA: older.versionNumber,
              versionB: newer.versionNumber,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Сопоставимость этих версий уже утверждена');
      }
      throw error;
    }
    return this.comparabilityQuestionnaire(older.questionnaireId);
  }

  /** Отзыв сопоставимости: сравнения сразу перестают объединять замеры этих версий. */
  async revokeComparability(id: string, reason: string): Promise<ComparabilityQuestionnaireDto> {
    const row = await this.prisma.versionComparability.findUnique({
      where: { id },
      include: {
        versionA: { select: { questionnaireId: true, versionNumber: true } },
        versionB: { select: { versionNumber: true } },
      },
    });
    if (!row) throw new NotFoundException('Сопоставимость не найдена');
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.versionComparability.deleteMany({ where: { id } });
      if (deleted.count === 0) throw new NotFoundException('Сопоставимость не найдена');
      await this.audit.log(
        {
          action: 'questionnaire_comparability.revoked',
          entityType: 'questionnaire_version_comparability',
          entityId: id,
          before: {
            questionnaireId: row.versionA.questionnaireId,
            versionA: row.versionA.versionNumber,
            versionB: row.versionB.versionNumber,
          },
          reason,
        },
        tx,
      );
    });
    return this.comparabilityQuestionnaire(row.versionA.questionnaireId);
  }

  // ── Обезличенная выгрузка (FR-025) ──

  async exportResults(query: ExportResultsQueryDto): Promise<ExportFile> {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id: query.questionnaireId },
      select: { id: true },
    });
    if (!questionnaire) throw new NotFoundException('Методика не найдена');
    const sessions = await this.prisma.diagnosticSession.findMany({
      where: {
        status: 'COMPLETED',
        version: { questionnaireId: query.questionnaireId },
        ...(query.measurementType ? { measurementType: query.measurementType } : {}),
      },
      select: {
        measurementType: true,
        source: true,
        completedAt: true,
        durationSeconds: true,
        currentRevision: true,
        student: { select: { participantCode: true, currentGroup: { select: { name: true } } } },
        version: { select: { versionNumber: true, title: true } },
        scores: { include: scoreInclude },
      },
      orderBy: [{ student: { participantCode: 'asc' } }, { completedAt: 'asc' }],
    });
    const table = buildDiagnosticExportTable(
      sessions.map((session) => ({
        participantCode: session.student.participantCode,
        groupName: session.student.currentGroup?.name ?? null,
        questionnaireTitle: session.version.title,
        versionNumber: session.version.versionNumber,
        measurementType: session.measurementType as MeasurementType,
        source: session.source as DiagnosticSource,
        completedAt: session.completedAt!.toISOString(),
        durationSeconds: session.durationSeconds,
        scores: toScaleResults(session.scores, session.currentRevision),
      })),
    );
    const file = await exportFile(table, query.format, 'diagnostics', 'Результаты');
    await this.audit.log({
      action: 'diagnostic_results.exported',
      entityType: 'questionnaire',
      entityId: query.questionnaireId,
      after: {
        format: query.format,
        measurementType: query.measurementType ?? null,
        rowCount: table.rows.length,
      },
    });
    return file;
  }

  private async comparabilityQuestionnaire(id: string): Promise<ComparabilityQuestionnaireDto> {
    const row = await this.prisma.questionnaire.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        isDemo: true,
        versions: {
          where: { status: { in: EVER_PUBLISHED } },
          select: {
            id: true,
            versionNumber: true,
            title: true,
            status: true,
            publishedAt: true,
            comparableAsA: {
              include: { versionB: { select: { id: true, versionNumber: true } } },
            },
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
    const approverIds = row.versions.flatMap((version) =>
      version.comparableAsA.map((pair) => pair.approvedById),
    );
    const approvers = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(approverIds)] } },
          select: personSelect,
        })
      ).map((person) => [person.id, { id: person.id, fullName: formatFullName(person) }]),
    );
    return {
      id: row.id,
      title: row.versions[0]!.title,
      isDemo: row.isDemo,
      versions: row.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        status: version.status as QuestionnaireVersionStatus,
        publishedAt: version.publishedAt?.toISOString() ?? null,
      })),
      comparabilities: row.versions
        .flatMap((version) =>
          version.comparableAsA.map((pair) => ({
            id: pair.id,
            versionA: { id: version.id, versionNumber: version.versionNumber },
            versionB: { id: pair.versionB.id, versionNumber: pair.versionB.versionNumber },
            note: pair.note,
            approvedAt: pair.approvedAt.toISOString(),
            approvedBy: approvers.get(pair.approvedById) ?? null,
          })),
        )
        .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)),
    };
  }
}
