import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { checkPassword, type CurrentUser, type SessionResponse } from '@iot/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { AccessTokenPayload } from './auth.guard.js';
import { currentUserInclude, toCurrentUser } from './current-user.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './passwords.js';

const INVALID_CREDENTIALS = 'Неверный логин или пароль';

export interface IssuedSession {
  response: SessionResponse;
  /** Значение refresh-токена для httpOnly cookie. В БД хранится только его хеш. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function accessTokenTtlSeconds(): number {
  return Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
}

function lockedMessage(until: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return `Вход временно заблокирован из-за неудачных попыток. Повторите через ${minutes} мин.`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async login(
    login: string,
    password: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<IssuedSession> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { login: login.trim().toLowerCase() },
    });
    if (!user || user.status === 'ARCHIVED') {
      await verifyAgainstDummy(password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new HttpException(lockedMessage(user.lockedUntil, now), HttpStatus.LOCKED);
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      await this.registerFailedAttempt(user.id, now);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Сообщение о блокировке — только после верного пароля, чтобы не раскрывать состояние учётной записи.
    if (user.status === 'BLOCKED') {
      throw new ForbiddenException('Учётная запись заблокирована. Обратитесь к администратору');
    }

    const sessionDays = await this.settings.get('auth.sessionDays');
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(now.getTime() + sessionDays * 86_400_000);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
      });
      const created = await tx.authSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: refreshExpiresAt,
          userAgent: meta.userAgent?.slice(0, 500),
          ipAddress: meta.ipAddress,
        },
      });
      await this.audit.log(
        { action: 'auth.login', entityType: 'user', entityId: user.id, actorId: user.id },
        tx,
      );
      return created;
    });
    return {
      response: await this.sessionResponse(user.id, session.id),
      refreshToken,
      refreshExpiresAt,
    };
  }

  /** Неверный пароль: счётчик растёт атомарно; на пороге вход блокируется на заданное время. */
  private async registerFailedAttempt(userId: string, now: Date): Promise<void> {
    const [maxAttempts, lockoutMinutes] = await Promise.all([
      this.settings.get('auth.maxFailedAttempts'),
      this.settings.get('auth.lockoutMinutes'),
    ]);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    if (updated.failedLoginAttempts < maxAttempts) {
      await this.audit.log({
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: userId,
        actorId: null,
      });
      return;
    }
    const lockedUntil = new Date(now.getTime() + lockoutMinutes * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: 0, lockedUntil },
      });
      await this.audit.log(
        {
          action: 'auth.locked',
          entityType: 'user',
          entityId: userId,
          actorId: null,
          after: { lockedUntil: lockedUntil.toISOString(), attempts: updated.failedLoginAttempts },
        },
        tx,
      );
    });
    throw new HttpException(lockedMessage(lockedUntil, now), HttpStatus.LOCKED);
  }

  /** Обновление сессии: refresh-токен ротируется, старое значение перестаёт действовать. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const now = new Date();
    const session = refreshToken
      ? await this.prisma.authSession.findUnique({
          where: { tokenHash: hashToken(refreshToken) },
          include: { user: true },
        })
      : null;
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Сессия завершена. Войдите снова');
    }
    const nextToken = randomBytes(32).toString('base64url');
    // Условие по старому хешу: при одновременных запросах ротацию выполнит только один.
    const rotated = await this.prisma.authSession.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: { tokenHash: hashToken(nextToken) },
    });
    if (rotated.count === 0) throw new UnauthorizedException('Сессия завершена. Войдите снова');
    return {
      response: await this.sessionResponse(session.userId, session.id),
      refreshToken: nextToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!session || session.revokedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await this.audit.log(
        {
          action: 'auth.logout',
          entityType: 'user',
          entityId: session.userId,
          actorId: session.userId,
        },
        tx,
      );
    });
  }

  /** Смена пароля пользователем. Остальные сессии пользователя завершаются. */
  async changePassword(
    user: CurrentUser & { sessionId: string },
    currentPassword: string,
    newPassword: string,
  ): Promise<CurrentUser> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(record.passwordHash, currentPassword))) {
      throw new BadRequestException({
        message: 'Проверьте правильность заполнения формы',
        fields: { currentPassword: 'Текущий пароль указан неверно' },
      });
    }
    const minLength = await this.settings.get('auth.passwordMinLength');
    const error =
      checkPassword(newPassword, minLength, record.login) ??
      (newPassword === currentPassword ? 'Новый пароль должен отличаться от текущего' : null);
    if (error) {
      throw new BadRequestException({
        message: 'Проверьте правильность заполнения формы',
        fields: { newPassword: error },
      });
    }
    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
      });
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: now },
      });
      await this.audit.log(
        { action: 'auth.password_changed', entityType: 'user', entityId: user.id },
        tx,
      );
    });
    return this.loadCurrentUser(user.id);
  }

  async loadCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: currentUserInclude(new Date()),
    });
    return toCurrentUser(user);
  }

  private async sessionResponse(userId: string, sessionId: string): Promise<SessionResponse> {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    const expiresIn = accessTokenTtlSeconds();
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn }),
      expiresIn,
      user: await this.loadCurrentUser(userId),
    };
  }
}
