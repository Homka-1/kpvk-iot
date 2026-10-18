import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CabinetFeedbackDto,
  type CabinetFeedbackTrajectoryDto,
  type CurrentUser,
  DATED_FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_LIST_LIMIT,
  type FeedbackDto,
  FeedbackKind,
  isCheckpointReflectable,
  type PendingReflectionDto,
  type ReflectionDto,
  RESOLVABLE_FEEDBACK_KINDS,
  STUDENT_FEEDBACK_KINDS,
  STUDENT_VISIBLE_TRAJECTORY_STATUSES,
  type StudentSupportDto,
  TEACHER_FEEDBACK_KINDS,
  type TrajectoryStatus,
  Visibility,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { loadPeople } from '../library/materials.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsultationsService, withoutInternalNote } from './consultations.service.js';
import type {
  CabinetFeedbackInputDto,
  CabinetReplyInputDto,
  CreateFeedbackDto,
  FeedbackListQueryDto,
  FeedbackReplyInputDto,
  ReflectionInputDto,
} from './feedback.dto.js';
import {
  findStudentInScope,
  isoDate,
  resolveBinding,
  stageSelect,
  studentSelect,
  toStudentRef,
  toTrajectoryRef,
  trajectorySelect,
  unknownPerson,
} from './feedback-refs.js';

const STUDENT_VISIBLE = Visibility.STUDENT_VISIBLE;

