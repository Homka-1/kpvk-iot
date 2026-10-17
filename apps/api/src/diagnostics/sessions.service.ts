import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSIGNMENT_MAX_DAYS,
  type AnswerMap,
  type AnswerValue,
  answeredOnly,
  answersIssues,
  assignmentState,
  type CabinetDiagnosticDto,
  type CabinetDiagnosticSessionDto,
  type CurrentUser,
  type DiagnosticAnswersDto,
  type DiagnosticAssignmentDetailDto,
  type DiagnosticAssignmentDto,
  type DiagnosticForm,
  type DiagnosticRevisionKind,
  type DiagnosticSessionStatus,
  type DiagnosticSessionRowDto,
  type DiagnosticSource,
  formatFullName,
  type MeasurementType,
  type PersonRef,
  type QuestionnaireContent,
  type QuestionnaireVersionLabel,
  type ScaleResultDto,
  scoreQuestionnaire,
  type SessionCounts,
  type StudentDiagnosticDto,
  type StudentRef,
  toDiagnosticForm,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readContent, versionContentInclude } from './questionnaire-content.js';
import type { CreateAssignmentDto, PaperEntryDto } from './sessions.dto.js';

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Допуск расхождения часов клиента и сервера для даты бумажного бланка. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const ASSIGNMENT_LIST_LIMIT = 200;

/** Статусы, в которых студент может проходить диагностику. */
const OPEN_STATUSES: DiagnosticSessionStatus[] = ['ASSIGNED', 'IN_PROGRESS'];
/** Статусы, в которых можно ввести бумажный бланк (FR-022): в том числе после окончания срока. */
const PAPER_STATUSES: DiagnosticSessionStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'];

const personSelect = { id: true, lastName: true, firstName: true, middleName: true } as const;
const studentSelect = {
  ...personSelect,
  participantCode: true,
  currentGroup: { select: { id: true, name: true } },
} as const;
const versionLabelSelect = {
  id: true,
  versionNumber: true,
  title: true,
  questionnaire: { select: { id: true, isDemo: true } },
} as const;
const scoreInclude = {
  scale: { select: { code: true, name: true, sortOrder: true } },
  interpretationRule: { select: { levelCode: true, levelLabel: true, studentText: true } },
} as const;
const assignmentPeriodSelect = { startsAt: true, endsAt: true, cancelledAt: true } as const;

type VersionLabelRow = Prisma.QuestionnaireVersionGetPayload<{
  select: typeof versionLabelSelect;
}>;
type ScoreRow = Prisma.DiagnosticScoreGetPayload<{ include: typeof scoreInclude }>;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

function toVersionLabel(version: VersionLabelRow): QuestionnaireVersionLabel {
  return {
    questionnaireId: version.questionnaire.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    title: version.title,
    isDemo: version.questionnaire.isDemo,
  };
}

function toStudentRef(student: StudentRow): StudentRef {
  return {
    id: student.id,
    fullName: formatFullName(student),
    participantCode: student.participantCode,
  };
}

function toScaleResults(rows: ScoreRow[], revision: number): ScaleResultDto[] {
  return rows
    .filter((row) => row.revision === revision)
    .sort((a, b) => a.scale.sortOrder - b.scale.sortOrder)
    .map((row) => ({
      scaleId: row.scaleId,
      code: row.scale.code,
      name: row.scale.name,
      rawScore: row.rawScore === null ? null : row.rawScore.toNumber(),
      missingAnswers: row.missingAnswers,
      level: row.interpretationRule
        ? { code: row.interpretationRule.levelCode, label: row.interpretationRule.levelLabel }
        : null,
    }));
}

function fieldsException(message: string, fields: Record<string, string>): BadRequestException {
  return new BadRequestException({ message, fields });
}

