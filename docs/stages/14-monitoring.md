# Этап 14 — Мониторинг и корректировка ИОТ

статус: done дата: 2026-10-19 коммиты: 7f29d1d (api+shared), ea87460 (web), docs-коммит; ветка worktree-stage-14-monitoring

## сделано

- миграции нет: trajectory_versions, trajectory_checkpoints.status/passed_at, trajectories.final_assessment/completed_at, students.support_status — с этапа 01.
- shared:
  - `trajectories.ts`: `TRAJECTORY_CORRECTABLE_STATUSES` (ACTIVE, NEEDS_CORRECTION), `TRAJECTORY_FINAL_ASSESSMENT_MAX`, `localDate` экспортирован, `TrajectoryDto.completedAt/finalAssessment`, `TrajectoryVersionDto` (снимок), `trajectoryDiff(before, after)` → `TrajectoryChange[]` (паспорт, этапы добавлены/убраны/перемещены, поля этапов, КТ, задания+сроки, материалы; по id; даты дд.мм.гггг).
  - `monitoring.ts` (новый): `isCheckpointMissed`, `weekStart`, `weekBuckets` (≤53 нед.), `averagePercent`, `averageOf`, `HELP_REQUEST_KINDS`, DTO мониторинга (`MonitoringDto`, `MonitoringRowDto`, `MonitoringDetailDto`, `MonitoringWarningDto`, `SupportStatusDto`).
  - `submissions.ts`: `nextStageStatus(current, statuses, checkpoints=[])` — этап без заданий завершается, когда все КТ PASSED.
  - `CabinetTrajectoryDto.completedAt/finalAssessment`; `profile.ts` — метки истории `trajectory.needs_correction|corrected|completed|checkpoint_marked`, `student.support_status_changed`.
- api:
  - `apps/api/src/trajectories/stage-progress.ts` (новый): `syncStageProgress` (перенесён из submissions.service, + КТ) и `syncCurrentStage` (текущий = первый незавершённый действующий этап).
  - `TrajectoriesService`: `writeContent(tx, …, 'draft'|'correction')` — общий для черновика и корректировки; `correct` (`POST /trajectories/:id/corrections`, права manage+approve), `assertCorrectable`, `refreshStages`, `markNeedsCorrection` (`/needs-correction`), `complete` (`/complete`), `version` (`GET /versions/:n`), `markCheckpoint` (`POST /checkpoints/:checkpointId/status`). load/cabinet — completedAt, finalAssessment. findInScope — + discipline.name.
  - модуль `apps/api/src/monitoring/`: `MonitoringService` (`overview`, `detail`, `setSupportStatus`, `collect` — одним набором запросов), `MonitoringAlertsService` (фон, при старте + раз в час, кроме NODE_ENV=test; КТ → MISSED + уведомление `checkpoint.missed`, просрочка → `assignment.overdue`, без дублей), `MonitoringController` (`GET /monitoring`, `GET /monitoring/trajectories/:id`, `PUT /monitoring/students/:id/support-status`), DTO со swagger.
- web:
  - `views/monitoring/`: `MonitoringView.vue` (раздел; фильтры шапки + поиск + период DateInput; сводка MetricCard; предупреждения; динамика; карточки маршрутов), `MonitoringDetailView.vue` (`/monitoring/:id`, имя `monitoring-details`: действия, период, показатели, предупреждения, этапы с отметкой КТ, активность/успешность, отдельно диагностика через `DiagnosticComparison`, версии), `DynamicsCharts.vue` (столбцы + линия, без второй оси, таблица), `SupportStatusDialog.vue`, `content.ts` (`rowFacts`, `warningBadge`, `warningDue`).
  - `TrajectoryEditor.vue`: проп `mode: 'draft'|'correction'`, emit `cancel`; в корректировке — без сохранения по шагам, блок «Изменения новой версии N» (`VersionChanges.vue`), причина, «Подтвердить новую версию» + подтверждение; кнопки удаления заблокированы (`assignmentRemovable`, `checkpointRemovable`, `stageRemovable` в `content.ts`; формы хранят status).
  - `TrajectoryView.vue`: панель действий (Корректировать, Требует корректировки, Завершить маршрут — диалог с итоговой оценкой, В архив, Мониторинг), `?correct=1` открывает корректировку, блок итоговой оценки, «История версий» + `TrajectoryVersionDialog.vue`.
  - `MyTrajectoryView.vue`: «Итог маршрута». router: `monitoring` в SECTION_VIEWS, вложенный `monitoring/:id`. меню не менялось.
- docs: ADR-020, access-model (этап 14), data-model 3.4/3.5, wireframes (экран 3, новый 18), traceability.

## требования

