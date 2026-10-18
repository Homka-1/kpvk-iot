// Демо-данные для разработки. Идемпотентен: повторный запуск не создаёт дублей и не меняет
// пароли существующих учётных записей. Справочники и данные модулей добавляются на этапах,
// где появляются эти модули (демо-методика — этап 06 и т. д.).
//
// Пароли учётных записей берутся из переменных окружения SEED_<РОЛЬ>_PASSWORD (.env).
// Если переменная не задана, пароль генерируется и один раз выводится в консоль.
import { PrismaPg } from '@prisma/adapter-pg';
import { publishIssues, RoleCode } from '@iot/shared';
import { loadEnv } from '../src/config/load-env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { generateTemporaryPassword, hashPassword } from '../src/auth/passwords.js';
import { syncRbacCatalog } from '../src/auth/rbac-catalog.js';
import { loadDefinitions } from '../src/diagnostics/questionnaire-definitions.js';
import { passportData, replaceContent } from '../src/diagnostics/questionnaire-content.js';
import { syncAssignmentTypes } from '../src/library/assignment-types-catalog.js';
import { syncTrajectoryTemplates } from '../src/trajectories/trajectory-templates-catalog.js';

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

    await seedDirectory(prisma);
    await seedQuestionnaires(prisma);
    await syncAssignmentTypes(prisma);
    await syncTrajectoryTemplates(prisma);
    await seedLibrary(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Демо-справочники (этап 04): группа, дисциплина, закрепление демо-преподавателя и зачисление
 * демо-студента. Существующие записи не меняются.
 */
async function seedDirectory(prisma: PrismaClient): Promise<void> {
  const group = await prisma.group.upsert({
    where: { name: 'ДЕМО-21' },
    update: {},
    create: { name: 'ДЕМО-21', course: 2, specialty: 'Программное обеспечение (демо)' },
  });
  const discipline = await prisma.discipline.upsert({
    where: { name: 'Математика (демо)' },
    update: {},
    create: { name: 'Математика (демо)', code: 'ДЕМО-МАТ' },
  });
  const teacher = await prisma.user.findUnique({ where: { login: 'teacher' } });
  if (teacher) {
    const assigned = await prisma.teacherAssignment.findFirst({
      where: {
        teacherId: teacher.id,
        groupId: group.id,
        disciplineId: discipline.id,
        endsAt: null,
      },
    });
    if (!assigned) {
      await prisma.teacherAssignment.create({
        data: { teacherId: teacher.id, groupId: group.id, disciplineId: discipline.id },
      });
    }
  }
  const student = await prisma.student.findUnique({ where: { participantCode: 'DEMO-0001' } });
  if (student && !student.currentGroupId) {
    await prisma.student.update({
      where: { id: student.id },
      data: {
        currentGroupId: group.id,
        enrollments: { create: { groupId: group.id, reason: 'Демо-данные' } },
      },
    });
  }
  console.log('Сид: демо-группа «ДЕМО-21» и дисциплина «Математика (демо)» готовы.');
}

/**
 * Методики из файлов `prisma/questionnaires/<методика>/v<N>.json` (этап 06). Пока заказчик не
 * передал реальные методики, это только демо-методика с пометкой «ДЕМО — не для исследования»
 * (огр. 1, ADR-003). Методика ищется по названию версии 1; существующие не меняются.
 * Каждая версия публикуется, предыдущая выводится из использования.
 */
async function seedQuestionnaires(prisma: PrismaClient): Promise<void> {
  const definitions = loadDefinitions();
  for (const slug of new Set(definitions.map((definition) => definition.slug))) {
    const versions = definitions
      .filter((definition) => definition.slug === slug)
      .sort((a, b) => a.version - b.version);
    const first = versions[0]!;
    const exists = await prisma.questionnaireVersion.findFirst({
      where: { versionNumber: 1, title: first.content.title },
    });
    if (exists) {
      console.log(`Сид: методика «${first.content.title}» уже есть — пропущена.`);
      continue;
    }
    for (const definition of versions) {
      const issues = publishIssues(definition.content, definition.isDemo);
      if (issues.length > 0) {
        throw new Error(
          `Методика ${slug} v${definition.version}: ${issues.map((issue) => issue.message).join('; ')}`,
        );
      }
    }
    const direction = first.directionCode
      ? await prisma.diagnosticDirection.findUnique({ where: { code: first.directionCode } })
      : null;
    await prisma.$transaction(async (tx) => {
      const questionnaire = await tx.questionnaire.create({
        data: { directionId: direction?.id ?? null, isDemo: first.isDemo },
      });
      for (const definition of versions) {
        await tx.questionnaireVersion.updateMany({
          where: { questionnaireId: questionnaire.id, status: 'PUBLISHED' },
          data: { status: 'RETIRED' },
        });
        const version = await tx.questionnaireVersion.create({
          data: {
            questionnaireId: questionnaire.id,
            versionNumber: definition.version,
            ...passportData(definition.content),
          },
        });
        await replaceContent(tx, version.id, definition.content);
        await tx.questionnaireVersion.update({
          where: { id: version.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      }
    });
    console.log(`Сид: методика «${first.content.title}» опубликована.`);
  }
}

/**
 * Демо-библиотека (этап 10): материал-текст и задание по демо-дисциплине. Без файлов —
 * их содержимое хранится вне БД. Записи ищутся по названию; существующие не меняются.
 */
async function seedLibrary(prisma: PrismaClient): Promise<void> {
  const discipline = await prisma.discipline.findUniqueOrThrow({
    where: { name: 'Математика (демо)' },
  });
  const teacher = await prisma.user.findUnique({ where: { login: 'teacher' } });
  const materialTitle = 'Памятка: как решать текстовые задачи (демо)';
  if (!(await prisma.material.findFirst({ where: { title: materialTitle } }))) {
    await prisma.material.create({
      data: {
        title: materialTitle,
        kind: 'TEXT',
        body: '1. Прочитайте условие и выделите известные величины.\n2. Сделайте схему или таблицу.\n3. Составьте уравнение.\n4. Проверьте ответ по смыслу задачи.',
        disciplineId: discipline.id,
        topic: 'Текстовые задачи',
        createdById: teacher?.id ?? null,
      },
    });
  }
  const assignmentTitle = 'Практическая работа: линейные уравнения (демо)';
  if (!(await prisma.assignment.findFirst({ where: { title: assignmentTitle } }))) {
    const type = await prisma.assignmentType.findUniqueOrThrow({ where: { code: 'practical' } });
    await prisma.assignment.create({
      data: {
        title: assignmentTitle,
        disciplineId: discipline.id,
        topic: 'Линейные уравнения',
        goal: 'Научиться решать линейные уравнения и проверять решение подстановкой',
        difficulty: 'BASIC',
        typeId: type.id,
        instruction: 'Решите 10 уравнений из файла задания. Для каждого выполните проверку.',
        submissionFormats: ['TEXT', 'FILE'],
        maxScore: 10,
        createdById: teacher?.id ?? null,
        criteria: {
          create: [
            { sortOrder: 0, title: 'Верность решений', maxScore: 7 },
            { sortOrder: 1, title: 'Проверка подстановкой', maxScore: 3 },
          ],
        },
      },
    });
  }
  console.log('Сид: демо-материал и демо-задание библиотеки готовы.');
}

await main();
