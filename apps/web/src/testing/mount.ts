import { type CurrentUser, ROLE_PERMISSIONS, type RoleCode } from '@iot/shared';
import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import type { Component } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { routes } from '@/router';
import { useAuthStore } from '@/stores/auth';

/** Маршрутизатор приложения на памяти — для модульных тестов компонентов (без проверки входа). */
export function createTestRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes });
}

/** Пользователь для тестов: права — по ролям из каталога. */
export function testUser(
  roles: RoleCode[] = ['teacher'],
  overrides: Partial<CurrentUser> = {},
): CurrentUser {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    login: 'test.user',
    lastName: 'Иванова',
    firstName: 'Анна',
    middleName: 'Сергеевна',
    roles,
    permissions: [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))],
    mustChangePassword: false,
    ...overrides,
  };
}

/**
 * Монтирует компонент с PrimeVue, Pinia и маршрутизатором, предварительно перейдя по `path`.
 * `user` — вошедший пользователь (по умолчанию преподаватель; `null` — без входа).
 */
export async function mountWithApp<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> & { path?: string; user?: CurrentUser | null } = {},
) {
  const { path = '/', user = testUser(), global, ...rest } = options;
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = user;
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    ...rest,
    global: { ...global, plugins: [PrimeVue, pinia, router, ...(global?.plugins ?? [])] },
  } as ComponentMountingOptions<C>);
  return { wrapper, router };
}
