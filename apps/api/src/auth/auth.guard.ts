import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Permission } from '@iot/shared';
import type { Request } from 'express';
import { getRequestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentUserInclude, toCurrentUser } from './current-user.js';
import {
  ALLOW_PENDING_PASSWORD,
  type AuthUser,
  IS_PUBLIC,
  REQUIRED_ANY_PERMISSIONS,
  REQUIRED_PERMISSIONS,
} from './decorators.js';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

/**
 * Глобальная проверка доступа: каждый эндпоинт, не помеченный `@Public()`, требует
 * действующего access-токена. Пользователь, роли и права читаются из БД на каждый запрос,
 * поэтому блокировка, выход и изменение прав действуют сразу. Затем проверяются
 * разрешения из `@RequirePermissions()` и требование сменить временный пароль.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = await this.authenticate(req);
    req.user = user;
    const ctx = getRequestContext();
    if (ctx) ctx.userId = user.id;

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)
    ) {
      throw new ForbiddenException('Смените временный пароль, чтобы продолжить работу');
    }

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      targets,
    );
    if (required?.some((permission) => !user.permissions.includes(permission))) {
      throw new ForbiddenException('Недостаточно прав для выполнения действия');
    }
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_ANY_PERMISSIONS,
      targets,
    );
    if (anyOf && !anyOf.some((permission) => user.permissions.includes(permission))) {
      throw new ForbiddenException('Недостаточно прав для выполнения действия');
    }
    return true;
  }

  private async authenticate(req: Request): Promise<AuthUser> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Требуется вход в систему');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Сессия истекла. Войдите снова');
    }

    const now = new Date();
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: { include: currentUserInclude(now) } },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Сессия завершена. Войдите снова');
    }
    return { ...toCurrentUser(session.user), sessionId: session.id };
  }
}
