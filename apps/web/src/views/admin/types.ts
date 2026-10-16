import { type Permission, type RoleCode, type UserStatus, USER_STATUS_LABELS } from '@iot/shared';
import type { StatusTone } from '@/components/StatusBadge.vue';

/** Ответы API раздела «Администрирование» (см. OpenAPI: /api/admin/*, /api/audit-logs). */
export interface UserSummary {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  email: string | null;
  status: UserStatus;
  roles: RoleCode[];
  lockedUntil: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface GrantedPermission {
  permission: Permission;
  description: string;
  reason: string;
  expiresAt: string | null;
  grantedAt: string;
  grantedByName: string | null;
}

export interface UserDetails extends UserSummary {
  grantedPermissions: GrantedPermission[];
  effectivePermissions: Permission[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TemporaryPasswordResult {
  user: UserDetails;
  temporaryPassword: string;
}

export interface RoleInfo {
  code: RoleCode;
  name: string;
  description: string | null;
  permissions: Permission[];
}

export interface PermissionInfo {
  code: Permission;
  description: string;
  sensitive: boolean;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ipAddress: string | null;
}

/** Состояние учётной записи для StatusBadge: текст и тон (статус не только цветом). */
export function userState(
  user: UserSummary,
  now = new Date(),
): { label: string; tone: StatusTone } {
  if (user.status === 'BLOCKED') return { label: USER_STATUS_LABELS.BLOCKED, tone: 'danger' };
  if (user.status === 'ARCHIVED') return { label: USER_STATUS_LABELS.ARCHIVED, tone: 'neutral' };
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    return { label: 'Вход временно заблокирован', tone: 'warning' };
  }
  return { label: USER_STATUS_LABELS.ACTIVE, tone: 'success' };
}

/** Русские названия действий журнала аудита. Неизвестный код показывается как есть. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Вход в систему',
  'auth.logout': 'Выход из системы',
  'auth.login_failed': 'Неудачная попытка входа',
  'auth.locked': 'Вход временно заблокирован',
  'auth.password_changed': 'Смена пароля',
  'user.created': 'Создание учётной записи',
  'user.updated': 'Изменение учётной записи',
  'user.blocked': 'Блокировка учётной записи',
  'user.unblocked': 'Разблокировка учётной записи',
  'user.password_reset': 'Сброс пароля',
  'user.roles_changed': 'Изменение ролей',
  'user.permission_granted': 'Выдача разрешения',
  'user.permission_revoked': 'Отзыв разрешения',
  'settings.updated': 'Изменение настроек',
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: 'Учётная запись',
  settings: 'Настройки',
};
