import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CurrentUser,
  type EnrollmentDto,
  LOGIN_PATTERN,
  type MotivationLevel,
  type MotivationProfileStatus,
  PARTICIPANT_CODE_HINT,
  PARTICIPANT_CODE_PATTERN,
  type ProfileFilterValue,
  RoleCode,
  type StudentCreatedDto,
  type StudentDetailsDto,
  type StudentImportPreviewDto,
  type StudentImportResultDto,
  type StudentImportRowDto,
  type StudentPageDto,
  type StudentSummaryDto,
  type SupportStatus,
  type TrajectoryStatus,
} from '@iot/shared';
import {
  type AccessScope,
  AccessScopeService,
  activeAssignmentWhere,
} from '../auth/access-scope.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.js';
import { AuditService } from '../audit/audit.service.js';
import { IdempotencyService } from '../common/idempotency.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseImportFile } from './student-import.js';
import type {
  CreateStudentDto,
  ImportRowInputDto,
  StudentListQueryDto,
  TransferStudentDto,
  UpdateStudentDto,
} from './students.dto.js';

/** Статусы ИОТ, при которых маршрут считается текущим. */
const CURRENT_TRAJECTORY_STATUSES: TrajectoryStatus[] = [
  'ACTIVE',
  'NEEDS_CORRECTION',
  'PENDING_APPROVAL',
  'DRAFT',
];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NAME_MAX = 100;

const summaryInclude = {
  currentGroup: { select: { id: true, name: true, course: true, specialty: true } },
  user: { select: { login: true } },
  currentMotivationProfile: { select: { status: true, level: true, proposedLevel: true } },
  trajectories: {
    where: { status: { in: CURRENT_TRAJECTORY_STATUSES } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, discipline: { select: { name: true } } },
  },
} satisfies Prisma.StudentInclude;

/**
 * Рабочий контекст из шапки (группа, дисциплина): студенты группы и студенты групп, где ведётся
 * дисциплина — для преподавателя только по его собственным закреплениям.
 */
export function contextWhere(
  scope: AccessScope,
  userId: string,
  filter: { groupId?: string; disciplineId?: string },
): Prisma.StudentWhereInput[] {
  const conditions: Prisma.StudentWhereInput[] = [];
  if (filter.groupId) conditions.push({ currentGroupId: filter.groupId });
  if (filter.disciplineId) {
    conditions.push({
      currentGroup: {
        teacherAssignments: {
          some: {
            disciplineId: filter.disciplineId,
            teacherId: scope.kind === 'assigned' ? userId : undefined,
            ...activeAssignmentWhere(),
          },
        },
      },
    });
  }
  return conditions;
}

/** Отбор по текущему профилю (FR-008): утверждённый уровень или статус без уровня. */
export function currentProfileWhere(filter: ProfileFilterValue): Prisma.StudentWhereInput {
  if (filter === 'PROPOSED' || filter === 'NEEDS_MORE_DIAGNOSTICS') {
    return { currentMotivationProfile: { is: { status: filter } } };
  }
  return {
    currentMotivationProfile: { is: { level: filter, status: { in: ['CONFIRMED', 'CORRECTED'] } } },
  };
}

const detailsInclude = {
  ...summaryInclude,
  enrollments: {
    orderBy: { startsAt: 'desc' },
    include: { group: { select: { id: true, name: true } } },
  },
} satisfies Prisma.StudentInclude;

type SummaryRow = Prisma.StudentGetPayload<{ include: typeof summaryInclude }>;
type DetailsRow = Prisma.StudentGetPayload<{ include: typeof detailsInclude }>;

