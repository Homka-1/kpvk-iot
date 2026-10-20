import { expect, test } from '@playwright/test';
import { apiAs, control, experimental, signIn, stand } from './support/acceptance.ts';
import { TRAJECTORY_GOALS } from './support/seed.ts';

test('AT-12: студент не имеет доступа к чужим данным', async ({ page }) => {
  const student = experimental(5);
  const other = experimental(1);
  const outsider = control(1);

  // Интерфейс: страницы сотрудников по прямой ссылке ведут на главную кабинета студента.
  await signIn(page, student);
  for (const path of [`/students/${other.id}`, `/trajectories/${other.trajectoryId}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Главная');
    await expect(page.getByText(other.fullName)).toHaveCount(0);
  }
  await page.goto('/student/trajectory');
  await expect(page.getByText(TRAJECTORY_GOALS)).toBeVisible();
  await expect(page.getByText(other.fullName)).toHaveCount(0);

  // Сервер: чужие записи по прямым адресам API не выдаются (проверка не только в интерфейсе).
  const api = await apiAs(student);
  const otherApi = await apiAs(other);
  const otherTask = (
    await otherApi.call<{ items: { id: string }[] }>('GET', '/cabinet/assignments')
  ).items[0]!.id;
  const forbidden = [
    `/students/${other.id}/profile`,
    `/students/${other.id}/diagnostics`,
    `/students/${other.id}/motivation-profile`,
    `/students/${outsider.id}/profile`,
    `/trajectories/${other.trajectoryId}`,
    `/cabinet/assignments/${otherTask}`,
    `/students`,
    `/monitoring`,
    `/research-projects/${stand().research.id}/data`,
    `/reports/students/${other.id}?format=pdf`,
  ];
  for (const path of forbidden) {
    const response = await api.request('GET', path);
    expect([403, 404], `GET ${path} вернул ${response.status}`).toContain(response.status);
  }
  const submit = await api.request('POST', `/cabinet/assignments/${otherTask}/submissions`, {
    text: 'Чужой ответ',
  });
  expect([403, 404]).toContain(submit.status);

  // Свои данные доступны.
  const own = await api.call<{ items: { id: string }[] }>('GET', '/cabinet/assignments');
  expect(own.items).toHaveLength(3);
  expect(own.items.map((item) => item.id)).not.toContain(otherTask);
});
