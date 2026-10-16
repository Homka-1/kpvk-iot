import 'reflect-metadata';
import { loadEnv } from './config/load-env.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

loadEnv();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
