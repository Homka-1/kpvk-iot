import { expect, test } from '@playwright/test';
import type {
  ComparabilityQuestionnaireDto,
  ResearchDataDto,
  ResearchMeasurementDto,
  ResearchParticipantDto,
  ResearchProjectDetailDto,
} from '@iot/shared';
import {
  EMPTY_ANALYTICS,
  expectNoHorizontalScroll,
  fakeUser,
  mockSession,
} from './support/session';

const PROJECT_ID = '0190a000-0000-7000-8000-0000000000aa';
const V1 = '0190a000-0000-7000-8000-0000000000b1';
const EG_GROUP = '0190a000-0000-7000-8000-0000000000c1';
const CG_GROUP = '0190a000-0000-7000-8000-0000000000c2';

const stats = (n: number, mean: number | null, missing = 0) => ({
  n,
  missing,
  mean,
  median: mean,
  sd: n > 1 ? 1.5 : null,
  min: mean,
  q1: mean,
  q3: mean,
  max: mean,
});

const questionnaire: ComparabilityQuestionnaireDto = {
  id: 'q1',
  title: 'Учебная мотивация (ДЕМО)',
  isDemo: true,
  versions: [
    {
      id: V1,
      versionNumber: 1,
      title: 'Учебная мотивация (ДЕМО)',
      status: 'PUBLISHED',
      publishedAt: null,
    },
  ],
  comparabilities: [],
};

