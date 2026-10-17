import { expect, test } from '@playwright/test';
import type {
  QuestionnaireContent,
  QuestionnaireDetailDto,
  QuestionnaireSummaryDto,
  QuestionnaireVersionDto,
} from '@iot/shared';
import { expectNoHorizontalScroll, fakeUser, mockSession } from './support/session';

const teacher = fakeUser(['teacher']);
const Q_ID = '00000000-0000-7000-8000-0000000000e1';
const V1 = '00000000-0000-7000-8000-0000000000e2';
const direction = {
  id: '00000000-0000-7000-8000-0000000000e3',
  code: 'LEARNING_MOTIVATION',
  name: 'Учебная мотивация',
  sortOrder: 10,
};

/**
 * Имитация API методик в памяти: создание, чтение, сохранение черновика и публикация.
 * Сервер заменяет временные ключи новых элементов на постоянные — здесь так же.
 */
async function mockQuestionnairesApi(page: import('@playwright/test').Page) {
  const state: { content: QuestionnaireContent | null; status: 'DRAFT' | 'PUBLISHED' } = {
    content: null,
    status: 'DRAFT',
  };
  const requests: { method: string; url: string; idempotencyKey?: string; body?: unknown }[] = [];
  const versionInfo = () => ({
    id: V1,
    versionNumber: 1,
    status: state.status,
    title: state.content!.title,
    changeNote: null,
    createdAt: '2026-10-17T08:00:00.000Z',
    publishedAt: state.status === 'PUBLISHED' ? '2026-10-17T09:00:00.000Z' : null,
  });
  const detail = (): QuestionnaireDetailDto => ({
    id: Q_ID,
    status: 'ACTIVE',
    isDemo: false,
    direction: null,
    copiedFrom: null,
    archivedAt: null,
    versions: [versionInfo()],
    comparabilities: [],
  });
  const version = (): QuestionnaireVersionDto => ({
    ...versionInfo(),
    questionnaireId: Q_ID,
    content: state.content!,
  });
  let counter = 0;
  const stableKeys = (content: QuestionnaireContent): QuestionnaireContent => {
    const map = new Map<string, string>();
    const fix = (key: string) => {
      if (!key.startsWith('new-')) return key;
      if (!map.has(key)) map.set(key, `saved-${(counter += 1)}`);
      return map.get(key)!;
    };
    return {
      ...content,
      questions: content.questions.map((q) => ({
        ...q,
        key: fix(q.key),
        options: q.options.map((o) => ({ ...o, key: fix(o.key) })),
      })),
      scales: content.scales.map((s) => ({
        ...s,
        key: fix(s.key),
        keys: s.keys.map((k) => ({
          ...k,
          questionKey: fix(k.questionKey),
          optionKey: k.optionKey && fix(k.optionKey),
        })),
        rules: s.rules.map((r) => ({ ...r, key: fix(r.key) })),
      })),
    };
  };

  await page.route('**/api/diagnostic-directions', (route) => route.fulfill({ json: [direction] }));
  await page.route(/\/api\/questionnaires(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { content: QuestionnaireContent };
      requests.push({
        method: 'POST',
        url: request.url(),
        idempotencyKey: request.headers()['idempotency-key'],
        body,
      });
      state.content = stableKeys(body.content);
      return route.fulfill({ status: 201, json: detail() });
    }
    const list: QuestionnaireSummaryDto[] = state.content
      ? [
          {
            id: Q_ID,
            title: state.content.title,
            status: 'ACTIVE',
            isDemo: false,
            direction: null,
            published: null,
            draft: { id: V1, versionNumber: 1, status: 'DRAFT' },
            questionCount: state.content.questions.length,
            archivedAt: null,
            updatedAt: '2026-10-17T08:00:00.000Z',
          },
        ]
      : [];
    return route.fulfill({ json: list });
  });
  await page.route(`**/api/questionnaires/${Q_ID}`, (route) => route.fulfill({ json: detail() }));
  await page.route(`**/api/questionnaires/${Q_ID}/versions/${V1}`, async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as QuestionnaireContent;
      requests.push({ method: 'PUT', url: request.url(), body });
      state.content = stableKeys(body);
    }
    return route.fulfill({ json: version() });
  });
  await page.route(`**/api/questionnaires/${Q_ID}/versions/${V1}/publish`, (route) => {
    requests.push({ method: 'PUBLISH', url: route.request().url() });
    state.status = 'PUBLISHED';
    return route.fulfill({ json: version() });
  });
  return { state, requests };
}