/** Выборка сообщения; студенту — только ответы, открытые ему (FR-068). */
function feedbackInclude(forStudent: boolean) {
  return {
    student: { select: studentSelect },
    trajectory: { select: trajectorySelect },
    stage: { select: stageSelect },
    trajectoryAssignment: { select: { id: true, assignment: { select: { title: true } } } },
    replies: {
      where: forStudent ? { visibility: STUDENT_VISIBLE } : {},
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.FeedbackInclude;
}

type FeedbackRow = Prisma.FeedbackGetPayload<{ include: ReturnType<typeof feedbackInclude> }>;

const reflectionInclude = {
  student: { select: studentSelect },
  trajectory: { select: trajectorySelect },
  stage: { select: stageSelect },
  checkpoint: { select: { id: true, title: true } },
} satisfies Prisma.ReflectionInclude;

type ReflectionRow = Prisma.ReflectionGetPayload<{ include: typeof reflectionInclude }>;

const trajectoryOptionSelect = {
  ...trajectorySelect,
  status: true,
  stages: {
    where: { archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      ...stageSelect,
      checkpoints: {
        orderBy: { dueDate: 'asc' },
        select: { id: true, title: true, dueDate: true, status: true },
      },
    },
  },
} satisfies Prisma.TrajectorySelect;

type TrajectoryOptionRow = Prisma.TrajectoryGetPayload<{ select: typeof trajectoryOptionSelect }>;

const toBindingOption = (row: TrajectoryOptionRow): CabinetFeedbackTrajectoryDto => ({
  id: row.id,
  disciplineName: row.discipline.name,
  status: row.status as TrajectoryStatus,
  stages: row.stages.map(({ id, title, sortOrder }) => ({ id, title, sortOrder })),
});

/** Куда ведёт уведомление студента о сообщении: к заданию или в раздел «Обратная связь». */
const studentLink = (trajectoryAssignmentId: string | null) =>
  trajectoryAssignmentId ? `/student/assignments/${trajectoryAssignmentId}` : '/student/feedback';

/**
 * Обратная связь (п. 4.9, FR-063–FR-068): сообщения преподавателя и обращения студента
 * с ответами, рефлексия после контрольных точек, история взаимодействия. Внутренние заметки
 * (INTERNAL) отдаются только сотрудникам с доступом к студенту; эндпоинты кабинета фильтруют
 * их в запросе к базе, а не в интерфейсе.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
    private readonly consultations: ConsultationsService,
  ) {}

  // ── Преподаватель ──

  /** Сообщения и обращения в области пользователя (раздел «Обратная связь», FR-063). */
  async list(user: CurrentUser, query: FeedbackListQueryDto): Promise<FeedbackDto[]> {
    const scope = await this.scopes.forUser(user);
    const bySource =
      query.source === 'student'
        ? [...STUDENT_FEEDBACK_KINDS, FeedbackKind.ROUTE_CHANGE_PROPOSAL]
        : query.source === 'teacher'
          ? [...TEACHER_FEEDBACK_KINDS]
          : undefined;
    // «Нерассмотренные» — только обращения студента, которые отмечаются рассмотренными.
    const kinds = query.open
      ? (bySource ?? [...RESOLVABLE_FEEDBACK_KINDS]).filter((kind) =>
          RESOLVABLE_FEEDBACK_KINDS.includes(kind),
        )
      : bySource;
    const rows = await this.prisma.feedback.findMany({
      where: {
        parentId: null,
        student: {
          ...this.scopes.studentsWhere(scope),
          ...(query.groupId ? { currentGroupId: query.groupId } : {}),
        },
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.trajectoryAssignmentId
          ? { trajectoryAssignmentId: query.trajectoryAssignmentId }
          : {}),
        ...(query.disciplineId
          ? { OR: [{ trajectoryId: null }, { trajectory: { disciplineId: query.disciplineId } }] }
          : {}),
        ...(kinds ? { kind: { in: kinds } } : {}),
        ...(query.open ? { resolvedAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: FEEDBACK_LIST_LIMIT,
      include: feedbackInclude(false),
    });
    return this.toFeedbackList(rows);
  }

  /** История взаимодействия со студентом: сообщения, консультации, рефлексия (FR-063, FR-067). */
  async support(user: CurrentUser, studentId: string): Promise<StudentSupportDto> {
    const scope = await this.scopes.forUser(user);
    await findStudentInScope(this.prisma, this.scopes.studentsWhere(scope), studentId);
    const [rows, consultations, reflections, trajectories] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { studentId, parentId: null },
        orderBy: { createdAt: 'desc' },
        include: feedbackInclude(false),
      }),
      this.consultations.forStudent(studentId),
      this.reflectionsOf(studentId),
      this.trajectoriesOf(studentId),
    ]);
    return {
      feedback: await this.toFeedbackList(rows),
      consultations,
      reflections,
      trajectories: trajectories.map(toBindingOption),
    };
  }

  /** Сообщение преподавателя студенту или внутренняя педагогическая заметка (FR-064, FR-068). */
  async create(user: CurrentUser, dto: CreateFeedbackDto, key: string): Promise<FeedbackDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `feedback.create:${key}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const student = await findStudentInScope(
          this.prisma,
          this.scopes.studentsWhere(scope),
          dto.studentId,
        );
        if (student.archivedAt) {
          throw new ConflictException('Студент в архиве: новые сообщения не отправляются');
        }
        this.assertTeacherMessage(dto);
        const binding = await resolveBinding(this.prisma, student.id, dto);
        const dated = DATED_FEEDBACK_KINDS.includes(dto.kind);
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.feedback.create({
            data: {
              studentId: student.id,
              authorId: user.id,
              kind: dto.kind,
              visibility: dto.visibility,
              body: dto.body,
              dueDate: dated && dto.dueDate ? new Date(`${dto.dueDate}T00:00:00Z`) : null,
              ...binding,
            },
            include: feedbackInclude(false),
          });
          if (dto.visibility === STUDENT_VISIBLE) {
            await this.notifications.notify(tx, [student.userId], {
              type: 'feedback.created',
              title: `Новое сообщение преподавателя: ${FEEDBACK_KIND_LABELS[dto.kind].toLowerCase()}`,
              link: studentLink(binding.trajectoryAssignmentId),
              entityType: 'feedback',
              entityId: created.id,
            });
          }
          return created;
        });
        return this.toFeedback(row, await loadPeople(this.prisma, [user.id]));
      },
    );
    return response;
  }

  /** Ответ преподавателя в ветке. Ответ во внутренней заметке остаётся внутренним (FR-068). */
  async reply(
    user: CurrentUser,
    id: string,
    dto: FeedbackReplyInputDto,
    key: string,
  ): Promise<FeedbackDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `feedback.reply:${id}:${key}`,
      dto,
      async () => {
        const root = await this.findRootInScope(user, id);
        const visibility =
          root.visibility === Visibility.INTERNAL
            ? Visibility.INTERNAL
            : (dto.visibility ?? STUDENT_VISIBLE);
        await this.prisma.$transaction(async (tx) => {
          await tx.feedback.create({
            data: {
              studentId: root.studentId,
              authorId: user.id,
              kind: FeedbackKind.COMMENT,
              visibility,
              parentId: root.id,
              body: dto.body,
              trajectoryId: root.trajectoryId,
              stageId: root.stageId,
              trajectoryAssignmentId: root.trajectoryAssignmentId,
            },
          });
          if (visibility === STUDENT_VISIBLE) {
            await this.notifications.notify(tx, [root.student.userId], {
              type: 'feedback.reply',
              title: 'Преподаватель ответил на сообщение',
              link: studentLink(root.trajectoryAssignmentId),
              entityType: 'feedback',
              entityId: root.id,
            });
          }
        });
        return this.loadOne(root.id, false);
      },
    );
    return response;
  }

  /** Обращение студента рассмотрено: снимается отметка «затруднение» в фильтрах (FR-008). */
  async resolve(user: CurrentUser, id: string): Promise<FeedbackDto> {
    const root = await this.findRootInScope(user, id);
    if (!RESOLVABLE_FEEDBACK_KINDS.includes(root.kind as FeedbackKind)) {
      throw new BadRequestException('Рассмотренными отмечаются только обращения студента');
    }
    if (!root.resolvedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.feedback.update({ where: { id }, data: { resolvedAt: new Date() } });
        await this.notifications.notify(tx, [root.student.userId], {
          type: 'feedback.resolved',
          title: 'Преподаватель рассмотрел ваше обращение',
          body: FEEDBACK_KIND_LABELS[root.kind as FeedbackKind],
          link: studentLink(root.trajectoryAssignmentId),
          entityType: 'feedback',
          entityId: id,
        });
        await this.audit.log(
          {
            action: 'feedback.resolved',
            entityType: 'feedback',
            entityId: id,
            after: { studentId: root.studentId, kind: root.kind },
          },
          tx,
        );
      });
    }
    return this.loadOne(id, false);
  }

  // ── Студент ──

  /** Раздел «Обратная связь» кабинета: только записи, открытые студенту (FR-016, FR-068). */
  async cabinet(user: CurrentUser): Promise<CabinetFeedbackDto> {
    const { id: studentId } = await this.scopes.ownStudent(user);
    const [rows, consultations, reflections, trajectories] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { studentId, parentId: null, visibility: STUDENT_VISIBLE },
        orderBy: { createdAt: 'desc' },
        take: FEEDBACK_LIST_LIMIT,
        include: feedbackInclude(true),
      }),
      this.consultations.forStudent(studentId),
      this.reflectionsOf(studentId),
      this.trajectoriesOf(studentId),
    ]);
    const reflected = new Set(reflections.map((item) => item.checkpoint?.id).filter(Boolean));
    const pendingReflections: PendingReflectionDto[] = trajectories.flatMap((trajectory) =>
      trajectory.stages.flatMap((stage) =>
        stage.checkpoints
          .filter((point) => isCheckpointReflectable(point.status) && !reflected.has(point.id))
          .map((point) => ({
            checkpointId: point.id,
            title: point.title,
            dueDate: isoDate(point.dueDate),
            status: point.status,
            stage: { id: stage.id, title: stage.title, sortOrder: stage.sortOrder },
            trajectory: { id: trajectory.id, disciplineName: trajectory.discipline.name },
          })),
      ),
    );
    return {
      feedback: await this.toFeedbackList(rows),
      // Внутренняя заметка консультации студенту не передаётся (FR-068).
      consultations: consultations.map(withoutInternalNote),
      reflections,
      pendingReflections,
      trajectories: trajectories.map(toBindingOption),
    };
  }

  /** Вопрос или сообщение о затруднении от студента (п. 4.9). */
  async ask(user: CurrentUser, dto: CabinetFeedbackInputDto, key: string): Promise<FeedbackDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `feedback.ask:${key}`,
      dto,
      async () => {
        const { id: studentId } = await this.scopes.ownStudent(user);
        const binding = await resolveBinding(this.prisma, studentId, dto);
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.feedback.create({
            data: {
              studentId,
              authorId: user.id,
              kind: dto.kind,
              visibility: STUDENT_VISIBLE,
              body: dto.body,
              ...binding,
            },
            include: feedbackInclude(true),
          });
          await this.notifications.notify(
            tx,
            await this.notifications.teachersFor(tx, studentId, binding.trajectoryId),
            {
              type: 'feedback.created',
              title:
                dto.kind === FeedbackKind.DIFFICULTY_REPORT
                  ? 'Студент сообщил о затруднении'
                  : 'Студент задал вопрос',
              body: toStudentRef(created.student).fullName,
              link: '/feedback',
              entityType: 'feedback',
              entityId: created.id,
            },
          );
          return created;
        });
        return this.toFeedback(row, await loadPeople(this.prisma, [user.id]));
      },
    );
    return response;
  }

  /** Ответ студента в ветке, открытой ему. */
  async studentReply(
    user: CurrentUser,
    id: string,
    dto: CabinetReplyInputDto,
    key: string,
  ): Promise<FeedbackDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `feedback.student_reply:${id}:${key}`,
      dto,
      async () => {
        const { id: studentId } = await this.scopes.ownStudent(user);
        const root = await this.prisma.feedback.findFirst({
          where: { id, studentId, parentId: null, visibility: STUDENT_VISIBLE },
          select: {
            id: true,
            authorId: true,
            trajectoryId: true,
            stageId: true,
            trajectoryAssignmentId: true,
          },
        });
        if (!root) throw new NotFoundException('Сообщение не найдено');
        await this.prisma.$transaction(async (tx) => {
          await tx.feedback.create({
            data: {
              studentId,
              authorId: user.id,
              kind: FeedbackKind.COMMENT,
              visibility: STUDENT_VISIBLE,
              parentId: root.id,
              body: dto.body,
              trajectoryId: root.trajectoryId,
              stageId: root.stageId,
              trajectoryAssignmentId: root.trajectoryAssignmentId,
            },
          });
          const recipients =
            root.authorId === user.id
              ? await this.notifications.teachersFor(tx, studentId, root.trajectoryId)
              : [root.authorId];
          await this.notifications.notify(tx, recipients, {
            type: 'feedback.reply',
            title: 'Студент ответил на сообщение',
            link: '/feedback',
            entityType: 'feedback',
            entityId: root.id,
          });
        });
        return this.loadOne(root.id, true);
      },
    );
    return response;
  }

  /**
   * Рефлексия студента (FR-066): после контрольной точки — одна на точку; в ответ на запрос
   * самооценки — закрывает запрос. Хотя бы одно поле должно быть заполнено.
   */
  async reflect(user: CurrentUser, dto: ReflectionInputDto, key: string): Promise<ReflectionDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `reflection.create:${key}`,
      dto,
      async () => {
        const { id: studentId } = await this.scopes.ownStudent(user);
        const filled =
          (dto.selfAssessment ?? null) !== null ||
          [dto.achievements, dto.difficulties, dto.nextSteps].some((value) => !!value);
        if (!filled) {
          throw new BadRequestException({
            message: 'Заполните хотя бы одно поле рефлексии',
            fields: { achievements: 'Опишите, что получилось, или поставьте самооценку' },
          });
        }
        const visible = { in: [...STUDENT_VISIBLE_TRAJECTORY_STATUSES] };
        const checkpoint = dto.checkpointId
          ? await this.prisma.trajectoryCheckpoint.findFirst({
              where: {
                id: dto.checkpointId,
                stage: { archivedAt: null, trajectory: { studentId, status: visible } },
              },
              select: {
                id: true,
                title: true,
                status: true,
                stageId: true,
                stage: {
                  select: { trajectoryId: true, trajectory: { select: { teacherId: true } } },
                },
              },
            })
          : null;
        if (dto.checkpointId && !checkpoint) {
          throw new NotFoundException('Контрольная точка не найдена');
        }
        if (checkpoint && !isCheckpointReflectable(checkpoint.status)) {
          throw new ConflictException(
            'Рефлексия заполняется после контрольной точки: точка ещё не отмечена преподавателем',
          );
        }
        const request = dto.requestId
          ? await this.prisma.feedback.findFirst({
              where: {
                id: dto.requestId,
                studentId,
                parentId: null,
                kind: FeedbackKind.SELF_ASSESSMENT_REQUEST,
                visibility: STUDENT_VISIBLE,
              },
              select: {
                id: true,
                authorId: true,
                resolvedAt: true,
                trajectoryId: true,
                stageId: true,
              },
            })
          : null;
        if (dto.requestId && !request) throw new NotFoundException('Запрос самооценки не найден');
        if (request?.resolvedAt) {
          throw new ConflictException('На этот запрос самооценки вы уже ответили');
        }
        const row = await this.prisma.$transaction(async (tx) => {
          if (checkpoint) {
            const existing = await tx.reflection.findFirst({
              where: { studentId, checkpointId: checkpoint.id },
              select: { id: true },
            });
            if (existing) {
              throw new ConflictException('Рефлексия по этой контрольной точке уже заполнена');
            }
          }
          const created = await tx.reflection.create({
            data: {
              studentId,
              checkpointId: checkpoint?.id ?? null,
              stageId: checkpoint?.stageId ?? request?.stageId ?? null,
              trajectoryId: checkpoint?.stage.trajectoryId ?? request?.trajectoryId ?? null,
              selfAssessment: dto.selfAssessment ?? null,
              achievements: dto.achievements ?? null,
              difficulties: dto.difficulties ?? null,
              nextSteps: dto.nextSteps ?? null,
            },
            include: reflectionInclude,
          });
          if (request) {
            await tx.feedback.update({
              where: { id: request.id },
              data: { resolvedAt: new Date() },
            });
          }
          const recipients = request
            ? [request.authorId]
            : checkpoint
              ? [checkpoint.stage.trajectory.teacherId]
              : await this.notifications.teachersFor(tx, studentId, null);
          await this.notifications.notify(tx, recipients, {
            type: 'reflection.created',
            title: 'Студент заполнил рефлексию',
            body: checkpoint
              ? `${toStudentRef(created.student).fullName} · «${checkpoint.title}»`
              : toStudentRef(created.student).fullName,
            link: `/students/${studentId}?tab=support`,
            entityType: 'reflection',
            entityId: created.id,
          });
          await this.audit.log(
            {
              action: 'reflection.created',
              entityType: 'reflection',
              entityId: created.id,
              after: {
                studentId,
                checkpointId: created.checkpointId,
                requestId: request?.id ?? null,
              },
            },
            tx,
          );
          return created;
        });
        return this.toReflection(row);
      },
    );
    return response;
  }

  // ── Внутреннее ──

  private assertTeacherMessage(dto: CreateFeedbackDto): void {
    const fields: Record<string, string> = {};
    // Внутренняя заметка — комментарий или рекомендация для коллег; цель и запрос адресованы студенту.
    if (
      dto.visibility === Visibility.INTERNAL &&
      (dto.kind === FeedbackKind.SHORT_TERM_GOAL ||
        dto.kind === FeedbackKind.SELF_ASSESSMENT_REQUEST)
    ) {
      fields.visibility =
        'Цель и запрос самооценки адресованы студенту — они не бывают внутренними';
    }
    if (dto.dueDate && !DATED_FEEDBACK_KINDS.includes(dto.kind)) {
      fields.dueDate = 'Срок указывается только для цели и запроса самооценки';
    }
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте правильность заполнения формы', fields });
    }
  }

  private async findRootInScope(user: CurrentUser, id: string) {
    const scope = await this.scopes.forUser(user);
    const root = await this.prisma.feedback.findFirst({
      where: { id, parentId: null, student: this.scopes.studentsWhere(scope) },
      include: { student: { select: { userId: true } } },
    });
    if (!root) throw new NotFoundException('Сообщение не найдено');
    return root;
  }

  private async loadOne(id: string, forStudent: boolean): Promise<FeedbackDto> {
    const row = await this.prisma.feedback.findUniqueOrThrow({
      where: { id },
      include: feedbackInclude(forStudent),
    });
    const [item] = await this.toFeedbackList([row]);
    return item!;
  }

  /** Утверждённые маршруты студента с действующими этапами и контрольными точками. */
  private trajectoriesOf(studentId: string): Promise<TrajectoryOptionRow[]> {
    return this.prisma.trajectory.findMany({
      where: { studentId, status: { in: [...STUDENT_VISIBLE_TRAJECTORY_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: trajectoryOptionSelect,
    });
  }

  private async reflectionsOf(studentId: string): Promise<ReflectionDto[]> {
    const rows = await this.prisma.reflection.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: reflectionInclude,
    });
    return rows.map((row) => this.toReflection(row));
  }

  private async toFeedbackList(rows: FeedbackRow[]): Promise<FeedbackDto[]> {
    const people = await loadPeople(
      this.prisma,
      rows.flatMap((row) => [row.authorId, ...row.replies.map((reply) => reply.authorId)]),
    );
    return rows.map((row) => this.toFeedback(row, people));
  }

  private toFeedback(row: FeedbackRow, people: Map<string, { id: string; fullName: string }>) {
    const person = (id: string) => people.get(id) ?? unknownPerson(id);
    return {
      id: row.id,
      kind: row.kind as FeedbackKind,
      visibility: row.visibility as Visibility,
      body: row.body,
      dueDate: isoDate(row.dueDate),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      student: toStudentRef(row.student),
      author: person(row.authorId),
      fromStudent: row.authorId === row.student.userId,
      trajectory: toTrajectoryRef(row.trajectory),
      stage: row.stage,
      assignment: row.trajectoryAssignment
        ? { id: row.trajectoryAssignment.id, title: row.trajectoryAssignment.assignment.title }
        : null,
      replies: row.replies.map((reply) => ({
        id: reply.id,
        body: reply.body,
        visibility: reply.visibility as Visibility,
        author: person(reply.authorId),
        fromStudent: reply.authorId === row.student.userId,
        createdAt: reply.createdAt.toISOString(),
      })),
    } satisfies FeedbackDto;
  }

  private toReflection(row: ReflectionRow): ReflectionDto {
    return {
      id: row.id,
      trajectory: toTrajectoryRef(row.trajectory),
      stage: row.stage,
      checkpoint: row.checkpoint,
      selfAssessment: row.selfAssessment,
      achievements: row.achievements,
      difficulties: row.difficulties,
      nextSteps: row.nextSteps,
      createdAt: row.createdAt.toISOString(),
      student: toStudentRef(row.student),
    };
  }
}
