// Перечень сторонних библиотек и лицензий (п. 13 ТЗ) — `docs/licenses.md`.
//   pnpm docs:licenses   — пересобрать перечень по установленным зависимостям;
//   pnpm licenses:check  — проверить, что все лицензии рассмотрены и перечень актуален.
// Источник — `pnpm licenses list` и `pnpm list` (зависимости должны быть установлены).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'docs/licenses.md');

/**
 * Рассмотренные лицензии. Новая лицензия в зависимостях (после обновления) должна быть
 * оценена и добавлена сюда с пояснением, иначе `licenses:check` завершится ошибкой.
 */
const REVIEWED_LICENSES = {
  MIT: 'разрешительная',
  'MIT/X11': 'разрешительная (вариант MIT)',
  'MIT and ISC': 'разрешительная',
  '(MIT AND Zlib)': 'разрешительная',
  '(MIT OR CC0-1.0)': 'разрешительная; используется MIT',
  '(MIT OR GPL-3.0-or-later)': 'двойная; используется MIT, требования GPL не применяются',
  ISC: 'разрешительная',
  '0BSD': 'разрешительная',
  BSD: 'разрешительная (BSD)',
  'BSD-2-Clause': 'разрешительная',
  'BSD-3-Clause': 'разрешительная',
  'Apache-2.0': 'разрешительная, с сохранением уведомлений NOTICE',
  'BlueOak-1.0.0': 'разрешительная',
  'MIT-0': 'разрешительная',
  Unlicense: 'общественное достояние',
  'CC0-1.0': 'общественное достояние',
  'CC-BY-4.0': 'разрешительная, с указанием авторства (данные caniuse-lite в инструментах сборки)',
  'Python-2.0': 'разрешительная',
  'MPL-2.0':
    'слабая копилефт на уровне файла: при изменении файлов библиотеки их исходный код раскрывается; использование без изменений ограничений не накладывает',
  'EPL-2.0':
    'слабая копилефт на уровне модуля: при изменении библиотеки её исходный код раскрывается; использование без изменений ограничений не накладывает',
  Unknown: 'лицензия в пакете не указана — см. примечания',
};

/** Назначение прямых зависимостей. Новая прямая зависимость должна получить описание. */
const PURPOSES = {
  '@nestjs/common': 'Фреймворк серверной части (NestJS)',
  '@nestjs/core': 'Фреймворк серверной части (NestJS)',
  '@nestjs/jwt': 'Access-токены JWT',
  '@nestjs/platform-express': 'HTTP-сервер Express для NestJS',
  '@nestjs/swagger': 'Описание API OpenAPI и страница `/api/docs`',
  '@prisma/adapter-pg': 'Подключение Prisma к PostgreSQL',
  '@prisma/client': 'Доступ к базе данных (ORM Prisma)',
  prisma: 'Миграции базы данных',
  argon2: 'Хеширование паролей argon2id',
  'class-transformer': 'Преобразование тел запросов',
  'class-validator': 'Проверка данных запросов',
  'cookie-parser': 'Чтение cookie сессии',
  dotenv: 'Загрузка переменных окружения',
  exceljs: 'Импорт и экспорт XLSX',
  helmet: 'Заголовки безопасности HTTP',
  papaparse: 'Импорт и экспорт CSV',
  pdfmake: 'Формирование отчётов PDF (со шрифтом Roboto, Apache-2.0)',
  pino: 'Журнал сервера с маскированием персональных данных',
  'reflect-metadata': 'Метаданные декораторов для NestJS',
  rxjs: 'Реактивные потоки, требуются NestJS',
  '@primeuix/themes': 'Тема оформления PrimeVue',
  '@vee-validate/zod': 'Связка проверки форм со схемами zod',
  'chart.js': 'Диаграммы',
  pinia: 'Хранилище состояния интерфейса',
  primeicons: 'Иконки интерфейса',
  primevue: 'Компоненты интерфейса (PrimeVue)',
  'vee-validate': 'Проверка форм',
  vue: 'Фреймворк интерфейса (Vue 3)',
  'vue-chartjs': 'Диаграммы Chart.js в компонентах Vue',
  'vue-router': 'Маршрутизация интерфейса',
  zod: 'Схемы проверки данных, общие для сервера и интерфейса',
  '@eslint/js': 'Статический анализ кода',
  eslint: 'Статический анализ кода',
  'eslint-config-prettier': 'Согласование ESLint и Prettier',
  'eslint-plugin-vue': 'Статический анализ компонентов Vue',
  globals: 'Глобальные имена для ESLint',
  husky: 'Проверки перед коммитом',
  'lint-staged': 'Проверки перед коммитом',
  prettier: 'Форматирование кода',
  typescript: 'Язык TypeScript',
  'typescript-eslint': 'Статический анализ TypeScript',
  '@nestjs/cli': 'Сборка серверной части',
  '@nestjs/testing': 'Тесты серверной части',
  '@types/cookie-parser': 'Типы TypeScript',
  '@types/express': 'Типы TypeScript',
  '@types/jest': 'Типы TypeScript',
  '@types/node': 'Типы TypeScript',
  '@types/papaparse': 'Типы TypeScript',
  '@types/pdfmake': 'Типы TypeScript',
  '@types/supertest': 'Типы TypeScript',
  jest: 'Тесты серверной части',
  supertest: 'HTTP-тесты API',
  'ts-jest': 'TypeScript в Jest',
  tsx: 'Запуск служебных скриптов TypeScript',
  '@playwright/test': 'Сквозные тесты в браузере',
  '@vitejs/plugin-vue': 'Сборка компонентов Vue',
  '@vue/test-utils': 'Тесты компонентов Vue',
  jsdom: 'Браузерное окружение для тестов',
  vite: 'Сборка интерфейса',
  vitest: 'Модульные тесты',
  'vue-tsc': 'Проверка типов компонентов Vue',
};

