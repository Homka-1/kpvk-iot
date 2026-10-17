import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { CurrentUser, Permission } from '@iot/shared';

/** Пользователь запроса: данные текущей учётной записи и идентификатор сессии. */
export interface AuthUser extends CurrentUser {
  sessionId: string;
}

export const IS_PUBLIC = 'iot:isPublic';
export const REQUIRED_PERMISSIONS = 'iot:requiredPermissions';
export const REQUIRED_ANY_PERMISSIONS = 'iot:requiredAnyPermissions';
export const ALLOW_PENDING_PASSWORD = 'iot:allowPendingPassword';

/** Эндпоинт доступен без входа (вход, обновление сессии, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Эндпоинт требует всех перечисленных разрешений. Проверяется на сервере глобальным guard. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Эндпоинт требует хотя бы одного из перечисленных разрешений (проверяется на сервере). */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS, permissions);

/**
 * Эндпоинт доступен и до смены временного пароля. Остальные эндпоинты при
 * `mustChangePassword` отвечают 403, пока пользователь не задаст свой пароль.
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

/** Текущий пользователь в параметре обработчика. */
export const User = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

export function hasPermission(user: CurrentUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}
