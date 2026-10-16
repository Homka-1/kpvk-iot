import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  fakeUser,
  isMobile,
  mockAdminApi,
  mockSession,
} from './support/session';

test.describe('вход и выход', () => {
  test('без сессии любой раздел ведёт на страницу входа', async ({ page }) => {
    await mockSession(page, null);
    await page.goto('/students');
    await expect(page).toHaveURL('/login?redirect=/students');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход в систему');
    await expectNoHorizontalScroll(page);
  });

  test('MVP-1: вход возвращает на запрошенную страницу; выход — на страницу входа', async ({
    page,
  }) => {
    await mockSession(page, null);
    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON() as { login: string; password: string };
      if (body.password !== 'Верный-пароль-1') {
        await route.fulfill({
          status: 401,
          json: { statusCode: 401, message: 'Неверный логин или пароль' },
        });
        return;
      }
      await route.fulfill({
        json: { accessToken: 'token', expiresIn: 900, user: fakeUser(['teacher']) },
      });
    });
    await page.goto('/monitoring');

    await page.getByLabel('Логин').fill('teacher');
    await page.getByLabel('Пароль', { exact: true }).fill('неверный');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('alert')).toHaveText('Неверный логин или пароль');

    await page.getByLabel('Пароль', { exact: true }).fill('Верный-пароль-1');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL('/monitoring');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мониторинг');

    await page.getByRole('button', { name: 'Профиль: Иванова Анна' }).click();
    await page.getByRole('menuitem', { name: 'Выйти' }).click();
    await expect(page).toHaveURL('/login');
  });

  test('временный пароль: до смены пароля разделы недоступны', async ({ page }) => {
    await mockSession(page, fakeUser(['teacher'], { mustChangePassword: true }));
    await page.route('**/api/auth/password-policy', (route) =>
      route.fulfill({ json: { minLength: 10, maxLength: 128 } }),
    );
    await page.goto('/students');
    await expect(page).toHaveURL('/account/password');
    await expect(page.getByText('Вы вошли с временным паролем')).toBeVisible();
    await page.getByLabel('Новый пароль', { exact: true }).fill('короткий1');
    await page.getByRole('button', { name: 'Сменить пароль' }).click();
    await expect(page.getByText('Пароль должен содержать не менее 10 символов')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('администрирование', () => {
  test('п. 2.1, NFR-004: разделы администратора открываются без горизонтальной прокрутки', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['admin']));
    await mockAdminApi(page);
    await page.goto('/admin');
    await expect(page.getByRole('tab', { name: 'Пользователи' })).toBeVisible();
    await expect(page.getByText('Пользователи не найдены')).toBeVisible();
    await page.getByRole('tab', { name: 'Журнал аудита' }).click();
    await expect(page.getByText('Записей нет')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto('/settings');
    await expect(page.getByLabel('Неудачных попыток входа до блокировки')).toBeVisible();
    await expectNoHorizontalScroll(page);
    if (isMobile(page)) {
      await page.getByRole('button', { name: 'Открыть меню' }).click();
      await expect(page.getByRole('dialog').getByRole('link')).toHaveText([
        'Главная',
        'Дисциплины',
        'Настройки',
        'Администрирование',
      ]);
    }
  });
});
