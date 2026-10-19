import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSIGNMENT_SUBMITTABLE_STATUSES,
  type AssignmentReviewDto,
  type AssignmentStatus,
  type AssignmentWorkDto,
  checkAssessment,
  type CurrentUser,
  formatFullName,
  type ReviewQueueItemDto,
  submissionIssues,
} from '@iot/shared';
import { type AccessScope, AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { FilesService } from '../library/files.service.js';
import {
  cabinetAssignmentWhere,
  publishedAssignmentWhere,
  teacherAssignmentWhere,
} from '../library/library-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { syncStageProgress } from '../trajectories/stage-progress.js';
import { order, rowInclude, StudentAssignmentsService } from './student-assignments.service.js';
import type {
  AssessAssignmentDto,
  ReviewQueueQueryDto,
  SubmitAssignmentDto,
} from './submissions.dto.js';

const REVIEW_QUEUE_LIMIT = 200;

const studentSelect = {
  id: true,
  lastName: true,
  firstName: true,
  middleName: true,
  currentGroup: { select: { id: true, name: true, course: true, specialty: true } },
} satisfies Prisma.StudentSelect;

const toStudent = (row: Prisma.StudentGetPayload<{ select: typeof studentSelect }>) => ({
  id: row.id,
  fullName: formatFullName(row),
  group: row.currentGroup,
});

/**
 * Ответы «На проверке» студентов, которых пользователь ведёт (FR-002), в контексте шапки.
 * Общее правило очереди проверки и карточки главной панели.
 */
export function reviewQueueWhere(
  scope: AccessScope,
  query: { groupId?: string | null; disciplineId?: string | null },
): Prisma.TrajectoryAssignmentWhereInput {
  return {
    AND: [teacherAssignmentWhere(scope), publishedAssignmentWhere()],
    status: 'SUBMITTED',
    student: { archivedAt: null, ...(query.groupId ? { currentGroupId: query.groupId } : {}) },
    ...(query.disciplineId ? { assignment: { disciplineId: query.disciplineId } } : {}),
  };
}

const SUBMIT_CONFLICTS: Partial<Record<AssignmentStatus, string>> = {
  OFFERED: 'Сначала выберите задание из набора',
  SUBMITTED: 'Ответ уже отправлен и ждёт проверки',
  COMPLETED: 'Задание уже выполнено',
};

/**
 * Выполнение заданий (UC-04, AT-07): студент приступает к заданию и отправляет ответ текстом,
 * файлом или ссылкой (FR-050), преподаватель проверяет по критериям и принимает или возвращает
 * на доработку (FR-051, FR-052). Каждая сдача — новая попытка; история сохраняется.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
    private readonly files: FilesService,
    private readonly assignments: StudentAssignmentsService,
  ) {}

  // ── Студент ──

  /** «Приступить к выполнению»: назначенное задание становится выполняемым (FR-053). */
  async start(user: CurrentUser, id: string): Promise<AssignmentWorkDto> {
    await this.scopes.ownStudent(user);
    const row = await this.prisma.trajectoryAssignment.findFirst({
      where: { id, ...cabinetAssignmentWhere(user.id) },
      select: { status: true, stageId: true },
    });
    if (!row) throw new NotFoundException('Задание не найдено');
    if (row.status === 'ASSIGNED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.trajectoryAssignment.updateMany({
          where: { id, status: 'ASSIGNED' },
          data: { status: 'IN_PROGRESS' },
        });
        await syncStageProgress(tx, row.stageId);
      });
    }
    return this.assignments.cabinetGet(user, id);
  }

  /**
   * Отправка ответа на проверку (FR-050, FR-051): новая попытка, статус «На проверке»,
   * уведомление преподавателю. Повтор формы с тем же ключом не создаёт попытку (NFR-006).
   */
  async submit(
    user: CurrentUser,
    id: string,
    dto: SubmitAssignmentDto,
    key: string,
  ): Promise<AssignmentWorkDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `assignment.submit:${id}:${key}`,
      dto,
      async () => {
        await this.scopes.ownStudent(user);
        const row = await this.prisma.trajectoryAssignment.findFirst({
          where: { id, ...cabinetAssignmentWhere(user.id) },
          include: {
            assignment: { select: { title: true, submissionFormats: true } },
            trajectory: { select: { teacherId: true } },
            student: { select: { lastName: true, firstName: true, middleName: true } },
          },
        });
        if (!row) throw new NotFoundException('Задание не найдено');
        if (!ASSIGNMENT_SUBMITTABLE_STATUSES.includes(row.status)) {
          throw new ConflictException(SUBMIT_CONFLICTS[row.status] ?? 'Задание нельзя сдать');
        }
        const fileIds = [...new Set(dto.fileIds ?? [])];
        const issues = submissionIssues(row.assignment.submissionFormats, { ...dto, fileIds });
        if (issues.length > 0) {
          throw new BadRequestException({
            message: issues[0]!.message,
            fields: Object.fromEntries(issues.map((issue) => [issue.field, issue.message])),
          });
        }
        for (const fileId of fileIds) {
          await this.files.assertOwnUpload(fileId, user.id, 'fileIds');
        }

        await this.prisma.$transaction(async (tx) => {
          const moved = await tx.trajectoryAssignment.updateMany({
            where: { id, status: { in: [...ASSIGNMENT_SUBMITTABLE_STATUSES] } },
            data: { status: 'SUBMITTED' },
          });
          if (moved.count === 0) {
            throw new ConflictException('Статус задания изменился. Обновите страницу');
          }
          const attemptNumber =
            (await tx.submission.count({ where: { trajectoryAssignmentId: id } })) + 1;
          const submission = await tx.submission.create({
            data: {
              trajectoryAssignmentId: id,
              attemptNumber,
              text: dto.text ?? null,
              url: dto.url ?? null,
              files: { create: fileIds.map((fileId) => ({ fileId })) },
            },
          });
          await syncStageProgress(tx, row.stageId);
          await tx.notification.create({
            data: {
              userId: row.trajectory?.teacherId ?? row.assignedById,
              type: 'assignment.submitted',
              title: attemptNumber > 1 ? 'Доработанное задание на проверке' : 'Задание на проверке',
              body: `${formatFullName(row.student)}: ${row.assignment.title}`.slice(0, 500),
              link: `/assignments/review/${id}`,
              entityType: 'trajectory_assignment',
              entityId: id,
            },
          });
          await this.audit.log(
            {
              action: 'assignment.submitted',
              entityType: 'trajectory_assignment',
              entityId: id,
              before: { status: row.status },
              after: {
                status: 'SUBMITTED',
                submissionId: submission.id,
                attemptNumber,
                parts: {
                  text: !!dto.text,
                  url: !!dto.url,
                  files: fileIds.length,
                },
              },
            },
            tx,
          );
        });
        return this.assignments.cabinetGet(user, id);
      },
    );
    return response;
  }

  // ── Преподаватель ──

  /** Очередь «На проверке»: ответы студентов, которых пользователь ведёт; сначала давние. */
  async reviewQueue(user: CurrentUser, query: ReviewQueueQueryDto): Promise<ReviewQueueItemDto[]> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.trajectoryAssignment.findMany({
      where: reviewQueueWhere(scope, query),
      include: { ...rowInclude, student: { select: studentSelect } },
      orderBy: order,
      take: REVIEW_QUEUE_LIMIT,
    });
    const [dtos, latest] = await Promise.all([
      this.assignments.toDtos(rows),
      this.prisma.submission.findMany({
        where: { trajectoryAssignmentId: { in: rows.map((row) => row.id) } },
        orderBy: [{ trajectoryAssignmentId: 'asc' }, { attemptNumber: 'desc' }],
        distinct: ['trajectoryAssignmentId'],
        select: { trajectoryAssignmentId: true, attemptNumber: true, submittedAt: true },
      }),
    ]);
    const last = new Map(latest.map((item) => [item.trajectoryAssignmentId, item]));
    return rows
      .map((row, index): ReviewQueueItemDto => {
        const submission = last.get(row.id)!;
        return {
          ...dtos[index]!,
          student: toStudent(row.student),
          attemptNumber: submission.attemptNumber,
          submittedAt: submission.submittedAt.toISOString(),
          late: !!row.dueAt && submission.submittedAt > row.dueAt,
        };
      })
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  /** Карточка проверки: задание, студент, все попытки. Чужое — 404 (FR-002). */
  async reviewGet(user: CurrentUser, id: string): Promise<AssignmentReviewDto> {
    const scope = await this.scopes.forUser(user);
    const work = await this.assignments.work({
      id,
      AND: [teacherAssignmentWhere(scope), publishedAssignmentWhere()],
    });
    if (!work) throw new NotFoundException('Назначение не найдено');
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: work.studentId },
      select: studentSelect,
    });
    return { ...work.dto, student: toStudent(student) };
  }

  /**
   * Проверка последней попытки (FR-052): принять с баллами по критериям или вернуть на доработку
   * с комментарием (FR-051). Принятое задание выполнено; оценка записывается в учебные
   * достижения, прогресс этапа пересчитывается (UC-04). Попытка проверяется один раз.
   */
  async assess(
    user: CurrentUser,
    id: string,
    dto: AssessAssignmentDto,
    key: string,
  ): Promise<AssignmentReviewDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `assignment.assess:${id}:${key}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const row = await this.prisma.trajectoryAssignment.findFirst({
          where: { id, AND: [teacherAssignmentWhere(scope), publishedAssignmentWhere()] },
          include: {
            assignment: {
              select: {
                title: true,
                disciplineId: true,
                criteria: { orderBy: { sortOrder: 'asc' }, select: { id: true, maxScore: true } },
              },
            },
            student: { select: { userId: true } },
            submissions: {
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              select: { id: true, attemptNumber: true, assessment: { select: { id: true } } },
            },
          },
        });
        if (!row) throw new NotFoundException('Назначение не найдено');
        const submission = row.submissions[0];
        if (row.status !== 'SUBMITTED' || !submission || submission.assessment) {
          throw new ConflictException('Нет ответа, ожидающего проверки. Обновите страницу');
        }
        if (submission.id !== dto.submissionId) {
          throw new ConflictException('Студент отправил новую попытку. Обновите страницу');
        }
        const criteria = row.assignment.criteria.map((criterion) => ({
          id: criterion.id,
          maxScore: Number(criterion.maxScore),
        }));
        const check = checkAssessment(criteria, dto);
        if (check.issues.length > 0) {
          throw new BadRequestException({
            message: check.issues[0]!.message,
            fields: Object.fromEntries(check.issues.map((issue) => [issue.field, issue.message])),
          });
        }
        const accepted = dto.decision === 'ACCEPTED';
        const comments = new Map(
          (dto.criterionScores ?? []).map((item) => [item.criterionId, item.comment ?? null]),
        );

        await this.prisma.$transaction(async (tx) => {
          const now = new Date();
          const moved = await tx.trajectoryAssignment.updateMany({
            where: { id, status: 'SUBMITTED' },
            data: accepted ? { status: 'COMPLETED', completedAt: now } : { status: 'RETURNED' },
          });
          if (moved.count === 0) {
            throw new ConflictException('Статус задания изменился. Обновите страницу');
          }
          const assessment = await tx.assessment
            .create({
              data: {
                submissionId: submission.id,
                assessorId: user.id,
                decision: dto.decision,
                score: check.score,
                comment: dto.comment ?? null,
                criterionScores: accepted
                  ? {
                      create: (dto.criterionScores ?? []).map((item) => ({
                        criterionId: item.criterionId,
                        score: item.score,
                        comment: comments.get(item.criterionId) ?? null,
                      })),
                    }
                  : undefined,
              },
            })
            .catch((error: unknown) => {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('Попытка уже проверена. Обновите страницу');
              }
              throw error;
            });
          // Учебное достижение — только реальная оценка; без критериев балла нет (FR-005).
          if (accepted && check.score !== null && check.maxScore !== null) {
            await tx.academicResult.create({
              data: {
                studentId: row.studentId,
                disciplineId: row.assignment.disciplineId,
                source: 'ASSIGNMENT',
                trajectoryAssignmentId: id,
                assessmentId: assessment.id,
                title: row.assignment.title,
                score: check.score,
                maxScore: check.maxScore,
                recordedAt: now,
                recordedById: user.id,
              },
            });
          }
          await syncStageProgress(tx, row.stageId);
          if (row.student.userId) {
            await tx.notification.create({
              data: {
                userId: row.student.userId,
                type: accepted ? 'assignment.accepted' : 'assignment.returned',
                title: accepted ? 'Задание принято' : 'Задание возвращено на доработку',
                body: row.assignment.title,
                link: `/student/assignments/${id}`,
                entityType: 'trajectory_assignment',
                entityId: id,
              },
            });
          }
          await this.audit.log(
            {
              action: accepted ? 'assignment.accepted' : 'assignment.returned',
              entityType: 'trajectory_assignment',
              entityId: id,
              before: { status: 'SUBMITTED' },
              after: {
                status: accepted ? 'COMPLETED' : 'RETURNED',
                submissionId: submission.id,
                attemptNumber: submission.attemptNumber,
                score: check.score,
                maxScore: check.maxScore,
              },
            },
            tx,
          );
        });
        return this.reviewGet(user, id);
      },
    );
    return response;
  }
}
