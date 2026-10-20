import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { chooseGroup, experimental, signIn, stand } from '../acceptance/support/acceptance.ts';

/**
 * Снимки экранов для руководств `docs/guides/*.md`. Данные — приёмочный стенд с вымышленными
 * студентами; пароли и служебные адреса в кадр не попадают. Имена файлов используются в
 * руководствах: при переименовании обновить ссылки.
 */
const IMG_DIR = resolve(import.meta.dirname, '../../../../docs/guides/img');

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status').filter({ hasText: /Загрузка/ })).toHaveCount(0);
  await page.screenshot({ path: `${IMG_DIR}/${name}.png`, animations: 'disabled' });
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}

test('снимки: администратор', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Администрирование' })).toBeVisible();
  await shot(page, 'admin-users');
  await openTab(page, 'Журнал аудита');
  await shot(page, 'admin-audit');
  await page.goto('/disciplines');
  await openTab(page, 'Закрепление преподавателей');
  await shot(page, 'admin-teacher-assignments');
  await page.goto('/settings');
  await shot(page, 'admin-settings');
});

test('снимки: преподаватель', async ({ page }) => {
  const group = stand().experimental.name;
  const student = experimental(1);
  await signIn(page, 'teacher');
  await chooseGroup(page, group);
  await shot(page, 'teacher-dashboard');

  await page.goto('/students');
  await chooseGroup(page, group);
  await expect(page.getByText('Найдено студентов: 20')).toBeVisible();
  await shot(page, 'teacher-students');

  await page.goto(`/students/${student.id}`);
  await expect(page.getByRole('heading', { name: student.fullName })).toBeVisible();
  await shot(page, 'teacher-profile');
  await openTab(page, 'Диагностика');
  await shot(page, 'teacher-profile-diagnostics');
  await openTab(page, 'Мотивационный профиль');
  await shot(page, 'teacher-profile-motivation');

  await page.goto('/diagnostics');
  await shot(page, 'teacher-questionnaires');

  await page.goto(`/trajectories/${student.trajectoryId}`);
  await expect(page.getByRole('heading', { name: 'Карта маршрута' })).toBeVisible();
  await shot(page, 'teacher-trajectory');

  await page.goto('/assignments');
  await shot(page, 'teacher-assignments');

  await page.goto('/monitoring');
  await chooseGroup(page, group);
  await shot(page, 'teacher-monitoring');

  await page.goto('/feedback');
  await shot(page, 'teacher-feedback');

  await page.goto('/reports');
  await shot(page, 'teacher-reports');
});

test('снимки: исследователь', async ({ page }) => {
  await signIn(page, 'researcher');
  await page.goto('/analytics');
  await openTab(page, 'Исследования');
  await shot(page, 'researcher-projects');
  await page.goto(`/analytics/research/${stand().research.id}`);
  await expect(page.getByRole('heading', { name: stand().research.title })).toBeVisible();
  await shot(page, 'researcher-project');
});

test('снимки: студент', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page, experimental(1));
  await shot(page, 'student-home');
  await page.goto('/student/trajectory');
  await expect(page.getByRole('heading', { name: 'Карта маршрута' })).toBeVisible();
  await shot(page, 'student-trajectory');
  await page.goto('/student/assignments');
  await shot(page, 'student-assignments');
  await page.goto('/student/feedback');
  await shot(page, 'student-feedback');
});
