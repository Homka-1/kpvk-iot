import { expect, test } from '@playwright/test';
import { chooseGroup, signIn, stand } from './support/acceptance.ts';

test('AT-01: созданы две исследовательские группы по 20 студентов', async ({ page }) => {
  const { experimental, control, research } = stand();

  // Преподаватель видит обе учебные группы по 20 студентов.
  await signIn(page, 'teacher');
  await page.goto('/students');
  for (const group of [experimental, control]) {
    await chooseGroup(page, group.name);
    await expect(page.getByText('Найдено студентов: 20')).toBeVisible();
    await expect(page.getByText(group.students[0]!.fullName).first()).toBeVisible();
  }

  // Исследователь видит исследование с экспериментальной и контрольной группами.
  await page.context().clearCookies();
  await signIn(page, 'researcher');
  await page.goto('/analytics');
  await page.getByRole('link', { name: research.title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(research.title);
  await expect(
    page.getByText('Экспериментальная группа: 20 · Контрольная группа: 20'),
  ).toBeVisible();
});
