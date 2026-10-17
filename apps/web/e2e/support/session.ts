import { expect, type Page } from '@playwright/test';
import {
  type CurrentUser,
  type DisciplineDto,
  type GroupDto,
  ROLE_PERMISSIONS,
  type RoleCode,
  type StudentSummaryDto,
} from '@iot/shared';

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** NFR-004: на странице нет горизонтальной прокрутки. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export function fakeUser(roles: RoleCode[], overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    login: 'demo',
    lastName: 'Иванова',
    firstName: 'Анна',
    middleName: null,
    roles,
    permissions: [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))],
    mustChangePassword: false,
    ...overrides,
  };
}

/**
 * Имитация сессии без запуска API: интерфейсные тесты проверяют навигацию и вёрстку,
 * а права на данные проверяют e2e-тесты API (apps/api/test).
 */
export async function mockSession(page: Page, user: CurrentUser | null): Promise<void> {
  if (user) {
    await page
      .context()
      .addCookies([{ name: 'iot_csrf', value: 'test-csrf', url: 'http://localhost:5173' }]);
  }
  await page.route('**/api/auth/refresh', (route) =>
    user
      ? route.fulfill({ json: { accessToken: 'test-token', expiresIn: 900, user } })
      : route.fulfill({ status: 401, json: { statusCode: 401, message: 'Сессия завершена' } }),
  );
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));
  // Шапка сотрудника загружает группы и дисциплины; без моков Vite проксирует их в незапущенный
  // API и засоряет вывод ошибками ECONNREFUSED. Тесты переопределяют их через mockDirectoryApi.
  await page.route(/\/api\/(groups|disciplines)(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/(cabinet\/diagnostics|diagnostic-assignments)$/, (route) =>
    route.fulfill({ json: [] }),
  );
}

/** Пустые ответы API раздела «Администрирование» и «Настройки». */
export async function mockAdminApi(page: Page): Promise<void> {
  await page.route('**/api/admin/roles', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/permissions', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/users?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }),
  );
  await page.route('**/api/audit-logs?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50 } }),
  );
  await page.route('**/api/settings', (route) =>
    route.fulfill({
      json: [
        {
          key: 'auth.maxFailedAttempts',
          label: 'Неудачных попыток входа до блокировки',
          description: 'После указанного числа неверных паролей подряд вход временно блокируется.',
          unit: 'попыток',
          min: 3,
          max: 20,
          defaultValue: 5,
          value: 5,
        },
      ],
    }),
  );
}

/** Справочники и студенты: по умолчанию пустые ответы. */
export async function mockDirectoryApi(
  page: Page,
  data: { groups?: GroupDto[]; disciplines?: DisciplineDto[]; students?: StudentSummaryDto[] } = {},
): Promise<void> {
  const students = data.students ?? [];
  await page.route(/\/api\/groups(\?.*)?$/, (route) => route.fulfill({ json: data.groups ?? [] }));
  await page.route(/\/api\/disciplines(\?.*)?$/, (route) =>
    route.fulfill({ json: data.disciplines ?? [] }),
  );
  await page.route(/\/api\/teacher-assignments.*/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/questionnaires(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/diagnostic-directions$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/students(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: students, total: students.length, page: 1, pageSize: 20 } }),
  );
}