function toSummary(row: SummaryRow): StudentSummaryDto {
  const profile = row.currentMotivationProfile;
  const trajectory = row.trajectories[0];
  return {
    id: row.id,
    participantCode: row.participantCode,
    lastName: row.lastName,
    firstName: row.firstName,
    middleName: row.middleName,
    login: row.user?.login ?? null,
    group: row.currentGroup,
    supportStatus: row.supportStatus as SupportStatus,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    motivationProfile: profile
      ? {
          status: profile.status as MotivationProfileStatus,
          level: profile.level as MotivationLevel | null,
          proposedLevel: profile.proposedLevel as MotivationLevel | null,
        }
      : null,
    // TODO(этап 13): прогресс, успеваемость, выполненные задания и активность — из результатов
    // заданий. До этого — «нет данных», а не нули (FR-005).
    currentTrajectory: trajectory
      ? {
          id: trajectory.id,
          status: trajectory.status as TrajectoryStatus,
          disciplineName: trajectory.discipline.name,
          progress: null,
        }
      : null,
    averageScore: null,
    completedAssignments: null,
    lastActivityAt: null,
  };
}

function toDetails(row: DetailsRow): StudentDetailsDto {
  return {
    ...toSummary(row),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    enrollments: row.enrollments.map((item): EnrollmentDto => ({
      id: item.id,
      group: item.group,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt?.toISOString() ?? null,
      reason: item.reason,
    })),
  };
}

/** Кандидат в студенты: ручной ввод (группа по id) или строка импорта (группа по названию). */
interface Candidate {
  lastName: string;
  firstName: string;
  middleName: string | null;
  groupId?: string;
  groupName?: string;
  participantCode: string | null;
  login: string | null;
}

interface ResolvedCandidate {
  lastName: string;
  firstName: string;
  middleName: string | null;
  groupId: string;
  participantCode: string | null;
  login: string | null;
}

type CandidateField =
  'lastName' | 'firstName' | 'middleName' | 'groupId' | 'participantCode' | 'login';
type CandidateError = { field: CandidateField; message: string };

