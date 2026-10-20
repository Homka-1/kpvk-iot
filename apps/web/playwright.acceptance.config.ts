import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_COMMAND, WEB_URL } from './e2e/acceptance/support/stand.ts';

/**
 * Приёмочный набор AT-01…AT-12 (п. 11.2 ТЗ) на живом стенде: настоящий API и отдельная база
 * `iot_acceptance` без подмены ответов. Стенд готовит `e2e/acceptance/global-setup.ts`.
 * Запуск — `pnpm test:acceptance` из корня (собирает shared и API).
 *
 * Сценарии выполняются по одному: они общие для учётной записи преподавателя, а каждый работает
 * со своими студентами стенда, поэтому порядок запуска на результат не влияет.
 */
export default defineConfig({
  testDir: './e2e/acceptance',
  outputDir: './test-results/acceptance',
  globalSetup: './e2e/acceptance/global-setup.ts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/acceptance', open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Сборка как в рабочей системе: dev-сервер Vite перезагружает страницу, когда во время
    // сценария впервые встречает новую зависимость, и обрывает запросы.
    command: WEB_COMMAND,
    url: WEB_URL,
    timeout: 180_000,
    env: { VITE_API_PROXY: API_URL },
    reuseExistingServer: false,
  },
  projects: [{ name: 'acceptance', use: { ...devices['Desktop Chrome'] } }],
});
