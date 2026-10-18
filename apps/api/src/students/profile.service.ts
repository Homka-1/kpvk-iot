import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CurrentUser,
  formatFullName,
  type ObservationDto,
  type OwnProfileDto,
  type PersonRef,
  type ProfileDisciplineDto,
  STUDENT_HISTORY_LABELS,
  type StudentHistoryItemDto,
  type StudentProfileDto,
  type StudentVisibleObservationDto,
  Visibility,
} from '@iot/shared';
import {
  type AccessScope,
  AccessScopeService,
  activeAssignmentWhere,
} from '../auth/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import type { PedagogicalObservation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateObservationDto, UpdateObservationDto } from './profile.dto.js';
import { StudentsService } from './students.service.js';

/** Сколько последних событий показывает вкладка «История». */
const HISTORY_LIMIT = 200;
const HISTORY_ACTIONS = Object.keys(STUDENT_HISTORY_LABELS);

type ObservationRow = PedagogicalObservation & { discipline: { id: string; name: string } | null };

const observationInclude = { discipline: { select: { id: true, name: true } } } as const;

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const unknownPerson = (id: string): PersonRef => ({ id, fullName: 'Нет данных' });

/**
 * Профиль студента (п. 4.3, 6.3): общие сведения, педагогические наблюдения (FR-014), история
 * и «Мой профиль» студента. Служебные наблюдения (INTERNAL) отдаются только сотрудникам с доступом
 * к студенту; студент получает только наблюдения, открытые ему (FR-016). Проверка — здесь,
 * на сервере, а не в интерфейсе.
 */
