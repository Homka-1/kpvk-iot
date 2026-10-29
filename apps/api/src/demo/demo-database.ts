import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const run = promisify(execFile);

/** Каталог пакета API (там prisma.config.ts и миграции): src/demo или dist/demo → ../.. */
const API_ROOT = resolve(import.meta.dirname, '../..');
const COPY_BATCH = 2000;
/** Таблицы, которые в копию не переносятся: история действий и уведомления копии — свои. */
const SKIPPED_TABLES = new Set(['_prisma_migrations', 'audit_logs', 'notifications']);

/**
 * Демонстрационная копия рабочей базы на том же сервере PostgreSQL: `<имя базы>_demo`.
 * Схема создаётся теми же миграциями Prisma, данные переносятся таблица за таблицей.
 * Работа с базами (CREATE/DROP DATABASE, отключение триггеров на время копирования) требует
 * прав владельца сервера — так настроены контейнер postgres и окружения разработки.
 */
export class DemoDatabase {
  readonly name: string;
  private readonly url: string;

  constructor(mainUrl: string) {
    const url = new URL(mainUrl);
    this.name = `${decodeURIComponent(url.pathname.slice(1))}_demo`;
    url.pathname = `/${encodeURIComponent(this.name)}`;
    this.url = url.toString();
  }

  connect(): PrismaClient {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: this.url }) });
  }

  async exists(main: PrismaClient): Promise<boolean> {
    const rows = await main.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${this.name}`;
    return rows.length > 0;
  }

  async drop(main: PrismaClient): Promise<void> {
    await main.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${this.quotedName} WITH (FORCE)`);
  }

  /** Пустая копия со схемой текущих миграций. */
  async create(main: PrismaClient): Promise<void> {
    await this.drop(main);
    await main.$executeRawUnsafe(`CREATE DATABASE ${this.quotedName}`);
    await this.migrate();
  }

  /** Применяет новые миграции к копии (после обновления приложения). */
  async migrate(): Promise<void> {
    const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    await run(process.execPath, [cli, 'migrate', 'deploy'], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: this.url },
    });
  }

  /** Переносит данные рабочей базы в пустую копию. Триггеры и внешние ключи на время отключены. */
  async copyFrom(main: PrismaClient, demo: PrismaClient): Promise<void> {
    const tables = await main.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    await demo.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        for (const { tablename } of tables) {
          if (SKIPPED_TABLES.has(tablename)) continue;
          const table = `"${tablename.replaceAll('"', '""')}"`;
          // Пустая таблица по миграции может содержать справочники — их заменяют данные рабочей базы.
          await tx.$executeRawUnsafe(`DELETE FROM ${table}`);
          for (let offset = 0; ; offset += COPY_BATCH) {
            const [{ rows }] = await main.$queryRawUnsafe<[{ rows: string | null }]>(
              `SELECT json_agg(t)::text AS rows FROM (SELECT * FROM ${table} ORDER BY 1 LIMIT ${COPY_BATCH} OFFSET ${offset}) t`,
            );
            if (!rows) break;
            await tx.$executeRawUnsafe(
              `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`,
              rows,
            );
          }
        }
      },
      { timeout: 10 * 60 * 1000, maxWait: 30 * 1000 },
    );
  }

  private get quotedName(): string {
    return `"${this.name.replaceAll('"', '""')}"`;
  }
}
