import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_COMMAND, WEB_URL } from './e2e/acceptance/support/stand.ts';

/**
 * Снимки экранов для руководств пользователей (`docs/guides/img`). Работает на том же приёмочном
 * стенде, что и `pnpm test:acceptance`, но отдельным набором: в приёмочный прогон не входит.
 * Запуск — `pnpm docs:screenshots` из корня.
 */
export default defineConfig({
  testDir: './e2e/guides',
  outputDir: './test-results/guides',
  globalSetup: './e2e/acceptance/global-setup.ts',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: WEB_COMMAND,
    url: WEB_URL,
    timeout: 180_000,
    env: { VITE_API_PROXY: API_URL },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'guides',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
