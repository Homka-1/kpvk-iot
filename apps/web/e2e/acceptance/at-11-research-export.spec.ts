import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { apiAs, control, signIn, stand } from './support/acceptance.ts';

test('AT-11, UC-07, FR-071, FR-075: исследователь экспортирует обезличенные результаты КГ и ЭГ', async ({
  page,
}) => {
  const { research, experimental, control: controlGroup } = stand();
  await signIn(page, 'researcher');
  await page.goto('/analytics');
  await page.getByRole('link', { name: research.title }).click();
  await expect(page.getByRole('heading', { name: 'Входной замер' })).toBeVisible();

  // Наблюдения по группам: у контрольной группы 10 завершённых замеров из 20 (FR-073).
  const observations = page.getByRole('region', { name: 'Полные и неполные наблюдения' });
  await expect(observations.getByRole('row', { name: /Экспериментальная группа/ })).toBeVisible();
  const controlRow = observations.getByRole('row', { name: /Контрольная группа/ });
  await expect(controlRow.getByRole('cell').nth(0)).toHaveText('20');
  await expect(controlRow.getByRole('cell').nth(1)).toHaveText('10');
  await expect(controlRow.getByRole('cell').nth(2)).toHaveText('10');

  // Экспорт исходных данных в CSV.
  await page.getByLabel('CSV (UTF-8, «;»)').check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспортировать' }).click();
  const file = await (await download).path();
  await expect(page.getByText('Файл сформирован.')).toBeVisible();
  const csv = await readFile(file, 'utf8');
  const lines = csv.trim().split(/\r?\n/);
  // Заголовок и по строке на каждого из 40 участников.
  expect(lines.length).toBeGreaterThanOrEqual(41);
  expect(csv).toMatch(/ЭГ/);
  expect(csv).toMatch(/КГ/);

  // Обезличивание: нет Ф. И. О., логинов и кодов студентов из учётных данных.
  for (const student of [...experimental.students, ...controlGroup.students]) {
    const lastName = student.fullName.split(' ')[0]!;
    expect(csv, `в выгрузке найдена фамилия ${lastName}`).not.toContain(lastName);
    expect(csv, `в выгрузке найден логин ${student.login}`).not.toContain(student.login);
  }
});

test('огр. 4 ТЗ: контрольная группа исследования не получает ИОТ (проверка на сервере)', async () => {
  const teacher = await apiAs('teacher');
  const student = control(1);
  const options = await teacher.call<{ templates: { id: string; isStandard: boolean }[] }>(
    'GET',
    `/students/${student.id}/trajectory-options`,
  );
  const response = await teacher.request('POST', '/trajectories', {
    studentId: student.id,
    disciplineId: stand().discipline.id,
    templateId: options.templates.find((template) => template.isStandard)!.id,
  });
  expect(response.status).toBe(403);
  expect(((await response.json()) as { message: string }).message).toContain(
    'контрольную группу исследования',
  );
});
