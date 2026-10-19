# Этап 19 — Безопасность и NFR

статус: done дата: 2026-10-20 коммиты: см. git log (test(api), feat(api), test(web), test, docs)

## сделано

- миграции нет.
- api тесты:
  - `test/routes.ts` — обход всех маршрутов по метаданным (ModulesContainer + MetadataScanner; DiscoveryService в app не зарегистрирован).
  - `test/route-guards.e2e-spec.ts` (5): публичны только health/login/refresh/logout; без разрешения только self-маршруты (auth/me, password-policy, change-password, notifications*); cabinet/** = ровно `cabinet.access`; каждый непубличный без токена → 401.
  - `test/idor.e2e-spec.ts` (5): мир студента группы Б через API (ИОТ, задания, выбор, сдача с файлом, диагностика бланком, профиль, наблюдение, обращение, консультация, уведомление, материал, файл). подстановка id по префиксу пути; маршрут без подстановки и вне `SHARED_PREFIXES` → тест падает. владелец GET → 200 (id настоящие). посторонние teacher A / student A, все методы, с валидными телами (`bodyFor`) → строго 403/404. + проверка аудита этого мира.
  - `test/security.e2e-spec.ts` (8): заголовки, no-store, swagger при CSP, 413/400/404, файл > 20 МБ → 413, очистка idempotency.
- api код:
  - `app.setup.ts`: helmet (CSP строгая, styleSrc unsafe-inline ради swagger-ui, DENY, no-referrer, HSTS), `Cache-Control: no-store`, `useBodyParser('json', {limit: '2mb'})` (`JSON_BODY_LIMIT`). `configureApp` теперь берёт `NestExpressApplication` (main.ts, helpers.ts, health spec поправлены).
  - `http-exception.filter.ts`: ошибки http-errors (`status` 4xx + `expose`) → их статус + DEFAULT_MESSAGES. БАГ найден: большое тело давало 500.
  - `logging/mask.ts` `errorForLog`: ошибки Prisma (name `PrismaClient*`) → только класс, код, кадры стека. текст Prisma содержит аргументы запроса (ФИО, логин). используют filter, monitoring-alerts, idempotency-cleanup. spec `logging/error-for-log.spec.ts`.
  - `common/idempotency-cleanup.service.ts` — фоновое удаление просроченных idempotency_keys раз в час (как MonitoringAlertsService; в test не стартует). провайдер в AppModule (IdempotencyService создаётся в 8 модулях — таймер там дублировался бы).
- web: проекты Playwright `firefox`, `webkit`; `test:e2e` = desktop + mobile-360 + firefox; `test:e2e:webkit` — docker `mcr.microsoft.com/playwright:v1.64.1-noble` (на CachyOS WebKit не стартует: нет libicu74/libflite). research UC-07 → `test.slow()` (в webkit ~27 с из 30).
- eslint: web — `vue/no-v-html`, запрет `document.write`, присваивание innerHTML/outerHTML не литералом; `*.k6.js` глобалы k6; console в `apps/api/test/load/*.ts`.
- нагрузка: `apps/api/test/load/prepare-data.ts` (через API: 2 группы × 25, ИОТ + 3 задания, диагностика бланком, сдача), `screens.k6.js` (10 преп + 40 студ VU, 3m, порог p95<3000 на экран, http_req_failed<1%). скрипты root: `test:load:prepare`, `test:load` (docker grafana/k6:2.3.0), `audit:deps`. `*.local.json` в .gitignore.
- зависимость: `helmet@^8.3.0` (apps/api, MIT). После слияния — `pnpm install`.
- docs: `docs/testing/security.md`, `docs/testing/load.md`, ADR-025, access-model (ПДн + раздел этапа 19), traceability NFR-001…006, AT-12, п. 8.3.

## требования

- NFR-001 ✅ NFR-002 ✅ NFR-003 ✅ NFR-004 ✅ NFR-005 ✅ NFR-006 ✅ AT-12 ✅ (приёмочный прогон — этап 20)
- п. 8.3 ⚠️ — всё кроме HTTPS и бэкапа/восстановления (этап 21).

## решения (почему)

- права проверяются обходом метаданных, не ручным списком — новый маршрут без решения о доступе роняет тест.
- IDOR строго 403/404: 400 значил бы проверку формы раньше доступа (слабая проверка). для этого `bodyFor` даёт валидные тела всех 33 мутаций; тела с реальными id (дисциплина Б, группа А, submission) — иначе 404 по ссылке маскировал бы дыру.
- общие справочники (методики, исследования, группы, дисциплины, типы заданий, направления, admin) исключены из IDOR: доступ только по разрешению, без владельца.
- санитайзер HTML не нужен: пользовательский HTML/Markdown нигде не рендерится; закреплено ESLint.
- CSP интерфейса (статика) — nginx этап 21; PrimeVue вставляет стили → там `style-src 'self' 'unsafe-inline'`.
- лимит одновременных отчётов не вводили: PDF группы 0,57 с, 5 параллельно ≤ 0,68 с.
- k6 и WebKit — в docker, ничего не ставим на хост.
- нагрузка на отдельной БД `iot_load`, `.env.load` (NODE_ENV=production, API_PORT=3100, LOGIN_RATE_LIMIT=100000 — 50 входов с одного IP).
- moderate в audit: uuid (exceljs; v3/v5/v6 с буфером не вызываются), sprintf-js (только jest). high/critical — 0.

## файлы ключевые

- apps/api/src/app.setup.ts — helmet, no-store, json limit
- apps/api/src/common/http-exception.filter.ts — 413/400 транспорта
- apps/api/src/logging/mask.ts — errorForLog
- apps/api/src/common/idempotency-cleanup.service.ts
- apps/api/test/{routes.ts,route-guards,idor,security}.e2e-spec.ts
- apps/api/test/load/{prepare-data.ts,screens.k6.js}
- apps/web/playwright.config.ts, eslint.config.mjs
- docs/testing/{security,load}.md

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm install && pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- webkit: `pnpm dev` в одном терминале, `pnpm test:e2e:webkit` в другом.
- нагрузка: по `docs/testing/load.md` (БД iot_load, `.env.load`, `pnpm test:load:prepare`, `pnpm test:load`).
- `pnpm audit:deps`

## тесты

- итог: shared 77, api unit 55 (+3), api e2e 172 (+18: route-guards 5, idor 5, security 8), web vitest 120; playwright `pnpm test:e2e` (desktop + mobile-360 + firefox): 190 passed, 2 skipped (5.8m); webkit (docker) 63 passed, 1 skipped; firefox 63 passed, 1 skipped (skip = тест нижней панели только для узкого экрана).
- k6 3m, 50 VU: 0/4441 ошибок, p95 экранов 28 мс…1,83 с, все пороги ✓.

## долги / TODO(этап NN)

- TODO(этап 21): CSP/HSTS для статики интерфейса в nginx (`style-src 'self' 'unsafe-inline'` из-за PrimeVue), HTTPS, `client_max_body_size` ≥ 20 МБ (файлы) — согласовать с JSON 2 МБ API.
- TODO(этап 20): AT-12 в приёмочном наборе Playwright; повторить k6 на приёмочном сиде.
- TODO(этап 22): `docs/licenses.md` — добавить helmet (MIT).
- остаются: списки назначений диагностики и история профиля ограничены 200 без пагинации — на объёме пилота ок (этапы 05, 07); выгрузка без стрима (этап 08) — ок для пилота.
- нагрузку на сервере колледжа повторить на его железе (AT-14).

## для след. этапа

- `pnpm test:e2e` теперь 3 проекта (desktop, mobile-360, firefox) — дольше (~+2 мин).
- `createTestApp` возвращает NestExpressApplication; новые e2e берут `configureApp` как есть.
- idor-мир (`idor.e2e-spec.ts`) — готовый образец создания полного набора данных студента через API для приёмочного сида этапа 20 (там же — `prepare-data.ts`).
- новый маршрут с `:id` → добавить подстановку в `resolve()` и тело в `bodyFor()` idor-теста, иначе тест упадёт.