const normalizeGroupName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function generateCode(): string {
  let code = 'S-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * Студенты (п. 4.2 ТЗ; FR-006–FR-011). Преподаватель работает только со студентами групп,
 * за которыми закреплён (FR-002); чужие студенты для него не существуют (ответ 404).
 * При создании студента создаётся учётная запись с ролью «Студент» и временным паролем.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scopes: AccessScopeService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(user: CurrentUser, query: StudentListQueryDto): Promise<StudentPageDto> {
    const scope = await this.scopes.forUser(user);
    const conditions: Prisma.StudentWhereInput[] = [
      this.scopes.studentsWhere(scope),
      { archivedAt: query.archived ? { not: null } : null },
    ];
    const search = query.search?.trim();
    if (search) {
      conditions.push({
        OR: [
          { lastName: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { participantCode: { contains: search, mode: 'insensitive' } },
          { currentGroup: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    conditions.push(...contextWhere(scope, user.id, query));
    if (query.profile) conditions.push(currentProfileWhere(query.profile));
    if (query.trajectoryStatus) {
      conditions.push({ trajectories: { some: { status: query.trajectoryStatus } } });
    }
    if (query.hasDifficulties !== undefined) {
      const difficulty: Prisma.FeedbackWhereInput = { kind: 'DIFFICULTY_REPORT', resolvedAt: null };
      conditions.push({
        feedback: query.hasDifficulties ? { some: difficulty } : { none: difficulty },
      });
    }

    const where: Prisma.StudentWhereInput = { AND: conditions };
    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { participantCode: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(user: CurrentUser, id: string): Promise<StudentDetailsDto> {
    const scope = await this.scopes.forUser(user);
    return toDetails(await this.findInScope(scope, id));
  }

  async create(
    user: CurrentUser,
    dto: CreateStudentDto,
    idempotencyKey: string,
  ): Promise<StudentCreatedDto> {
    const { response } = await this.idempotency.run(
      user.id,
      `student.create:${idempotencyKey}`,
      dto,
      async () => {
        const scope = await this.scopes.forUser(user);
        const candidate: Candidate = {
          lastName: dto.lastName,
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          groupId: dto.groupId,
          participantCode: dto.participantCode ?? null,
          login: dto.login ?? null,
        };
        const [result] = await this.validate(scope, [candidate]);
        if (result!.errors.length > 0) {
          throw new BadRequestException({
            message: 'Проверьте правильность заполнения формы',
            fields: Object.fromEntries(result!.errors.map((error) => [error.field, error.message])),
          });
        }
        const [created] = await this.createAccounts([result!.resolved!], user.id, 'manual');
        return created!;
      },
      (created) => ({ ...created, temporaryPassword: null }),
    );
    return response;
  }

  async previewImport(
    user: CurrentUser,
    file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<StudentImportPreviewDto> {
    if (!file) throw new BadRequestException('Выберите файл CSV или XLSX');
    const parsed = await parseImportFile(file.buffer, file.originalname);
    const scope = await this.scopes.forUser(user);
    const candidates = parsed.rows.map(({ values }) => ({
      lastName: values.lastName,
      firstName: values.firstName,
      middleName: values.middleName || null,
      groupName: values.groupName,
      participantCode: values.participantCode ? values.participantCode.toUpperCase() : null,
      login: values.login ? values.login.toLowerCase() : null,
    }));
    const results = await this.validate(scope, candidates);
    const rows = parsed.rows.map((row, index): StudentImportRowDto => ({
      line: row.line,
      ...candidates[index]!,
      groupName: row.values.groupName,
      errors: results[index]!.errors.map((error) => error.message),
    }));
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    return {
      rows,
      validCount: rows.length - invalidCount,
      invalidCount,
      fileErrors: parsed.fileErrors,
    };
  }

  /** Импорт подтверждённых строк: все строки проверяются заново, при любой ошибке ничего не создаётся. */
  async commitImport(
    user: CurrentUser,
    rows: ImportRowInputDto[],
    idempotencyKey: string,
  ): Promise<StudentImportResultDto> {
    const { response, replayed } = await this.idempotency.run(
      user.id,
      `student.import:${idempotencyKey}`,
      rows,
      async () => {
        const scope = await this.scopes.forUser(user);
        const candidates = rows.map((row) => ({
          lastName: row.lastName.trim(),
          firstName: row.firstName.trim(),
          middleName: row.middleName?.trim() || null,
          groupName: row.groupName,
          participantCode: row.participantCode?.trim().toUpperCase() || null,
          login: row.login?.trim().toLowerCase() || null,
        }));
        const results = await this.validate(scope, candidates);
        const fields: Record<string, string> = {};
        results.forEach((result, index) => {
          if (result.errors.length > 0) {
            fields[`rows.${rows[index]!.line}`] = result.errors
              .map((error) => error.message)
              .join('; ');
          }
        });
        if (Object.keys(fields).length > 0) {
          throw new BadRequestException({
            message: 'Данные изменились после предпросмотра. Загрузите файл заново',
            fields,
          });
        }
        const created = await this.createAccounts(
          results.map((result) => result.resolved!),
          user.id,
          'import',
        );
        return { created, replayed: false };
      },
      (result) => ({
        ...result,
        created: result.created.map((item) => ({ ...item, temporaryPassword: null })),
      }),
    );
    return replayed ? { ...response, replayed: true } : response;
  }

  async update(user: CurrentUser, id: string, dto: UpdateStudentDto): Promise<StudentDetailsDto> {
    const scope = await this.scopes.forUser(user);
    const existing = await this.findInScope(scope, id);
    const data = {
      lastName: dto.lastName,
      firstName: dto.firstName,
      middleName: dto.middleName ?? null,
    };
    return this.prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data });
      if (existing.userId) await tx.user.update({ where: { id: existing.userId }, data });
      await this.audit.log(
        {
          action: 'student.updated',
          entityType: 'student',
          entityId: id,
          before: {
            lastName: existing.lastName,
            firstName: existing.firstName,
            middleName: existing.middleName,
          },
          after: data,
        },
        tx,
      );
      return toDetails(
        await tx.student.findUniqueOrThrow({ where: { id }, include: detailsInclude }),
      );
    });
  }

  /** Перевод в другую группу (FR-010): прежняя запись о группе закрывается, история сохраняется. */
  async transfer(
    user: CurrentUser,
    id: string,
    dto: TransferStudentDto,
  ): Promise<StudentDetailsDto> {
    const scope = await this.scopes.forUser(user);
    const existing = await this.findInScope(scope, id);
    if (existing.archivedAt)
      throw new ConflictException('Студент в архиве. Сначала верните его из архива');
    if (existing.currentGroupId === dto.groupId) {
      throw new ConflictException('Студент уже состоит в этой группе');
    }
    await this.assertGroupAvailable(scope, dto.groupId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: { studentId: id, endsAt: null },
        data: { endsAt: now },
      });
      await tx.enrollment.create({
        data: {
          studentId: id,
          groupId: dto.groupId,
          startsAt: now,
          reason: dto.reason,
          createdById: user.id,
        },
      });
      await tx.student.update({ where: { id }, data: { currentGroupId: dto.groupId } });
      await this.audit.log(
        {
          action: 'student.transferred',
          entityType: 'student',
          entityId: id,
          before: { groupId: existing.currentGroupId },
          after: { groupId: dto.groupId },
          reason: dto.reason,
        },
        tx,
      );
      return toDetails(
        await tx.student.findUniqueOrThrow({ where: { id }, include: detailsInclude }),
      );
    });
  }

  /**
   * Архивирование (FR-011): студент скрывается из рабочих списков, вход в систему закрывается.
   * Ничего не удаляется — исследовательские данные сохраняются (сроки хранения — open-questions, 4).
   */
  async archive(user: CurrentUser, id: string, reason: string): Promise<StudentDetailsDto> {
    const scope = await this.scopes.forUser(user);
    const existing = await this.findInScope(scope, id);
    if (existing.archivedAt) throw new ConflictException('Студент уже в архиве');
    return this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: { archivedAt: new Date(), archiveReason: reason },
      });
      if (existing.userId) {
        await tx.user.update({ where: { id: existing.userId }, data: { status: 'ARCHIVED' } });
        await tx.authSession.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.log(
        { action: 'student.archived', entityType: 'student', entityId: id, reason },
        tx,
      );
      return toDetails(
        await tx.student.findUniqueOrThrow({ where: { id }, include: detailsInclude }),
      );
    });
  }

  async restore(user: CurrentUser, id: string): Promise<StudentDetailsDto> {
    const scope = await this.scopes.forUser(user);
    const existing = await this.findInScope(scope, id);
    if (!existing.archivedAt) throw new ConflictException('Студент не в архиве');
    if (existing.currentGroupId) {
      const group = await this.prisma.group.findUnique({ where: { id: existing.currentGroupId } });
      if (group?.archivedAt) {
        throw new ConflictException(
          'Группа студента в архиве. Попросите администратора вернуть группу',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: { archivedAt: null, archiveReason: null } });
      if (existing.userId) {
        await tx.user.updateMany({
          where: { id: existing.userId, status: 'ARCHIVED' },
          data: { status: 'ACTIVE' },
        });
      }
      await this.audit.log({ action: 'student.restored', entityType: 'student', entityId: id }, tx);
      return toDetails(
        await tx.student.findUniqueOrThrow({ where: { id }, include: detailsInclude }),
      );
    });
  }

  /** Новый временный пароль студента, например если он забыл свой. Все его сессии завершаются. */
  async resetPassword(
    user: CurrentUser,
    id: string,
  ): Promise<{ login: string; temporaryPassword: string }> {
    const scope = await this.scopes.forUser(user);
    const existing = await this.findInScope(scope, id);
    if (existing.archivedAt) throw new ConflictException('Студент в архиве');
    if (!existing.userId || !existing.user)
      throw new ConflictException('У студента нет учётной записи');
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.userId! },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.authSession.updateMany({
        where: { userId: existing.userId!, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { action: 'student.password_reset', entityType: 'student', entityId: id },
        tx,
      );
    });
    return { login: existing.user.login, temporaryPassword };
  }

  // ── Внутреннее ──

  private async findInScope(scope: AccessScope, id: string): Promise<DetailsRow> {
    const student = await this.prisma.student.findFirst({
      where: { id, ...this.scopes.studentsWhere(scope) },
      include: detailsInclude,
    });
    if (!student) throw new NotFoundException('Студент не найден');
    return student;
  }

  private async assertGroupAvailable(scope: AccessScope, groupId: string): Promise<void> {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    const inScope = scope.kind === 'all' || scope.groupIds.includes(groupId);
    if (!group || group.archivedAt || !inScope) {
      throw new BadRequestException({
        message: 'Проверьте правильность заполнения формы',
        fields: { groupId: 'Группа не найдена среди ваших действующих групп' },
      });
    }
  }

  /** Проверка кандидатов: обязательные поля, группа в области доступа, уникальность кода и логина. */
  private async validate(
    scope: AccessScope,
    candidates: Candidate[],
  ): Promise<{ errors: CandidateError[]; resolved: ResolvedCandidate | null }[]> {
    const groups = await this.prisma.group.findMany({
      where: { archivedAt: null, id: scope.kind === 'all' ? undefined : { in: scope.groupIds } },
      select: { id: true, name: true },
    });
    const groupById = new Map(groups.map((group) => [group.id, group.id]));
    const groupByName = new Map(groups.map((group) => [normalizeGroupName(group.name), group.id]));

    const effectiveLogin = (candidate: Candidate) =>
      candidate.login ?? candidate.participantCode?.toLowerCase() ?? null;
    const codes = candidates.map((c) => c.participantCode).filter((code): code is string => !!code);
    const logins = candidates.map(effectiveLogin).filter((login): login is string => !!login);
    const [takenCodes, takenLogins] = await Promise.all([
      this.prisma.student.findMany({
        where: { participantCode: { in: codes } },
        select: { participantCode: true },
      }),
      this.prisma.user.findMany({ where: { login: { in: logins } }, select: { login: true } }),
    ]);
    const codeInDb = new Set(takenCodes.map((row) => row.participantCode));
    const loginInDb = new Set(takenLogins.map((row) => row.login));
    const count = (values: string[]) =>
      values.reduce(
        (map, value) => map.set(value, (map.get(value) ?? 0) + 1),
        new Map<string, number>(),
      );
    const codeCount = count(codes);
    const loginCount = count(logins);

    return candidates.map((candidate) => {
      const errors: CandidateError[] = [];
      const required = (field: 'lastName' | 'firstName', value: string, label: string) => {
        if (!value.trim()) errors.push({ field, message: `Не указано: ${label}` });
        else if (value.length > NAME_MAX)
          errors.push({ field, message: `${label}: не более ${NAME_MAX} символов` });
      };
      required('lastName', candidate.lastName, 'фамилия');
      required('firstName', candidate.firstName, 'имя');
      if (candidate.middleName && candidate.middleName.length > NAME_MAX) {
        errors.push({ field: 'middleName', message: `Отчество: не более ${NAME_MAX} символов` });
      }

      let groupId: string | undefined;
      if (candidate.groupId !== undefined) {
        groupId = groupById.get(candidate.groupId);
        if (!groupId)
          errors.push({
            field: 'groupId',
            message: 'Группа не найдена среди ваших действующих групп',
          });
      } else if (!candidate.groupName?.trim()) {
        errors.push({ field: 'groupId', message: 'Не указана группа' });
      } else {
        groupId = groupByName.get(normalizeGroupName(candidate.groupName));
        if (!groupId) {
          errors.push({
            field: 'groupId',
            message: `Группа «${candidate.groupName.trim()}» не найдена среди ваших действующих групп`,
          });
        }
      }

      const code = candidate.participantCode;
      if (code) {
        if (!PARTICIPANT_CODE_PATTERN.test(code))
          errors.push({ field: 'participantCode', message: PARTICIPANT_CODE_HINT });
        else if (codeInDb.has(code))
          errors.push({ field: 'participantCode', message: `Код участника «${code}» уже занят` });
        else if ((codeCount.get(code) ?? 0) > 1) {
          errors.push({
            field: 'participantCode',
            message: `Код участника «${code}» повторяется в файле`,
          });
        }
      }
      const login = effectiveLogin(candidate);
      if (candidate.login && !LOGIN_PATTERN.test(candidate.login)) {
        errors.push({
          field: 'login',
          message: 'Логин: 3–64 символа, латинские буквы, цифры, точка, дефис, подчёркивание',
        });
      } else if (login && loginInDb.has(login)) {
        errors.push({
          field: 'login',
          message: `Логин «${login}» уже занят — укажите другой логин`,
        });
      } else if (login && (loginCount.get(login) ?? 0) > 1) {
        errors.push({ field: 'login', message: `Логин «${login}» повторяется в файле` });
      }

      return {
        errors,
        resolved:
          errors.length === 0
            ? {
                lastName: candidate.lastName.trim(),
                firstName: candidate.firstName.trim(),
                middleName: candidate.middleName?.trim() || null,
                groupId: groupId!,
                participantCode: code,
                login,
              }
            : null,
      };
    });
  }

  /** Коды участников для строк без кода: случайные, не совпадающие с занятыми кодами и логинами. */
  private async assignCodes(
    items: ResolvedCandidate[],
  ): Promise<{ code: string; login: string }[]> {
    const reserved = new Set(
      items.flatMap((item) => [item.participantCode, item.login]).filter(Boolean),
    );
    const result = items.map((item) => ({ code: item.participantCode, login: item.login }));
    for (let attempt = 0; attempt < 10; attempt++) {
      const pending = result.filter((item) => !item.code);
      if (pending.length === 0) break;
      const proposals = pending.map(() => {
        let code = generateCode();
        while (reserved.has(code) || reserved.has(code.toLowerCase())) code = generateCode();
        return code;
      });
      const lowered = proposals.map((code) => code.toLowerCase());
      const [codeClash, loginClash] = await Promise.all([
        this.prisma.student.findMany({
          where: { participantCode: { in: proposals } },
          select: { participantCode: true },
        }),
        this.prisma.user.findMany({ where: { login: { in: lowered } }, select: { login: true } }),
      ]);
      const busy = new Set([
        ...codeClash.map((row) => row.participantCode),
        ...loginClash.map((row) => row.login.toUpperCase()),
      ]);
      pending.forEach((item, index) => {
        const code = proposals[index]!;
        if (busy.has(code)) return;
        item.code = code;
        item.login ??= code.toLowerCase();
        reserved.add(code).add(code.toLowerCase());
      });
    }
    if (result.some((item) => !item.code || !item.login)) {
      throw new ConflictException('Не удалось сформировать коды участников. Повторите попытку');
    }
    return result as { code: string; login: string }[];
  }

  private async createAccounts(
    items: ResolvedCandidate[],
    actorId: string,
    source: 'manual' | 'import',
  ): Promise<StudentCreatedDto[]> {
    const identities = await this.assignCodes(items);
    const passwords = items.map(() => generateTemporaryPassword());
    const hashes = await Promise.all(passwords.map((password) => hashPassword(password)));
    const ids = await this.prisma.$transaction(
      async (tx) => {
        const role = await tx.role.findUniqueOrThrow({ where: { code: RoleCode.STUDENT } });
        const created: string[] = [];
        for (const [index, item] of items.entries()) {
          const { code, login } = identities[index]!;
          const names = {
            lastName: item.lastName,
            firstName: item.firstName,
            middleName: item.middleName,
          };
          const account = await tx.user.create({
            data: {
              ...names,
              login,
              passwordHash: hashes[index]!,
              mustChangePassword: true,
              createdById: actorId,
              roles: { create: { roleId: role.id, grantedById: actorId } },
            },
          });
          const student = await tx.student.create({
            data: {
              ...names,
              userId: account.id,
              participantCode: code,
              currentGroupId: item.groupId,
              createdById: actorId,
              enrollments: { create: { groupId: item.groupId, createdById: actorId } },
            },
          });
          await this.audit.log(
            {
              action: 'student.created',
              entityType: 'student',
              entityId: student.id,
              after: { participantCode: code, login, groupId: item.groupId, source },
            },
            tx,
          );
          created.push(student.id);
        }
        if (source === 'import') {
          await this.audit.log(
            { action: 'student.imported', entityType: 'student', after: { count: created.length } },
            tx,
          );
        }
        return created;
      },
      { timeout: 120_000 },
    );
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      include: detailsInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id, index) => ({
      student: toDetails(byId.get(id)!),
      login: identities[index]!.login,
      temporaryPassword: passwords[index]!,
    }));
  }
}
