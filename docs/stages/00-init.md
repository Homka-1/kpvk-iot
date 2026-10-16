# Этап 00 — Инициализация репо и спецификация

статус: done дата: 2026-10-16 коммиты: см. `git log` (первый коммит репо)

## сделано

- git init, ветка main. .gitignore, .editorconfig, .gitattributes (LF), .prettierrc.json, .nvmrc (24), .npmrc (engine-strict).
- pnpm-монорепо: apps/api (NestJS 12, ESM), apps/web (Vue 3.5 + Vite 8 + vue-router 5 + pinia 4), packages/shared (@iot/shared).
- api: GET /api/health → {status:'ok'}; swagger /api/docs, json /api/docs/openapi.json; общая настройка `configureApp` (src/app.setup.ts) — и main, и e2e.
- prisma 7.10: prisma.config.ts (читает корневой .env или ENV_FILE), schema.prisma без моделей, seed.ts заглушка. Скрипты db:migrate/db:seed/db:deploy/db:validate.
- web: пустая главная (h1 = APP_NAME), vite proxy /api → :3000, Playwright конфиг + e2e/home.spec.ts.
- ESLint flat (eslint.config.mjs: ts + vue + prettier), Prettier, husky pre-commit → lint-staged.
- docker-compose.dev.yml: postgres:16-alpine, базы iot_dev + iot_test (docker/postgres/init-test-db.sql). .env.example.
- docs: STATUS.md, spec/traceability.md (FR-001…080, NFR-001…010, UC-01…07, AT-01…14 → этапы), spec/decisions.md (ADR-001…006), spec/open-questions.md (12 вопросов), README.md.

## требования

- NFR-010 ⚠️ частично: dev/test БД разделены, .env.example. prod — этап 21.
- остальные — только разнесены по этапам в traceability.md.

## решения (почему)

- Nest 12 = ESM only → api ESM, импорты с `.js`, jest через `node --experimental-vm-modules --disable-warning=ExperimentalWarning node_modules/jest/bin/jest.js`, ts-jest useESM, moduleNameMapper срезает `.js`. Работает.
- TypeScript ~6.0.3, не 7: typescript-eslint <6.1, ts-jest <7. ADR-005.
- @iot/shared ESM, exports: условие `node` → dist (api, jest), иначе → src (vite, vue-tsc). Поэтому корневые dev/typecheck/test сначала `pnpm build:shared`.
- Prisma 7: url не в schema, а в prisma.config.ts через env('DATABASE_URL'); без DATABASE_URL любые prisma-команды падают — это норм. Генератор `prisma-client` → apps/api/src/generated/prisma (в eslint ignore; в .gitignore добавить на этапе 01 при первом generate, если решим не коммитить).
- pnpm не через corepack: в Node 26 corepack нет → `npm i -g pnpm@10` (стоит в ~/.npm-global/bin, добавить в PATH).

## файлы ключевые

- package.json (корень) — скрипты из CLAUDE.md п. 2 + db:up/db:down, format.
- apps/api/src/app.setup.ts — префикс api, ValidationPipe, swagger.
- apps/api/test/health.e2e-spec.ts — e2e health + openapi.
- apps/api/prisma.config.ts, apps/api/prisma/schema.prisma.
- apps/web/vite.config.ts — proxy + vitest jsdom.
- docs/spec/traceability.md — генерить заново НЕ надо, дальше править руками.

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm install && pnpm lint && pnpm typecheck && pnpm test`
- `pnpm dev` → curl localhost:3000/api/health; localhost:5173
- `pnpm test:e2e` (chromium уже скачан в ~/.cache/ms-playwright)

## тесты

- shared vitest 1/1, web vitest 1/1, api jest unit 1/1, api e2e 2/2, playwright 1/1. Все зелёные.

## долги / TODO(этап NN)

- окружение: Node тут 26.11 (план — 24 LTS). Prisma ругается в preinstall (официально 20/22/24), но работает. Прод-образ — node:24 (этап 21).
- docker: у агента нет прав на /var/run/docker.sock → postgres НЕ поднимал, db:migrate на живой БД не проверен. TODO(этап 01): нужен доступ к docker (пользователь в группе docker) или запуск `pnpm db:up` пользователем.
- TODO(этап 01): e2e тест на тестовой БД (.env.test, ENV_FILE=.env.test), миграции к чистой БД.
- TODO(этап 02): PrimeVue, тема, layout. Playwright сейчас только chromium; остальные браузеры — этап 19.
- TODO(этап 03): pino с маскированием ПДн, helmet/throttler.

## для след. этапа

- этап 01: модели Prisma с @@map на имена таблиц п. 7 ТЗ; enum'ы статусов дублировать в packages/shared (as const объекты, не TS enum — shared грузится и в браузер).
- открытые вопросы заказчику — docs/spec/open-questions.md.
