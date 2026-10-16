import { type CurrentUser, RoleCode } from '@iot/shared';

/** Стартовая страница пользователя: кабинет студента или главная сотрудника. */
export function homePath(user: CurrentUser): string {
  return user.roles.includes(RoleCode.STUDENT) ? '/student' : '/';
}

/** Адрес возврата после входа: только внутренний путь приложения (защита от открытого редиректа). */
export function safeRedirect(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : null;
}
