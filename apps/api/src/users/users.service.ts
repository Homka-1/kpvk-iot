import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatFullName,
  type Permission,
  PERMISSION_DESCRIPTIONS,
  RoleCode,
  SENSITIVE_PERMISSIONS,
} from '@iot/shared';
import { AuditService } from '../audit/audit.service.js';
import { currentUserInclude, toCurrentUser } from '../auth/current-user.js';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateUserDto,
  GrantPermissionDto,
  TemporaryPasswordDto,
  UpdateUserDto,
  UserDetailsDto,
  UserListQueryDto,
  UserPageDto,
  UserSummaryDto,
} from './users.dto.js';

const SELF_FORBIDDEN =
  'Собственные роли, разрешения, блокировку и пароль через администрирование не изменяют. ' +
  'Обратитесь к другому администратору';

type Db = Prisma.TransactionClient | PrismaService;

function detailsInclude(now: Date) {
  const base = currentUserInclude(now);
  return {
    ...base,
    permissions: {
      ...base.permissions,
      include: {
        permission: true,
        grantedBy: { select: { lastName: true, firstName: true, middleName: true } },
      },
    },
  } satisfies Prisma.UserInclude;
}

type UserWithDetails = Prisma.UserGetPayload<{ include: ReturnType<typeof detailsInclude> }>;