- FR-043 ✅ FR-044 ✅ FR-056 ✅ FR-057 ✅ FR-058 ✅ FR-059 ✅ FR-060 ✅ FR-061 ✅ FR-062 ✅ UC-05 ✅ AT-08 ✅ AT-09 ✅
- FR-042 ⚠️→✅ + этап без заданий завершают КТ (долг этапа 13 закрыт)
- UC-05 шаг «консультация» — этап 15 (обращения за помощью уже считаются по feedback/consultations)
- FR-002 ⚠️ + мониторинг и корректировка в области данных; без закреплений — пусто

## решения (почему)

- корректировка = полное содержимое (как PUT черновика) + причина → один снимок-версия. по шагам не сохраняется: иначе живой маршрут менялся бы до утверждения.
- корректировка требует manage+approve: новая версия сразу действующая, FR-039.
- история выполнения не стирается: этап архивируется, задание отменяется; начатые/выполненные и отмеченные КТ — 400. замена задания в назначении запрещена (попытки привязаны к назначению).
- защита от дубля корректировки — метка `updatedAt` (409), не Idempotency-Key: тот же механизм, что у утверждения.
- уведомление студенту о корректировке без текста причины — причина может быть служебной.
- поддержка (FR-060) — без нового права: `students.read`+`monitoring.read`, основание в аудите. новое право = сиды/роли, лишнее.
- фоновая задача — setInterval в процессе API, без @nestjs/schedule (нет новой зависимости).
- даты событий периода/недель — по местному времени сервера (`localMidnight`, `localDate`). была ошибка: UTC-неделя ≠ местная (тест падал после полуночи).
- текущий этап = первый незавершённый (раньше — следующий после текущего). эквивалентно при обычном ходе, корректно при перестановке.
- в мониторинг входят ACTIVE, NEEDS_CORRECTION, COMPLETED; предупреждения — только у действующих.
- «История версий» вместо «Версии маршрута» на странице ИОТ (появился просмотр версий) — записано в wireframes, экран 3.

## файлы ключевые

- packages/shared/src/monitoring.ts, trajectories.ts (`trajectoryDiff`), submissions.ts (`nextStageStatus`)
- apps/api/src/monitoring/* — мониторинг, фон, поддержка
- apps/api/src/trajectories/trajectories.service.ts — correct/complete/needs-correction/version/markCheckpoint/writeContent
- apps/api/src/trajectories/stage-progress.ts — пересчёт этапов
- apps/api/test/monitoring.e2e-spec.ts — e2e (7)
- apps/web/src/views/monitoring/* ; apps/web/src/views/trajectories/TrajectoryView.vue, TrajectoryEditor.vue, VersionChanges.vue, TrajectoryVersionDialog.vue
- apps/web/e2e/monitoring.spec.ts — Playwright AT-08, UC-05/AT-09

## проверить

- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- руками: `pnpm db:seed && pnpm dev` → преподаватель: «Мониторинг» → маршрут → «Подробнее и корректировка» → «Статус сопровождения», отметка КТ, «Корректировать ИОТ» → шаги → «Предпросмотр»: изменения, причина → «Подтвердить новую версию» → «История версий» → просмотр версии. Страница ИОТ → «Завершить маршрут».

## тесты

- shared 61 (+3 monitoring.spec, +2 trajectories diff, +1 submissions КТ), api unit 50, api e2e 129 (+7 monitoring), web vitest 102 (+2 monitoring.spec), playwright 111 passed / 1 skipped (by design; +4: AT-08 и UC-05 × 2 вьюпорта); правлены navigation.spec (Мониторинг больше не заглушка).
- правлены старые моки: `completedAt/finalAssessment: null` (e2e/cabinet, e2e/trajectories, cabinet.spec, trajectories.spec).

## долги / TODO(этап NN)

- TODO(этап 15): консультация в UC-05 (кнопка из мониторинга), бейдж уведомлений (`checkpoint.missed`, `assignment.overdue`, `trajectory.corrected|completed`); рефлексия после КТ — Reflection FK на checkpoint: удаление PENDING-точки с рефлексией при корректировке упадёт по FK → проверить в 15.
- TODO(этап 16): сводка главной — можно брать `GET /monitoring` (summary).
- TODO(этап 18): отчёт по реализации ИОТ — данные мониторинга и `trajectoryDiff`.
- предел 500 строк мониторинга без пагинации (сузить фильтр) — при росте данных пересмотреть.

## для след. этапа

- обращения за помощью уже считаются: feedback QUESTION/DIFFICULTY_REPORT по trajectoryId + consultations, которые запросил сам студент (`requestedById` = user студента). этап 15 должен ставить trajectoryId и requestedById.
- уведомления пишутся в `notifications` (type, link `/monitoring/:id` или `/student/trajectory`).
- worktree-грабли те же: heredoc с `\"` и переменные в sed/pnpm блокируются — правки python-скриптом (`$CLAUDE_JOB_DIR/tmp/edit.py` с JSON заменами), pnpm уже в PATH.
