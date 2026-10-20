import { expect, test, type Page } from '@playwright/test';
import { experimental, signIn, type StandStudent } from './support/acceptance.ts';

async function proposeProfile(page: Page, student: StandStudent) {
  await page.goto(`/students/${student.id}?tab=motivation`);
  const panel = page.getByRole('tabpanel');
  await panel.getByRole('button', { name: 'Сформировать предварительный профиль' }).click();
  return panel;
}

test('AT-03, FR-027, FR-028: система формирует предварительный профиль по результатам диагностики', async ({
  page,
}) => {
  await signIn(page, 'teacher');

  // Студент 6: первичная диагностика с низкими баллами по обеим шкалам.
  const panel = await proposeProfile(page, experimental(6));
  await expect(panel.getByText('Система предлагает: Низкий уровень')).toBeVisible();
  const basis = panel.getByRole('table', { name: 'Показатели, повлиявшие на профиль' });
  await expect(basis.getByRole('row', { name: /Познавательный интерес/ })).toContainText('2');
  await expect(basis.getByRole('row', { name: /Мотивация достижения/ })).toContainText('4');
  // Предложение не действует до решения преподавателя (FR-029): ИОТ по нему не формируется.
  await expect(panel.getByRole('link', { name: 'Сформировать ИОТ' })).toHaveCount(0);

  await panel.getByRole('button', { name: 'Подтвердить или скорректировать' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
  await expect(panel.getByText('Подтверждён преподавателем').first()).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Сформировать ИОТ' })).toBeVisible();

  // Студент 12 без диагностики: уровень не присваивается (п. 4.5).
  const empty = await proposeProfile(page, experimental(12));
  await expect(empty.getByText('Требуется дополнительная диагностика').first()).toBeVisible();
  await expect(empty.getByText(/Система предлагает/)).toHaveCount(0);
});

test('AT-04, FR-029, FR-032: преподаватель корректирует профиль с обязательной причиной', async ({
  page,
}) => {
  await signIn(page, 'teacher');

  // Студент 7: высокие баллы — система предлагает высокий уровень.
  const panel = await proposeProfile(page, experimental(7));
  await expect(panel.getByText('Система предлагает: Высокий уровень')).toBeVisible();

  await panel.getByRole('button', { name: 'Подтвердить или скорректировать' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Средний уровень', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Скорректировать' }).click();
  await expect(dialog.getByText('Укажите причину корректировки')).toBeVisible();
  await dialog
    .getByLabel('Причина корректировки')
    .fill('Высокие баллы не подтверждаются на занятиях');
  await dialog.getByRole('button', { name: 'Скорректировать' }).click();
  await expect(dialog).toBeHidden();

  await expect(panel.getByText('Скорректирован преподавателем').first()).toBeVisible();
  await expect(
    panel.getByText(
      'Предложено: Высокий уровень. Причина корректировки: Высокие баллы не подтверждаются на занятиях',
    ),
  ).toBeVisible();
  await expect(page.locator('.profile__facts').getByText('Средний уровень')).toBeVisible();

  // История изменений сохраняет и предложение, и корректировку (FR-032).
  await page.reload();
  await expect(
    page.getByRole('tabpanel').getByText('Причина: Высокие баллы не подтверждаются на занятиях'),
  ).toBeVisible();
});