test.describe('исследовательский режим', () => {
  test('UC-07, AT-11, NFR-004: исследование, ЭГ и КГ, замер, таблица и обезличенный экспорт', async ({
    page,
  }) => {
    // Длинный сквозной сценарий: в WebKit и Firefox близок к стандартному лимиту 30 с.
    test.slow();
    await mockSession(page, fakeUser(['researcher']));
    const state: {
      project: ResearchProjectDetailDto | null;
      participants: ResearchParticipantDto[];
    } = { project: null, participants: [] };
    const requests: {
      method: string;
      path: string;
      body: unknown;
      headers: Record<string, string>;
    }[] = [];
    const exports: URL[] = [];

    await page.route('**/api/questionnaire-comparabilities', (route) =>
      route.fulfill({ json: [questionnaire] }),
    );
    await page.route(/\/api\/research-projects(\/.*)?(\?.*)?$/, (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace('/api/research-projects', '');
      requests.push({
        method: request.method(),
        path,
        body: request.postDataJSON(),
        headers: request.headers(),
      });
      if (path === '' && request.method() === 'POST') {
        const body = request.postDataJSON() as { title: string };
        state.project = {
          id: PROJECT_ID,
          title: body.title,
          description: null,
          status: 'DRAFT',
          startsOn: null,
          endsOn: null,
          participants: { EXPERIMENTAL: 0, CONTROL: 0 },
          measurements: 0,
          createdAt: '2026-10-19T08:00:00.000Z',
          updatedAt: '2026-10-19T08:00:00.000Z',
          editable: true,
          measurementList: [],
        };
        return route.fulfill({ status: 201, json: state.project });
      }
      if (path === '') return route.fulfill({ json: state.project ? [state.project] : [] });
      if (path === '/candidate-groups') {
        return route.fulfill({
          json: [
            { id: EG_GROUP, name: 'ПО-21', course: 2, specialty: 'ПО', students: 20 },
            { id: CG_GROUP, name: 'ПО-22', course: 2, specialty: 'ПО', students: 20 },
          ],
        });
      }
      if (path === `/${PROJECT_ID}`) return route.fulfill({ json: state.project });
      if (path === `/${PROJECT_ID}/participants` && request.method() === 'POST') {
        const body = request.postDataJSON() as { groupId: string; group: string };
        if (body.group === 'CONTROL') {
          return route.fulfill({
            status: 409,
            json: {
              statusCode: 409,
              message:
                'Контрольная группа не получает ИОТ: у студентов с кодами S-0007 есть маршрут в работе',
            },
          });
        }
        state.participants = Array.from({ length: 20 }, (_, index) => ({
          id: `p${index}`,
          code: `R${String(index + 1).padStart(3, '0')}`,
          group: 'EXPERIMENTAL',
          academicGroup: 'ПО-21',
          includedAt: '2026-10-19T08:00:00.000Z',
          excludedAt: null,
          fullName: null,
        }));
        state.project = { ...state.project!, participants: { EXPERIMENTAL: 20, CONTROL: 0 } };
        return route.fulfill({ status: 201, json: { added: 20, skipped: 0 } });
      }
      if (path === `/${PROJECT_ID}/participants`) {
        return route.fulfill({ json: state.participants });
      }
      if (path === `/${PROJECT_ID}/measurements`) {
        const body = request.postDataJSON() as { title: string; measurementType: 'PRIMARY' };
        const measurement: ResearchMeasurementDto = {
          id: 'm1',
          title: body.title,
          measurementType: body.measurementType,
          questionnaire: {
            questionnaireId: 'q1',
            versionId: V1,
            versionNumber: 1,
            title: 'Учебная мотивация (ДЕМО)',
            isDemo: true,
          },
          startsOn: null,
          endsOn: null,
          createdAt: '2026-10-19T08:00:00.000Z',
        };
        state.project = {
          ...state.project!,
          measurements: 1,
          measurementList: [measurement],
        };
        return route.fulfill({ status: 201, json: state.project });
      }
      if (path === `/${PROJECT_ID}/data`) {
        const measurements = state.project!.measurementList;
        const data: ResearchDataDto = {
          measurements,
          scales: [
            {
              key: 'q1:COGNITIVE',
              questionnaireId: 'q1',
              questionnaireTitle: 'Учебная мотивация (ДЕМО)',
              code: 'COGNITIVE',
              name: 'Познавательный интерес',
            },
          ],
          observations: [
            { group: 'EXPERIMENTAL', participants: 20, complete: 18, incomplete: 2 },
            { group: 'CONTROL', participants: 0, complete: 0, incomplete: 0 },
          ],
          stats: measurements.flatMap((item) => [
            {
              measurementId: item.id,
              scaleKey: 'q1:COGNITIVE',
              group: 'EXPERIMENTAL' as const,
              stats: stats(18, 7.25, 2),
            },
            {
              measurementId: item.id,
              scaleKey: 'q1:COGNITIVE',
              group: 'CONTROL' as const,
              stats: stats(0, null),
            },
          ]),
          changes: [],
          excludedParticipants: 0,
          rows: [],
        };
        return route.fulfill({ json: data });
      }
      if (path === `/${PROJECT_ID}/export`) {
        exports.push(url);
        return route.fulfill({
          body: '﻿Код участника;Группа исследования;Наблюдение\r\nR001;ЭГ;полное',
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="research-raw-2026-10-19.csv"',
          },
        });
      }
      return route.fulfill({ status: 404, json: { statusCode: 404, message: 'Не найдено' } });
    });
    await page.route(/\/api\/analytics(\?.*)?$/, (route) =>
      route.fulfill({ json: EMPTY_ANALYTICS }),
    );

    // Аналитика → исследование.
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аналитика');
    await expect(page.getByRole('tab', { name: 'Показатели' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Новое исследование' }).click();
    await page.getByLabel('Название').fill('Эффективность ИОТ');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page).toHaveURL(`/analytics/research/${PROJECT_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Эффективность ИОТ');
    const created = requests.find((item) => item.method === 'POST' && item.path === '')!;
    expect(created.headers['idempotency-key']).toBeTruthy();

    // Группы ЭГ и КГ: контрольной группе с ИОТ сервер отказывает (огр. 4).
    const includeGroup = async (name: string, label: string) => {
      await page.locator('#participants-group').click();
      await page.getByRole('option', { name: new RegExp(name) }).click();
      await page.getByLabel(label).check();
      await page.getByRole('button', { name: 'Включить студентов группы' }).click();
    };
    await includeGroup('ПО-21', 'Экспериментальная группа');
    await expect(page.getByText('Включено: 20. Уже участвовали: 0.')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'R001', exact: true })).toBeVisible();
    await includeGroup('ПО-22', 'Контрольная группа');
    await expect(page.getByRole('alert')).toContainText('Контрольная группа не получает ИОТ');

    // Замер по версии методики.
    await page.getByRole('button', { name: 'Новый замер' }).click();
    await page.getByLabel('Название замера').fill('Входной замер');
    await page.locator('#measurement-version').click();
    await page.getByRole('option', { name: /версия 1/ }).click();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByRole('heading', { name: 'Входной замер' })).toBeVisible();

    // Таблица: полные и неполные наблюдения, «Нет данных» для КГ без значений.
    const observations = page.getByRole('region', { name: 'Полные и неполные наблюдения' });
    await expect(observations.getByRole('row', { name: /Экспериментальная группа/ })).toContainText(
      '18',
    );
    await expect(page.getByText('Нет данных').first()).toBeVisible();

    // Обезличенный экспорт.
    await page.getByLabel('CSV (UTF-8, «;»)').check();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспортировать' }).click();
    expect((await download).suggestedFilename()).toBe('research-raw-2026-10-19.csv');
    await expect(page.getByText('Файл сформирован.')).toBeVisible();
    expect(exports[0]!.searchParams.get('format')).toBe('csv');
    expect(exports[0]!.searchParams.get('dataset')).toBe('raw');
    await expectNoHorizontalScroll(page);
  });

  test('FR-069, NFR-004: преподаватель видит показатели аналитики без исследовательских вкладок', async ({
    page,
  }) => {
    await mockSession(page, fakeUser(['teacher']));
    await page.goto('/analytics');
    await expect(page.getByRole('tab', { name: 'Показатели' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Исследования' })).toHaveCount(0);
    await expect(page.getByText('Нет данных для аналитики')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