test.describe('конструктор диагностических методик', () => {
  test('FR-017, FR-021, NFR-004: создание методики, вопрос, шкала с обратным ключом, публикация', async ({
    page,
  }) => {
    await mockSession(page, teacher);
    const { state, requests } = await mockQuestionnairesApi(page);

    await page.goto('/diagnostics');
    await expect(page.getByText('Методик пока нет')).toBeVisible();
    await page.getByRole('button', { name: 'Создать методику' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Новая методика' });
    await createDialog.getByLabel('Название').fill('Учебная мотивация (тест)');
    await createDialog.getByRole('button', { name: 'Создать' }).click();

    await expect(page).toHaveURL(`/diagnostics/questionnaires/${Q_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Учебная мотивация (тест)');
    expect(requests[0]!.idempotencyKey).toBeTruthy();

    // Вопрос: шкала Лайкерта 1–5 по умолчанию.
    await page.getByRole('tab', { name: /Вопросы/ }).click();
    await page.getByRole('button', { name: 'Добавить вопрос' }).click();
    await page.getByLabel('Текст вопроса').fill('На занятиях мне скучно');

    // Шкала и обратный ключ на этот вопрос.
    await page.getByRole('tab', { name: /Шкалы и ключи/ }).click();
    await page.getByRole('button', { name: 'Добавить шкалу' }).click();
    await page.getByRole('region', { name: 'Шкала 1' }).getByLabel('Название').fill('Интерес');
    await page.getByRole('button', { name: 'Добавить ключ' }).click();
    await page.getByLabel('Обратный ключ').check();
    await expect(page.getByText('Возможный балл: от 1 до 5')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Черновик сохранён')).toBeVisible();
    const saved = requests.find((item) => item.method === 'PUT')!.body as QuestionnaireContent;
    expect(saved.questions[0]).toMatchObject({ text: 'На занятиях мне скучно', type: 'LIKERT' });
    expect(saved.scales[0]!.keys[0]).toMatchObject({
      questionKey: saved.questions[0]!.key,
      isReverse: true,
    });

    // Предпросмотр считает обратный ключ: ответ 2 → 1 + 5 − 2 = 4.
    await page.getByRole('button', { name: 'Предпросмотр' }).click();
    const preview = page.getByRole('dialog', { name: 'Предпросмотр методики' });
    await expect(preview.getByRole('cell', { name: 'Нет данных' })).toBeVisible();
    await preview.getByText('2', { exact: true }).click();
    await expect(preview.getByRole('cell', { name: '4', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();

    await page.getByRole('button', { name: 'Опубликовать версию' }).click();
    await page
      .getByRole('dialog', { name: 'Публикация версии' })
      .getByRole('button', { name: 'Опубликовать' })
      .click();
    await expect(page.getByText('Версия 1 опубликована и больше не изменяется')).toBeVisible();
    expect(state.status).toBe('PUBLISHED');
    await expect(page.getByRole('button', { name: 'Создать новую версию' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('п. 4.4: направления диагностики доступны во вкладке раздела', async ({ page }) => {
    await mockSession(page, teacher);
    await mockQuestionnairesApi(page);
    await page.goto('/diagnostics');
    await page.getByRole('tab', { name: 'Направления' }).click();
    await expect(page.getByText('Учебная мотивация')).toBeVisible();
    await expect(page.getByText('Код: LEARNING_MOTIVATION')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('п. 2.1: администратор не видит раздел «Диагностика» и конструктор', async ({ page }) => {
    await mockSession(page, fakeUser(['admin']));
    await page.goto(`/diagnostics/questionnaires/${Q_ID}`);
    await expect(page.getByText('Нет доступа')).toBeVisible();
  });
});
