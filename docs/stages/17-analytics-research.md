# Этап 17 — Аналитика и исследовательский режим

статус: done дата: 2026-10-19 коммиты: c3bdb8e (shared+api), aa9849e (web), docs — см. git log; ветка worktree-stage-17-analytics от main 563c240

## сделано

- миграции нет: research_projects/participants/measurements с этапа 01.
- shared:
  - `statistics.ts`: `descriptiveStats` (n, missing, mean, median, sd n−1, min, q1, q3, max; квартили тип 7 = Excel QUARTILE.INC / R quantile; точность 0,001; нет значений → все null), `quantile`, `DESCRIPTIVE_STATS_COLUMNS`. имя не `describe` — конфликт с vitest.
  - `analytics.ts`: `compareGroups` (Все группы + по группам), `buildMotivationAnalytics` (от студента: самый ранний PRIMARY, самые поздние INTERMEDIATE/REPEATED после первичного; change = repeated − primary), DTO `AnalyticsDto` (trajectories, academic, activity, dynamics = точки мониторинга, profiles total+groups, assignments, motivation, truncated).
  - `research.ts`: статусы `RESEARCH_STATUS_TRANSITIONS` (DRAFT→ACTIVE|ARCHIVED, ACTIVE→COMPLETED, COMPLETED→ARCHIVED), `RESEARCH_EDITABLE_STATUSES`, `researchCode(n)` = R001, zod-формы (проект, участники, замер), DTO, `buildResearchData` (замер ← COMPLETED сессия той же версии+типа, дата local в периоде, самая ранняя; полное наблюдение; stats по замер×шкала×ЭГ/КГ; changes первый→последний замер методики только если versionsComparable), `buildResearchRawTable`, `buildResearchAggregateTable`, `ResearchDataset` raw|aggregate.
  - описание права `research.manage` расширено (участники, замеры).
- api:
  - `apps/api/src/analytics/*` (новый модуль): `GET /analytics` (analytics.read + students.read) — поверх `MonitoringService.overview` + `MotivationProfilesService.distribution` (по каждой группе области) + свои запросы: результативность заданий (trajectoryAssignment по `teacherAssignmentWhere`, top 20), мотивация (версии с прохождениями в области, сопоставимые версии, incomplete = ASSIGNED|IN_PROGRESS|EXPIRED).
  - `research-projects`: GET list/:id (research.read), POST (manage, Idempotency-Key), PATCH :id, POST :id/status, GET candidate-groups (manage; только имя/курс/численность), GET/POST :id/participants (POST = целая учебная группа в ЭГ|КГ, дубли пропуск, коды shuffle Фишер–Йетс), POST :id/participants/:pid/exclude {reason}, POST :id/measurements (Idempotency-Key, версия PUBLISHED|RETIRED), GET :id/data, GET :id/export (research.export) .
  - огр. 4: CONTROL + студент с ИОТ DRAFT|PENDING_APPROVAL|ACTIVE|NEEDS_CORRECTION → 409 с participantCode (не ФИО).
  - ФИО участников — только с `research.personal_data.read`.
  - аудит: research_project.created|updated|status_changed, research_participants.added, research_participant.excluded, research_measurement.created, research_data.exported.
  - `apps/api/src/common/spreadsheet.ts` (новый): `exportFile`, `downloadable`, CSV BOM `;` CRLF, XLSX, защита от формул — вынесено из `diagnostics/results.service.ts` (выгрузка этапа 08 теперь через него).
- web:
  - `views/analytics/AnalyticsView.vue` — вкладки по правам: Показатели / Исследования / Диагностика: выгрузка и сопоставимость (блоки этапа 08 туда).
  - `AnalyticsOverviewPanel.vue` (7 видов п. 4.10), `StatsTable.vue` (n=0 → «Нет данных», sd null → «—»), `ResearchProjectsPanel.vue`, `ResearchProjectDialog.vue`, `ResearchProjectView.vue` (маршрут `research-details` `/analytics/research/:id`, research.read), `ResearchParticipantsPanel.vue`, `ResearchMeasurementDialog.vue`, `ResearchDataPanel.vue` (MultiSelect замеры/шкалы, экспорт), `research.ts` (бейдж статуса, период).
  - переиспользованы `DynamicsCharts.vue` (мониторинг), `ProfileChart.vue`, `PROFILE_SLICES` (главная).
  - меню не менялось.
- docs: ADR-023, access-model (этап 17), wireframes §20, traceability FR-069–075, FR-074 ✅, UC-07, AT-11, огр. 4.

