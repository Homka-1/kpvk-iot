import { expect, test } from '@playwright/test';
import {
  assignDiagnostic,
  experimental,
  passDemoHigh,
  signIn,
  stand,
} from './support/acceptance.ts';

test('AT-10, UC-06, FR-024: повторная диагностика отображается в сравнении с первичной', async ({
  page,
}) => {
  // Студент 9: первичный замер с низкими баллами (познавательный интерес 2, достижение 4).
  const student = experimental(9);
  await signIn(page, 'teacher');
  await assignDiagnostic(page, student, 'Повторный');

  await page.context().clearCookies();
  await signIn(page, student);
  await passDemoHigh(page);

  await page.context().clearCookies();
  await signIn(page, 'teacher');
  await page.goto(`/students/${student.id}?tab=diagnostics`);
  await expect(page.getByRole('heading', { name: 'Динамика и сравнение замеров' })).toBeVisible();
  const table = page.getByRole('table', {
    name: `Баллы по замерам: ${stand().questionnaire.title}`,
  });
  await expect(table.getByRole('columnheader', { name: /Первичный/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /Повторный/ })).toBeVisible();
  const cognitive = table.getByRole('row', { name: /Познавательный интерес/ });
  await expect(cognitive).toContainText('2');
  await expect(cognitive).toContainText('13');
  await expect(cognitive).toContainText('+11');
  const achievement = table.getByRole('row', { name: /Мотивация достижения/ });
  await expect(achievement).toContainText('+7');
  await expect(page.getByRole('img', { name: /График динамики баллов/ })).toBeVisible();
});
