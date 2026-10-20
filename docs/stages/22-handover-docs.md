# Этап 22 — Итоговая документация и передача

статус: done дата: 2026-10-20 коммиты: см. STATUS (дописать)

## сделано

- `docs/api/openapi.json` — из кода: `pnpm docs:openapi` (`apps/api/src/cli/export-openapi.ts`, сборка api → node dist). БД не нужна: NestFactory.create без init. `configureApp` теперь возвращает OpenAPIObject (тот же, что на `/api/docs`). тест `apps/api/test/health.e2e-spec.ts` «п. 13: docs/api/openapi.json совпадает…» — API поменял, доку не обновил → красный. файл в `.prettierignore` (генерится).
- фикс расхождения: ts-jest и tsc давали разную метадату параметра `permission` в `DELETE /api/admin/users/:id/permissions/:permission` → дубль параметра в swagger под jest. явный `@ApiParam({ enum: Permission })` в `users.controller.ts`.
- `docs/api/README.md` — обзор: вход/refresh/CSRF, права, 401/403/404, Idempotency-Key, формат ошибок, разделы (теги), пример curl.
- `docs/licenses.md` — `scripts/licenses.mjs` (`pnpm docs:licenses`, проверка `pnpm licenses:check`): прод-пакеты из `pnpm licenses list --prod`, прямые зависимости с назначением, dev-инструменты, компоненты вне npm (образы, Roboto). список рассмотренных лицензий в скрипте; новая лицензия / зависимость без описания / устаревший файл → exit 1. e-mail авторов вырезаются. 537 пакетов. внимание: `buffers` без лицензии (exceljs→unzipper→binary), elkjs EPL (prisma studio), lightningcss MPL (vite), jszip MIT|GPL → MIT.
- снимки экранов: `apps/web/playwright.guides.config.ts` + `apps/web/e2e/guides/screenshots.spec.ts`, `pnpm docs:screenshots` (приёмочный стенд, 4 теста, ~1,6 мин). 21 png в `docs/guides/img` (2 МБ). в `test:acceptance` не входит (testDir другой).
- `apps/web/tsconfig.json`: include `playwright*.config.ts` (раньше acceptance-конфиг не проверялся типами).
- руководства (обычный язык): `docs/guides/admin.md`, `teacher.md` (14 разделов, UC-01…UC-06), `student.md` (мобильный), `researcher.md` (UC-07, mermaid-схема), `methodologies.md` (ввод Ильина/Реан/Моросанова: что получить, как считает движок, конструктор, файл определения + контрольные примеры, перенос на прод через конструктор или `POST /api/questionnaires`, чек-лист).
- `docs/architecture/overview.md` — схема, технологии, модули api, shared, сквозные механизмы, окружения, тесты.
- `docs/acceptance/act-template.md` (акт приёмки AT-01…14, перечень п. 13), `docs/acceptance/pilot-report-template.md` (отчёт пилота ТЗ-9).
- `README.md` полный: возможности по ролям, карта документации, перечень п. 13, прод, разработка, команды (+ docs:*, licenses:check), ограничения.
- `docs/design/wireframes.md` — в шапке пояснение: ранние «в разработке» — история, итог в `docs/guides/`.
- `docs/spec/traceability.md` — FR-012, FR-049, NFR-008, п. 6.2–6.5, п. 8.3, п. 13 → ✅; раздел «Итоговая сверка (этап 22)»: остаются ⚠️ FR-011 (сроки хранения — заказчик), AT-14/MVP-15 (сервер колледжа), п. 11.3/огр. 1 (методики заказчика).
- `docs/spec/decisions.md` — ADR-027.

## требования

- NFR-008 ✅ (deploy + guides)
- п. 13 ТЗ ✅ (все материалы, перечень в README и act-template)
- п. 11.3 ⚠️ инструкция есть, примеры реальных методик — после передачи
- AT-14 ⚠️ выполняет колледж
- FR-011 ⚠️ сроки хранения — open-questions 4

## решения (почему)

- openapi.json из кода + тест сверки: ручная дока API устаревает. ADR-027.
- лицензии — скрипт, не ручной список: 537 пакетов, обновления зависимостей.
- снимки — отдельный playwright-конфиг: приёмка не должна менять файлы docs.
- примеры путей `rean-motivation` в methodologies.md — намеренно «например», файлов нет (методик нет). проверка ссылок их показывает — норм.

## файлы ключевые

- `apps/api/src/cli/export-openapi.ts`, `apps/api/src/app.setup.ts` — выгрузка OpenAPI
- `scripts/licenses.mjs` — перечень лицензий
- `apps/web/e2e/guides/screenshots.spec.ts` — снимки
- `docs/guides/*.md`, `docs/api/README.md`, `docs/architecture/overview.md`, `docs/acceptance/*-template.md`

## проверить

- `pnpm docs:openapi` → `git diff docs/api` пусто
- `pnpm licenses:check`
- `pnpm docs:screenshots` (нужен `pnpm db:up`, порты 3200/5273 свободны)
- `pnpm --filter @iot/api test:unit -- control-examples`

## тесты

- lint ✅, typecheck ✅, format:check ✅
- shared 77/77, api unit 55/55, api e2e 175/175 (24 набора, +1 тест п. 13), web 120/120 отдельно.
- полный `pnpm test` дважды: web vitest падал разными тестами по таймауту (layouts, analytics, library) — нагрузка машины: load 12 на 4 ядрах, своп, чужой стенд `iot-at13` в docker (не мой, не трогал). web отдельно — 120/120. код web не менялся.
- `pnpm docs:screenshots` 4/4.

## долги / TODO

- AT-14, пилот (ТЗ-9) — колледж, по `docs/acceptance/at-14-server.md`, `pilot-report-template.md`.
- методики заказчика + контрольные примеры — по `docs/guides/methodologies.md`.
- `buffers` без лицензии — юр. проверка или замена импорта XLSX.
- из прошлых: pg@9 + adapter-pg; лимиты 200 в списках; выгрузка без стрима; FR-033 без автотеста.
- web vitest чувствителен к нагрузке (таймауты 5 с) — при CI на слабой машине поднять testTimeout.

## для след. этапа

- план CLAUDE.md закончен (22 из 22). дальше — только по запросу: AT-14, пилот, п. 10.2.
- после слияния `pnpm install` не нужен: зависимости не менялись (lockfile не трогал).
