import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Переменные окружения лежат в корне монорепо (.env — разработка, .env.test — тесты).
config({
  path: resolve(import.meta.dirname, '../../', process.env.ENV_FILE ?? '.env'),
  quiet: true,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
