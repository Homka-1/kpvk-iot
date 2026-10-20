import { expect, type Page } from '@playwright/test';
import { ApiClient, isoDate, type StandData, type StandStudent } from './seed.ts';
import { readStand } from './stand.ts';

export { ApiClient, type StandData, type StandStudent };

let cached: StandData | null = null;

/** Данные стенда, записанные global-setup (`stand.local.json`). */
export function stand(): StandData {
  cached ??= readStand();
  return cached;
}

/** Студент экспериментальной группы по номеру в списке (1–20). */
export const experimental = (number: number): StandStudent =>
  stand().experimental.students[number - 1]!;
/** Студент контрольной группы по номеру в списке (1–20). */
export const control = (number: number): StandStudent => stand().control.students[number - 1]!;

type Staff = 'admin' | 'teacher' | 'researcher';

/** Вход через форму входа, как у пользователя. */
export async function signIn(page: Page, who: Staff | StandStudent): Promise<void> {
  const [login, password] =
    typeof who === 'string'
      ? [who, stand().passwords[who]]
      : [who.login, stand().passwords.students];
  await page.goto('/login');
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Клиент API для подготовки предусловий сценария и проверок доступа. */
export function apiAs(who: Staff | StandStudent): Promise<ApiClient> {
  const data = stand();
  return typeof who === 'string'
    ? ApiClient.login(data.apiUrl, who, data.passwords[who])
    : ApiClient.login(data.apiUrl, who.login, data.passwords.students);
}

/** Дата для поля ввода «дд/мм/гггг» со сдвигом в днях от сегодняшнего дня. */
export function typedDate(offsetDays: number): string {
  return isoDate(offsetDays).split('-').reverse().join('/');
}

/**
 * Студент отправляет ответ на задание траектории, преподаватель принимает его с полным баллом
 * по всем критериям — через API, как предусловие сценария.
 */
export async function completeTask(student: StandStudent, title: string): Promise<void> {
  const [studentApi, teacherApi] = await Promise.all([apiAs(student), apiAs('teacher')]);
  const cabinet = await studentApi.call<{ items: { id: string; assignment: { title: string } }[] }>(
    'GET',
    '/cabinet/assignments',
  );
  const item = cabinet.items.find((entry) => entry.assignment.title === title);
  if (!item) throw new Error(`У студента ${student.login} нет задания «${title}»`);
  await studentApi.call('POST', `/cabinet/assignments/${item.id}/start`, {});
  await studentApi.call('POST', `/cabinet/assignments/${item.id}/submissions`, { text: 'Ответ' });
  const work = await teacherApi.call<{
    criteria: { id: string; maxScore: number }[];
    submissions: { id: string }[];
  }>('GET', `/student-assignments/${item.id}`);
  await teacherApi.call('POST', `/student-assignments/${item.id}/assessments`, {
    submissionId: work.submissions.at(-1)!.id,
    decision: 'ACCEPTED',
    criterionScores: work.criteria.map((criterion) => ({
      criterionId: criterion.id,
      score: criterion.maxScore,
    })),
  });
}

/** Преподаватель назначает демо-методику одному студенту экспериментальной группы (FR-018). */
export async function assignDiagnostic(
  page: Page,
  student: StandStudent,
  measurement = 'Первичный',
): Promise<void> {
  const { questionnaire, experimental: group } = stand();
  await page.goto('/diagnostics');
  await page.getByRole('tab', { name: 'Назначения' }).click();
  await page.getByRole('button', { name: 'Назначить диагностику' }).click();
  const dialog = page.getByRole('dialog', { name: 'Назначение диагностики' });
  await dialog.getByRole('combobox', { name: 'Методика' }).click();
  await page.getByRole('option', { name: questionnaire.title }).click();
  if (measurement !== 'Первичный') {
    await dialog.getByRole('combobox', { name: 'Замер' }).click();
    await page.getByRole('option', { name: measurement, exact: true }).click();
  }
  await dialog.getByText('Одному студенту').click();
  await dialog.getByRole('combobox', { name: 'Группа' }).click();
  await page.getByRole('option', { name: group.name, exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Студент' }).click();
  await page
    .getByRole('option', { name: `${student.fullName} (${student.participantCode})` })
    .click();
  await dialog.getByRole('button', { name: 'Назначить' }).click();
  const details = page.getByRole('dialog', { name: 'Прохождения диагностики' });
  await expect(details.getByText(student.fullName)).toBeVisible();
  await expect(details.getByText('Назначена')).toBeVisible();
}

/**
 * Студент проходит демо-методику в кабинете (UC-01) с ответами контрольного примера
 * «высокий уровень» (01-high, п. 11.3): познавательный интерес 13, мотивация достижения 11.
 */
export async function passDemoHigh(page: Page): Promise<void> {
  await page.goto('/student/diagnostics');
  await page.getByRole('link', { name: stand().questionnaire.title }).first().click();
  await page.getByRole('button', { name: 'Начать' }).click();
  const question = (text: string) => page.getByRole('group', { name: new RegExp(text) });
  for (const [text, value] of [
    ['Мне интересно узнавать новое', '5'],
    ['На занятиях мне чаще всего скучно', '1'],
    ['Я стараюсь выполнить задание лучше', '5'],
    ['Если задание трудное', '1'],
  ] as const) {
    await question(text).getByLabel(value, { exact: true }).check();
  }
  await question('Почему вы выбрали').getByLabel('Мне интересна эта профессия').check();
  await question('Что помогает вам учиться').getByLabel('Интерес к предмету').check();
  await question('Что помогает вам учиться').getByLabel('Желание получить высокую оценку').check();
  await question('Сколько часов в неделю').getByLabel('Ответ').fill('10');
  await question('Что бы вы хотели изменить').getByLabel('Ответ').fill('Больше практики');
  await expect(page.getByText(/Черновик сохранён/)).toBeVisible();
  await page.getByRole('button', { name: 'Завершить' }).click();
  await page
    .getByRole('dialog', { name: 'Завершение диагностики' })
    .getByRole('button', { name: 'Завершить' })
    .click();
  await expect(page.getByText('Диагностика пройдена')).toBeVisible();
}

/** Выбор группы в шапке сотрудника: от неё зависят списки разделов (FR-004). */
export async function chooseGroup(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Учебная группа' }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
