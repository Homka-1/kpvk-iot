import type { DemoStatusDto } from '@iot/shared';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWithApp, testUser } from '@/testing/mount';
import DemoDialog from './DemoDialog.vue';

const status = (overrides: Partial<DemoStatusDto> = {}): DemoStatusDto => ({
  active: false,
  exists: false,
  stage: 'NONE',
  job: null,
  period: { from: '2025-10-01', to: '2026-04-30' },
  ...overrides,
});

function mockApi(responses: Record<string, DemoStatusDto>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^\/api/, '');
    const body = responses[`${init?.method ?? 'GET'} ${path}`];
    return new Response(JSON.stringify(body ?? { message: 'Не найдено' }), {
      status: body === undefined ? 404 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const mountDialog = () =>
  mountWithApp(DemoDialog, {
    props: { visible: true },
    attachTo: document.body,
    user: testUser(['admin']),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Демонстрационное отображение', () => {
  it('до подготовки данных отображение не включается', async () => {
    mockApi({ 'GET /admin/demo': status() });
    await mountDialog();
    await flushPromises();
    expect(document.body.textContent).toContain('Не подготовлены');
    expect(document.body.textContent).toContain('01.10.2025 — 30.04.2026');
    const toggle = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Включить отображение'),
    );
    expect(toggle?.disabled).toBe(true);
  });

  it('запуск подготовки показывает текущий шаг', async () => {
    const running = status({
      exists: true,
      job: {
        kind: 'PREPARE',
        status: 'RUNNING',
        step: 'Расписание и журнал наблюдений',
        error: null,
        startedAt: '2026-10-29T10:00:00.000Z',
        finishedAt: null,
      },
    });
    const fetchMock = mockApi({ 'GET /admin/demo': status(), 'POST /admin/demo/prepare': running });
    await mountDialog();
    await flushPromises();
    const prepare = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Подготовить данные'),
    )!;
    prepare.click();
    await flushPromises();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    expect(document.body.textContent).toContain('Расписание и журнал наблюдений');
  });
});