/** Пояснения к пакетам, требующим внимания. */
const NOTES = {
  buffers:
    'В пакете не указана лицензия. Используется косвенно: exceljs → unzipper → binary (чтение XLSX при импорте студентов). При юридической проверке оценить отдельно или заменить импорт XLSX.',
  jszip: 'Двойная лицензия MIT или GPL-3.0; используется на условиях MIT.',
  elkjs:
    'EPL-2.0. Используется косвенно пакетом prisma (Prisma Studio — инструмент просмотра базы для разработчика) и в работе приложения не задействуется.',
  lightningcss:
    'MPL-2.0. Используется сборщиком интерфейса Vite при сборке; в готовое приложение не входит.',
  'lightningcss-linux-x64-gnu': 'MPL-2.0. Платформенная сборка lightningcss, см. выше.',
};

/** Сторонние компоненты вне npm, входящие в поставку. */
const OTHER_COMPONENTS = [
  ['Node.js 24 (образ `node:24-alpine`)', 'MIT и лицензии компонентов', 'Среда выполнения API'],
  ['PostgreSQL 16 (образ `postgres:16-alpine`)', 'PostgreSQL License', 'СУБД'],
  [
    'nginx (образ `nginxinc/nginx-unprivileged:1.30-alpine`)',
    'BSD-2-Clause',
    'Обратный прокси, HTTPS, раздача интерфейса',
  ],
  [
    'Alpine Linux (основа образов)',
    'MIT, GPL-2.0 и др. для пакетов ОС',
    'Базовая система контейнеров; используется без изменений',
  ],
  ['Шрифт Roboto (в составе pdfmake)', 'Apache-2.0', 'Кириллица в отчётах PDF'],
];

