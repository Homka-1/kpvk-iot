# Сторонние библиотеки и лицензии

Перечень формируется автоматически по установленным зависимостям командой `pnpm docs:licenses` (скрипт `scripts/licenses.mjs`); `pnpm licenses:check` проверяет, что каждая встречающаяся лицензия рассмотрена и перечень не устарел. Файл не редактируется вручную: пояснения задаются в скрипте.

Все библиотеки используются без изменения их исходного кода. Ни одна npm-библиотека не используется на условиях сильной копилефт-лицензии (GPL, AGPL). Перечень составлен с запасом: в него входят все пакеты, которые pnpm относит к рабочим зависимостям, включая используемые только при сборке.

## Сводка по лицензиям

Пакетов, входящих в работающее приложение (вместе с косвенными зависимостями): 537.

| Лицензия                  | Пакетов | Оценка                                                                                                                                                |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIT                       | 447     | разрешительная                                                                                                                                        |
| ISC                       | 37      | разрешительная                                                                                                                                        |
| Apache-2.0                | 27      | разрешительная, с сохранением уведомлений NOTICE                                                                                                      |
| BSD-3-Clause              | 7       | разрешительная                                                                                                                                        |
| Unlicense                 | 3       | общественное достояние                                                                                                                                |
| BSD-2-Clause              | 2       | разрешительная                                                                                                                                        |
| MPL-2.0                   | 2       | слабая копилефт на уровне файла: при изменении файлов библиотеки их исходный код раскрывается; использование без изменений ограничений не накладывает |
| (MIT AND Zlib)            | 1       | разрешительная                                                                                                                                        |
| (MIT OR CC0-1.0)          | 1       | разрешительная; используется MIT                                                                                                                      |
| (MIT OR GPL-3.0-or-later) | 1       | двойная; используется MIT, требования GPL не применяются                                                                                              |
| 0BSD                      | 1       | разрешительная                                                                                                                                        |
| BlueOak-1.0.0             | 1       | разрешительная                                                                                                                                        |
| BSD                       | 1       | разрешительная (BSD)                                                                                                                                  |
| EPL-2.0                   | 1       | слабая копилефт на уровне модуля: при изменении библиотеки её исходный код раскрывается; использование без изменений ограничений не накладывает       |
| MIT and ISC               | 1       | разрешительная                                                                                                                                        |
| MIT/X11                   | 1       | разрешительная (вариант MIT)                                                                                                                          |
| Python-2.0                | 1       | разрешительная                                                                                                                                        |
| Unknown                   | 1       | лицензия в пакете не указана — см. примечания                                                                                                         |

## Пакеты, требующие внимания

| Пакет                      | Версия | Лицензия                  | Пояснение                                                                                                                                                                                 |
| -------------------------- | ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| buffers                    | 0.1.1  | Unknown                   | В пакете не указана лицензия. Используется косвенно: exceljs → unzipper → binary (чтение XLSX при импорте студентов). При юридической проверке оценить отдельно или заменить импорт XLSX. |
| elkjs                      | 0.11.1 | EPL-2.0                   | EPL-2.0. Используется косвенно пакетом prisma (Prisma Studio — инструмент просмотра базы для разработчика) и в работе приложения не задействуется.                                        |
| jszip                      | 3.10.2 | (MIT OR GPL-3.0-or-later) | Двойная лицензия MIT или GPL-3.0; используется на условиях MIT.                                                                                                                           |
| lightningcss               | 1.33.0 | MPL-2.0                   | MPL-2.0. Используется сборщиком интерфейса Vite при сборке; в готовое приложение не входит.                                                                                               |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0                   | MPL-2.0. Платформенная сборка lightningcss, см. выше.                                                                                                                                     |

## Прямые зависимости приложения

| Библиотека               | Версия  | Лицензия     | Где                   | Назначение                                               |
| ------------------------ | ------- | ------------ | --------------------- | -------------------------------------------------------- |
| @nestjs/common           | 12.1.3  | MIT          | @iot/api              | Фреймворк серверной части (NestJS)                       |
| @nestjs/core             | 12.1.3  | MIT          | @iot/api              | Фреймворк серверной части (NestJS)                       |
| @nestjs/jwt              | 12.0.3  | MIT          | @iot/api              | Access-токены JWT                                        |
| @nestjs/platform-express | 12.1.3  | MIT          | @iot/api              | HTTP-сервер Express для NestJS                           |
| @nestjs/swagger          | 12.0.2  | MIT          | @iot/api              | Описание API OpenAPI и страница `/api/docs`              |
| @primeuix/themes         | 2.0.3   | MIT          | @iot/web              | Тема оформления PrimeVue                                 |
| @prisma/adapter-pg       | 7.10.1  | Apache-2.0   | @iot/api              | Подключение Prisma к PostgreSQL                          |
| @prisma/client           | 7.10.1  | Apache-2.0   | @iot/api              | Доступ к базе данных (ORM Prisma)                        |
| @vee-validate/zod        | 4.15.1  | MIT          | @iot/web              | Связка проверки форм со схемами zod                      |
| argon2                   | 0.45.1  | MIT          | @iot/api              | Хеширование паролей argon2id                             |
| chart.js                 | 4.5.1   | MIT          | @iot/web              | Диаграммы                                                |
| class-transformer        | 0.5.1   | MIT          | @iot/api              | Преобразование тел запросов                              |
| class-validator          | 0.15.1  | MIT          | @iot/api              | Проверка данных запросов                                 |
| cookie-parser            | 1.4.7   | MIT          | @iot/api              | Чтение cookie сессии                                     |
| dotenv                   | 18.0.8  | BSD-2-Clause | @iot/api              | Загрузка переменных окружения                            |
| exceljs                  | 4.4.0   | MIT          | @iot/api              | Импорт и экспорт XLSX                                    |
| helmet                   | 8.3.0   | MIT          | @iot/api              | Заголовки безопасности HTTP                              |
| papaparse                | 5.7.0   | MIT          | @iot/api              | Импорт и экспорт CSV                                     |
| pdfmake                  | 0.2.20  | MIT          | @iot/api              | Формирование отчётов PDF (со шрифтом Roboto, Apache-2.0) |
| pinia                    | 4.1.0   | MIT          | @iot/web              | Хранилище состояния интерфейса                           |
| pino                     | 10.4.0  | MIT          | @iot/api              | Журнал сервера с маскированием персональных данных       |
| primeicons               | 7.0.0   | MIT          | @iot/web              | Иконки интерфейса                                        |
| primevue                 | 4.5.5   | MIT          | @iot/web              | Компоненты интерфейса (PrimeVue)                         |
| prisma                   | 7.10.1  | Apache-2.0   | @iot/api              | Миграции базы данных                                     |
| reflect-metadata         | 0.2.2   | Apache-2.0   | @iot/api              | Метаданные декораторов для NestJS                        |
| rxjs                     | 7.8.2   | Apache-2.0   | @iot/api              | Реактивные потоки, требуются NestJS                      |
| vee-validate             | 4.15.1  | MIT          | @iot/web              | Проверка форм                                            |
| vue                      | 3.5.44  | MIT          | @iot/web              | Фреймворк интерфейса (Vue 3)                             |
| vue-chartjs              | 5.3.4   | MIT          | @iot/web              | Диаграммы Chart.js в компонентах Vue                     |
| vue-router               | 5.4.0   | MIT          | @iot/web              | Маршрутизация интерфейса                                 |
| zod                      | 3.25.76 | MIT          | @iot/web, @iot/shared | Схемы проверки данных, общие для сервера и интерфейса    |

