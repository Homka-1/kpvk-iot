import 'reflect-metadata';
import { loadEnv } from './config/load-env.js';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppLogger } from './logging/app-logger.js';

loadEnv();

async function bootstrap(): Promise<void> {
  const logger = new AppLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  configureApp(app, logger);
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