@Injectable()
export class StudentProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
    private readonly students: StudentsService,
  ) {}

  async getProfile(user: CurrentUser, id: string): Promise<StudentProfileDto> {
    const details = await this.students.get(user, id);
    const extra = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      select: { interests: true, currentGroupId: true },
    });
    return {
      ...details,
      interests: extra.interests,
      disciplines: await this.groupDisciplines(extra.currentGroupId),
    };
  }

  async listObservations(user: CurrentUser, studentId: string): Promise<ObservationDto[]> {
    await this.assertStudentInScope(await this.scopes.forUser(user), studentId);
    const rows = await this.prisma.pedagogicalObservation.findMany({
      where: { studentId },
      orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
      include: observationInclude,
    });
    const authors = await this.people(rows.map((row) => row.authorId));
    return rows.map((row) => this.toObservation(row, authors, user.id));
  }

  async createObservation(
    user: CurrentUser,
    studentId: string,
    dto: CreateObservationDto,
    key: string,
  ): Promise<ObservationDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.assertStudentInScope(scope, studentId);
    const { response } = await this.idempotency.run(
      user.id,
      `observation.create:${studentId}:${key}`,
      dto,
      async () => {
        await this.validateObservation(scope, student.currentGroupId, dto);
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.pedagogicalObservation.create({
            data: {
              studentId,
              authorId: user.id,
              observedAt: new Date(`${dto.observedAt}T00:00:00Z`),
              text: dto.text,
              visibility: dto.visibility,
              disciplineId: dto.disciplineId ?? null,
            },
            include: observationInclude,
          });
          // Текст наблюдения в журнал не пишется: журнал читает администратор (п. 2.1).
          await this.audit.log(
            {
              action: 'observation.created',
              entityType: 'pedagogical_observation',
              entityId: created.id,
              after: { studentId, visibility: created.visibility },
            },
            tx,
          );
          return created;
        });
        return this.toObservation(row, await this.people([row.authorId]), user.id);
      },
    );
    return response;
  }

  async updateObservation(
    user: CurrentUser,
    studentId: string,
    observationId: string,
    dto: UpdateObservationDto,
  ): Promise<ObservationDto> {
    const scope = await this.scopes.forUser(user);
    const student = await this.assertStudentInScope(scope, studentId);
    const existing = await this.prisma.pedagogicalObservation.findFirst({
      where: { id: observationId, studentId },
    });
    if (!existing) throw new NotFoundException('Наблюдение не найдено');
    if (existing.authorId !== user.id) {
      throw new ForbiddenException('Изменять наблюдение может только его автор');
    }
    await this.validateObservation(scope, student.currentGroupId, dto);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pedagogicalObservation.update({
        where: { id: observationId },
        data: {
          observedAt: new Date(`${dto.observedAt}T00:00:00Z`),
          text: dto.text,
          visibility: dto.visibility,
          disciplineId: dto.disciplineId ?? null,
        },
        include: observationInclude,
      });
      await this.audit.log(
        {
          action: 'observation.updated',
          entityType: 'pedagogical_observation',
          entityId: observationId,
          before: { studentId, visibility: existing.visibility },
          after: { studentId, visibility: updated.visibility },
        },
        tx,
      );
      return updated;
    });
    return this.toObservation(row, await this.people([row.authorId]), user.id);
  }

  /** Значимые изменения по студенту из журнала аудита (вкладка «История»). */
  async history(user: CurrentUser, studentId: string): Promise<StudentHistoryItemDto[]> {
    await this.assertStudentInScope(await this.scopes.forUser(user), studentId);
    const ids = { where: { studentId }, select: { id: true } } as const;
    const [
      observations,
      sessions,
      profiles,
      trajectories,
      assignments,
      feedback,
      consultations,
      reflections,
    ] = await Promise.all([
      this.prisma.pedagogicalObservation.findMany(ids),
      this.prisma.diagnosticSession.findMany(ids),
      this.prisma.motivationProfile.findMany(ids),
      this.prisma.trajectory.findMany(ids),
      this.prisma.trajectoryAssignment.findMany(ids),
      this.prisma.feedback.findMany({ where: { studentId, parentId: null }, select: { id: true } }),
      this.prisma.consultation.findMany(ids),
      this.prisma.reflection.findMany(ids),
    ]);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        action: { in: HISTORY_ACTIONS },
        OR: [
          { entityType: 'student', entityId: studentId },
          {
            entityType: 'pedagogical_observation',
            entityId: { in: observations.map((item) => item.id) },
          },
          { entityType: 'diagnostic_session', entityId: { in: sessions.map((item) => item.id) } },
          { entityType: 'motivation_profile', entityId: { in: profiles.map((item) => item.id) } },
          { entityType: 'trajectory', entityId: { in: trajectories.map((item) => item.id) } },
          {
            entityType: 'trajectory_assignment',
            entityId: { in: assignments.map((item) => item.id) },
          },
          { entityType: 'feedback', entityId: { in: feedback.map((item) => item.id) } },
          { entityType: 'consultation', entityId: { in: consultations.map((item) => item.id) } },
          { entityType: 'reflection', entityId: { in: reflections.map((item) => item.id) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: {
        actor: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      },
    });
    return logs.map((log) => ({
      id: log.id,
      at: log.createdAt.toISOString(),
      action: log.action,
      label: STUDENT_HISTORY_LABELS[log.action] ?? log.action,
      actor: log.actor ? { id: log.actor.id, fullName: formatFullName(log.actor) } : null,
      reason: log.reason,
    }));
  }

  /** «Мой профиль»: только данные студента, связанного с текущей учётной записью. */
  async getOwn(user: CurrentUser): Promise<OwnProfileDto> {
    const student = await this.ownStudent(user);
    const [rows, decided] = await Promise.all([
      this.prisma.pedagogicalObservation.findMany({
        where: { studentId: student.id, visibility: Visibility.STUDENT_VISIBLE },
        orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
        include: observationInclude,
      }),
      // Студенту — только утверждённая интерпретация: без уровня, оснований и причин (FR-016).
      this.prisma.motivationProfile.findFirst({
        where: { studentId: student.id, status: { in: ['CONFIRMED', 'CORRECTED'] } },
        orderBy: { decidedAt: 'desc' },
        select: { studentSummary: true, decidedAt: true },
      }),
    ]);
    const authors = await this.people(rows.map((row) => row.authorId));
    return {
      participantCode: student.participantCode,
      lastName: student.lastName,
      firstName: student.firstName,
      middleName: student.middleName,
      group: student.currentGroup,
      disciplines: await this.groupDisciplines(student.currentGroupId),
      interests: student.interests,
      observations: rows.map((row): StudentVisibleObservationDto => ({
        id: row.id,
        observedAt: isoDate(row.observedAt),
        text: row.text,
        discipline: row.discipline,
        author: authors.get(row.authorId) ?? unknownPerson(row.authorId),
      })),
      motivationProfile: decided?.decidedAt
        ? { studentSummary: decided.studentSummary, decidedAt: decided.decidedAt.toISOString() }
        : null,
    };
  }

  async updateOwnInterests(user: CurrentUser, interests: string): Promise<OwnProfileDto> {
    const student = await this.ownStudent(user);
    const value = interests === '' ? null : interests;
    if (value !== student.interests) {
      await this.prisma.$transaction(async (tx) => {
        await tx.student.update({ where: { id: student.id }, data: { interests: value } });
        await this.audit.log(
          { action: 'student.interests_updated', entityType: 'student', entityId: student.id },
          tx,
        );
      });
    }
    return this.getOwn(user);
  }

  private async ownStudent(user: CurrentUser) {
    const student = await this.prisma.student.findUnique({
      where: { userId: user.id },
      include: {
        currentGroup: { select: { id: true, name: true, course: true, specialty: true } },
      },
    });
    if (!student || student.archivedAt) {
      throw new NotFoundException('Карточка студента для этой учётной записи не найдена');
    }
    return student;
  }

  private async assertStudentInScope(scope: AccessScope, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ...this.scopes.studentsWhere(scope) },
      select: { id: true, currentGroupId: true },
    });
    if (!student) throw new NotFoundException('Студент не найден');
    return student;
  }

  private async validateObservation(
    scope: AccessScope,
    groupId: string | null,
    dto: CreateObservationDto,
  ): Promise<void> {
    const fields: Record<string, string> = {};
    // Запас в 14 часов: дата «сегодня» у пользователя восточнее UTC уже наступила.
    const latest = isoDate(new Date(Date.now() + 14 * 60 * 60 * 1000));
    const parsed = new Date(`${dto.observedAt}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || isoDate(parsed) !== dto.observedAt) {
      fields.observedAt = 'Укажите дату наблюдения';
    } else if (dto.observedAt > latest) {
      fields.observedAt = 'Дата наблюдения не может быть в будущем';
    }
    if (dto.disciplineId) {
      const discipline = await this.prisma.discipline.findUnique({
        where: { id: dto.disciplineId },
        select: { archivedAt: true },
      });
      const inScope =
        scope.kind === 'all' ||
        scope.pairs.some(
          (pair) => pair.disciplineId === dto.disciplineId && pair.groupId === groupId,
        );
      if (!discipline || discipline.archivedAt || !inScope) {
        fields.disciplineId = 'Выберите дисциплину, которую вы ведёте в группе студента';
      }
    }
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ message: 'Проверьте правильность заполнения формы', fields });
    }
  }

  /** Дисциплины группы и преподаватели по действующим закреплениям. */
  private async groupDisciplines(groupId: string | null): Promise<ProfileDisciplineDto[]> {
    if (!groupId) return [];
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { groupId, ...activeAssignmentWhere(), discipline: { archivedAt: null } },
      include: {
        discipline: { select: { id: true, name: true } },
        teacher: { select: { id: true, lastName: true, firstName: true, middleName: true } },
      },
    });
    const byDiscipline = new Map<string, ProfileDisciplineDto>();
    for (const item of assignments) {
      const entry = byDiscipline.get(item.disciplineId) ?? { ...item.discipline, teachers: [] };
      if (!entry.teachers.some((teacher) => teacher.id === item.teacherId)) {
        entry.teachers.push({ id: item.teacher.id, fullName: formatFullName(item.teacher) });
      }
      byDiscipline.set(item.disciplineId, entry);
    }
    return [...byDiscipline.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  private async people(ids: string[]): Promise<Map<string, PersonRef>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, lastName: true, firstName: true, middleName: true },
    });
    return new Map(users.map((item) => [item.id, { id: item.id, fullName: formatFullName(item) }]));
  }

  private toObservation(
    row: ObservationRow,
    authors: Map<string, PersonRef>,
    userId: string,
  ): ObservationDto {
    return {
      id: row.id,
      observedAt: isoDate(row.observedAt),
      text: row.text,
      visibility: row.visibility as Visibility,
      discipline: row.discipline,
      author: authors.get(row.authorId) ?? unknownPerson(row.authorId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      canEdit: row.authorId === userId,
    };
  }
}