## Инструменты разработки и тестирования

Используются только при разработке, сборке и тестировании; в рабочую поставку не входят.

| Инструмент             | Версия  | Лицензия   | Назначение                           |
| ---------------------- | ------- | ---------- | ------------------------------------ |
| @eslint/js             | 10.0.1  | MIT        | Статический анализ кода              |
| @nestjs/cli            | 12.0.8  | MIT        | Сборка серверной части               |
| @nestjs/testing        | 12.1.3  | MIT        | Тесты серверной части                |
| @playwright/test       | 1.64.1  | Apache-2.0 | Сквозные тесты в браузере            |
| @types/cookie-parser   | 1.4.10  | MIT        | Типы TypeScript                      |
| @types/express         | 5.0.6   | MIT        | Типы TypeScript                      |
| @types/jest            | 30.0.0  | MIT        | Типы TypeScript                      |
| @types/node            | 24.19.2 | MIT        | Типы TypeScript                      |
| @types/papaparse       | 5.5.2   | MIT        | Типы TypeScript                      |
| @types/pdfmake         | 0.2.11  | MIT        | Типы TypeScript                      |
| @types/supertest       | 7.2.1   | MIT        | Типы TypeScript                      |
| @vitejs/plugin-vue     | 6.0.10  | MIT        | Сборка компонентов Vue               |
| @vue/test-utils        | 2.5.1   | MIT        | Тесты компонентов Vue                |
| eslint                 | 10.13.0 | MIT        | Статический анализ кода              |
| eslint-config-prettier | 10.1.8  | MIT        | Согласование ESLint и Prettier       |
| eslint-plugin-vue      | 10.11.1 | MIT        | Статический анализ компонентов Vue   |
| globals                | 17.13.0 | MIT        | Глобальные имена для ESLint          |
| husky                  | 9.1.7   | MIT        | Проверки перед коммитом              |
| jest                   | 30.5.2  | MIT        | Тесты серверной части                |
| jsdom                  | 30.1.3  | MIT        | Браузерное окружение для тестов      |
| lint-staged            | 17.6.0  | MIT        | Проверки перед коммитом              |
| prettier               | 3.9.10  | MIT        | Форматирование кода                  |
| supertest              | 7.3.1   | MIT        | HTTP-тесты API                       |
| ts-jest                | 29.4.15 | MIT        | TypeScript в Jest                    |
| tsx                    | 4.23.15 | MIT        | Запуск служебных скриптов TypeScript |
| typescript             | 6.0.3   | Apache-2.0 | Язык TypeScript                      |
| typescript-eslint      | 8.71.2  | MIT        | Статический анализ TypeScript        |
| vite                   | 8.3.4   | MIT        | Сборка интерфейса                    |
| vitest                 | 5.0.5   | MIT        | Модульные тесты                      |
| vue-tsc                | 3.3.13  | MIT        | Проверка типов компонентов Vue       |

## Компоненты вне npm

| Компонент                                               | Лицензия                          | Назначение                                              |
| ------------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Node.js 24 (образ `node:24-alpine`)                     | MIT и лицензии компонентов        | Среда выполнения API                                    |
| PostgreSQL 16 (образ `postgres:16-alpine`)              | PostgreSQL License                | СУБД                                                    |
| nginx (образ `nginxinc/nginx-unprivileged:1.30-alpine`) | BSD-2-Clause                      | Обратный прокси, HTTPS, раздача интерфейса              |
| Alpine Linux (основа образов)                           | MIT, GPL-2.0 и др. для пакетов ОС | Базовая система контейнеров; используется без изменений |
| Шрифт Roboto (в составе pdfmake)                        | Apache-2.0                        | Кириллица в отчётах PDF                                 |

## Полный перечень пакетов приложения

