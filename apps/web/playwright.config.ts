import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Приёмочный набор идёт на живом стенде: playwright.acceptance.config.ts.
  testIgnore: 'acceptance/**',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    // --force: заново собрать зависимости при старте. Иначе Vite берёт старый кэш (lockfile не менялся),
    // находит новый импорт ленивой страницы во время теста и перезагружает её посреди сценария.
    command: 'pnpm dev --force',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // NFR-004: минимальная поддерживаемая ширина экрана — 360 px.
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
    // NFR-003: другие движки браузеров (Firefox; WebKit — Safari и браузеры iOS).
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