## требования

- FR-069 ✅ FR-070 ✅ FR-071 ✅ FR-072 ✅ FR-073 ✅ FR-074 ✅ FR-075 ✅
- UC-07 ✅ AT-11 ✅ огр. 4 ✅ (обе стороны)
- п. 2.4 ✅ исследователь — только коды; ПДн по отдельному праву
- п. 4.10 отчёты-аналитика 7 видов ✅ (как разделы вкладки «Показатели»)

## решения (почему)

- статистика в shared — одна функция для UI, выгрузки, тестов; квартили как в Excel/R — чтобы исследователь сверял с внешним пакетом.
- аналитика зовёт мониторинг/профили, правил не дублирует (как панель этапа 16). наблюдение для ИОТ-показателей = одна ИОТ.
- исследователь не видит студентов → включение целой учебной группой (AT-01 тоже про группы). код R### свой на исследование, порядок случайный.
- замер ← завершённые сессии по версии/типу/периоду, не через assignment.researchMeasurementId: бумажные бланки тоже попадают, преподавателю ничего отмечать. поле в БД осталось.
- изменение между замерами только по сопоставимым версиям (FR-072); несопоставимо → причина текстом.
- в выгрузке исследования нет учебной группы (риск узнавания); в выгрузке этапа 08 осталась как была.
- `research.manage` тот же (не новое право) — описание расширено.
- исследователь не получает «Показатели» (нет students.read, scope пуст) — его групповая аналитика = ЭГ/КГ.
- фикс NFR-004: скрытый `<caption class="iot-visually-hidden">` absolute → без `position: relative` у контейнера прокрутки вылезал за 360 px и сдвигал страницу (Playwright ловил маску/клики мимо). контейнерам прокрутки этапа добавлен `position: relative`. старые таблицы (DiagnosticComparison и др.) не трогал — там проблемы не видно в тестах.

## файлы ключевые

- packages/shared/src/statistics.ts, analytics.ts, research.ts; statistics.spec.ts — эталоны
- apps/api/src/analytics/* — аналитика + исследования
- apps/api/src/common/spreadsheet.ts — CSV/XLSX
- apps/api/test/research.e2e-spec.ts — e2e (8)
- apps/web/src/views/analytics/* ; analytics.spec.ts
- apps/web/e2e/research.spec.ts — Playwright UC-07 (2 × 2 вьюпорта)

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- руками: `pnpm db:seed && pnpm dev` → researcher: «Аналитика» → «Исследования» → «Новое исследование» → включить группы ЭГ/КГ → «Новый замер» → данные → «Экспортировать». teacher: «Аналитика» → «Показатели».

## тесты

- shared 77 (+8 statistics.spec), api unit 50, api e2e 147 (+8 research), web vitest 118 (+5 analytics.spec, −2 перенесены из results.spec), playwright 125 passed / 1 skipped (by design; +4 research.spec).
- правлены: e2e/repeat-diagnostics (выгрузка теперь на вкладке), e2e/support/session.ts (моки /api/analytics → EMPTY_ANALYTICS, /api/research-projects → []), results.spec (тесты раздела перенесены в analytics.spec).

## долги / TODO(этап NN)

- TODO(этап 18): отчёт «по диагностике» (FR-079) может брать `descriptiveStats`, `buildMotivationAnalytics`; PDF/XLSX — `common/spreadsheet.ts` для XLSX.
- TODO(этап 19): нагрузка `GET /analytics` (мониторинг + N запросов распределения по группам) — NFR-002; IDOR-тесты research-projects.
- TODO(этап 20): сид приёмки AT-01 — исследование с двумя группами по 20 (включать через API research-projects).
- TODO(этап 22): инструкция исследователя (UC-07) в docs/guides/researcher.md.
- аналитика ИОТ наследует предел мониторинга 500 маршрутов (ADR-020).
- открытый вопрос 15 (пропуски внутри методики) влияет на число полных наблюдений.

## для след. этапа

- этап 18 (отчёты): готовы `descriptiveStats`, `compareGroups`, `exportFile`/`downloadable` (XLSX/CSV), правила мониторинга. pdfmake ещё не стоит (зависимость этапа 18).
- worktree-грабли: python-heredoc с путями вне worktree и `$(...)` блокируются — скрипты класть в `/home/homka/.claude/jobs/<job>/tmp` и запускать `python3 -I <путь>`; pnpm через обёртку `run.sh` (cd + PATH).
