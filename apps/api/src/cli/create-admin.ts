// Создание учётной записи администратора на рабочем сервере, где демо-сид не запускается.
// Запуск в контейнере API: `node dist/cli/create-admin.js [логин]` (по умолчанию `admin`).
// Пароль временный: выводится один раз, при первом входе система потребует его сменить.
import { PrismaPg } from '@prisma/adapter-pg';
import { LOGIN_PATTERN, RoleCode } from '@iot/shared';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.js';
import { syncRbacCatalog } from '../auth/rbac-catalog.js';
import { loadEnv } from '../config/load-env.js';
import { PrismaClient } from '../generated/prisma/client.js';

async function main(): Promise<void> {
  loadEnv();
  const login = (process.argv[2] ?? 'admin').trim();
  if (!LOGIN_PATTERN.test(login)) {
    throw new Error('Логин: от 3 до 64 символов — латинские буквы, цифры, точка, дефис, «_»');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Не задана переменная окружения DATABASE_URL');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (await prisma.user.findUnique({ where: { login } })) {
      throw new Error(`Учётная запись «${login}» уже существует`);
    }
    await syncRbacCatalog(prisma);
    const password = generateTemporaryPassword();
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
      const user = await tx.user.create({
        data: {
          login,
          lastName: 'Администратор',
          firstName: 'Системный',
          passwordHash,
          mustChangePassword: true,
          roles: { create: { roleId: role.id } },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'user.created',
          entityType: 'user',
          entityId: user.id,
          after: { login, roles: [RoleCode.ADMIN], source: 'create-admin' },
        },
      });
    });
    console.log(`Создана учётная запись администратора «${login}».`);
    console.log(`Временный пароль: ${password}`);
    console.log('При первом входе система попросит сменить пароль.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
