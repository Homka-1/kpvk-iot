import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const apiRoot = join(import.meta.dirname, '..');
const migrationsDir = join(apiRoot, 'prisma', 'migrations');
const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Таблицы, обязательные по п. 7 ТЗ. */
const SPEC_TABLES = [
  'users',
  'roles',
  'students',
  'groups',
  'disciplines',
  'enrollments',
  'questionnaires',
  'questionnaire_versions',
  'questions',
  'answer_options',
  'diagnostic_sessions',
  'diagnostic_answers',
  'diagnostic_scores',
  'motivation_profiles',
  'trajectory_templates',
  'trajectories',
  'trajectory_versions',
  'trajectory_stages',
  'assignments',
  'trajectory_assignments',
  'submissions',
  'assessments',
  'feedback',
  'reflections',
  'academic_results',
  'research_projects',
  'research_participants',
  'audit_logs',
];

/** Таблицы, записи которых только добавляются (триггер forbid_modification). */
const IMMUTABLE_TABLES = [
  'audit_logs',
  'diagnostic_answers',
  'diagnostic_revisions',
  'diagnostic_scores',
  'motivation_profile_history',
  'trajectory_versions',
];

function clientFor(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

describe('База данных (e2e)', () => {
  it('NFR-007: тестовая база подключается и все миграции применены', async () => {
    const prisma = new PrismaService();
    try {
      const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
      expect(rows).toEqual([{ ok: 1 }]);
      const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name`;
      expect(applied.map((row) => row.migration_name)).toEqual(migrationNames);
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('чистая база', () => {
    const baseUrl = new URL(process.env.DATABASE_URL!);
    const tempDb = `iot_migration_check_${process.pid}_test`;
    const tempUrl = new URL(baseUrl);
    tempUrl.pathname = `/${tempDb}`;
    const admin = clientFor(baseUrl.toString());
    let temp: PrismaClient | undefined;

    beforeAll(async () => {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${tempDb}"`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${tempDb}"`);
      execFileSync(join(apiRoot, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: tempUrl.toString() },
        stdio: 'pipe',
      });
      temp = clientFor(tempUrl.toString());
    }, 120_000);

    afterAll(async () => {
      await temp?.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${tempDb}" WITH (FORCE)`);
      await admin.$disconnect();
    });

    it('NFR-007: миграции применяются к пустой базе и создают все таблицы п. 7 ТЗ', async () => {
      const rows = await temp!.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
      const tables = rows.map((row) => row.table_name);
      expect(tables).toEqual(expect.arrayContaining(SPEC_TABLES));
    });

    it('FR-013, FR-043: неизменяемые таблицы защищены триггером', async () => {
      const rows = await temp!.$queryRaw<{ table_name: string }[]>`
        SELECT c.relname AS table_name FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE p.proname = 'forbid_modification' AND NOT t.tgisinternal`;
      expect(rows.map((row) => row.table_name).sort()).toEqual(IMMUTABLE_TABLES);
    });

    it('п. 8.3: запись журнала аудита нельзя изменить или удалить', async () => {
      const entry = await temp!.auditLog.create({
        data: { action: 'test.created', entityType: 'test' },
      });
      // Сырые запросы: Prisma передаёт текст ошибки PostgreSQL без преобразования.
      await expect(
        temp!
          .$executeRaw`UPDATE audit_logs SET action = 'test.changed' WHERE id = ${entry.id}::uuid`,
      ).rejects.toThrow(/неизменяема: UPDATE запрещён/);
      await expect(
        temp!.$executeRaw`DELETE FROM audit_logs WHERE id = ${entry.id}::uuid`,
      ).rejects.toThrow(/неизменяема: DELETE запрещён/);
    });
  });
});
