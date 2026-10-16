import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { createTestRouter, testUser } from '@/testing/mount';
import { useAuthStore } from '@/stores/auth';
import { authGuard } from './index';
import { safeRedirect } from './paths';

async function check(path: string) {
  const router = createTestRouter();
  // resolve() даёт тот же набор полей, что и маршрут перехода (meta, matched, fullPath, name).
  return authGuard(router.resolve(path) as unknown as RouteLocationNormalized);
}

describe('проверка доступа к страницам', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('без входа — на страницу входа с адресом возврата', async () => {
    vi.spyOn(useAuthStore(), 'refresh').mockResolvedValue(false);
    expect(await check('/students')).toEqual({
      name: 'login',
      query: { redirect: '/students' },
    });
    expect(await check('/login')).toBe(true);
  });

  it('AT-12: студент не попадает в рабочее место сотрудника, сотрудник — в кабинет студента', async () => {
    const auth = useAuthStore();
    auth.user = testUser(['student']);
    expect(await check('/students')).toBe('/student');
    expect(await check('/student/trajectory')).toBe(true);

    auth.user = testUser(['teacher']);
    expect(await check('/student')).toBe('/');
    expect(await check('/students')).toBe(true);
  });

  it('временный пароль — сначала смена пароля', async () => {
    useAuthStore().user = testUser(['admin'], { mustChangePassword: true });
    expect(await check('/admin')).toEqual({ name: 'change-password' });
    expect(await check('/account/password')).toBe(true);
  });

  it('вошедший пользователь со страницы входа уходит на свою главную', async () => {
    useAuthStore().user = testUser(['student']);
    expect(await check('/login')).toBe('/student');
  });

  it('адрес возврата — только внутренний путь', () => {
    expect(safeRedirect('/students')).toBe('/students');
    expect(safeRedirect('//evil.example')).toBeNull();
    expect(safeRedirect('https://evil.example')).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
  });
});
