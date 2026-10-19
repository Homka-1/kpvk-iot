import { expect, test } from '@playwright/test';
import { STUDENT_NAV, TEACHER_NAV, TEACHER_SERVICE_NAV } from '../src/navigation';
import {
  expectNoHorizontalScroll,
  fakeUser,
  isMobile,
  mockAdminApi,
  mockDirectoryApi,
  mockSession,
} from './support/session';

/** Разделы, которые уже реализованы (остальные пока открывают заглушку). */
const IMPLEMENTED = new Set([
  'home',
  'settings',
  'admin',
  'students',
  'disciplines',
  'diagnostics',
  'motivation-profiles',
  'trajectories',
  'assignments',
  'monitoring',
  'feedback',
  'library',
  'analytics',
]);
/** Служебные разделы администратора; остальные пункты открываются под преподавателем. */
const ADMIN_SECTIONS = new Set(['settings', 'admin']);

test.describe('навигация сотрудника', () => {
  for (const item of [...TEACHER_NAV, ...TEACHER_SERVICE_NAV]) {
    test(`ТЗ п. 3.1, NFR-004: пункт «${item.label}» открывается из меню`, async ({ page }) => {
      const role = ADMIN_SECTIONS.has(item.name) ? 'admin' : 'teacher';
      await mockSession(page, fakeUser([role]));
      await mockAdminApi(page);
      await mockDirectoryApi(page);
      await page.goto(item.path === '/' ? '/disciplines' : '/');
      if (isMobile(page)) {
        await page.getByRole('button', { name: 'Открыть меню' }).click();
        await page.getByRole('dialog').getByRole('link', { name: item.label, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
      } else {
        await page
          .getByRole('complementary')
          .getByRole('link', { name: item.label, exact: true })
          .click();
      }
      await expect(page).toHaveURL(item.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
      if (!IMPLEMENTED.has(item.name)) {
        await expect(page.getByText('Раздел в разработке')).toBeVisible();
      }
      await expect(page).toHaveTitle(`${item.label} — ИОТ`);
      await expectNoHorizontalScroll(page);
    });
  }

  test('ТЗ п. 6.2: в шапке видны группа, дисциплина, уведомления и пользователь', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    await page.goto('/');
    await expect(page.getByRole('combobox', { name: 'Учебная группа' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Дисциплина' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Уведомления' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Профиль: Иванова Анна' })).toBeVisible();
  });

  test('п. 2: преподаватель не видит «Администрирование», а по прямой ссылке — «Нет доступа»', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    await page.goto('/admin');
    await expect(page.getByText('Нет доступа к разделу')).toBeVisible();
    if (!isMobile(page)) {
      await expect(
        page.getByRole('complementary').getByRole('link', { name: 'Администрирование' }),
      ).toHaveCount(0);
    }
  });
});

test.describe('навигация студента', () => {
  for (const item of STUDENT_NAV) {
    test(`ТЗ п. 3.2, NFR-004: пункт «${item.label}» открывается из меню`, async ({ page }) => {
      await mockSession(page, fakeUser(['student']));
      await page.goto(item.path === '/student' ? '/student/profile' : '/student');
      if (isMobile(page)) {
        await page.getByRole('button', { name: 'Ещё' }).click();
        await page.getByRole('dialog').getByRole('link', { name: item.label, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
      } else {
        await page
          .getByRole('complementary')
          .getByRole('link', { name: item.label, exact: true })
          .click();
      }
      await expect(page).toHaveURL(item.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
      await expectNoHorizontalScroll(page);
    });
  }

  test('ТЗ п. 3.2: на смартфоне основные пункты доступны в нижней панели', async ({ page }) => {
    test.skip(!isMobile(page), 'нижняя панель только на узком экране');
    await mockSession(page, fakeUser(['student']));
    await page.goto('/student');
    const bottom = page.getByRole('navigation', { name: 'Быстрая навигация' });
    await expect(bottom).toBeVisible();
    await bottom.getByRole('link', { name: 'Задания' }).click();
    await expect(page).toHaveURL('/student/assignments');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мои задания');
  });

  test('AT-12: студента не пускают в рабочее место преподавателя', async ({ page }) => {
    await mockSession(page, fakeUser(['student']));
    await page.goto('/students');
    await expect(page).toHaveURL('/student');
  });
});

test('NFR-005: неизвестный адрес — понятное сообщение и ссылка на главную', async ({ page }) => {
  await mockSession(page, fakeUser(['teacher']));
  await page.goto('/нет-такой-страницы');
  await expect(page.getByRole('alert')).toContainText('Такой страницы нет');
  await page.getByRole('link', { name: 'Перейти на главную' }).click();
  await expect(page).toHaveURL('/');
});
