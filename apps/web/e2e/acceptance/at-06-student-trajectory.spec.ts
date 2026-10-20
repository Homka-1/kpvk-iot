import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from '../support/session.ts';
import { experimental, signIn, stand } from './support/acceptance.ts';
import { TRAJECTORY_GOALS } from './support/seed.ts';

for (const viewport of [
  { name: 'компьютер', width: 1280, height: 800 },
  { name: '360 px', width: 360, height: 740 },
]) {
  test(`AT-06, FR-040, FR-041, NFR-004: студент видит утверждённую ИОТ и свои задания (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const [first, second, third] = stand().tasks;
    await signIn(page, experimental(1));

    // Моя траектория: цели и карта пяти этапов, текущий — первый.
    await page.goto('/student/trajectory');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Моя траектория');
    await expect(page.getByText(TRAJECTORY_GOALS)).toBeVisible();
    const stages = page.getByRole('list', { name: 'Этапы маршрута' }).getByRole('listitem');
    await expect(stages).toHaveCount(5);
    await expect(stages.first()).toContainText('Текущий этап');
    const details = page.getByRole('region', { name: 'Содержание этапа 1' });
    await expect(details.getByRole('link', { name: first!.title })).toBeVisible();
    await expect(details.getByRole('link', { name: second!.title })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Мои задания: все три задания маршрута.
    await page.goto('/student/assignments');
    await expect(page.getByRole('heading', { name: 'Текущие' })).toBeVisible();
    for (const task of [first!, second!, third!]) {
      await expect(page.getByRole('link', { name: new RegExp(task.title) })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);

    // Карточка задания открывается со своей инструкцией и критериями.
    await page.getByRole('link', { name: new RegExp(first!.title) }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(first!.title);
    await expect(page.getByText('Решите задачи и запишите ход решения.')).toBeVisible();
    await expect(page.getByText('Верность решения')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