/** Одинаковые ли наборы ответов (без учёта порядка ключей). */
function sameAnswers(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

interface FinalizeOptions {
  source: DiagnosticSource;
  completedAt: Date;
  startedAt: Date | null;
  durationSeconds: number | null;
  enteredById: string | null;
  allowedStatuses: DiagnosticSessionStatus[];
}

/**
 * Назначение и проведение диагностики (UC-01; FR-013, FR-018–FR-020, FR-022, FR-023).
 * Назначается только действующая (опубликованная) версия методики. При назначении создаются
 * прохождения для каждого студента. Завершение фиксирует исходные ответы, рассчитанные по
 * утверждённым ключам баллы, версию методики, дату и время прохождения. Ответы после завершения
 * не изменяются: исправление ошибочного ввода — новая ревизия с причиной и записью в аудит
 * (защищено и триггерами БД). Преподаватель видит только студентов своих групп (FR-002),
 * студент — только свои прохождения (AT-12).
 */
@Injectable()
export class DiagnosticSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ── Назначения ──

  async listAssignments(user: CurrentUser): Promise<DiagnosticAssignmentDto[]> {
    await this.expireOverdue();
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.diagnosticAssignment.findMany({
      where: this.assignmentsWhere(scope),
      include: this.assignmentInclude(scope),
      orderBy: { createdAt: 'desc' },
      take: ASSIGNMENT_LIST_LIMIT,
    });
    const people = await this.people(rows.map((row) => row.assignedById));
    return rows.map((row) => this.toAssignment(row, people));
  }

  async getAssignment(user: CurrentUser, id: string): Promise<DiagnosticAssignmentDetailDto> {
    await this.expireOverdue();
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.diagnosticAssignment.findFirst({
      where: { id, ...this.assignmentsWhere(scope) },
      include: this.assignmentInclude(scope),
    });
    if (!row) throw new NotFoundException('Назначение не найдено');
    const sessions = await this.prisma.diagnosticSession.findMany({
      where: { assignmentId: id, student: this.scopes.studentsWhere(scope) },
      include: { student: { select: studentSelect } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const people = await this.people([row.assignedById]);
    return {
      ...this.toAssignment(row, people),
      sessions: sessions.map((session): DiagnosticSessionRowDto => ({
        id: session.id,
        student: { ...toStudentRef(session.student), group: session.student.currentGroup },
        status: session.status as DiagnosticSessionStatus,
        source: session.source as DiagnosticSource,
        startedAt: iso(session.startedAt),
        completedAt: iso(session.completedAt),
        durationSeconds: session.durationSeconds,
      })),
    };
  }

  async createAssignment(
    user: CurrentUser,
    dto: CreateAssignmentDto,
    key: string,
  ): Promise<DiagnosticAssignmentDetailDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `diagnostic_assignment.create:${key}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const period = this.validatePeriod(dto);
        const version = await this.prisma.questionnaireVersion.findFirst({
          where: {
            questionnaireId: dto.questionnaireId,
            status: 'PUBLISHED',
            questionnaire: { status: 'ACTIVE' },
          },
          select: { id: true, title: true },
        });
        if (!version) {
          throw fieldsException('Методику нельзя назначить', {
            questionnaireId: 'Выберите методику с опубликованной версией',
          });
        }
        const students = await this.targetStudents(scope, dto);
        const id = await this.prisma.$transaction(async (tx) => {
          const assignment = await tx.diagnosticAssignment.create({
            data: {
              versionId: version.id,
              groupId: dto.groupId ?? null,
              studentId: dto.studentId ?? null,
              startsAt: period.startsAt,
              endsAt: period.endsAt,
              assignedById: user.id,
            },
          });
          await tx.diagnosticSession.createMany({
            data: students.map((student) => ({
              assignmentId: assignment.id,
              studentId: student.id,
              versionId: version.id,
            })),
          });
          // Уведомление студенту (UC-01, шаг 5). Показ в шапке — этап 15 (FR-065).
          await tx.notification.createMany({
            data: students
              .filter((student) => student.userId !== null)
              .map((student) => ({
                userId: student.userId!,
                type: 'diagnostic.assigned',
                title: 'Назначена диагностика',
                body: version.title,
                link: '/student/diagnostics',
                entityType: 'diagnostic_assignment',
                entityId: assignment.id,
              })),
          });
          await this.audit.log(
            {
              action: 'diagnostic_assignment.created',
              entityType: 'diagnostic_assignment',
              entityId: assignment.id,
              after: {
                versionId: version.id,
                groupId: assignment.groupId,
                studentId: assignment.studentId,
                startsAt: assignment.startsAt.toISOString(),
                endsAt: assignment.endsAt.toISOString(),
                sessionCount: students.length,
              },
            },
            tx,
          );
          return assignment.id;
        });
        return this.getAssignment(user, id);
      },
    );
    return response;
  }

  /** Отмена назначения: незавершённые прохождения отменяются, завершённые результаты остаются. */
  async cancelAssignment(
    user: CurrentUser,
    id: string,
    reason: string,
  ): Promise<DiagnosticAssignmentDetailDto> {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.diagnosticAssignment.findFirst({
      where: { id, ...this.assignmentsWhere(scope) },
    });
    if (!row) throw new NotFoundException('Назначение не найдено');
    if (row.cancelledAt) throw new ConflictException('Назначение уже отменено');
    await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.diagnosticAssignment.updateMany({
        where: { id, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      if (cancelled.count === 0) throw new ConflictException('Назначение уже отменено');
      const sessions = await tx.diagnosticSession.updateMany({
        where: { assignmentId: id, status: { in: OPEN_STATUSES } },
        data: { status: 'CANCELLED', draftAnswers: Prisma.DbNull },
      });
      await this.audit.log(
        {
          action: 'diagnostic_assignment.cancelled',
          entityType: 'diagnostic_assignment',
          entityId: id,
          after: { cancelledSessions: sessions.count },
          reason,
        },
        tx,
      );
    });
    return this.getAssignment(user, id);
  }

  // ── Результаты для преподавателя ──

  /** Вкладка «Диагностика» профиля студента: прохождения и баллы действующей ревизии. */
  async listForStudent(user: CurrentUser, studentId: string): Promise<StudentDiagnosticDto[]> {
    await this.expireOverdue();
    const scope = await this.scopes.forUser(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    const rows = await this.prisma.diagnosticSession.findMany({
      where: { studentId },
      include: {
        version: { select: versionLabelSelect },
        assignment: { select: assignmentPeriodSelect },
        scores: { include: scoreInclude },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      questionnaire: toVersionLabel(row.version),
      measurementType: row.measurementType as MeasurementType,
      status: row.status as DiagnosticSessionStatus,
      source: row.source as DiagnosticSource,
      startsAt: iso(row.assignment?.startsAt),
      endsAt: iso(row.assignment?.endsAt),
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      durationSeconds: row.durationSeconds,
      revision: row.currentRevision,
      scores: toScaleResults(row.scores, row.currentRevision),
    }));
  }

  /** Форма методики прохождения — для ввода бумажного бланка. */
  async getForm(user: CurrentUser, sessionId: string): Promise<DiagnosticForm> {
    const session = await this.sessionInScope(user, sessionId);
    return toDiagnosticForm(session.content);
  }

  /** Исходные ответы и все ревизии (разрешение `diagnostics.answers.read`). */
  async getAnswers(user: CurrentUser, sessionId: string): Promise<DiagnosticAnswersDto> {
    const session = await this.sessionInScope(user, sessionId);
    const [revisions, answers, scores, student] = await Promise.all([
      this.prisma.diagnosticRevision.findMany({
        where: { sessionId },
        orderBy: { revision: 'desc' },
      }),
      this.prisma.diagnosticAnswer.findMany({ where: { sessionId } }),
      this.prisma.diagnosticScore.findMany({ where: { sessionId }, include: scoreInclude }),
      this.prisma.student.findUniqueOrThrow({
        where: { id: session.row.studentId },
        select: studentSelect,
      }),
    ]);
    const people = await this.people(
      revisions.map((revision) => revision.createdById).filter((id): id is string => !!id),
    );
    return {
      sessionId,
      student: toStudentRef(student),
      form: toDiagnosticForm(session.content),
      revisions: revisions.map((revision) => ({
        revision: revision.revision,
        kind: revision.kind as DiagnosticRevisionKind,
        reason: revision.reason,
        createdAt: revision.createdAt.toISOString(),
        createdBy: revision.createdById ? (people.get(revision.createdById) ?? null) : null,
        answers: Object.fromEntries(
          answers
            .filter((answer) => answer.revision === revision.revision)
            .map((answer) => [answer.questionId, answer.value as AnswerValue]),
        ),
        scores: toScaleResults(scores, revision.revision),
      })),
    };
  }

  /** Ручной ввод бумажного бланка (FR-022): ответы и расчёт — как при онлайн-прохождении. */
  async enterPaper(
    user: CurrentUser,
    sessionId: string,
    dto: PaperEntryDto,
    key: string,
  ): Promise<StudentDiagnosticDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `diagnostic_session.paper:${sessionId}:${key}`,
      dto,
      async () => {
        const session = await this.sessionInScope(user, sessionId);
        if (!PAPER_STATUSES.includes(session.row.status as DiagnosticSessionStatus)) {
          throw new ConflictException(
            session.row.status === 'COMPLETED'
              ? 'Результаты уже внесены. Для исправления используйте процедуру исправления ввода'
              : 'Прохождение отменено',
          );
        }
        const completedAt = new Date(dto.completedAt);
        if (completedAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
          throw fieldsException('Проверьте дату', {
            completedAt: 'Дата заполнения бланка не может быть в будущем',
          });
        }
        const answers = this.checkedAnswers(session.content, dto.answers);
        await this.prisma.$transaction(async (tx) => {
          await this.finalize(tx, session.row, session.content, answers, user.id, {
            source: 'PAPER',
            completedAt,
            startedAt: null,
            durationSeconds: null,
            enteredById: user.id,
            allowedStatuses: PAPER_STATUSES,
          });
          await this.audit.log(
            {
              action: 'diagnostic_session.paper_entered',
              entityType: 'diagnostic_session',
              entityId: sessionId,
              after: { studentId: session.row.studentId, versionId: session.row.versionId },
            },
            tx,
          );
        });
        return this.studentDiagnostic(sessionId);
      },
    );
    return response;
  }

  /**
   * Исправление ошибочного ввода (FR-013): полный набор ответов новой ревизии с причиной.
   * Прежние ответы и баллы остаются в истории; расчёт — по той же версии методики (FR-026).
   */
  async correct(
    user: CurrentUser,
    sessionId: string,
    answersInput: AnswerMap,
    reason: string,
    key: string,
  ): Promise<StudentDiagnosticDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `diagnostic_session.correct:${sessionId}:${key}`,
      { answers: answersInput, reason },
      async () => {
        const session = await this.sessionInScope(user, sessionId);
        if (session.row.status !== 'COMPLETED') {
          throw new ConflictException('Исправить можно только завершённое прохождение');
        }
        const answers = this.checkedAnswers(session.content, answersInput);
        const current = session.row.currentRevision;
        const previous = await this.prisma.diagnosticAnswer.findMany({
          where: { sessionId, revision: current },
        });
        const previousMap = Object.fromEntries(
          previous.map((answer) => [answer.questionId, answer.value]),
        );
        if (sameAnswers(answers, previousMap)) {
          throw fieldsException('Ответы не изменились', {
            answers: 'Измените хотя бы один ответ',
          });
        }
        const revision = current + 1;
        await this.prisma.$transaction(async (tx) => {
          const moved = await tx.diagnosticSession.updateMany({
            where: { id: sessionId, currentRevision: current },
            data: { currentRevision: revision },
          });
          if (moved.count === 0) {
            throw new ConflictException('Результаты уже исправлены другим пользователем');
          }
          await this.writeRevision(tx, sessionId, session.content, answers, {
            revision,
            kind: 'CORRECTION',
            reason,
            scoringVersionId: session.row.versionId,
            createdById: user.id,
          });
          await this.audit.log(
            {
              action: 'diagnostic_session.corrected',
              entityType: 'diagnostic_session',
              entityId: sessionId,
              before: { revision: current },
              after: { revision, studentId: session.row.studentId },
              reason,
            },
            tx,
          );
        });
        return this.studentDiagnostic(sessionId);
      },
    );
    return response;
  }

  // ── Кабинет студента ──

  async cabinetList(user: CurrentUser): Promise<CabinetDiagnosticDto[]> {
    await this.expireOverdue();
    const student = await this.ownStudent(user);
    const rows = await this.prisma.diagnosticSession.findMany({
      where: { studentId: student.id, status: { not: 'CANCELLED' } },
      include: {
        version: { select: versionLabelSelect },
        assignment: { select: assignmentPeriodSelect },
        scores: { include: scoreInclude },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toCabinet(row));
  }

  async cabinetGet(user: CurrentUser, sessionId: string): Promise<CabinetDiagnosticSessionDto> {
    await this.expireOverdue();
    const { row, content } = await this.ownSession(user, sessionId);
    const scores = await this.prisma.diagnosticScore.findMany({
      where: { sessionId },
      include: scoreInclude,
    });
    return {
      ...this.toCabinet({ ...row, scores }),
      form: toDiagnosticForm(content),
      draft:
        content.allowDraft && OPEN_STATUSES.includes(row.status as DiagnosticSessionStatus)
          ? ((row.draftAnswers as Record<string, AnswerValue> | null) ?? null)
          : null,
    };
  }

  /** Начало прохождения после чтения инструкции (UC-01, шаг 6): фиксирует время начала. */
  async start(user: CurrentUser, sessionId: string): Promise<CabinetDiagnosticSessionDto> {
    await this.expireOverdue();
    const { row } = await this.ownSession(user, sessionId);
    this.assertOpen(row);
    if (row.status === 'ASSIGNED') {
      await this.prisma.diagnosticSession.updateMany({
        where: { id: sessionId, status: 'ASSIGNED' },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }
    return this.cabinetGet(user, sessionId);
  }

  /** Автосохранение черновика (UC-01, альтернативный сценарий), если его допускает методика. */
  async saveDraft(
    user: CurrentUser,
    sessionId: string,
    answers: AnswerMap,
  ): Promise<{ savedAt: string }> {
    await this.expireOverdue();
    const { row, content } = await this.ownSession(user, sessionId);
    this.assertOpen(row);
    if (!content.allowDraft) {
      throw new ConflictException('Методика не допускает сохранение черновика');
    }
    if (row.status !== 'IN_PROGRESS') {
      throw new ConflictException('Сначала начните прохождение');
    }
    const issues = answersIssues(toDiagnosticForm(content).questions, answers, false);
    if (Object.keys(issues).length > 0) throw fieldsException('Проверьте ответы', issues);
    const saved = await this.prisma.diagnosticSession.updateMany({
      where: { id: sessionId, status: 'IN_PROGRESS' },
      data: { draftAnswers: answers as Prisma.InputJsonValue },
    });
    if (saved.count === 0) throw new ConflictException('Прохождение уже завершено');
    return { savedAt: new Date().toISOString() };
  }

  /** Завершение (UC-01, шаги 8–9): проверка полноты, расчёт и сохранение результатов. */
  async complete(
    user: CurrentUser,
    sessionId: string,
    answersInput: AnswerMap,
    key: string,
  ): Promise<CabinetDiagnosticDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `diagnostic_session.complete:${sessionId}:${key}`,
      answersInput,
      async () => {
        await this.expireOverdue();
        const { row, content } = await this.ownSession(user, sessionId);
        this.assertOpen(row);
        const answers = this.checkedAnswers(content, answersInput);
        const completedAt = new Date();
        await this.prisma.$transaction(async (tx) => {
          await this.finalize(tx, row, content, answers, user.id, {
            source: 'ONLINE',
            completedAt,
            startedAt: row.startedAt ?? completedAt,
            durationSeconds: row.startedAt
              ? Math.max(0, Math.round((completedAt.getTime() - row.startedAt.getTime()) / 1000))
              : null,
            enteredById: null,
            allowedStatuses: OPEN_STATUSES,
          });
          await this.audit.log(
            {
              action: 'diagnostic_session.completed',
              entityType: 'diagnostic_session',
              entityId: sessionId,
              after: { studentId: row.studentId, versionId: row.versionId },
            },
            tx,
          );
        });
        const scores = await this.prisma.diagnosticScore.findMany({
          where: { sessionId },
          include: scoreInclude,
        });
        const completed = await this.ownSession(user, sessionId);
        return this.toCabinet({ ...completed.row, scores });
      },
    );
    return response;
  }

  // ── Внутреннее ──

  /** Просроченные незавершённые прохождения получают статус «Срок истёк» (FR-019). */
  private async expireOverdue(): Promise<void> {
    await this.prisma.diagnosticSession.updateMany({
      where: { status: { in: OPEN_STATUSES }, assignment: { endsAt: { lte: new Date() } } },
      data: { status: 'EXPIRED' },
    });
  }

  private assignmentsWhere(scope: AccessScope): Prisma.DiagnosticAssignmentWhereInput {
    if (scope.kind === 'all') return {};
    return {
      OR: [
        { groupId: { in: scope.groupIds } },
        { student: { currentGroupId: { in: scope.groupIds } } },
      ],
    };
  }

  private assignmentInclude(scope: AccessScope) {
    return {
      version: { select: versionLabelSelect },
      group: { select: { id: true, name: true, course: true, specialty: true } },
      student: { select: studentSelect },
      sessions: {
        where: { student: this.scopes.studentsWhere(scope) },
        select: { status: true },
      },
    } satisfies Prisma.DiagnosticAssignmentInclude;
  }

  private toAssignment(
    row: Prisma.DiagnosticAssignmentGetPayload<{
      include: ReturnType<DiagnosticSessionsService['assignmentInclude']>;
    }>,
    people: Map<string, PersonRef>,
  ): DiagnosticAssignmentDto {
    const counts: SessionCounts = {
      total: row.sessions.length,
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      EXPIRED: 0,
      CANCELLED: 0,
    };
    for (const session of row.sessions) counts[session.status as DiagnosticSessionStatus] += 1;
    const period = {
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      cancelledAt: iso(row.cancelledAt),
    };
    return {
      id: row.id,
      questionnaire: toVersionLabel(row.version),
      target: row.student
        ? { kind: 'student', student: toStudentRef(row.student) }
        : { kind: 'group', group: row.group! },
      measurementType: row.measurementType as MeasurementType,
      ...period,
      state: assignmentState(period),
      assignedBy: people.get(row.assignedById) ?? { id: row.assignedById, fullName: 'Нет данных' },
      createdAt: row.createdAt.toISOString(),
      counts,
    };
  }

  private validatePeriod(dto: CreateAssignmentDto): { startsAt: Date; endsAt: Date } {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const fields: Record<string, string> = {};
    if (endsAt <= startsAt) fields.endsOn = 'Дата окончания не раньше даты начала';
    else if (endsAt.getTime() <= Date.now()) fields.endsOn = 'Период уже закончился';
    else if (endsAt.getTime() - startsAt.getTime() > ASSIGNMENT_MAX_DAYS * DAY_MS) {
      fields.endsOn = `Период не длиннее ${ASSIGNMENT_MAX_DAYS} дней`;
    }
    if (Object.keys(fields).length > 0) throw fieldsException('Проверьте период', fields);
    return { startsAt, endsAt };
  }

  /** Студенты назначения: вся группа (без архивных) или один студент — только в своей области. */
  private async targetStudents(scope: AccessScope, dto: CreateAssignmentDto) {
    if (!!dto.groupId === !!dto.studentId) {
      throw fieldsException('Укажите, кому назначить диагностику', {
        target: 'Выберите группу или студента',
      });
    }
    if (dto.studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, archivedAt: null, ...this.scopes.studentsWhere(scope) },
        select: { id: true, userId: true },
      });
      if (!student) throw new NotFoundException('Студент не найден');
      return [student];
    }
    const inScope = scope.kind === 'all' || scope.groupIds.includes(dto.groupId!);
    const group = inScope
      ? await this.prisma.group.findFirst({ where: { id: dto.groupId!, archivedAt: null } })
      : null;
    if (!group) throw new NotFoundException('Группа не найдена');
    const students = await this.prisma.student.findMany({
      where: { currentGroupId: group.id, archivedAt: null },
      select: { id: true, userId: true },
    });
    if (students.length === 0) {
      throw fieldsException('В группе нет студентов', { groupId: 'В группе нет студентов' });
    }
    return students;
  }

  private async sessionInScope(user: CurrentUser, sessionId: string) {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.diagnosticSession.findFirst({
      where: { id: sessionId, student: this.scopes.studentsWhere(scope) },
      include: { version: { include: versionContentInclude } },
    });
    if (!row) throw new NotFoundException('Прохождение не найдено');
    return { row, content: readContent(row.version) };
  }

  private async ownStudent(user: CurrentUser) {
    const student = await this.prisma.student.findUnique({
      where: { userId: user.id },
      select: { id: true, archivedAt: true },
    });
    if (!student || student.archivedAt) {
      throw new NotFoundException('Карточка студента для этой учётной записи не найдена');
    }
    return student;
  }

  /** Прохождение текущего студента (чужое — 404, AT-12). */
  private async ownSession(user: CurrentUser, sessionId: string) {
    const student = await this.ownStudent(user);
    const row = await this.prisma.diagnosticSession.findFirst({
      where: { id: sessionId, studentId: student.id, status: { not: 'CANCELLED' } },
      include: {
        version: {
          include: { ...versionContentInclude, questionnaire: versionLabelSelect.questionnaire },
        },
        assignment: { select: assignmentPeriodSelect },
      },
    });
    if (!row) throw new NotFoundException('Диагностика не найдена');
    return { row, content: readContent(row.version) };
  }

  /** Можно ли сейчас проходить: статус и период назначения. */
  private assertOpen(row: {
    status: string;
    assignment: { startsAt: Date; endsAt: Date } | null;
  }): void {
    if (row.status === 'COMPLETED') throw new ConflictException('Диагностика уже пройдена');
    if (row.status === 'EXPIRED') throw new ConflictException('Срок прохождения истёк');
    if (!OPEN_STATUSES.includes(row.status as DiagnosticSessionStatus)) {
      throw new ConflictException('Диагностика недоступна');
    }
    const now = new Date();
    if (row.assignment && now < row.assignment.startsAt) {
      throw new ConflictException('Период прохождения ещё не начался');
    }
    if (row.assignment && now >= row.assignment.endsAt) {
      throw new ConflictException('Срок прохождения истёк');
    }
  }

  /** Проверка полноты и допустимости ответов (UC-01, шаг 9); возвращает ответы без пропусков. */
  private checkedAnswers(content: QuestionnaireContent, answers: AnswerMap) {
    const { questions } = toDiagnosticForm(content);
    const issues = answersIssues(questions, answers, true);
    if (Object.keys(issues).length > 0) {
      throw fieldsException('Ответьте на все обязательные вопросы', issues);
    }
    return answeredOnly(questions, answers);
  }

  private async finalize(
    tx: Tx,
    row: { id: string; versionId: string },
    content: QuestionnaireContent,
    answers: Record<string, Exclude<AnswerValue, null>>,
    actorId: string,
    options: FinalizeOptions,
  ): Promise<void> {
    const done = await tx.diagnosticSession.updateMany({
      where: { id: row.id, status: { in: options.allowedStatuses } },
      data: {
        status: 'COMPLETED',
        source: options.source,
        startedAt: options.startedAt,
        completedAt: options.completedAt,
        durationSeconds: options.durationSeconds,
        enteredById: options.enteredById,
        draftAnswers: Prisma.DbNull,
        currentRevision: 1,
      },
    });
    if (done.count === 0) throw new ConflictException('Прохождение уже завершено или недоступно');
    await this.writeRevision(tx, row.id, content, answers, {
      revision: 1,
      kind: 'INITIAL',
      reason: null,
      scoringVersionId: row.versionId,
      createdById: actorId,
    });
  }

  /** Ревизия результатов: исходные ответы и баллы по утверждённым ключам версии (FR-020, FR-023). */
  private async writeRevision(
    tx: Tx,
    sessionId: string,
    content: QuestionnaireContent,
    answers: Record<string, Exclude<AnswerValue, null>>,
    revision: {
      revision: number;
      kind: DiagnosticRevisionKind;
      reason: string | null;
      scoringVersionId: string;
      createdById: string;
    },
  ): Promise<void> {
    await tx.diagnosticRevision.create({ data: { sessionId, ...revision } });
    await tx.diagnosticAnswer.createMany({
      data: Object.entries(answers).map(([questionId, value]) => ({
        sessionId,
        questionId,
        revision: revision.revision,
        value: value as Prisma.InputJsonValue,
      })),
    });
    await tx.diagnosticScore.createMany({
      data: scoreQuestionnaire(content, answers).map((score) => ({
        sessionId,
        scaleId: score.scaleKey,
        revision: revision.revision,
        rawScore: score.rawScore,
        interpretationRuleId: score.rule?.key ?? null,
        missingAnswers: score.missingAnswers,
      })),
    });
  }

  private async studentDiagnostic(sessionId: string): Promise<StudentDiagnosticDto> {
    const row = await this.prisma.diagnosticSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        version: { select: versionLabelSelect },
        assignment: { select: assignmentPeriodSelect },
        scores: { include: scoreInclude },
      },
    });
    return {
      id: row.id,
      questionnaire: toVersionLabel(row.version),
      measurementType: row.measurementType as MeasurementType,
      status: row.status as DiagnosticSessionStatus,
      source: row.source as DiagnosticSource,
      startsAt: iso(row.assignment?.startsAt),
      endsAt: iso(row.assignment?.endsAt),
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      durationSeconds: row.durationSeconds,
      revision: row.currentRevision,
      scores: toScaleResults(row.scores, row.currentRevision),
    };
  }

  private toCabinet(row: {
    id: string;
    status: string;
    completedAt: Date | null;
    currentRevision: number;
    version: VersionLabelRow;
    assignment: { startsAt: Date; endsAt: Date } | null;
    scores: ScoreRow[];
  }): CabinetDiagnosticDto {
    return {
      id: row.id,
      title: row.version.title,
      isDemo: row.version.questionnaire.isDemo,
      status: row.status as DiagnosticSessionStatus,
      startsAt: iso(row.assignment?.startsAt),
      endsAt: iso(row.assignment?.endsAt),
      completedAt: iso(row.completedAt),
      // Баллы и служебные уровни студенту не передаются — только текст для студента (FR-016).
      results: row.scores
        .filter((score) => score.revision === row.currentRevision)
        .sort((a, b) => a.scale.sortOrder - b.scale.sortOrder)
        .flatMap((score) =>
          score.interpretationRule?.studentText
            ? [{ scale: score.scale.name, text: score.interpretationRule.studentText }]
            : [],
        ),
    };
  }

  private async people(ids: string[]): Promise<Map<string, PersonRef>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: personSelect,
    });
    return new Map(users.map((item) => [item.id, { id: item.id, fullName: formatFullName(item) }]));
  }
}
