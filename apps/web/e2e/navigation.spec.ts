import { expect, test, type Page } from '@playwright/test';
import { STUDENT_NAV, TEACHER_NAV, TEACHER_SERVICE_NAV } from '../src/navigation';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** NFR-004: на странице нет горизонтальной прокрутки. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('навигация преподавателя', () => {
  for (const item of [...TEACHER_NAV, ...TEACHER_SERVICE_NAV]) {
    test(`ТЗ п. 3.1, NFR-004: пункт «${item.label}» открывается из меню`, async ({ page }) => {
      await page.goto(item.path === '/' ? '/reports' : '/');
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
      await expect(page.getByText('Раздел в разработке')).toBeVisible();
      await expect(page).toHaveTitle(`${item.label} — ИОТ`);
      await expectNoHorizontalScroll(page);
    });
  }

  test('ТЗ п. 6.2: в шапке видны группа, дисциплина, уведомления', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox', { name: 'Учебная группа' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Дисциплина' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Уведомления' })).toBeVisible();
  });
});

test.describe('навигация студента', () => {
  for (const item of STUDENT_NAV) {
    test(`ТЗ п. 3.2, NFR-004: пункт «${item.label}» открывается из меню`, async ({ page }) => {
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
    await page.goto('/student');
    const bottom = page.getByRole('navigation', { name: 'Быстрая навигация' });
    await expect(bottom).toBeVisible();
    await bottom.getByRole('link', { name: 'Задания' }).click();
    await expect(page).toHaveURL('/student/assignments');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мои задания');
  });
});

test('страница входа отображается без горизонтальной прокрутки', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход в систему');
  await expect(page.getByLabel('Логин')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('NFR-005: неизвестный адрес — понятное сообщение и ссылка на главную', async ({ page }) => {
  await page.goto('/нет-такой-страницы');
  await expect(page.getByRole('alert')).toContainText('Такой страницы нет');
  await page.getByRole('link', { name: 'Перейти на главную' }).click();
  await expect(page).toHaveURL('/');
});
