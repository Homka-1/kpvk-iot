import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  combineMethodologyLevels,
  type CurrentUser,
  DEFAULT_MOTIVATION_STRATEGIES,
  formatFullName,
  type MeasurementType,
  type MethodologyLevelDto,
  methodologyLevel,
  type MotivationLevel,
  type MotivationProfileDto,
  type MotivationProfileHistoryDto,
  type MotivationProfileStatus,
  motivationStrategiesSchema,
  type MotivationStrategiesDto,
  type PersonRef,
  type ProfileBasisDto,
  type ProfileBasisItemDto,
  type ProfileDistributionDto,
  proposeMotivationLevel,
  type ScaleAggregation,
  type ScaleMotivationRole,
  scaleScoreRange,
  type StudentMotivationDto,
  usesIntrinsicRule,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { readContent, versionContentInclude } from '../diagnostics/questionnaire-content.js';
import { toVersionLabel, versionLabelSelect } from '../diagnostics/sessions.service.js';
import type { MotivationProfile, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { contextWhere, currentProfileWhere } from '../students/students.service.js';
import type { DistributionQueryDto, ProfileDecisionDto } from './motivation-profiles.dto.js';

const STRATEGIES_KEY = 'profiles.strategies';
const DECIDED: MotivationProfileStatus[] = ['CONFIRMED', 'CORRECTED'];

/** Завершённые прохождения со шкалами версии и баллами — исходные данные профиля. */
const basisSessionInclude = {
  version: {
    select: {
      ...versionLabelSelect,
      scales: {
        select: {
          id: true,
          code: true,
          name: true,
          sortOrder: true,
          aggregation: true,
          motivationRole: true,
          interpretationRules: { select: { motivationLevel: true } },
        },
      },
    },
  },
  scores: {
    include: {
      interpretationRule: {
        select: { levelLabel: true, description: true, studentText: true, motivationLevel: true },
      },
    },
  },
} satisfies Prisma.DiagnosticSessionInclude;

type BasisSession = Prisma.DiagnosticSessionGetPayload<{ include: typeof basisSessionInclude }>;

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

/**
 * Показатели шкал, участвующих в профиле. Прежнее правило — шкалы, у правил интерпретации которых
 * задан уровень профиля; новое — внутренние и внешние шкалы (справочные не показываются).
 */
function basisItems(session: BasisSession, intrinsicRule: boolean): ProfileBasisItemDto[] {
  return session.version.scales
    .filter((scale) =>
      intrinsicRule
        ? scale.motivationRole !== 'REFERENCE'
        : scale.interpretationRules.some((rule) => rule.motivationLevel),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((scale) => {
      const score = session.scores.find(
        (item) => item.scaleId === scale.id && item.revision === session.currentRevision,
      );
      const rule = score?.rawScore == null ? null : score.interpretationRule;
      return {
        sessionId: session.id,
        questionnaire: toVersionLabel(session.version),
        measurementType: session.measurementType as MeasurementType,
        completedAt: session.completedAt!.toISOString(),
        scaleCode: scale.code,
        scaleName: scale.name,
        rawScore: score?.rawScore == null ? null : score.rawScore.toNumber(),
        levelLabel: rule?.levelLabel ?? null,
        description: rule?.description ?? null,
        studentText: rule?.studentText ?? null,
        motivationLevel: intrinsicRule
          ? null
          : ((rule?.motivationLevel as MotivationLevel | null) ?? null),
        ...(intrinsicRule ? { motivationRole: scale.motivationRole as ScaleMotivationRole } : {}),
      };
    });
}

/**
 * Мотивационные профили (п. 4.5; FR-027–FR-033; UC-02). Система предлагает уровень по
 * утверждённым правилам интерпретации; уровень присваивает только преподаватель — подтверждением
 * или корректировкой с причиной. При недостатке данных уровень не предлагается и не может быть
 * присвоен («Требуется дополнительная диагностика»). Каждое изменение — в истории профиля
 * (неизменяемая таблица) и в журнале аудита.
 */
@Injectable()
export class MotivationProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
    private readonly settings: SettingsService,
  ) {}

  async getForStudent(user: CurrentUser, studentId: string): Promise<StudentMotivationDto> {
    const student = await this.studentInScope(user, studentId);
    const [current, lastDecided, history] = await Promise.all([
      student.currentMotivationProfileId
        ? this.prisma.motivationProfile.findUnique({
            where: { id: student.currentMotivationProfileId },
          })
        : null,
      this.lastDecided(studentId),
      this.prisma.motivationProfileHistory.findMany({
        where: { profile: { studentId } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const people = await this.people([
      ...[current, lastDecided].map((row) => row?.decidedById),
      ...history.map((row) => row.changedById),
    ]);
    return {
      current: current ? this.toDto(current, people) : null,
      lastDecided: lastDecided ? this.toDto(lastDecided, people) : null,
      history: history.map((row): MotivationProfileHistoryDto => ({
        id: row.id,
        profileId: row.profileId,
        status: row.status as MotivationProfileStatus,
        fromLevel: row.fromLevel as MotivationLevel | null,
        toLevel: row.toLevel as MotivationLevel | null,
        reason: row.reason,
        changedBy: row.changedById ? (people.get(row.changedById) ?? null) : null,
        at: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Предварительный профиль по последним завершённым прохождениям каждой методики (FR-027).
   * Если данные и результат не изменились с текущей записи, новая запись не создаётся.
   */
  async form(user: CurrentUser, studentId: string, key: string): Promise<MotivationProfileDto> {
    const student = await this.studentInScope(user, studentId);
    this.assertActive(student);
    const { response } = await this.idempotency.run(
      user.id,
      `motivation_profile.form:${studentId}:${key}`,
      {},
      async () => {
        const basis = await this.collectBasis(studentId);
        const status: MotivationProfileStatus = basis.level ? 'PROPOSED' : 'NEEDS_MORE_DIAGNOSTICS';
        const current = student.currentMotivationProfileId
          ? await this.prisma.motivationProfile.findUniqueOrThrow({
              where: { id: student.currentMotivationProfileId },
              include: { sources: { select: { sessionId: true } } },
            })
          : null;
        if (
          current &&
          current.proposedLevel === basis.level &&
          (current.status === 'NEEDS_MORE_DIAGNOSTICS') === (basis.level === null) &&
          sameSet(
            current.sources.map((item) => item.sessionId),
            basis.sessionIds,
          )
        ) {
          return this.toDto(current, await this.people([current.decidedById]));
        }

        const created = await this.prisma.$transaction(async (tx) => {
          const row = await tx.motivationProfile.create({
            data: {
              studentId,
              status,
              proposedLevel: basis.level,
              basis: basis.dto as unknown as Prisma.InputJsonValue,
              sources: { create: basis.sessionIds.map((sessionId) => ({ sessionId })) },
            },
          });
          await tx.motivationProfileHistory.create({
            data: {
              profileId: row.id,
              status,
              toLevel: basis.level,
              reason: basis.dto.reason,
              changedById: user.id,
            },
          });
          // Указатель меняется, только если его не изменил параллельный запрос.
          const moved = await tx.student.updateMany({
            where: {
              id: studentId,
              currentMotivationProfileId: student.currentMotivationProfileId,
            },
            data: { currentMotivationProfileId: row.id },
          });
          if (moved.count === 0) throw this.changedConflict();
          await this.audit.log(
            {
              action:
                status === 'PROPOSED'
                  ? 'motivation_profile.proposed'
                  : 'motivation_profile.needs_more_diagnostics',
              entityType: 'motivation_profile',
              entityId: row.id,
              after: { studentId, status, proposedLevel: basis.level, sources: basis.sessionIds },
            },
            tx,
          );
          return row;
        });
        return this.toDto(created, new Map());
      },
    );
    return response;
  }

  /** Подтверждение или корректировка предложенного профиля (FR-029, AT-04). */
  async decide(
    user: CurrentUser,
    profileId: string,
    dto: ProfileDecisionDto,
  ): Promise<MotivationProfileDto> {
    const profile = await this.prisma.motivationProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Мотивационный профиль не найден');
    const student = await this.studentInScope(user, profile.studentId);
    this.assertActive(student);
    if (profile.status === 'NEEDS_MORE_DIAGNOSTICS') {
      throw new ConflictException(
        'Данных недостаточно: уровень не присваивается. Проведите дополнительную диагностику.',
      );
    }
    if (profile.status !== 'PROPOSED') {
      throw new ConflictException('Решение по этому профилю уже принято');
    }
    if (student.currentMotivationProfileId !== profile.id) {
      throw new ConflictException('Есть более новое предложение профиля. Обновите страницу.');
    }
    const corrected = dto.level !== profile.proposedLevel;
    const reason = dto.reason ?? null;
    if (corrected && !reason) {
      throw new BadRequestException({
        message: 'Проверьте правильность заполнения формы',
        fields: { reason: 'Укажите причину корректировки' },
      });
    }
    const status: MotivationProfileStatus = corrected ? 'CORRECTED' : 'CONFIRMED';
    const decidedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.motivationProfile.updateMany({
        where: { id: profileId, status: 'PROPOSED' },
        data: {
          status,
          level: dto.level,
          correctionReason: corrected ? reason : null,
          studentSummary: dto.studentSummary ?? null,
          decidedById: user.id,
          decidedAt,
        },
      });
      if (updated.count === 0) throw new ConflictException('Решение по этому профилю уже принято');
      await tx.motivationProfileHistory.create({
        data: {
          profileId,
          status,
          fromLevel: profile.proposedLevel,
          toLevel: dto.level,
          reason,
          changedById: user.id,
        },
      });
      await this.audit.log(
        {
          action: corrected ? 'motivation_profile.corrected' : 'motivation_profile.confirmed',
          entityType: 'motivation_profile',
          entityId: profileId,
          before: { studentId: profile.studentId, proposedLevel: profile.proposedLevel },
          after: { status, level: dto.level },
          reason,
        },
        tx,
      );
    });
    const row = await this.prisma.motivationProfile.findUniqueOrThrow({ where: { id: profileId } });
    return this.toDto(row, await this.people([user.id]));
  }

  /** Распределение текущих профилей среди действующих студентов доступной области. */
  async distribution(
    user: CurrentUser,
    query: DistributionQueryDto,
  ): Promise<ProfileDistributionDto> {
    const scope = await this.scopes.forUser(user);
    const base: Prisma.StudentWhereInput[] = [
      this.scopes.studentsWhere(scope),
      { archivedAt: null },
      ...contextWhere(scope, user.id, query),
    ];
    const count = (extra?: Prisma.StudentWhereInput) =>
      this.prisma.student.count({ where: { AND: extra ? [...base, extra] : base } });
    const [total, HIGH, MEDIUM, LOW, PROPOSED, NEEDS_MORE_DIAGNOSTICS, NONE] = await Promise.all([
      count(),
      count(currentProfileWhere('HIGH')),
      count(currentProfileWhere('MEDIUM')),
      count(currentProfileWhere('LOW')),
      count(currentProfileWhere('PROPOSED')),
      count(currentProfileWhere('NEEDS_MORE_DIAGNOSTICS')),
      count({ currentMotivationProfileId: null }),
    ]);
    return { total, HIGH, MEDIUM, LOW, PROPOSED, NEEDS_MORE_DIAGNOSTICS, NONE };
  }

  // ── Стратегии сопровождения (FR-030) ──

  /** Действующий для проектирования ИОТ профиль: последний подтверждённый или скорректированный. */
  lastDecided(
    studentId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<MotivationProfile | null> {
    return db.motivationProfile.findFirst({
      where: { studentId, status: { in: DECIDED } },
      orderBy: { decidedAt: 'desc' },
    });
  }

  async getStrategies(): Promise<MotivationStrategiesDto> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: STRATEGIES_KEY } });
    const parsed = motivationStrategiesSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : DEFAULT_MOTIVATION_STRATEGIES;
  }

  async updateStrategies(
    value: MotivationStrategiesDto,
    actorId: string,
  ): Promise<MotivationStrategiesDto> {
    const next = { HIGH: value.HIGH, MEDIUM: value.MEDIUM, LOW: value.LOW };
    const before = await this.getStrategies();
    if (JSON.stringify(before) === JSON.stringify(next)) return before;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: STRATEGIES_KEY },
        create: { key: STRATEGIES_KEY, value: next, updatedById: actorId },
        update: { value: next, updatedById: actorId },
      });
      await this.audit.log(
        {
          action: 'settings.updated',
          entityType: 'settings',
          before: { [STRATEGIES_KEY]: before },
          after: { [STRATEGIES_KEY]: next },
        },
        tx,
      );
    });
    return next;
  }

  // ── Внутреннее ──

  /**
   * Последнее завершённое прохождение каждой методики и предложение уровня по нему. Если хотя бы у
   * одной из этих версий заданы шкалы внутренней мотивации, действует правило этапа 24: уровень
   * каждой такой методики по её внутренним шкалам, затем сведение уровней методик; версии без ролей
   * шкал в нём не участвуют. Иначе — прежнее правило (голосование шкал, `profiles.minScales`).
   */
  private async collectBasis(studentId: string): Promise<{
    level: MotivationLevel | null;
    dto: ProfileBasisDto;
    sessionIds: string[];
  }> {
    const sessions = await this.prisma.diagnosticSession.findMany({
      where: { studentId, status: 'COMPLETED', completedAt: { not: null } },
      include: basisSessionInclude,
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    const latest = new Map<string, BasisSession>();
    for (const session of sessions) {
      const questionnaireId = session.version.questionnaire.id;
      if (!latest.has(questionnaireId)) latest.set(questionnaireId, session);
    }
    const minScales = await this.settings.get('profiles.minScales');
    const intrinsicSessions = [...latest.values()].filter((session) =>
      usesIntrinsicRule(session.version.scales as { motivationRole: ScaleMotivationRole }[]),
    );
    if (intrinsicSessions.length > 0) {
      return this.intrinsicBasis(intrinsicSessions, minScales);
    }

    const items = [...latest.values()].flatMap((session) => basisItems(session, false));
    const proposal = proposeMotivationLevel(items, minScales);
    return {
      level: proposal.level,
      dto: {
        rule: 'SCALE_VOTES',
        minScales,
        items,
        counts: proposal.counts,
        reason: proposal.reason,
      },
      sessionIds: [...new Set(items.map((item) => item.sessionId))],
    };
  }

  /** Правило этапа 24: уровни методик по внутренним шкалам и их сведение (FR-027, FR-028). */
  private async intrinsicBasis(
    sessions: BasisSession[],
    minScales: number,
  ): Promise<{ level: MotivationLevel | null; dto: ProfileBasisDto; sessionIds: string[] }> {
    // Максимум шкалы нужен для процента от максимума: считается по ключам версии.
    const versions = await this.prisma.questionnaireVersion.findMany({
      where: { id: { in: sessions.map((session) => session.versionId) } },
      include: versionContentInclude,
    });
    const maxByScale = new Map<string, number | null>();
    for (const version of versions) {
      const content = readContent(version);
      for (const scale of content.scales) {
        maxByScale.set(scale.key, scaleScoreRange(content, scale)?.max ?? null);
      }
    }

    const methodologies = sessions.map((session): MethodologyLevelDto => {
      const result = methodologyLevel(
        session.version.scales.map((scale) => {
          const score = session.scores.find(
            (item) => item.scaleId === scale.id && item.revision === session.currentRevision,
          );
          return {
            name: scale.name,
            role: scale.motivationRole as ScaleMotivationRole,
            aggregation: scale.aggregation as ScaleAggregation,
            rawScore: score?.rawScore == null ? null : score.rawScore.toNumber(),
            maxScore: maxByScale.get(scale.id) ?? null,
          };
        }),
      );
      return {
        sessionId: session.id,
        questionnaire: toVersionLabel(session.version),
        measurementType: session.measurementType as MeasurementType,
        completedAt: session.completedAt!.toISOString(),
        ...result,
      };
    });
    const proposal = combineMethodologyLevels(methodologies.map((item) => item.level));
    const items = sessions.flatMap((session) => basisItems(session, true));
    return {
      level: proposal.level,
      dto: {
        rule: 'METHODOLOGIES',
        minScales,
        items,
        counts: proposal.counts,
        reason: proposal.reason,
        methodologies,
        outcome: proposal.outcome,
        explanation: proposal.explanation,
      },
      sessionIds: sessions.map((session) => session.id),
    };
  }

  private async studentInScope(user: CurrentUser, studentId: string) {
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true, archivedAt: true, currentMotivationProfileId: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    return student;
  }

  private assertActive(student: { archivedAt: Date | null }): void {
    if (student.archivedAt) {
      throw new ConflictException('Студент в архиве: профиль не изменяется');
    }
  }

  private changedConflict(): ConflictException {
    return new ConflictException('Профиль студента только что изменился. Обновите страницу.');
  }

  private async people(ids: (string | null | undefined)[]): Promise<Map<string, PersonRef>> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, lastName: true, firstName: true, middleName: true },
    });
    return new Map(users.map((item) => [item.id, { id: item.id, fullName: formatFullName(item) }]));
  }

  private toDto(row: MotivationProfile, people: Map<string, PersonRef>): MotivationProfileDto {
    return {
      id: row.id,
      studentId: row.studentId,
      status: row.status as MotivationProfileStatus,
      proposedLevel: row.proposedLevel as MotivationLevel | null,
      level: row.level as MotivationLevel | null,
      basis: (row.basis as unknown as ProfileBasisDto | null) ?? null,
      correctionReason: row.correctionReason,
      studentSummary: row.studentSummary,
      decidedBy: row.decidedById ? (people.get(row.decidedById) ?? null) : null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
