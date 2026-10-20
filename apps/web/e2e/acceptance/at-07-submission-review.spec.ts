import { expect, test } from '@playwright/test';
import { experimental, signIn, stand } from './support/acceptance.ts';

test('AT-07, UC-04: студент отправляет задание, преподаватель проверяет', async ({ page }) => {
  const student = experimental(2);
  const task = stand().tasks[0]!;

  // Студент отвечает текстом и отправляет на проверку (FR-050).
  await signIn(page, student);
  await page.goto('/student/assignments');
  await page.getByRole('link', { name: new RegExp(task.title) }).click();
  await page.getByLabel('Ответ текстом').fill('x = 2, проверка: 3·2 − 1 = 5');
  await page.getByRole('button', { name: 'Отправить на проверку' }).click();
  await expect(page.getByText('Ответ отправлен и ждёт проверки')).toBeVisible();
  await expect(page.getByText('Попытка 1')).toBeVisible();

  // Преподаватель находит ответ в очереди и оценивает по критериям (FR-052).
  await page.context().clearCookies();
  await signIn(page, 'teacher');
  await page.goto('/assignments?tab=review');
  await page.getByRole('link', { name: new RegExp(`${task.title}.*${student.fullName}`) }).click();
  await expect(page.getByRole('heading', { name: 'Проверка попытки 1' })).toBeVisible();
  await expect(page.getByText('x = 2, проверка: 3·2 − 1 = 5')).toBeVisible();
  await page.getByLabel('Верность решения (0–5)').fill('5');
  await page.getByLabel('Оформление (0–3)').fill('2');
  await page
    .getByLabel('Комментарий для студента (необязательно)')
    .fill('Верно, оформите проверку подробнее');
  await page.getByRole('button', { name: 'Принять' }).click();
  await expect(page.getByText('Балл: 7 из 8')).toBeVisible();

  // Студент видит результат проверки и комментарий.
  await page.context().clearCookies();
  await signIn(page, student);
  await page.goto('/student/assignments');
  await page.getByRole('link', { name: new RegExp(task.title) }).click();
  await expect(page.getByText(/Задание выполнено\. Балл: 7 из 8/)).toBeVisible();
  await expect(page.getByText('Верно, оформите проверку подробнее')).toBeVisible();
});
