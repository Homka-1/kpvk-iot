# Этап 16 — Главная панель преподавателя и главная студента

статус: done дата: 2026-10-19 коммиты: 66386ba (api+shared), 3227a8a (web), docs — см. git log; ветка worktree-stage-16-dashboards от main fd0285a

## сделано

- миграции нет: всё из существующих таблиц.
- shared `packages/shared/src/dashboard.ts` (новый): `DashboardPeriod` + `DASHBOARD_PERIOD_LABELS` + `dashboardPeriodRange(period, today)` (учебный год с 1.09 по умолч., 3 мес, 4 нед, всё время; `to` всегда null); DTO `DashboardDto` (cards, stages, profiles, recentAssignments, activity, upcoming); `DASHBOARD_LIST_LIMIT=6`, `DASHBOARD_REFRESH_MS=60000`; главная студента — чистые функции `studentGoals`, `studentTodos`, `studentAchievements`, `studentTeachers`.
- api:
  - `apps/api/src/dashboard/*` (новый модуль): `GET /dashboard?groupId&disciplineId&period`, права `students.read`+`monitoring.read`. сервис берёт правила у владельцев: `MonitoringService.overview` (активные ИОТ, средний %, просрочки), `MotivationProfilesService.distribution` (студенты, профили), `reviewQueueWhere` (на проверке), `NEEDS_ATTENTION` (требуют внимания). свои запросы: столбцы этапов (`trajectoryStage` по номеру), последние назначения, лента активности (сдача, диагностика, вопрос, затруднение, запрос консультации студентом, рефлексия), предстоящие (PENDING точки ИОТ в работе с даты сегодня + SCHEDULED консультации).
  - `monitoring`: фильтр `status` (ACTIVE|NEEDS_CORRECTION|COMPLETED) в `MonitoringQueryDto`; модуль экспортирует `MonitoringService`.
  - `students`: фильтр `needsAttention`; правило `NEEDS_ATTENTION` (supportStatus ≠ STANDARD или нерассмотренный DIFFICULTY_REPORT) экспортировано; `OPEN_DIFFICULTY` вынесено.
  - `submissions.service.ts`: `reviewQueueWhere(scope, query)` вынесено из `reviewQueue` — общее с панелью.
- web:
  - `views/dashboard/`: `TeacherDashboardView.vue` (маршрут `home`), `StageChart.vue` (stacked bar + таблица), `ProfileChart.vue` (doughnut + легенда-ссылки), `content.ts` (подписи активности, ссылки, `periodQuery`, `PROFILE_SLICES`).
  - `views/student/StudentHomeView.vue` (`student-home`), `MyAchievementsView.vue` (`student-achievements`) — из `/cabinet/trajectories|assignments|diagnostics`.
  - `MonitoringView.vue`: Select статуса ИОТ, `status/from/to` из адреса. `StudentsView.vue`: фильтр «Внимание» + `?attention=1`.
  - `utils/chart.ts` (`chartColor`, `chartAnimation`) — заменил копии в `DynamicsCharts.vue`, `DiagnosticComparison.vue`.
  - router: home, student-home, student-achievements в SECTION_VIEWS. меню не менялось.
- docs: ADR-022, access-model (этап 16), wireframes экраны 1 и 4 + «Мои достижения», traceability FR-001–005 ✅, FR-008/FR-057 дополнены.

## требования

- FR-001 ✅ FR-002 ✅ (панель была последним куском) FR-003 ✅ FR-004 ✅ FR-005 ✅
- п. 4.1, 6.2 ✅; п. 6.5 ✅; «Мои достижения» (п. 3.2) ✅
- долг этапа 15 (нерассмотренные обращения, ближайшие консультации на главной) закрыт.

## решения (почему)

- один эндпоинт, а не 6 запросов из браузера: проще e2e «числа = данные» и «карточка = список».
- правила не дублировать: панель зовёт мониторинг/профили/очередь проверки → карточка и список всегда равны (тест сверяет).
- «Активных ИОТ» = статус ACTIVE (как в ТЗ «Активна»); NEEDS_CORRECTION видно в мониторинге отдельно.
- null-правило: нет студентов → все карточки null; нет маршрутов в мониторинге → ИОТ-карточки null; 0 на проверке при наличии студентов — честный 0.
- период ограничивает маршруты (как мониторинг), назначения и ленту; студенты/проверка/внимание — текущее состояние.
- главная студента без нового API: кабинетные эндпоинты уже фильтруют своё (AT-12); логика — чистые функции в shared с unit-тестами.
- обновление: опрос 60 с + visibilitychange, без SSE (как уведомления ADR-021).
- админ/исследователь: на главной ссылки на свои разделы (нет прав на панель → 403).
- якорь `#warnings-title` в ссылку мониторинга не ставил: у роутера нет scrollBehavior.

## файлы ключевые

- packages/shared/src/dashboard.ts — периоды, DTO, функции главной студента
- apps/api/src/dashboard/* — панель
- apps/api/test/dashboard.e2e-spec.ts — e2e (4)
- apps/web/src/views/dashboard/* — панель, графики
- apps/web/src/views/student/StudentHomeView.vue, MyAchievementsView.vue
- apps/web/e2e/dashboard.spec.ts — Playwright (3 × 2 вьюпорта)

## проверить

- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- руками: `pnpm db:seed && pnpm dev` → преподаватель: «Главная» → карточки, период, клик «Требуют внимания» → студенты с фильтром; студент: «Главная» → 4 блока, «Задать вопрос»; «Мои достижения».

## тесты

- shared 69 (+3 dashboard.spec), api unit 50, api e2e 139 (+4 dashboard), web vitest 115 (+6 dashboard.spec), playwright 121 passed / 1 skipped (by design; +6: 3 сценария × 2 вьюпорта).
- правлены: e2e/support/session.ts (мок `/api/dashboard` по умолч., `EMPTY_DISTRIBUTION`), e2e/navigation.spec (home больше не заглушка).

## долги / TODO(этап NN)

- показатели ИОТ панели наследуют предел мониторинга 500 маршрутов (ADR-020); для пилота хватает.
- период панели — пресеты, без произвольных дат (произвольные — в мониторинге).
- TODO(этап 18): отчёты могут брать те же правила показателей (`MonitoringService`, `reviewQueueWhere`, `NEEDS_ATTENTION`).
- TODO(этап 19): нагрузочный тест `GET /dashboard` (несколько запросов, NFR-002 ≤ 3 с).

## для след. этапа

- этап 17 (аналитика): `dashboardPeriodRange` и `MonitoringService` экспортированы, можно опираться.
- worktree-грабли те же: heredoc с python и цепочки с переменными в путях иногда блокируются — скрипты через Write в `/home/homka/.claude/jobs/<job>/tmp` и запуск по абсолютному пути.
