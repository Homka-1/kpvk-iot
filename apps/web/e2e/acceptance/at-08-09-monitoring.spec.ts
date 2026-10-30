import { expect, test } from '@playwright/test';
import { completeTask, experimental, signIn, stand } from './support/acceptance.ts';

test('AT-08, FR-042, FR-056: мониторинг корректно отображает изменение прогресса', async ({
  page,
}) => {
  const student = experimental(3);
  await signIn(page, 'teacher');
  await page.goto('/monitoring');
  const card = page.getByRole('article', {
    name: `${student.fullName}, ${stand().discipline.name}`,
  });
  await expect(card).toContainText('выполнено 0 из 3');
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(card).toContainText('Нет данных: оценок нет');

  // Студент выполнил задание, преподаватель принял его (100 из 100).
  await completeTask(student, stand().tasks[0]!.title);

  await page.reload();
  await expect(card).toContainText('выполнено 1 из 3');
  await expect(card.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '0');
  await expect(card).toContainText('100 % (оценок: 1)');
});

test('AT-09, UC-05, FR-043: корректировка ИОТ создаёт новую версию и сохраняет предыдущую', async ({
  page,
}) => {
  const student = experimental(4);
  await signIn(page, 'teacher');
  await page.goto('/monitoring');
  await page
    .getByRole('article', { name: `${student.fullName}, ${stand().discipline.name}` })
    .getByRole('link', { name: 'Подробнее и корректировка' })
    .click();
  await page.getByRole('link', { name: 'Корректировать ИОТ' }).click();
  await expect(page.getByText('Корректировка версии 1')).toBeVisible();
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Далее' }).click();
  }
  await page.getByLabel('Способы сопровождения').fill('Консультации два раза в неделю');
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page.getByText('Изменения новой версии 2')).toBeVisible();
  await expect(
    page.getByText('Консультации раз в неделю → Консультации два раза в неделю'),
  ).toBeVisible();

  // Причина корректировки обязательна (UC-05).
  await page.getByRole('button', { name: 'Подтвердить новую версию' }).click();
  await expect(page.getByText('Укажите причину корректировки')).toBeVisible();
  await page.getByLabel('Причина корректировки').fill('Студенту нужна дополнительная поддержка');
  await page.getByRole('button', { name: 'Подтвердить новую версию' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Утверждена версия 2: прежняя версия сохранена')).toBeVisible();

  // История версий: версия 1 сохранена и открывается без изменений.
  const history = page.getByRole('region', { name: 'История версий' });
  await expect(history).toContainText('Версия 2');
  await expect(history).toContainText('причина: Студенту нужна дополнительная поддержка');
  await expect(history).toContainText('Версия 1');
  await page.getByRole('button', { name: 'Открыть версию 1' }).click();
  const previous = page.getByRole('dialog', { name: 'Версия 1' });
  await expect(previous.getByText('Консультации раз в неделю')).toBeVisible();
  await previous.getByRole('button', { name: /Закрыть/ }).click();

  // Студент получает уведомление о новой версии маршрута.
  await page.context().clearCookies();
  await signIn(page, student);
  await page.getByRole('button', { name: /Уведомления/ }).click();
  await expect(page.getByText(/верси/i).first()).toBeVisible();
});
