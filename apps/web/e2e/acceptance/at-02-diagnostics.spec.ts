import { expect, test } from '@playwright/test';
import {
  assignDiagnostic,
  experimental,
  passDemoHigh,
  signIn,
  stand,
} from './support/acceptance.ts';

test('AT-02, UC-01: преподаватель назначает диагностику и получает результаты по утверждённым ключам', async ({
  page,
}) => {
  const student = experimental(11);

  // Преподаватель назначает демо-методику одному студенту (FR-018).
  await signIn(page, 'teacher');
  await assignDiagnostic(page, student);

  // Студент проходит методику (UC-01) с ответами контрольного примера «высокий уровень».
  await page.context().clearCookies();
  await signIn(page, student);
  await passDemoHigh(page);
  await expect(page.getByText('Вам интересно учиться.')).toBeVisible();

  // Преподаватель видит баллы и уровни, совпадающие с контрольным примером 01-high (FR-020, FR-023).
  await page.context().clearCookies();
  await signIn(page, 'teacher');
  await page.goto(`/students/${student.id}?tab=diagnostics`);
  const results = page.getByRole('table', { name: `Результаты: ${stand().questionnaire.title}` });
  const cognitive = results.getByRole('row', { name: /Познавательный интерес/ });
  await expect(cognitive).toContainText('13');
  await expect(cognitive).toContainText('Высокий');
  const achievement = results.getByRole('row', { name: /Мотивация достижения/ });
  await expect(achievement).toContainText('11');
  await expect(achievement).toContainText('Высокий');
});