function toSummary(user: {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  email: string | null;
  status: string;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  createdAt: Date;
  roles: { role: { code: string } }[];
}): UserSummaryDto {
  return {
    id: user.id,
    login: user.login,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    email: user.email,
    status: user.status,
    roles: user.roles.map(({ role }) => role.code as RoleCode).sort(),
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

function toDetails(user: UserWithDetails): UserDetailsDto {
  return {
    ...toSummary(user),
    grantedPermissions: user.permissions.map((grant) => ({
      permission: grant.permission.code as Permission,
      description: PERMISSION_DESCRIPTIONS[grant.permission.code as Permission] ?? '',
      reason: grant.reason,
      expiresAt: grant.expiresAt,
      grantedAt: grant.grantedAt,
      grantedByName: grant.grantedBy ? formatFullName(grant.grantedBy) : null,
    })),
    effectivePermissions: toCurrentUser(user).permissions,
  };
}

/** Снимок учётной записи для журнала аудита (без пароля и служебных счётчиков). */
function auditSnapshot(user: {
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  email: string | null;
  status: string;
}) {
  return {
    login: user.login,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: user.middleName,
    email: user.email,
    status: user.status,
  };
}

/**
 * Учётные записи сотрудников (раздел «Администрирование»). Все изменения пишутся в журнал
 * аудита в той же транзакции. Действия над собственной учётной записью запрещены, чтобы
 * администратор не мог выдать себе доступ к конфиденциальным данным (п. 2.1 ТЗ).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UserListQueryDto): Promise<UserPageDto> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.role ? { some: { role: { code: query.role } } } : undefined,
      OR: search
        ? (['login', 'lastName', 'firstName', 'middleName', 'email'] as const).map((field) => ({
            [field]: { contains: search, mode: 'insensitive' },
          }))
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { roles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, db: Db = this.prisma): Promise<UserDetailsDto> {
    const user = await db.user.findUnique({ where: { id }, include: detailsInclude(new Date()) });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return toDetails(user);
  }

  async create(dto: CreateUserDto, actorId: string): Promise<TemporaryPasswordDto> {
    await this.assertUnique(dto.login, dto.email ?? null);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({ where: { code: { in: dto.roles } } });
      const created = await tx.user.create({
        data: {
          login: dto.login,
          email: dto.email ?? null,
          lastName: dto.lastName,
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          passwordHash,
          mustChangePassword: true,
          createdById: actorId,
          roles: { create: roles.map((role) => ({ roleId: role.id, grantedById: actorId })) },
        },
      });
      await this.audit.log(
        {
          action: 'user.created',
          entityType: 'user',
          entityId: created.id,
          after: { ...auditSnapshot(created), roles: [...dto.roles].sort() },
        },
        tx,
      );
      return this.get(created.id, tx);
    });
    return { user, temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDetailsDto> {
    const existing = await this.findOrThrow(id);
    this.assertNotStudent(existing);
    if (dto.email && dto.email !== existing.email) await this.assertUnique(null, dto.email, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          lastName: dto.lastName,
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          email: dto.email ?? null,
        },
      });
      await this.audit.log(
        {
          action: 'user.updated',
          entityType: 'user',
          entityId: id,
          before: auditSnapshot(existing),
          after: auditSnapshot(updated),
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  async block(id: string, reason: string, actorId: string): Promise<UserDetailsDto> {
    this.assertNotSelf(id, actorId);
    const existing = await this.findOrThrow(id);
    if (existing.status === 'BLOCKED')
      throw new ConflictException('Учётная запись уже заблокирована');
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'BLOCKED' } });
      await this.revokeSessions(tx, id);
      await this.audit.log(
        {
          action: 'user.blocked',
          entityType: 'user',
          entityId: id,
          before: { status: existing.status },
          after: { status: 'BLOCKED' },
          reason,
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  /** Снимает блокировку администратором и временную блокировку после неудачных попыток входа. */
  async unblock(id: string, actorId: string): Promise<UserDetailsDto> {
    this.assertNotSelf(id, actorId);
    const existing = await this.findOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: null },
      });
      await this.audit.log(
        {
          action: 'user.unblocked',
          entityType: 'user',
          entityId: id,
          before: {
            status: existing.status,
            lockedUntil: existing.lockedUntil?.toISOString() ?? null,
          },
          after: { status: 'ACTIVE', lockedUntil: null },
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  async resetPassword(id: string, actorId: string): Promise<TemporaryPasswordDto> {
    this.assertNotSelf(id, actorId);
    await this.findOrThrow(id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await this.revokeSessions(tx, id);
      await this.audit.log({ action: 'user.password_reset', entityType: 'user', entityId: id }, tx);
      return this.get(id, tx);
    });
    return { user, temporaryPassword };
  }

  async setRoles(id: string, roles: RoleCode[], actorId: string): Promise<UserDetailsDto> {
    this.assertNotSelf(id, actorId);
    const existing = await this.findOrThrow(id);
    this.assertNotStudent(existing);
    const before = existing.roles.map(({ role }) => role.code).sort();
    const after = [...new Set(roles)].sort();
    return this.prisma.$transaction(async (tx) => {
      const roleRows = await tx.role.findMany({ where: { code: { in: after } } });
      await tx.userRole.deleteMany({ where: { userId: id, role: { code: { notIn: after } } } });
      await tx.userRole.createMany({
        data: roleRows.map((role) => ({ userId: id, roleId: role.id, grantedById: actorId })),
        skipDuplicates: true,
      });
      await this.audit.log(
        {
          action: 'user.roles_changed',
          entityType: 'user',
          entityId: id,
          before: { roles: before },
          after: { roles: after },
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  async grantPermission(
    id: string,
    dto: GrantPermissionDto,
    actorId: string,
  ): Promise<UserDetailsDto> {
    this.assertNotSelf(id, actorId);
    const existing = await this.findOrThrow(id);
    if (existing.roles.some(({ role }) => role.code === RoleCode.STUDENT)) {
      throw new ConflictException('Студентам индивидуальные разрешения не выдаются');
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new ConflictException('Срок действия разрешения должен быть в будущем');
    }
    return this.prisma.$transaction(async (tx) => {
      const permission = await tx.permission.findUniqueOrThrow({ where: { code: dto.permission } });
      await tx.userPermission.upsert({
        where: { userId_permissionId: { userId: id, permissionId: permission.id } },
        create: {
          userId: id,
          permissionId: permission.id,
          reason: dto.reason,
          expiresAt,
          grantedById: actorId,
        },
        update: { reason: dto.reason, expiresAt, grantedById: actorId, grantedAt: new Date() },
      });
      await this.audit.log(
        {
          action: 'user.permission_granted',
          entityType: 'user',
          entityId: id,
          after: {
            permission: dto.permission,
            sensitive: SENSITIVE_PERMISSIONS.includes(dto.permission),
            expiresAt: expiresAt?.toISOString() ?? null,
          },
          reason: dto.reason,
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  async revokePermission(
    id: string,
    permission: Permission,
    reason: string,
    actorId: string,
  ): Promise<UserDetailsDto> {
    this.assertNotSelf(id, actorId);
    await this.findOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.userPermission.deleteMany({
        where: { userId: id, permission: { code: permission } },
      });
      if (deleted.count === 0) throw new NotFoundException('Разрешение не было выдано');
      await this.audit.log(
        {
          action: 'user.permission_revoked',
          entityType: 'user',
          entityId: id,
          before: { permission },
          reason,
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  private assertNotSelf(id: string, actorId: string): void {
    if (id === actorId) throw new ForbiddenException(SELF_FORBIDDEN);
  }

  /** ФИО и роли студента ведутся в разделе «Студенты» вместе с карточкой студента. */
  private assertNotStudent(user: { roles: { role: { code: string } }[] }): void {
    if (user.roles.some(({ role }) => role.code === RoleCode.STUDENT)) {
      throw new ConflictException('Учётные записи студентов управляются в разделе «Студенты»');
    }
  }

  private async findOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  private async assertUnique(login: string | null, email: string | null, exceptId?: string) {
    const conditions: Prisma.UserWhereInput[] = [];
    if (login) conditions.push({ login });
    if (email) conditions.push({ email: { equals: email, mode: 'insensitive' } });
    if (conditions.length === 0) return;
    const clash = await this.prisma.user.findFirst({
      where: { OR: conditions, id: exceptId ? { not: exceptId } : undefined },
    });
    if (!clash) return;
    throw new ConflictException(
      login && clash.login === login
        ? 'Пользователь с таким логином уже существует'
        : 'Пользователь с таким адресом электронной почты уже существует',
    );
  }

  private async revokeSessions(db: Db, userId: string): Promise<void> {
    await db.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
