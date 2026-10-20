import { expect, test } from '@playwright/test';
import { experimental, signIn, typedDate } from './support/acceptance.ts';

test('AT-05, UC-03: преподаватель создаёт и утверждает ИОТ из пяти этапов', async ({ page }) => {
  // Студент 8: профиль подтверждён (средний уровень), ИОТ ещё нет.
  const student = experimental(8);
  const next = () => page.getByRole('button', { name: 'Далее' }).click();
  await signIn(page, 'teacher');

  // ① Дисциплина и шаблон: система предлагает шаблон по профилю (FR-035).
  await page.goto(`/students/${student.id}?tab=motivation`);
  await page.getByRole('tabpanel').getByRole('link', { name: 'Сформировать ИОТ' }).click();
  await expect(page).toHaveURL(/\/trajectories\/new/);
  await expect(page.getByText('Предложено по профилю')).toBeVisible();
  await page.getByRole('button', { name: 'Создать черновик и продолжить' }).click();
  await expect(page).toHaveURL(/\/trajectories\/[0-9a-f-]{36}$/);

  // ② Цели и сроки.
  await page.getByLabel('Образовательные цели').fill('Научиться решать системы уравнений');
  await page.getByLabel('Дата начала').fill(typedDate(-5));
  await page.getByLabel('Планируемая дата завершения').fill(typedDate(145));
  await next();

  // ③ Пять этапов из шаблона (п. 4.6).
  for (let index = 1; index <= 5; index += 1) {
    await expect(page.getByLabel(`Название этапа ${index}`)).not.toHaveValue('');
  }
  await next();

  // ④ Задание из библиотеки в первый этап (FR-037).
  await page.getByRole('button', { name: 'Добавить задания' }).first().click();
  const picker = page.getByRole('dialog');
  await picker.getByText('Линейные уравнения', { exact: true }).click();
  await picker.getByRole('button', { name: 'Добавить (1)' }).click();
  await expect(picker).toBeHidden();
  await next();

  // ⑤ Сроки этапов, контрольная точка и срок задания.
  for (let index = 0; index < 5; index += 1) {
    await page
      .getByLabel('Начало этапа')
      .nth(index)
      .fill(typedDate(-5 + index * 30));
    await page
      .getByLabel('Окончание этапа')
      .nth(index)
      .fill(typedDate(-5 + index * 30 + 28));
  }
  await page.getByRole('button', { name: 'Добавить контрольную точку' }).first().click();
  await page.getByLabel('Линейные уравнения').fill(typedDate(10));
  await next();

  // ⑥ Способы сопровождения подставлены по стратегии профиля (FR-030).
  await expect(page.getByLabel('Способы сопровождения')).not.toHaveValue('');
  await next();

  // ⑦ Предпросмотр (FR-038) и утверждение преподавателем (FR-039).
  await expect(page.getByText('Маршрут заполнен')).toBeVisible();
  await expect(page.locator('.stage-map__card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Утвердить и назначить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Утвердить и назначить' }).click();
  await expect(page.getByText('ИОТ утверждена и назначена')).toBeVisible();
  await expect(page.locator('.trajectory__heading').getByText('Активна')).toBeVisible();
  await expect(page.getByText('Версия 1', { exact: false }).first()).toBeVisible();

  // Утверждённая ИОТ видна в профиле студента.
  await page.goto(`/students/${student.id}?tab=trajectory`);
  await expect(page.getByText('Научиться решать системы уравнений').first()).toBeVisible();
});
