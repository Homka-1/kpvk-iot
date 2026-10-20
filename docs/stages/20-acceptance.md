# Этап 20 — Тестирование и приёмочная версия

статус: done дата: 2026-10-20 коммиты: см. git log (test(web), docs)

## сделано

- миграции нет. продуктовый код не менялся — приёмка ошибок в продукте не нашла (см. «найдено»).
- приёмочный стенд `apps/web/e2e/acceptance/support/stand.ts`:
  - база только `iot_acceptance` (имя зашито; URL берётся из `.env.test`, меняется только имя базы). dev/test базы не трогает.
  - шаги: `prisma migrate deploy` (создаёт базу, если нет) → TRUNCATE всех таблиц кроме `_prisma_migrations` через `prisma db execute --stdin` → `prisma db seed` (пароли admin/teacher/researcher случайные, через SEED\_\*\_PASSWORD) → `node apps/api/dist/main.js` на :3200 (NODE_ENV=development, LOG_LEVEL=warn, FILE_STORAGE_DIR=storage/acceptance) → HTTP-сид → `stand.local.json`.
  - `prisma migrate reset` Prisma запрещает запускать ИИ-агенту без согласия пользователя → не используем, очистка своим SQL только по базе `iot_acceptance`.
  - лог API стенда: `apps/web/test-results/acceptance-api.log`.
  - файл работает и в Playwright, и в голом Node 24 (type stripping): импорты с `.ts`, без enum.
- сид приёмки `support/seed.ts` (через API, как пользователи): дисциплина «Математика»; «ПО-21» (ЭГ) и «ПО-22» (КГ) по 20 студентов (логины `p-1001…p-1020`, `p-2001…p-2020`, общий случайный пароль, временный сменён); 3 задания библиотеки (критерии 5+3); первичная диагностика бланком студентам 1–10 обеих групп (паттерн high/medium/low по кругу, ответы = контрольные примеры п. 11.3); профиль подтверждён у ЭГ 1–5 и 8; исследование «Эффективность ИОТ» (ЭГ+КГ, входной замер, ACTIVE) — создаётся до ИОТ; утверждённая ИОТ (5 этапов по 30 дней, текущий — первый, задания 2+1) у ЭГ 1–5. время ~30 с.
  - ответы бланка: ключи файла методики (`q1`, `q5-o2`) → id вопросов/вариантов формы по порядку (`toFormAnswers`).
- Playwright `apps/web/playwright.acceptance.config.ts`: globalSetup поднимает стенд и гасит API; webServer — `vite build && vite preview --port 5273` (прокси /api → :3200); 1 воркер; проект `acceptance` (Desktop Chrome). обычный `playwright.config.ts` — `testIgnore: 'acceptance/**'`.
- сценарии `apps/web/e2e/acceptance/` (14 тестов, ~1,7 мин + сборка): AT-01 … AT-12 + огр. 4 (ИОТ для КГ → 403). распределение студентов ЭГ: 1 → AT-06, 2 → AT-07, 3 → AT-08, 4 → AT-09, 5 → AT-12, 6 → AT-03, 7 → AT-04, 8 → AT-05, 9 → AT-10, 11 → AT-02, 12 → «нет данных» в AT-03. сценарии не зависят от порядка.
- хелперы `support/acceptance.ts`: `stand()`, `experimental(n)`, `control(n)`, `signIn` (через форму входа), `apiAs` (Bearer), `assignDiagnostic`, `passDemoHigh`, `completeTask`, `typedDate`, `chooseGroup`.
- скрипты root: `pnpm test:acceptance` (build shared + api, затем playwright), `pnpm acceptance:stand` (стенд для ручной приёмки, :5273, до Ctrl+C). web: `test:acceptance`.
- eslint: console разрешён в `stand.ts` (CLI).
- docs: `docs/testing/scenarios/README.md` + 15 файлов модулей (п. 11.1: шаги, ожидаемое, требования, автотест); `docs/testing/results.md`; `docs/acceptance/checklist.md` (AT-01…AT-14, ручные шаги на стенде, отметка комиссии); traceability: AT-01…AT-12 + этап 20 и ссылка на приёмочный тест, AT-01 ✅, строки п. 11.1 и п. 11.2.

## требования

