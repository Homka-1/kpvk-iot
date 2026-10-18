import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CabinetConsultationDto,
  CONSULTATION_OPEN_STATUSES,
  type ConsultationDto,
  ConsultationStatus,
  type CurrentUser,
  FEEDBACK_LIST_LIMIT,
} from '@iot/shared';
import { AccessScopeService } from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ReasonDto } from '../common/dto.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { loadPeople } from '../library/materials.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CabinetConsultationInputDto,
  ConsultationListQueryDto,
  CreateConsultationDto,
  HoldConsultationDto,
  ScheduleConsultationDto,
} from './feedback.dto.js';
import {
  findStudentInScope,
  formatDateTime,
  resolveBinding,
  studentSelect,
  toStudentRef,
  toTrajectoryRef,
  trajectorySelect,
} from './feedback-refs.js';

const consultationInclude = {
  student: { select: studentSelect },
  trajectory: { select: trajectorySelect },
} satisfies Prisma.ConsultationInclude;

type ConsultationRow = Prisma.ConsultationGetPayload<{ include: typeof consultationInclude }>;

/** Консультация для кабинета студента: внутренняя заметка не передаётся (FR-068). */
export function withoutInternalNote({
  internalNote: _internalNote,
  ...item
}: ConsultationDto): CabinetConsultationDto {
  return item;
}

/** Допуск на расхождение часов клиента и сервера при отметке «проведена». */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Начало сегодняшнего дня по местному времени сервера. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseScheduledAt(value: string): Date {
  const at = new Date(value);
  const fail = (message: string): never => {
    throw new BadRequestException({ message, fields: { scheduledAt: message } });
  };
  if (Number.isNaN(at.getTime())) return fail('Укажите дату и время консультации');
  if (at < startOfToday()) return fail('Дата консультации уже прошла');
  return at;
}

