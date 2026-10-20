/**
 * Приёмочный стенд: отдельная база `iot_acceptance`, API на порту 3200, данные приёмки.
 *
 * Порядок: миграции → очистка таблиц → базовый сид (роли, демо-методика, учётные записи
 * сотрудников со случайными паролями) → запуск API → данные приёмки через API (`seed.ts`).
 * Итог записывается в `stand.local.json` (не коммитится): адреса, пароли и идентификаторы.
 *
 * Стенд работает только с базой `iot_acceptance` (NFR-010): база разработки и база автотестов
 * не затрагиваются. Переменные окружения берутся из `.env.test` (секрет JWT, доступ к PostgreSQL).
 *
 * Запуск вручную (для приёмочной комиссии): `pnpm acceptance:stand` — поднимает стенд и
 * интерфейс на http://localhost:5273 и работает до Ctrl+C.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { seedAcceptance, type StandData } from './seed.ts';

export const ROOT = resolve(import.meta.dirname, '../../../../..');
export const API_PORT = 3200;
export const WEB_PORT = 5273;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
/** Интерфейс стенда: production-сборка и `vite preview` с прокси `/api` на API стенда. */
export const WEB_COMMAND = `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`;
export const STAND_FILE = resolve(import.meta.dirname, '../stand.local.json');
const DATABASE = 'iot_acceptance';
const LOG_DIR = resolve(ROOT, 'apps/web/test-results');

/** Очистка всех таблиц, кроме журнала миграций: каждый прогон начинается с одинаковых данных. */
const CLEAN_SQL = `DO $$ BEGIN EXECUTE (
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
    || ' RESTART IDENTITY CASCADE'
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
); END $$;`;

function standEnv(passwords: StandData['passwords'] | Omit<StandData['passwords'], 'students'>) {
  const file = resolve(ROOT, '.env.test');
  if (!existsSync(file)) {
    throw new Error('Нет файла .env.test: скопируйте .env.example и задайте значения (README)');
  }
  const base = parseEnv(readFileSync(file, 'utf8'));
  const url = new URL(base.DATABASE_URL ?? '');
  url.pathname = `/${DATABASE}`;
  return {
    ...process.env,
    ...base,
    ENV_FILE: '.env.test',
    NODE_ENV: 'development',
    DATABASE_URL: url.toString(),
    API_PORT: String(API_PORT),
    LOG_LEVEL: 'warn',
    FILE_STORAGE_DIR: resolve(ROOT, 'storage/acceptance'),
    SEED_ADMIN_PASSWORD: passwords.admin,
    SEED_TEACHER_PASSWORD: passwords.teacher,
    SEED_RESEARCHER_PASSWORD: passwords.researcher,
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, input?: string): void {
  const result = spawnSync(command, args, { cwd: ROOT, env, input, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `Стенд: команда «${command} ${args.join(' ')}» завершилась с ошибкой\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function waitForHealth(api: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(`API стенда завершился с кодом ${api.exitCode}`);
    try {
      if ((await fetch(`${API_URL}/api/health`)).ok) return;
    } catch {
      // API ещё запускается.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error('API стенда не ответил за 60 секунд');
}

/**
 * Готовит базу и запускает API стенда (собранный `apps/api/dist`). Возвращает данные приёмки
 * и функцию остановки API.
 */
export async function startStand(): Promise<{ stand: StandData; stop: () => void }> {
  const passwords = {
    admin: `Админ-${randomBytes(6).toString('hex')}`,
    teacher: `Препод-${randomBytes(6).toString('hex')}`,
    researcher: `Исслед-${randomBytes(6).toString('hex')}`,
  };
  const env = standEnv(passwords);
  if (!existsSync(resolve(ROOT, 'apps/api/dist/main.js'))) {
    throw new Error('API не собран: выполните `pnpm --filter @iot/api build`');
  }
  run('pnpm', ['--filter', '@iot/api', 'exec', 'prisma', 'migrate', 'deploy'], env);
  run(
    'pnpm',
    ['--filter', '@iot/api', 'exec', 'prisma', 'db', 'execute', '--stdin'],
    env,
    CLEAN_SQL,
  );
  run('pnpm', ['--filter', '@iot/api', 'exec', 'prisma', 'db', 'seed'], env);

  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(resolve(LOG_DIR, 'acceptance-api.log'));
  const api = spawn('node', ['dist/main.js'], { cwd: resolve(ROOT, 'apps/api'), env });
  api.stdout?.pipe(log);
  api.stderr?.pipe(log);
  const stop = () => {
    if (api.exitCode === null) api.kill('SIGTERM');
  };
  try {
    await waitForHealth(api);
    const stand = await seedAcceptance({ apiUrl: API_URL, webUrl: WEB_URL, passwords });
    writeFileSync(STAND_FILE, JSON.stringify(stand, null, 2));
    return { stand, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

export function readStand(): StandData {
  return JSON.parse(readFileSync(STAND_FILE, 'utf8')) as StandData;
}

async function main(): Promise<void> {
  const { stand, stop } = await startStand();
  const web = spawn(WEB_COMMAND, {
    cwd: resolve(ROOT, 'apps/web'),
    env: { ...process.env, VITE_API_PROXY: API_URL },
    stdio: 'inherit',
    shell: true,
  });
  const shutdown = () => {
    web.kill('SIGTERM');
    stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(
    [
      '',
      `Приёмочный стенд готов: ${WEB_URL} (API ${API_URL}, база ${DATABASE}).`,
      `Учётные записи и пароли — ${STAND_FILE}.`,
      `Студенты: ${stand.experimental.name} (ЭГ) и ${stand.control.name} (КГ), логины p-1001…p-2020, общий пароль из файла.`,
      'Остановить — Ctrl+C.',
    ].join('\n'),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