- п. 11.1 ✅ п. 11.2 ✅ AT-01 ✅ AT-02…AT-12 ✅ (приёмочный прогон на живом стенде)
- AT-13 ⏳ этап 21. AT-14 ⏳ сервер колледжа (подготовка — этап 21).

## решения (почему)

- приёмка на живом API, без моков: обычные Playwright-тесты подменяют API, приёмка должна доказать связку интерфейс + API + БД.
- данные стенда через API, не Prisma напрямую: те же проверки прав/правил, что у людей; сид не может создать невозможное состояние.
- интерфейс стенда — production-сборка (`vite preview`), не dev-сервер: dev Vite на 360 px нашёл новую зависимость посреди сценария, перезагрузил страницу и оборвал `POST /auth/refresh` (пустая страница). это свойство dev-сервера, не продукта.
- AT-12 в интерфейсе: студент по ссылке на страницу сотрудника попадает на свою главную (а не «Нет доступа») — так устроен роутер с этапа 02, данные не показываются; тест проверяет это и отказ API (403/404).
- один воркер: общая учётка преподавателя; каждый сценарий со своими студентами — порядок не важен.
- NODE_ENV=development на стенде: фоновые предупреждения мониторинга (FR-058) работают, как в жизни; cookie без Secure (http://localhost).

## найдено при приёмке

- ошибок продукта нет: все 14 сценариев прошли на живом стенде после правок самих тестов (селекторы по id этапа, переход студента на главную).
- предупреждение pg в логе API: «Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0». трассировка (`NODE_OPTIONS=--trace-deprecation`): параллельные запросы в транзакции делает рантайм Prisma (`interpretNode → Array.map → PgTransaction.queryRaw`, @prisma/adapter-pg 7.10.1, pg 8.23.1), не наш код. сейчас безвредно.

## файлы ключевые

- apps/web/e2e/acceptance/support/stand.ts — стенд (база, сиды, API, CLI)
- apps/web/e2e/acceptance/support/seed.ts — данные приёмки через API, `ApiClient`
- apps/web/e2e/acceptance/support/acceptance.ts — хелперы сценариев
- apps/web/e2e/acceptance/at-\*.spec.ts — AT-01…AT-12
- apps/web/playwright.acceptance.config.ts
- docs/testing/scenarios/\*.md, docs/testing/results.md, docs/acceptance/checklist.md

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm install && pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:acceptance`
- ручной стенд: `pnpm acceptance:stand` → http://localhost:5273, учётки в `apps/web/e2e/acceptance/stand.local.json`.
- отчёт приёмки: `pnpm --filter @iot/web exec playwright show-report playwright-report/acceptance`

## тесты

- итог: lint/typecheck ок; shared 77, api unit 55, api e2e 172, web vitest 120; `pnpm test:e2e` 190 passed, 2 skipped (4,9 мин); `pnpm test:acceptance` 14 passed (1,9 мин). webkit не повторяли (UI не менялся с этапа 19).
- k6 на приёмочном стенде (40 студ.): 0 % ошибок, p95 главная преп. 1,36 с, главная студ. 1,64 с, прочее ≤ 80 мс — TODO этапа 19 закрыт. учётки k6 собраны из `stand.local.json` (описано в `docs/testing/load.md`).

## долги / TODO(этап NN)

- TODO(этап 21): AT-13 — автотест бэкап → чистый стенд → восстановление (можно взять `stand.ts` как образец подготовки базы); AT-14 — инструкция и чек-лист для сервера колледжа (повтор `pnpm test:acceptance`-сценариев вручную по `docs/acceptance/checklist.md`).
- TODO(обновление зависимостей): при переходе на pg@9 проверить совместимость @prisma/adapter-pg (см. «найдено»).
- FR-033 (профиль не ограничивает сложность) — без отдельного автотеста, в сценариях помечен «ручная проверка».
- остаются из прошлых этапов: списки назначений диагностики и история профиля ограничены 200; выгрузка без стрима.

## для след. этапа

- приёмочный набор — `pnpm test:acceptance` (≈2,5 мин вместе со сборкой); стенд можно поднять вручную `pnpm acceptance:stand`.
- порты стенда: API 3200, web 5273, база `iot_acceptance`; нагрузочный стенд — 3100 и `iot_load`; dev — 3000/5173/`iot_dev`; автотесты — `iot_test`.
- `stand.ts` показывает, как готовить базу без `migrate reset` (запрещён агенту Prisma).
