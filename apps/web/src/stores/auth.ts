import {
  CSRF_COOKIE,
  type CurrentUser,
  formatFullName,
  type Permission,
  RoleCode,
  type SessionResponse,
} from '@iot/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, configureHttp, readCookie } from '@/api/http';

/**
 * Сессия пользователя. Access-токен хранится только в памяти; refresh-токен — в httpOnly cookie,
 * недоступной скриптам. После перезагрузки страницы сессия восстанавливается через refresh.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null);
  const accessToken = ref<string | null>(null);
  let restoring: Promise<boolean> | null = null;

  const isAuthenticated = computed(() => user.value !== null);
  const isStudent = computed(() => user.value?.roles.includes(RoleCode.STUDENT) ?? false);
  const fullName = computed(() => (user.value ? formatFullName(user.value) : ''));

  function hasPermission(permission: Permission | undefined): boolean {
    return !permission || (user.value?.permissions.includes(permission) ?? false);
  }

  function applySession(session: SessionResponse): void {
    accessToken.value = session.accessToken;
    user.value = session.user;
  }

  function clear(): void {
    accessToken.value = null;
    user.value = null;
  }

  async function login(loginName: string, password: string): Promise<void> {
    applySession(
      await api<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { login: loginName, password },
        noRefresh: true,
      }),
    );
  }

  /** Обновление сессии по refresh-cookie. Параллельные вызовы используют один запрос. */
  function refresh(): Promise<boolean> {
    // Без CSRF-cookie сессии нет: не отправляем заведомо отклоняемый запрос.
    if (!readCookie(CSRF_COOKIE)) {
      clear();
      return Promise.resolve(false);
    }
    restoring ??= api<SessionResponse>('/auth/refresh', { method: 'POST', cookieAuth: true })
      .then((session) => {
        applySession(session);
        return true;
      })
      .catch(() => {
        clear();
        return false;
      })
      .finally(() => {
        restoring = null;
      });
    return restoring;
  }

  async function logout(): Promise<void> {
    try {
      await api('/auth/logout', { method: 'POST', cookieAuth: true });
    } finally {
      clear();
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    user.value = await api<CurrentUser>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  }

  configureHttp({ getAccessToken: () => accessToken.value, refresh });

  return {
    user,
    isAuthenticated,
    isStudent,
    fullName,
    hasPermission,
    login,
    refresh,
    logout,
    changePassword,
  };
});
