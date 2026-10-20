// Выгрузка описания API в `docs/api/openapi.json` (передаваемая документация API, п. 13 ТЗ).
// Запуск из корня репозитория: `pnpm docs:openapi`. База данных не нужна: приложение собирается
// без инициализации модулей и без запуска HTTP-сервера.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { loadEnv } from '../config/load-env.js';
import { AppLogger } from '../logging/app-logger.js';

/** Путь по умолчанию — от `apps/api/dist/cli` к `docs/api` в корне репозитория. */
const DEFAULT_OUTPUT = resolve(import.meta.dirname, '../../../../docs/api/openapi.json');

async function main(): Promise<void> {
  loadEnv();
  const output = resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  const logger = new AppLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  const document = configureApp(app, logger);
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`Описание API сохранено: ${output}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
