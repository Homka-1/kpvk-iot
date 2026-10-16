// Демо-данные для разработки. Идемпотентен: повторный запуск не создаёт дублей и не меняет
// пароли существующих учётных записей. Справочники и данные модулей добавляются на этапах,
// где появляются эти модули (демо-методика — этап 06 и т. д.).
//
// Пароли учётных записей берутся из переменных окружения SEED_<РОЛЬ>_PASSWORD (.env).
// Если переменная не задана, пароль генерируется и один раз выводится в консоль.
import { PrismaPg } from '@prisma/adapter-pg';
import { RoleCode } from '@iot/shared';
import { loadEnv } from '../src/config/load-env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { generateTemporaryPassword, hashPassword } from '../src/auth/passwords.js';
import { syncRbacCatalog } from '../src/auth/rbac-catalog.js';

loadEnv();

interface SeedAccount {
  login: string;
  role: RoleCode;
  lastName: string;
  firstName: string;
  middleName?: string;
  /** Для студента — код участника исследования. */
  participantCode?: string;
}

const ACCOUNTS: SeedAccount[] = [
  { login: 'admin', role: RoleCode.ADMIN, lastName: 'Администратор', firstName: 'Системный' },
  {
    login: 'teacher',
    role: RoleCode.TEACHER,
    lastName: 'Демо-преподаватель',
    firstName: 'Елена',
    middleName: 'Викторовна',
  },
  {
    login: 'student',
    role: RoleCode.STUDENT,
    lastName: 'Демо-студент',
    firstName: 'Арман',
    participantCode: 'DEMO-0001',
  },
  {
    login: 'researcher',
    role: RoleCode.RESEARCHER,
    lastName: 'Демо-исследователь',
    firstName: 'Айгерим',
  },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Не задана переменная окружения DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await syncRbacCatalog(prisma);
    console.log('Сид: роли и разрешения синхронизированы.');

    for (const account of ACCOUNTS) {
      if (await prisma.user.findUnique({ where: { login: account.login } })) {
        console.log(`Сид: учётная запись «${account.login}» уже есть — пропущена.`);
        continue;
      }
      const envName = `SEED_${account.role.toUpperCase()}_PASSWORD`;
      const fromEnv = process.env[envName];
      const password = fromEnv || generateTemporaryPassword();
      const role = await prisma.role.findUniqueOrThrow({ where: { code: account.role } });
      const user = await prisma.user.create({
        data: {
          login: account.login,
          lastName: account.lastName,
          firstName: account.firstName,
          middleName: account.middleName,
          passwordHash: await hashPassword(password),
          roles: { create: { roleId: role.id } },
        },
      });
      if (account.participantCode) {
        await prisma.student.create({
          data: {
            userId: user.id,
            participantCode: account.participantCode,
            lastName: account.lastName,
            firstName: account.firstName,
          },
        });
      }
      console.log(
        fromEnv
          ? `Сид: создана учётная запись «${account.login}» (пароль из ${envName}).`
          : `Сид: создана учётная запись «${account.login}», пароль: ${password} (задайте ${envName}, чтобы выбрать свой).`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