| Пакет                                  | Версии                                           | Лицензия                  | Автор                                    |
| -------------------------------------- | ------------------------------------------------ | ------------------------- | ---------------------------------------- |
| @babel/helper-string-parser            | 7.29.7, 8.0.6                                    | MIT                       | The Babel Team                           |
| @babel/helper-validator-identifier     | 7.29.7, 8.0.6                                    | MIT                       | The Babel Team                           |
| @babel/parser                          | 7.29.9, 8.0.7                                    | MIT                       | The Babel Team                           |
| @babel/types                           | 7.29.8, 8.0.6                                    | MIT                       | The Babel Team                           |
| @borewit/text-codec                    | 0.2.2                                            | MIT                       | Borewit                                  |
| @electric-sql/pglite                   | 0.4.3                                            | Apache-2.0                | Electric DB Limited                      |
| @electric-sql/pglite-socket            | 0.1.3                                            | Apache-2.0                | Electric DB Limited                      |
| @electric-sql/pglite-tools             | 0.3.3                                            | Apache-2.0                | Electric DB Limited                      |
| @epic-web/invariant                    | 1.0.0                                            | MIT                       | Kent C. Dodds                            |
| @esbuild/linux-x64                     | 0.28.2                                           | MIT                       |                                          |
| @fast-csv/format                       | 4.3.5                                            | MIT                       | doug-martin                              |
| @fast-csv/parse                        | 4.3.6                                            | MIT                       | doug-martin                              |
| @foliojs-fork/fontkit                  | 1.9.2                                            | MIT                       | Devon Govett                             |
| @foliojs-fork/linebreak                | 1.1.2                                            | MIT                       | Devon Govett                             |
| @foliojs-fork/pdfkit                   | 0.15.3                                           | MIT                       | Devon Govett                             |
| @foliojs-fork/restructure              | 2.0.2                                            | MIT                       | Devon Govett                             |
| @jridgewell/gen-mapping                | 0.3.13                                           | MIT                       | Justin Ridgewell                         |
| @jridgewell/remapping                  | 2.3.5                                            | MIT                       | Justin Ridgewell                         |
| @jridgewell/resolve-uri                | 3.1.2                                            | MIT                       | Justin Ridgewell                         |
| @jridgewell/sourcemap-codec            | 1.6.0                                            | MIT                       | Justin Ridgewell                         |
| @jridgewell/trace-mapping              | 0.3.31                                           | MIT                       | Justin Ridgewell                         |
| @kurkle/color                          | 0.3.4                                            | MIT                       | Jukka Kurkela                            |
| @lukeed/csprng                         | 1.1.0                                            | MIT                       | Luke Edwards                             |
| @microsoft/tsdoc                       | 0.17.0                                           | MIT                       |                                          |
| @nestjs/common                         | 12.1.3                                           | MIT                       | Kamil Mysliwiec                          |
| @nestjs/core                           | 12.1.3                                           | MIT                       | Kamil Mysliwiec                          |
| @nestjs/jwt                            | 12.0.3                                           | MIT                       | Kamil Mysliwiec                          |
| @nestjs/mapped-types                   | 12.0.0                                           | MIT                       | Kamil Mysliwiec                          |
| @nestjs/platform-express               | 12.1.3                                           | MIT                       | Kamil Mysliwiec                          |
| @nestjs/swagger                        | 12.0.2                                           | MIT                       | Kamil Mysliwiec                          |
| @oxc-project/types                     | 0.154.0                                          | MIT                       | Boshen and oxc contributors              |
| @phc/format                            | 1.0.0                                            | MIT                       | Simone Primarosa                         |
| @pinojs/redact                         | 0.4.0                                            | MIT                       | Matteo Collina                           |
| @primeuix/styled                       | 0.7.4                                            | MIT                       | PrimeTek Informatics                     |
| @primeuix/styles                       | 2.0.3                                            | MIT                       | PrimeTek Informatics                     |
| @primeuix/themes                       | 2.0.3                                            | MIT                       | PrimeTek Informatics                     |
| @primeuix/utils                        | 0.6.4                                            | MIT                       | PrimeTek Informatics                     |
| @primevue/core                         | 4.5.5                                            | MIT                       | PrimeTek Informatics                     |
| @primevue/icons                        | 4.5.5                                            | MIT                       | PrimeTek Informatics                     |
| @prisma/adapter-pg                     | 7.10.1                                           | Apache-2.0                | Tom Houlé                                |
| @prisma/client                         | 7.10.1                                           | Apache-2.0                | Tim Suchanek                             |
| @prisma/client-runtime-utils           | 7.10.1                                           | Apache-2.0                |                                          |
| @prisma/config                         | 7.10.1                                           | Apache-2.0                | Alberto Schiabel                         |
| @prisma/debug                          | 7.2.0, 7.10.1                                    | Apache-2.0                | Tim Suchanek                             |
| @prisma/dev                            | 0.24.17                                          | ISC                       | Igal Klebanov                            |
| @prisma/driver-adapter-utils           | 7.10.1                                           | Apache-2.0                | Alberto Schiabel                         |
| @prisma/engines                        | 7.10.1                                           | Apache-2.0                | Tim Suchanek                             |
| @prisma/engines-version                | 8.1.0-1.d1b3f377ca835d73fd50954a5e22128b9ebdd6b8 | Apache-2.0                | Tim Suchanek                             |
| @prisma/fetch-engine                   | 7.10.1                                           | Apache-2.0                | Tim Suchanek                             |
| @prisma/get-platform                   | 7.2.0, 7.10.1                                    | Apache-2.0                | Tim Suchanek                             |
| @prisma/query-plan-executor            | 7.2.0                                            | Apache-2.0                |                                          |
| @prisma/streams-local                  | 0.1.11                                           | Apache-2.0                |                                          |
| @prisma/studio-core                    | 0.33.0                                           | Apache-2.0                |                                          |
| @radix-ui/primitive                    | 1.1.3                                            | MIT                       |                                          |
| @radix-ui/react-compose-refs           | 1.1.2                                            | MIT                       |                                          |
| @radix-ui/react-primitive              | 2.1.3                                            | MIT                       |                                          |
| @radix-ui/react-slot                   | 1.2.3                                            | MIT                       |                                          |
| @radix-ui/react-toggle                 | 1.1.10                                           | MIT                       |                                          |
| @radix-ui/react-use-controllable-state | 1.2.2                                            | MIT                       |                                          |
| @radix-ui/react-use-effect-event       | 0.0.2                                            | MIT                       |                                          |
| @radix-ui/react-use-layout-effect      | 1.1.1                                            | MIT                       |                                          |
| @rolldown/binding-linux-x64-gnu        | 1.2.14                                           | MIT                       |                                          |
| @rolldown/pluginutils                  | 1.0.1                                            | MIT                       |                                          |
| @scarf/scarf                           | 1.4.0                                            | Apache-2.0                | Scarf Systems                            |
| @standard-schema/spec                  | 1.1.0                                            | MIT                       | Colin McDonnell                          |
| @tokenizer/inflate                     | 0.4.1                                            | MIT                       | Borewit                                  |
| @tokenizer/token                       | 0.3.0                                            | MIT                       | Borewit                                  |
| @types/d3-array                        | 3.0.3                                            | MIT                       |                                          |
| @types/d3-color                        | 3.1.0                                            | MIT                       |                                          |
| @types/d3-delaunay                     | 6.0.1                                            | MIT                       |                                          |
| @types/d3-format                       | 3.0.1                                            | MIT                       |                                          |
| @types/d3-geo                          | 3.1.0                                            | MIT                       |                                          |
| @types/d3-interpolate                  | 3.0.1                                            | MIT                       |                                          |
| @types/d3-path                         | 3.1.1                                            | MIT                       |                                          |
| @types/d3-scale                        | 4.0.2                                            | MIT                       |                                          |
| @types/d3-shape                        | 3.1.7                                            | MIT                       |                                          |
| @types/d3-time                         | 3.0.0                                            | MIT                       |                                          |
| @types/d3-time-format                  | 2.1.0                                            | MIT                       |                                          |
| @types/estree                          | 1.0.9                                            | MIT                       |                                          |
| @types/geojson                         | 7946.0.16                                        | MIT                       |                                          |
| @types/jsonwebtoken                    | 9.0.10                                           | MIT                       |                                          |
| @types/lodash                          | 4.17.26                                          | MIT                       |                                          |
| @types/ms                              | 2.1.0                                            | MIT                       |                                          |
| @types/node                            | 14.18.63, 24.19.2                                | MIT                       |                                          |
| @types/pg                              | 8.23.1                                           | MIT                       |                                          |
| @types/react                           | 19.3.0                                           | MIT                       |                                          |
| @types/validator                       | 13.15.10                                         | MIT                       |                                          |
| @vee-validate/zod                      | 4.15.1                                           | MIT                       | Abdelrahman Awad                         |
| @visx/curve                            | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/event                            | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/grid                             | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/group                            | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/point                            | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/responsive                       | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/scale                            | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/shape                            | 4.0.1-alpha.0                                    | MIT                       |                                          |
| @visx/vendor                           | 4.0.0-alpha.0                                    | MIT and ISC               |                                          |
| @vue-macros/common                     | 3.1.4                                            | MIT                       | Kevin Deng                               |
| @vue/compiler-core                     | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/compiler-dom                      | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/compiler-sfc                      | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/compiler-ssr                      | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/devtools-api                      | 7.7.10, 8.2.1                                    | MIT                       | webfansplz                               |
| @vue/devtools-kit                      | 7.7.10, 8.2.1                                    | MIT                       | webfansplz                               |
| @vue/devtools-shared                   | 7.7.10, 8.2.1                                    | MIT                       | webfansplz                               |
| @vue/reactivity                        | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/runtime-core                      | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/runtime-dom                       | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/server-renderer                   | 3.5.44                                           | MIT                       | Evan You                                 |
| @vue/shared                            | 3.5.44                                           | MIT                       | Evan You                                 |
| accepts                                | 2.0.0                                            | MIT                       |                                          |
| acorn                                  | 8.19.0                                           | MIT                       |                                          |
| ajv                                    | 8.20.0                                           | MIT                       | Evgeny Poberezkin                        |
| append-field                           | 1.0.0                                            | MIT                       | Linus Unnebäck                           |
| archiver                               | 5.3.2                                            | MIT                       | Chris Talkington                         |
| archiver-utils                         | 2.1.0, 3.0.4                                     | MIT                       | Chris Talkington                         |
| argon2                                 | 0.45.1                                           | MIT                       | Ranieri Althoff                          |
| argparse                               | 2.0.1                                            | Python-2.0                |                                          |
| array-buffer-byte-length               | 1.0.2                                            | MIT                       | Jordan Harband                           |
| arraybuffer.prototype.slice            | 1.0.4                                            | MIT                       | Jordan Harband                           |
| ast-kit                                | 2.2.0, 3.0.0                                     | MIT                       | Kevin Deng                               |
| ast-walker-scope                       | 0.10.0                                           | MIT                       | Kevin Deng                               |
| async                                  | 3.2.6                                            | MIT                       | Caolan McMahon                           |
| async-function                         | 1.0.0                                            | MIT                       | Jordan Harbamd                           |
| atomic-sleep                           | 1.0.0                                            | MIT                       | David Mark Clements                      |
| available-typed-arrays                 | 1.0.7                                            | MIT                       | Jordan Harband                           |
| aws-ssl-profiles                       | 1.1.2                                            | MIT                       | https://github.com/wellwelwel            |
| balanced-match                         | 1.0.2                                            | MIT                       | Julian Gruber                            |
| base64-js                              | 1.3.1, 1.5.1                                     | MIT                       | T. Jameson Little                        |
| better-result                          | 2.10.0                                           | MIT                       | Dillon Mulroy                            |
| big-integer                            | 1.6.52                                           | Unlicense                 | Peter Olson                              |
| binary                                 | 0.3.0                                            | MIT                       | James Halliday                           |
| birpc                                  | 2.9.0                                            | MIT                       | Anthony Fu                               |
| bl                                     | 4.1.0                                            | MIT                       |                                          |
| bluebird                               | 3.4.7                                            | MIT                       | Petka Antonov                            |
| body-parser                            | 2.3.0                                            | MIT                       |                                          |
| brace-expansion                        | 1.1.21, 2.1.7                                    | MIT                       | Julian Gruber                            |
| brotli                                 | 1.3.3                                            | MIT                       | Devon Govett                             |
| browserify-zlib                        | 0.2.0                                            | MIT                       | Devon Govett                             |
| buffer                                 | 5.7.1                                            | MIT                       | Feross Aboukhadijeh                      |
| buffer-crc32                           | 0.2.13                                           | MIT                       | Brian J. Brennan                         |
| buffer-equal-constant-time             | 1.0.1                                            | BSD-3-Clause              | GoInstant Inc., a salesforce.com company |
| buffer-indexof-polyfill                | 1.0.2                                            | MIT                       | https://github.com/sarosia               |
| buffers                                | 0.1.1                                            | Unknown                   | James Halliday                           |
| busboy                                 | 1.6.0                                            | MIT                       | Brian White                              |
| bytes                                  | 3.1.2                                            | MIT                       | TJ Holowaychuk                           |
| c12                                    | 3.3.4                                            | MIT                       |                                          |
| call-bind                              | 1.0.9                                            | MIT                       | Jordan Harband                           |
| call-bind-apply-helpers                | 1.0.2                                            | MIT                       | Jordan Harband                           |
| call-bound                             | 1.0.4                                            | MIT                       | Jordan Harband                           |
| chainsaw                               | 0.1.0                                            | MIT/X11                   | James Halliday                           |
| chart.js                               | 4.5.1                                            | MIT                       |                                          |
| chokidar                               | 5.0.0                                            | MIT                       | Paul Miller                              |
| class-transformer                      | 0.5.1                                            | MIT                       | TypeStack contributors                   |
| class-validator                        | 0.15.1                                           | MIT                       | TypeStack contributors                   |
| classnames                             | 2.5.1                                            | MIT                       | Jed Watson                               |
| clone                                  | 1.0.4                                            | MIT                       | Paul Vorbach                             |
| compress-commons                       | 4.1.2                                            | MIT                       | Chris Talkington                         |
| concat-map                             | 0.0.1                                            | MIT                       | James Halliday                           |
| confbox                                | 0.1.8, 0.2.4, 0.3.1                              | MIT                       |                                          |
| content-disposition                    | 1.1.0                                            | MIT                       | Douglas Christopher Wilson               |
| content-type                           | 1.0.5, 2.1.0                                     | MIT                       | Douglas Christopher Wilson               |
| cookie                                 | 0.7.2                                            | MIT                       | Roman Shtylman                           |
| cookie-parser                          | 1.4.7                                            | MIT                       | TJ Holowaychuk                           |
| cookie-signature                       | 1.0.6, 1.2.2                                     | MIT                       | TJ Holowaychuk                           |
| copy-anything                          | 4.1.5                                            | MIT                       | Luca Ban - Mesqueeb                      |
| core-util-is                           | 1.0.3                                            | MIT                       | Isaac Z. Schlueter                       |
| cors                                   | 2.8.6                                            | MIT                       | Troy Goode                               |
| crc-32                                 | 1.2.2                                            | Apache-2.0                | sheetjs                                  |
| crc32-stream                           | 4.0.3                                            | MIT                       | Chris Talkington                         |
| cross-env                              | 10.1.0                                           | MIT                       | Kent C. Dodds                            |
| cross-spawn                            | 7.0.6                                            | MIT                       | André Cruz                               |
| crypto-js                              | 4.2.0                                            | MIT                       | Evan Vosberg                             |
| csstype                                | 3.2.3                                            | MIT                       | Fredrik Nicol                            |
| d3-array                               | 3.2.1, 3.2.4                                     | ISC                       | Mike Bostock                             |
| d3-color                               | 3.1.0                                            | ISC                       | Mike Bostock                             |
| d3-delaunay                            | 6.0.2                                            | ISC                       | Mike Bostock                             |
| d3-format                              | 3.1.0                                            | ISC                       | Mike Bostock                             |
| d3-geo                                 | 3.1.0                                            | ISC                       | Mike Bostock                             |
| d3-interpolate                         | 3.0.1                                            | ISC                       | Mike Bostock                             |
| d3-path                                | 3.1.0                                            | ISC                       | Mike Bostock                             |
| d3-scale                               | 4.0.2                                            | ISC                       | Mike Bostock                             |
| d3-shape                               | 3.2.0                                            | ISC                       | Mike Bostock                             |
| d3-time                                | 3.1.0                                            | ISC                       | Mike Bostock                             |
| d3-time-format                         | 4.1.0                                            | ISC                       | Mike Bostock                             |
| data-view-buffer                       | 1.0.2                                            | MIT                       | Jordan Harband                           |
| data-view-byte-length                  | 1.0.2                                            | MIT                       | Jordan Harband                           |
| data-view-byte-offset                  | 1.0.1                                            | MIT                       | Jordan Harband                           |
| dayjs                                  | 1.11.23                                          | MIT                       | iamkun                                   |
| debug                                  | 4.4.3                                            | MIT                       | Josh Junon                               |
| deep-equal                             | 1.1.2                                            | MIT                       | James Halliday                           |
| deepmerge-ts                           | 8.0.2                                            | BSD-3-Clause              | Rebecca Stevens                          |
| define-data-property                   | 1.1.4                                            | MIT                       | Jordan Harband                           |
| define-properties                      | 1.2.1                                            | MIT                       | Jordan Harband                           |
| defu                                   | 6.1.7                                            | MIT                       |                                          |
| delaunator                             | 5.1.0                                            | ISC                       | Vladimir Agafonkin                       |
| depd                                   | 2.0.0                                            | MIT                       | Douglas Christopher Wilson               |
| destr                                  | 2.0.5                                            | MIT                       |                                          |
| detect-libc                            | 2.1.2                                            | Apache-2.0                | Lovell Fuller                            |
| dfa                                    | 1.2.0                                            | MIT                       | Devon Govett                             |
| dotenv                                 | 17.4.2, 18.0.8                                   | BSD-2-Clause              |                                          |
| dunder-proto                           | 1.0.1                                            | MIT                       | Jordan Harband                           |
| duplexer2                              | 0.1.4                                            | BSD-3-Clause              | Conrad Pankoff                           |
| ecdsa-sig-formatter                    | 1.0.11                                           | Apache-2.0                | D2L Corporation                          |
| ee-first                               | 1.1.1                                            | MIT                       | Jonathan Ong                             |
| effect                                 | 3.20.0                                           | MIT                       |                                          |
| elkjs                                  | 0.11.1                                           | EPL-2.0                   | Ulf Rüegg                                |
| empathic                               | 2.0.0                                            | MIT                       | Luke Edwards                             |
| encodeurl                              | 2.0.0                                            | MIT                       |                                          |
| end-of-stream                          | 1.4.5                                            | MIT                       | Mathias Buus                             |
| entities                               | 7.0.1                                            | BSD-2-Clause              | Felix Boehm                              |
| env-paths                              | 3.0.0                                            | MIT                       | Sindre Sorhus                            |
| es-abstract                            | 1.24.2                                           | MIT                       | Jordan Harband                           |
| es-abstract-get                        | 1.0.0                                            | MIT                       | Jordan Harband                           |
| es-define-property                     | 1.0.1                                            | MIT                       | Jordan Harband                           |
| es-errors                              | 1.3.0                                            | MIT                       | Jordan Harband                           |
| es-object-atoms                        | 1.1.2                                            | MIT                       | Jordan Harband                           |
| es-set-tostringtag                     | 2.1.0                                            | MIT                       | Jordan Harband                           |
| es-to-primitive                        | 1.3.4                                            | MIT                       | Jordan Harband                           |
| es-toolkit                             | 1.52.0                                           | MIT                       |                                          |
| esbuild                                | 0.28.2                                           | MIT                       |                                          |
| escape-html                            | 1.0.3                                            | MIT                       |                                          |
| estree-walker                          | 2.0.2, 3.0.3                                     | MIT                       | Rich Harris                              |
| etag                                   | 1.8.1                                            | MIT                       |                                          |
| exceljs                                | 4.4.0                                            | MIT                       | Guyon Roche                              |
| express                                | 5.2.1                                            | MIT                       | TJ Holowaychuk                           |
| exsolve                                | 1.1.3                                            | MIT                       |                                          |
| fast-check                             | 3.23.2                                           | MIT                       | Nicolas DUBIEN                           |
| fast-csv                               | 4.3.6                                            | MIT                       | Doug Martin                              |
| fast-decode-uri-component              | 1.0.1                                            | MIT                       |                                          |
| fast-deep-equal                        | 3.1.3                                            | MIT                       | Evgeny Poberezkin                        |
| fast-querystring                       | 1.1.2                                            | MIT                       | Yagiz Nizipli                            |
| fast-safe-stringify                    | 2.1.1                                            | MIT                       | David Mark Clements                      |
| fast-uri                               | 3.1.8                                            | BSD-3-Clause              | Vincent Le Goff                          |
| fdir                                   | 6.5.0                                            | MIT                       | thecodrr                                 |
| file-type                              | 22.1.1                                           | MIT                       | Sindre Sorhus                            |
| finalhandler                           | 2.1.1                                            | MIT                       | Douglas Christopher Wilson               |
| find-my-way                            | 9.7.0                                            | MIT                       |                                          |
| for-each                               | 0.3.5                                            | MIT                       | Raynos                                   |
| foreground-child                       | 3.3.1                                            | ISC                       | Isaac Z. Schlueter                       |
| forwarded                              | 0.2.0                                            | MIT                       |                                          |
| fresh                                  | 2.0.0                                            | MIT                       | TJ Holowaychuk                           |
| fs-constants                           | 1.0.0                                            | MIT                       | Mathias Buus                             |
| fs.realpath                            | 1.0.0                                            | ISC                       | Isaac Z. Schlueter                       |
| fstream                                | 1.0.12                                           | ISC                       | Isaac Z. Schlueter                       |
| function-bind                          | 1.1.2                                            | MIT                       | Raynos                                   |
| function.prototype.name                | 1.2.0                                            | MIT                       | Jordan Harband                           |
| functions-have-names                   | 1.2.3                                            | MIT                       | Jordan Harband                           |
| generate-function                      | 2.3.1                                            | MIT                       | Mathias Buus                             |
| generator-function                     | 2.0.1                                            | MIT                       | Jordan Harbamd                           |
| get-intrinsic                          | 1.3.0                                            | MIT                       | Jordan Harband                           |
| get-port-please                        | 3.2.0                                            | MIT                       |                                          |
| get-proto                              | 1.0.1                                            | MIT                       | Jordan Harband                           |
| get-symbol-description                 | 1.1.0                                            | MIT                       | Jordan Harband                           |
| giget                                  | 3.3.1                                            | MIT                       |                                          |
| glob                                   | 7.2.3                                            | ISC                       | Isaac Z. Schlueter                       |
| globalthis                             | 1.0.4                                            | MIT                       | Jordan Harband                           |
| gopd                                   | 1.2.0                                            | MIT                       | Jordan Harband                           |
| graceful-fs                            | 4.2.11                                           | ISC                       |                                          |
| grammex                                | 3.1.13                                           | MIT                       |                                          |
| graphmatch                             | 1.1.1                                            | MIT                       |                                          |
| has-bigints                            | 1.1.0                                            | MIT                       | Jordan Harband                           |
| has-property-descriptors               | 1.0.2                                            | MIT                       | Jordan Harband                           |
| has-proto                              | 1.2.0                                            | MIT                       | Jordan Harband                           |
| has-symbols                            | 1.1.0                                            | MIT                       | Jordan Harband                           |
| has-tostringtag                        | 1.0.2                                            | MIT                       | Jordan Harband                           |
| hasown                                 | 2.0.4                                            | MIT                       | Jordan Harband                           |
| helmet                                 | 8.3.0                                            | MIT                       | Adam Baldwin                             |
| hookable                               | 5.5.3                                            | MIT                       |                                          |
| http-errors                            | 2.0.1                                            | MIT                       | Jonathan Ong                             |
| iconv-lite                             | 0.6.3, 0.7.3                                     | MIT                       | Alexander Shtuchkin                      |
| ieee754                                | 1.2.1                                            | BSD-3-Clause              | Feross Aboukhadijeh                      |
| immediate                              | 3.0.6                                            | MIT                       |                                          |
| inflight                               | 1.0.6                                            | ISC                       | Isaac Z. Schlueter                       |
| inherits                               | 2.0.4                                            | ISC                       |                                          |
| internal-slot                          | 1.1.0                                            | MIT                       | Jordan Harband                           |
| internmap                              | 2.0.3                                            | ISC                       | Mike Bostock                             |
| ipaddr.js                              | 1.9.1                                            | MIT                       | whitequark                               |
| is-arguments                           | 1.2.0                                            | MIT                       | Jordan Harband                           |
| is-array-buffer                        | 3.0.5                                            | MIT                       | Jordan Harband                           |
| is-async-function                      | 2.1.1                                            | MIT                       | Jordan Harband                           |
| is-bigint                              | 1.1.0                                            | MIT                       | Jordan Harband                           |
| is-boolean-object                      | 1.2.2                                            | MIT                       | Jordan Harband                           |
| is-callable                            | 1.2.7                                            | MIT                       | Jordan Harband                           |
| is-data-view                           | 1.0.2                                            | MIT                       | Jordan Harband                           |
| is-date-object                         | 1.1.0                                            | MIT                       | Jordan Harband                           |
| is-document.all                        | 1.0.0                                            | MIT                       | Jordan Harband                           |
| is-finalizationregistry                | 1.1.1                                            | MIT                       | Jordan Harband                           |
| is-generator-function                  | 1.1.2                                            | MIT                       | Jordan Harband                           |
| is-map                                 | 2.0.3                                            | MIT                       | Jordan Harband                           |
| is-negative-zero                       | 2.0.3                                            | MIT                       | Jordan Harband                           |
| is-number-object                       | 1.1.1                                            | MIT                       | Jordan Harband                           |
| is-promise                             | 4.0.0                                            | MIT                       | ForbesLindesay                           |
| is-property                            | 1.0.2                                            | MIT                       | Mikola Lysenko                           |
| is-regex                               | 1.2.1                                            | MIT                       | Jordan Harband                           |
| is-set                                 | 2.0.3                                            | MIT                       | Jordan Harband                           |
| is-shared-array-buffer                 | 1.0.4                                            | MIT                       | Jordan Harband                           |
| is-string                              | 1.1.1                                            | MIT                       | Jordan Harband                           |
| is-symbol                              | 1.1.1                                            | MIT                       | Jordan Harband                           |
| is-typed-array                         | 1.1.15                                           | MIT                       | Jordan Harband                           |
| is-weakmap                             | 2.0.2                                            | MIT                       | Jordan Harband                           |
| is-weakref                             | 1.1.1                                            | MIT                       | Jordan Harband                           |
| is-weakset                             | 2.0.4                                            | MIT                       | Jordan Harband                           |
| isarray                                | 1.0.0, 2.0.5                                     | MIT                       | Julian Gruber                            |
| isexe                                  | 2.0.0                                            | ISC                       | Isaac Z. Schlueter                       |
| iterare                                | 1.2.1                                            | ISC                       | Felix Becker                             |
| jiti                                   | 2.7.0                                            | MIT                       |                                          |
| jpeg-exif                              | 1.1.4                                            | MIT                       |                                          |
| js-yaml                                | 5.4.2                                            | MIT                       | Vladimir Zapparov                        |
| json-schema-traverse                   | 1.0.0                                            | MIT                       | Evgeny Poberezkin                        |
| jsonwebtoken                           | 9.0.3                                            | MIT                       | auth0                                    |
| jszip                                  | 3.10.2                                           | (MIT OR GPL-3.0-or-later) | Stuart Knightley                         |
| jwa                                    | 2.0.1                                            | MIT                       | Brian J. Brennan                         |
| jws                                    | 4.0.1                                            | MIT                       | Brian J Brennan                          |
| lazystream                             | 1.0.1                                            | MIT                       | Jonas Pommerening                        |
| libphonenumber-js                      | 1.13.15                                          | MIT                       | catamphetamine                           |
| lie                                    | 3.3.0                                            | MIT                       |                                          |
| lightningcss                           | 1.33.0                                           | MPL-2.0                   |                                          |
| lightningcss-linux-x64-gnu             | 1.33.0                                           | MPL-2.0                   |                                          |
| listenercount                          | 1.0.1                                            | ISC                       | jden                                     |
| load-esm                               | 1.0.3                                            | MIT                       | Borewit                                  |
| local-pkg                              | 1.2.1                                            | MIT                       | Anthony Fu                               |
| lodash                                 | 4.18.1                                           | MIT                       | John-David Dalton                        |
| lodash.defaults                        | 4.2.0                                            | MIT                       | John-David Dalton                        |
| lodash.difference                      | 4.5.0                                            | MIT                       | John-David Dalton                        |
| lodash.escaperegexp                    | 4.1.2                                            | MIT                       | John-David Dalton                        |
| lodash.flatten                         | 4.4.0                                            | MIT                       | John-David Dalton                        |
| lodash.groupby                         | 4.6.0                                            | MIT                       | John-David Dalton                        |
| lodash.includes                        | 4.3.0                                            | MIT                       | John-David Dalton                        |
| lodash.isboolean                       | 3.0.3                                            | MIT                       | John-David Dalton                        |
| lodash.isequal                         | 4.5.0                                            | MIT                       | John-David Dalton                        |
| lodash.isfunction                      | 3.0.9                                            | MIT                       | John-David Dalton                        |
| lodash.isinteger                       | 4.0.4                                            | MIT                       | John-David Dalton                        |
| lodash.isnil                           | 4.0.0                                            | MIT                       | John-David Dalton                        |
| lodash.isnumber                        | 3.0.3                                            | MIT                       | John-David Dalton                        |
| lodash.isplainobject                   | 4.0.6                                            | MIT                       | John-David Dalton                        |
| lodash.isstring                        | 4.0.1                                            | MIT                       | John-David Dalton                        |
| lodash.isundefined                     | 3.0.1                                            | MIT                       | John-David Dalton                        |
| lodash.once                            | 4.1.1                                            | MIT                       | John-David Dalton                        |
| lodash.union                           | 4.6.0                                            | MIT                       | John-David Dalton                        |
| lodash.uniq                            | 4.5.0                                            | MIT                       | John-David Dalton                        |
| long                                   | 5.3.2                                            | Apache-2.0                | Daniel Wirtz                             |
| lru.min                                | 1.1.5                                            | MIT                       | https://github.com/wellwelwel            |
| magic-string                           | 0.30.21, 1.4.3                                   | MIT                       | Rich Harris                              |
| magic-string-ast                       | 1.0.3                                            | MIT                       | Kevin Deng                               |
| math-intrinsics                        | 1.1.0                                            | MIT                       | Jordan Harband                           |
| media-typer                            | 0.3.0, 1.1.1                                     | MIT                       | Douglas Christopher Wilson               |
| merge-descriptors                      | 2.0.0                                            | MIT                       |                                          |
| mime-db                                | 1.52.0, 1.54.0                                   | MIT                       |                                          |
| mime-types                             | 2.1.35, 3.0.2                                    | MIT                       |                                          |
| minimatch                              | 3.1.5, 5.1.9                                     | ISC                       | Isaac Z. Schlueter                       |
| minimist                               | 1.2.8                                            | MIT                       | James Halliday                           |
| mitt                                   | 3.0.1                                            | MIT                       |                                          |
| mkdirp                                 | 0.5.6                                            | MIT                       | James Halliday                           |
| mlly                                   | 1.8.2                                            | MIT                       |                                          |
| ms                                     | 2.1.3                                            | MIT                       |                                          |
| muggle-string                          | 0.4.1                                            | MIT                       |                                          |
| multer                                 | 2.4.0                                            | MIT                       |                                          |
| mysql2                                 | 3.24.4                                           | MIT                       | Andrey Sidorov                           |
| named-placeholders                     | 1.1.6                                            | MIT                       | Andrey Sidorov                           |
| nanoid                                 | 3.3.20                                           | MIT                       | Andrey Sitnik                            |
| negotiator                             | 1.1.0                                            | MIT                       |                                          |
| node-addon-api                         | 8.9.2                                            | MIT                       |                                          |
| node-gyp-build                         | 4.8.4                                            | MIT                       | Mathias Buus                             |
| normalize-path                         | 3.0.0                                            | MIT                       | Jon Schlinkert                           |
| nostics                                | 1.3.0                                            | MIT                       | Anthony Fu                               |
| object-assign                          | 4.1.1                                            | MIT                       | Sindre Sorhus                            |
| object-inspect                         | 1.13.4                                           | MIT                       | James Halliday                           |
| object-is                              | 1.1.6                                            | MIT                       | Jordan Harband                           |
| object-keys                            | 1.1.1                                            | MIT                       | Jordan Harband                           |
| object.assign                          | 4.1.7                                            | MIT                       | Jordan Harband                           |
| ohash                                  | 2.0.12                                           | MIT                       |                                          |
| on-exit-leak-free                      | 2.1.2                                            | MIT                       | Matteo Collina                           |
| on-finished                            | 2.4.1                                            | MIT                       |                                          |
| once                                   | 1.4.0                                            | ISC                       | Isaac Z. Schlueter                       |
| own-keys                               | 1.0.2                                            | MIT                       | Jordan Harband                           |
| pako                                   | 0.2.9                                            | MIT                       |                                          |
| pako                                   | 1.0.11                                           | (MIT AND Zlib)            |                                          |
| papaparse                              | 5.7.0                                            | MIT                       | Matthew Holt                             |
| parseurl                               | 1.3.3                                            | MIT                       |                                          |
| path-is-absolute                       | 1.0.1                                            | MIT                       | Sindre Sorhus                            |
| path-key                               | 3.1.1                                            | MIT                       | Sindre Sorhus                            |
| path-to-regexp                         | 8.4.2                                            | MIT                       |                                          |
| pathe                                  | 2.0.3                                            | MIT                       |                                          |
| pdfmake                                | 0.2.20                                           | MIT                       | Bartek Pampuch                           |
| perfect-debounce                       | 1.0.0, 2.1.0                                     | MIT                       |                                          |
| pg                                     | 8.23.1                                           | MIT                       | Brian Carlson                            |
| pg-cloudflare                          | 1.4.1                                            | MIT                       |                                          |
| pg-connection-string                   | 2.14.1                                           | MIT                       | Blaine Bublitz                           |
| pg-int8                                | 1.0.1                                            | ISC                       |                                          |
| pg-pool                                | 3.14.0                                           | MIT                       | Brian M. Carlson                         |
| pg-protocol                            | 1.16.1                                           | MIT                       |                                          |
| pg-types                               | 2.2.0                                            | MIT                       | Brian M. Carlson                         |
| pgpass                                 | 1.0.5                                            | MIT                       | Hannes Hörl                              |
| picocolors                             | 1.1.1                                            | ISC                       | Alexey Raspopov                          |
| picomatch                              | 4.0.7                                            | MIT                       | Jon Schlinkert                           |
| pinia                                  | 4.1.0                                            | MIT                       | Eduardo San Martin Morote                |
| pino                                   | 10.4.0                                           | MIT                       | Matteo Collina                           |
| pino-abstract-transport                | 3.0.0                                            | MIT                       | Matteo Collina                           |
| pino-std-serializers                   | 7.1.0                                            | MIT                       | James Sumners                            |
| pkg-types                              | 1.3.1, 2.3.3                                     | MIT                       |                                          |
| png-js                                 | 1.1.0                                            | MIT                       | Devon Govett                             |
| possible-typed-array-names             | 1.1.0                                            | MIT                       | Jordan Harband                           |
| postcss                                | 8.5.30                                           | MIT                       | Andrey Sitnik                            |
| postgres                               | 3.4.7                                            | Unlicense                 | Rasmus Porsager                          |
| postgres-array                         | 2.0.0, 3.0.4                                     | MIT                       | Ben Drucker                              |
| postgres-bytea                         | 1.0.1                                            | MIT                       | Ben Drucker                              |
| postgres-date                          | 1.0.7                                            | MIT                       | Ben Drucker                              |
| postgres-interval                      | 1.2.0                                            | MIT                       | Ben Drucker                              |
| primeicons                             | 7.0.0                                            | MIT                       | PrimeTek                                 |
| primevue                               | 4.5.5                                            | MIT                       | PrimeTek Informatics                     |
| prisma                                 | 7.10.1                                           | Apache-2.0                | Tim Suchanek                             |
| process-nextick-args                   | 2.0.1                                            | MIT                       |                                          |
| process-warning                        | 5.1.1                                            | MIT                       | Tomas Della Vedova                       |
| proper-lockfile                        | 4.1.2                                            | MIT                       | André Cruz                               |
| proxy-addr                             | 2.0.8                                            | MIT                       | Douglas Christopher Wilson               |
| pure-rand                              | 6.1.0                                            | MIT                       | Nicolas DUBIEN                           |
| qs                                     | 6.16.1                                           | BSD-3-Clause              |                                          |
| quansync                               | 0.2.11                                           | MIT                       | Anthony Fu                               |
| quick-format-unescaped                 | 4.0.4                                            | MIT                       | David Mark Clements                      |
| range-parser                           | 1.3.0                                            | MIT                       | TJ Holowaychuk                           |
| raw-body                               | 3.0.2                                            | MIT                       | Jonathan Ong                             |
| rc9                                    | 3.1.0                                            | MIT                       |                                          |
| react                                  | 19.3.1                                           | MIT                       |                                          |
| react-dom                              | 19.3.1                                           | MIT                       |                                          |
| readable-stream                        | 2.3.8, 3.6.2                                     | MIT                       |                                          |
| readdir-glob                           | 1.1.3                                            | Apache-2.0                | Yann Armelin                             |
| readdirp                               | 5.1.1                                            | MIT                       | Thorsten Lorenz                          |
| real-require                           | 1.0.0                                            | MIT                       | Paolo Insogna                            |
| reflect-metadata                       | 0.2.2                                            | Apache-2.0                | Ron Buckton                              |
| reflect.getprototypeof                 | 1.0.10                                           | MIT                       | Jordan Harband                           |
| regexp.prototype.flags                 | 1.5.4                                            | MIT                       | Jordan Harband                           |
| remeda                                 | 2.33.4                                           | MIT                       | Łukasz Sentkiewicz                       |
| require-from-string                    | 2.0.2                                            | MIT                       | Vsevolod Strukchinsky                    |
| ret                                    | 0.5.0                                            | MIT                       | fent                                     |
| retry                                  | 0.12.0                                           | MIT                       | Tim Koschützki                           |
| rfdc                                   | 1.4.1                                            | MIT                       | David Mark Clements                      |
| rimraf                                 | 2.7.1                                            | ISC                       | Isaac Z. Schlueter                       |
| robust-predicates                      | 3.0.3                                            | Unlicense                 | Vladimir Agafonkin                       |
| rolldown                               | 1.2.14                                           | MIT                       |                                          |
| router                                 | 2.2.0                                            | MIT                       | Douglas Christopher Wilson               |
| rxjs                                   | 7.8.2                                            | Apache-2.0                | Ben Lesh                                 |
| safe-array-concat                      | 1.1.4                                            | MIT                       | Jordan Harband                           |
| safe-buffer                            | 5.1.2, 5.2.1                                     | MIT                       | Feross Aboukhadijeh                      |
| safe-push-apply                        | 1.0.0                                            | MIT                       | Jordan Harband                           |
| safe-regex-test                        | 1.1.0                                            | MIT                       | Jordan Harband                           |
| safe-regex2                            | 5.1.2                                            | MIT                       | James Halliday                           |
| safe-stable-stringify                  | 2.5.0                                            | MIT                       | Ruben Bridgewater                        |
| safer-buffer                           | 2.1.2                                            | MIT                       | Nikita Skovoroda                         |
| sax                                    | 1.6.1                                            | BlueOak-1.0.0             | Isaac Z. Schlueter                       |
| saxes                                  | 5.0.1                                            | ISC                       | Louis-Dominique Dubeau                   |
| scheduler                              | 0.28.0                                           | MIT                       |                                          |
| scule                                  | 1.3.0                                            | MIT                       |                                          |
| semver                                 | 7.8.5                                            | ISC                       | GitHub Inc.                              |
| send                                   | 1.2.1                                            | MIT                       | TJ Holowaychuk                           |
| serve-static                           | 2.2.1                                            | MIT                       | Douglas Christopher Wilson               |
| set-function-length                    | 1.2.2                                            | MIT                       | Jordan Harband                           |
| set-function-name                      | 2.0.2                                            | MIT                       | Jordan Harband                           |
| set-proto                              | 1.0.0                                            | MIT                       | Jordan Harband                           |
| setimmediate                           | 1.0.5                                            | MIT                       | YuzuJS                                   |
| setprototypeof                         | 1.2.0                                            | ISC                       | Wes Todd                                 |
| shebang-command                        | 2.0.0                                            | MIT                       | Kevin Mårtensson                         |
| shebang-regex                          | 3.0.0                                            | MIT                       | Sindre Sorhus                            |
| side-channel                           | 1.1.1                                            | MIT                       | Jordan Harband                           |
| side-channel-list                      | 1.0.1                                            | MIT                       | Jordan Harband                           |
| side-channel-map                       | 1.0.1                                            | MIT                       | Jordan Harband                           |
| side-channel-weakmap                   | 1.0.2                                            | MIT                       | Jordan Harband                           |
| signal-exit                            | 3.0.7, 4.1.0                                     | ISC                       | Ben Coe                                  |
| sonic-boom                             | 4.2.1                                            | MIT                       | Matteo Collina                           |
| source-map-js                          | 1.2.2                                            | BSD-3-Clause              | Valentin 7rulnik Semirulnik              |
| speakingurl                            | 14.0.1                                           | BSD                       | Sascha Droste                            |
| split2                                 | 4.2.0                                            | ISC                       | Matteo Collina                           |
| sql-escaper                            | 1.5.2                                            | MIT                       | https://github.com/mysqljs               |
| statuses                               | 2.0.2                                            | MIT                       |                                          |
| std-env                                | 3.10.0                                           | MIT                       |                                          |
| stop-iteration-iterator                | 1.1.0                                            | MIT                       | Jordan Harband                           |
| streamsearch                           | 1.1.0                                            | MIT                       | Brian White                              |
| string_decoder                         | 1.1.1, 1.3.0                                     | MIT                       |                                          |
| string.prototype.trim                  | 1.2.11                                           | MIT                       | Jordan Harband                           |
| string.prototype.trimend               | 1.0.10                                           | MIT                       | Jordan Harband                           |
| string.prototype.trimstart             | 1.0.8                                            | MIT                       | Jordan Harband                           |
| strtok3                                | 10.5.0                                           | MIT                       | Borewit                                  |
| superjson                              | 2.2.6                                            | MIT                       | Simon Knott                              |
| swagger-ui-dist                        | 5.33.0                                           | Apache-2.0                |                                          |
| tar-stream                             | 2.2.0                                            | MIT                       | Mathias Buus                             |
| thread-stream                          | 4.2.0                                            | MIT                       | Matteo Collina                           |
| tiny-inflate                           | 1.0.3                                            | MIT                       | Devon Govett                             |
| tinyglobby                             | 0.2.17                                           | MIT                       | Superchupu                               |
| tmp                                    | 0.2.7                                            | MIT                       | KARASZI István                           |
| toidentifier                           | 1.0.1                                            | MIT                       | Douglas Christopher Wilson               |
| token-types                            | 6.1.2                                            | MIT                       | Borewit                                  |
| traverse                               | 0.3.10                                           | MIT                       | James Halliday                           |
| tslib                                  | 2.8.1                                            | 0BSD                      | Microsoft Corp.                          |
| tsx                                    | 4.23.15                                          | MIT                       | Hiroki Osame                             |
| type-fest                              | 4.41.0                                           | (MIT OR CC0-1.0)          | Sindre Sorhus                            |
| type-is                                | 1.6.18, 2.1.0                                    | MIT                       |                                          |
| typed-array-buffer                     | 1.0.3                                            | MIT                       | Jordan Harband                           |
| typed-array-byte-length                | 1.0.3                                            | MIT                       | Jordan Harband                           |
| typed-array-byte-offset                | 1.0.5                                            | MIT                       | Jordan Harband                           |
| typed-array-length                     | 1.0.8                                            | MIT                       | Jordan Harband                           |
| typedarray.prototype.slice             | 1.0.6                                            | MIT                       | Jordan Harband                           |
| typescript                             | 6.0.3                                            | Apache-2.0                | Microsoft Corp.                          |
| ufo                                    | 1.6.4                                            | MIT                       |                                          |
| uid                                    | 2.0.2                                            | MIT                       | Luke Edwards                             |
| uint8array-extras                      | 1.6.0                                            | MIT                       | Sindre Sorhus                            |
| unbox-primitive                        | 1.1.0                                            | MIT                       | Jordan Harband                           |
| undici-types                           | 7.24.6                                           | MIT                       |                                          |
| unicode-properties                     | 1.4.1                                            | MIT                       | Devon Govett                             |
| unicode-trie                           | 2.0.0                                            | MIT                       | Devon Govett                             |
| unpipe                                 | 1.0.0                                            | MIT                       | Douglas Christopher Wilson               |
| unplugin                               | 3.4.0                                            | MIT                       |                                          |
| unplugin-utils                         | 0.3.2                                            | MIT                       | Kevin Deng                               |
| unzipper                               | 0.10.14                                          | MIT                       | Evan Oxfeld                              |
| util-deprecate                         | 1.0.2                                            | MIT                       | Nathan Rajlich                           |
| uuid                                   | 8.3.2                                            | MIT                       |                                          |
| valibot                                | 1.4.2                                            | MIT                       | Fabian Hiller                            |
| validator                              | 13.15.35                                         | MIT                       | Chris O'Hara                             |
| vary                                   | 1.1.2                                            | MIT                       | Douglas Christopher Wilson               |
| vee-validate                           | 4.15.1                                           | MIT                       | Abdelrahman Awad                         |
| vite                                   | 8.3.4                                            | MIT                       | Evan You                                 |
| vue                                    | 3.5.44                                           | MIT                       | Evan You                                 |
| vue-chartjs                            | 5.3.4                                            | MIT                       | Jakub Juszczak                           |
| vue-router                             | 5.4.0                                            | MIT                       | Eduardo San Martin Morote                |
| webpack-virtual-modules                | 0.6.2                                            | MIT                       | SysGears INC                             |
| which                                  | 2.0.2                                            | ISC                       | Isaac Z. Schlueter                       |
| which-boxed-primitive                  | 1.1.1                                            | MIT                       | Jordan Harband                           |
| which-builtin-type                     | 1.2.1                                            | MIT                       | Jordan Harband                           |
| which-collection                       | 1.0.2                                            | MIT                       | Jordan Harband                           |
| which-typed-array                      | 1.1.24                                           | MIT                       | Jordan Harband                           |
| wrappy                                 | 1.0.2                                            | ISC                       | Isaac Z. Schlueter                       |
| xmlchars                               | 2.2.0                                            | MIT                       | Louis-Dominique Dubeau                   |
| xmldoc                                 | 2.0.3                                            | MIT                       | Nick Farina                              |
| xtend                                  | 4.0.2                                            | MIT                       | Raynos                                   |
| yaml                                   | 2.9.1                                            | ISC                       | Eemeli Aro                               |
| zeptomatch                             | 2.1.0                                            | MIT                       |                                          |
| zip-stream                             | 4.1.1                                            | MIT                       | Chris Talkington                         |
| zod                                    | 3.25.76                                          | MIT                       | Colin McDonnell                          |