/**
 * Консультации (п. 4.9, FR-067): студент запрашивает, преподаватель назначает, проводит
 * (итог для студента и внутренняя заметка) или отменяет с причиной. Внутренняя заметка
 * отдаётся только сотрудникам; кабинет убирает её из ответа (FR-068).
 */
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Консультации в области пользователя (раздел «Обратная связь», история — FR-067). */
  async list(user: CurrentUser, query: ConsultationListQueryDto): Promise<ConsultationDto[]> {
    const scope = await this.scopes.forUser(user);
    const rows = await this.prisma.consultation.findMany({
      where: {
        student: {
          ...this.scopes.studentsWhere(scope),
          ...(query.groupId ? { currentGroupId: query.groupId } : {}),
        },
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.disciplineId
          ? { OR: [{ trajectoryId: null }, { trajectory: { disciplineId: query.disciplineId } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: FEEDBACK_LIST_LIMIT,
      include: consultationInclude,
    });
    return this.toList(rows);
  }

  /** Все консультации студента (вызывающий проверил доступ к студенту). */
  async forStudent(studentId: string): Promise<ConsultationDto[]> {
    const rows = await this.prisma.consultation.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: consultationInclude,
    });
    return this.toList(rows);
  }

  /** Назначение консультации преподавателем (в том числе из мониторинга, UC-05). */
  async create(
    user: CurrentUser,
    dto: CreateConsultationDto,
    key: string,
  ): Promise<ConsultationDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `consultation.create:${key}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const student = await findStudentInScope(
          this.prisma,
          this.scopes.studentsWhere(scope),
          dto.studentId,
        );
        if (student.archivedAt) {
          throw new ConflictException('Студент в архиве: консультации не назначаются');
        }
        const scheduledAt = parseScheduledAt(dto.scheduledAt);
        const { trajectoryId } = await resolveBinding(this.prisma, student.id, {
          trajectoryId: dto.trajectoryId,
        });
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.consultation.create({
            data: {
              studentId: student.id,
              teacherId: user.id,
              trajectoryId,
              status: ConsultationStatus.SCHEDULED,
              topic: dto.topic,
              scheduledAt,
            },
            include: consultationInclude,
          });
          await this.afterScheduled(tx, created, student.userId);
          return created;
        });
        return this.toOne(row);
      },
    );
    return response;
  }

  /** Назначение даты запрошенной консультации или перенос назначенной. */
  async schedule(
    user: CurrentUser,
    id: string,
    dto: ScheduleConsultationDto,
  ): Promise<ConsultationDto> {
    const current = await this.findOpenInScope(user, id);
    const scheduledAt = parseScheduledAt(dto.scheduledAt);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: { status: ConsultationStatus.SCHEDULED, scheduledAt, teacherId: user.id },
        include: consultationInclude,
      });
      await this.afterScheduled(tx, updated, current.student.userId);
      return updated;
    });
    return this.toOne(row);
  }

  /** Фиксация проведённой консультации: итог для студента и внутренняя заметка (FR-067, FR-068). */
  async hold(user: CurrentUser, id: string, dto: HoldConsultationDto): Promise<ConsultationDto> {
    const current = await this.findOpenInScope(user, id);
    const heldAt = dto.heldAt ? new Date(dto.heldAt) : new Date();
    if (Number.isNaN(heldAt.getTime()) || heldAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
      const message = 'Дата проведения не может быть в будущем';
      throw new BadRequestException({ message, fields: { heldAt: message } });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: {
          status: ConsultationStatus.HELD,
          heldAt,
          summary: dto.summary ?? null,
          internalNote: dto.internalNote ?? null,
          teacherId: current.teacherId ?? user.id,
        },
        include: consultationInclude,
      });
      await this.notifications.notify(tx, [current.student.userId], {
        type: 'consultation.held',
        title: 'Консультация проведена',
        body: dto.summary
          ? `«${current.topic}»: итог в разделе «Обратная связь»`
          : `«${current.topic}»`,
        link: '/student/feedback',
        entityType: 'consultation',
        entityId: id,
      });
      // Тексты итога и заметки в журнал не пишутся: журнал читает администратор (п. 2.1).
      await this.audit.log(
        {
          action: 'consultation.held',
          entityType: 'consultation',
          entityId: id,
          before: { status: current.status },
          after: { status: ConsultationStatus.HELD, studentId: current.studentId },
        },
        tx,
      );
      return updated;
    });
    return this.toOne(row);
  }

  async cancel(user: CurrentUser, id: string, dto: ReasonDto): Promise<ConsultationDto> {
    const current = await this.findOpenInScope(user, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: { status: ConsultationStatus.CANCELLED },
        include: consultationInclude,
      });
      await this.notifications.notify(tx, [current.student.userId], {
        type: 'consultation.cancelled',
        title: 'Консультация отменена',
        body: `«${current.topic}»`,
        link: '/student/feedback',
        entityType: 'consultation',
        entityId: id,
      });
      await this.audit.log(
        {
          action: 'consultation.cancelled',
          entityType: 'consultation',
          entityId: id,
          before: { status: current.status },
          after: { status: ConsultationStatus.CANCELLED, studentId: current.studentId },
          reason: dto.reason,
        },
        tx,
      );
      return updated;
    });
    return this.toOne(row);
  }

  /** Запрос консультации студентом (п. 4.9). Дату назначает преподаватель. */
  async request(
    user: CurrentUser,
    dto: CabinetConsultationInputDto,
    key: string,
  ): Promise<CabinetConsultationDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `consultation.request:${key}`,
      dto,
      async () => {
        const { id: studentId } = await this.scopes.ownStudent(user);
        const { trajectoryId } = await resolveBinding(this.prisma, studentId, {
          trajectoryId: dto.trajectoryId,
        });
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.consultation.create({
            data: {
              studentId,
              trajectoryId,
              status: ConsultationStatus.REQUESTED,
              topic: dto.topic,
              requestedById: user.id,
            },
            include: consultationInclude,
          });
          await this.notifications.notify(
            tx,
            await this.notifications.teachersFor(tx, studentId, trajectoryId),
            {
              type: 'consultation.requested',
              title: 'Студент запросил консультацию',
              body: `${toStudentRef(created.student).fullName} · «${dto.topic}»`,
              link: '/feedback?tab=consultations',
              entityType: 'consultation',
              entityId: created.id,
            },
          );
          await this.audit.log(
            {
              action: 'consultation.requested',
              entityType: 'consultation',
              entityId: created.id,
              after: { studentId },
            },
            tx,
          );
          return created;
        });
        return withoutInternalNote(await this.toOne(row));
      },
    );
    return response;
  }

  private async afterScheduled(
    tx: Prisma.TransactionClient,
    row: ConsultationRow,
    studentUserId: string | null,
  ): Promise<void> {
    await this.notifications.notify(tx, [studentUserId], {
      type: 'consultation.scheduled',
      title: 'Назначена консультация',
      body: `«${row.topic}» · ${formatDateTime(row.scheduledAt!)}`,
      link: '/student/feedback',
      entityType: 'consultation',
      entityId: row.id,
    });
    await this.audit.log(
      {
        action: 'consultation.scheduled',
        entityType: 'consultation',
        entityId: row.id,
        after: { studentId: row.studentId, scheduledAt: row.scheduledAt?.toISOString() },
      },
      tx,
    );
  }

  private async findOpenInScope(user: CurrentUser, id: string) {
    const scope = await this.scopes.forUser(user);
    const row = await this.prisma.consultation.findFirst({
      where: { id, student: this.scopes.studentsWhere(scope) },
      include: { student: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException('Консультация не найдена');
    if (!CONSULTATION_OPEN_STATUSES.includes(row.status as ConsultationStatus)) {
      throw new ConflictException('Консультация уже проведена или отменена');
    }
    return row;
  }

  private async toOne(row: ConsultationRow): Promise<ConsultationDto> {
    const [item] = await this.toList([row]);
    return item!;
  }

  private async toList(rows: ConsultationRow[]): Promise<ConsultationDto[]> {
    const people = await loadPeople(
      this.prisma,
      rows.map((row) => row.teacherId),
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status as ConsultationStatus,
      topic: row.topic,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      heldAt: row.heldAt?.toISOString() ?? null,
      summary: row.summary,
      internalNote: row.internalNote,
      teacher: row.teacherId ? (people.get(row.teacherId) ?? null) : null,
      requestedByStudent: row.requestedById !== null && row.requestedById === row.student.userId,
      student: toStudentRef(row.student),
      trajectory: toTrajectoryRef(row.trajectory),
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