function pnpm(args) {
  return JSON.parse(
    execFileSync('pnpm', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  );
}

/** Имя автора без адреса e-mail и сайта: «Имя <почта> (сайт)» → «Имя»; голый адрес не выводится. */
function authorName(author) {
  const name = (author ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  return name.includes('@') ? '' : name;
}

function cell(text) {
  return String(text ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function table(header, rows) {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function build() {
  const licenses = pnpm(['licenses', 'list', '--prod', '--json']);
  const packages = [];
  for (const [license, list] of Object.entries(licenses)) {
    for (const item of list) packages.push({ ...item, license });
  }
  packages.sort((a, b) => a.name.localeCompare(b.name));
  const licenseOf = new Map(packages.map((item) => [item.name, item.license]));

  const devLicenses = pnpm(['licenses', 'list', '--json']);
  const allLicense = new Map();
  for (const [license, list] of Object.entries(devLicenses)) {
    for (const item of list) allLicense.set(item.name, license);
  }

  const problems = [];
  for (const license of new Set([...licenseOf.values(), ...allLicense.values()])) {
    if (!(license in REVIEWED_LICENSES)) {
      problems.push(`Лицензия «${license}» не рассмотрена (REVIEWED_LICENSES)`);
    }
  }

  const workspaces = pnpm(['list', '-r', '--depth', '0', '--json']);
  const direct = [];
  const dev = new Map();
  for (const workspace of workspaces) {
    for (const [name, info] of Object.entries(workspace.dependencies ?? {})) {
      if (name.startsWith('@iot/')) continue;
      direct.push([name, info.version, workspace.name]);
    }
    for (const [name, info] of Object.entries(workspace.devDependencies ?? {})) {
      const entry = dev.get(name) ?? { version: info.version, used: [] };
      entry.used.push(workspace.name);
      dev.set(name, entry);
    }
  }
  for (const name of [...direct.map(([name]) => name), ...dev.keys()]) {
    if (!(name in PURPOSES)) problems.push(`Нет описания назначения прямой зависимости «${name}»`);
  }

  const directRows = new Map();
  for (const [name, version, workspace] of direct) {
    const row = directRows.get(name) ?? { version, used: [] };
    row.used.push(workspace);
    directRows.set(name, row);
  }

  const summary = new Map();
  for (const license of licenseOf.values()) summary.set(license, (summary.get(license) ?? 0) + 1);

  const attention = packages.filter((item) => item.name in NOTES);
  const lines = [
    '# Сторонние библиотеки и лицензии',
    '',
    'Перечень формируется автоматически по установленным зависимостям командой `pnpm docs:licenses` (скрипт `scripts/licenses.mjs`); `pnpm licenses:check` проверяет, что каждая встречающаяся лицензия рассмотрена и перечень не устарел. Файл не редактируется вручную: пояснения задаются в скрипте.',
    '',
    'Все библиотеки используются без изменения их исходного кода. Ни одна npm-библиотека не используется на условиях сильной копилефт-лицензии (GPL, AGPL). Перечень составлен с запасом: в него входят все пакеты, которые pnpm относит к рабочим зависимостям, включая используемые только при сборке.',
    '',
    '## Сводка по лицензиям',
    '',
    `Пакетов, входящих в работающее приложение (вместе с косвенными зависимостями): ${packages.length}.`,
    '',
    table(
      ['Лицензия', 'Пакетов', 'Оценка'],
      [...summary.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([license, count]) => [
          license,
          count,
          REVIEWED_LICENSES[license] ?? 'не рассмотрена',
        ]),
    ),
    '',
    '## Пакеты, требующие внимания',
    '',
    table(
      ['Пакет', 'Версия', 'Лицензия', 'Пояснение'],
      attention.map((item) => [
        item.name,
        item.versions.join(', '),
        item.license,
        NOTES[item.name],
      ]),
    ),
    '',
    '## Прямые зависимости приложения',
    '',
    table(
      ['Библиотека', 'Версия', 'Лицензия', 'Где', 'Назначение'],
      [...directRows.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, row]) => [
          name,
          row.version,
          licenseOf.get(name) ?? '—',
          row.used.join(', '),
          PURPOSES[name] ?? '',
        ]),
    ),
    '',
    '## Инструменты разработки и тестирования',
    '',
    'Используются только при разработке, сборке и тестировании; в рабочую поставку не входят.',
    '',
    table(
      ['Инструмент', 'Версия', 'Лицензия', 'Назначение'],
      [...dev.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, entry]) => [
          name,
          entry.version,
          allLicense.get(name) ?? '—',
          PURPOSES[name] ?? '',
        ]),
    ),
    '',
    '## Компоненты вне npm',
    '',
    table(['Компонент', 'Лицензия', 'Назначение'], OTHER_COMPONENTS),
    '',
    '## Полный перечень пакетов приложения',
    '',
    table(
      ['Пакет', 'Версии', 'Лицензия', 'Автор'],
      packages.map((item) => [
        item.name,
        item.versions.join(', '),
        item.license,
        authorName(item.author),
      ]),
    ),
    '',
  ];
  return { text: lines.join('\n'), problems };
}

function prettier(text) {
  return execFileSync('pnpm', ['exec', 'prettier', '--stdin-filepath', OUTPUT], {
    cwd: ROOT,
    input: text,
    encoding: 'utf8',
  });
}

const { text, problems } = build();
const formatted = prettier(text);
if (process.argv.includes('--check')) {
  if (readFileSync(OUTPUT, 'utf8') !== formatted) {
    problems.push('docs/licenses.md устарел: выполните `pnpm docs:licenses`');
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Лицензии проверены, перечень актуален.');
} else {
  writeFileSync(OUTPUT, formatted);
  for (const problem of problems) console.warn(problem);
  console.log(`Перечень сохранён: ${OUTPUT}`);
}
