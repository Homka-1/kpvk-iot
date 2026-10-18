# Этап 09 — Мотивационные профили

статус: done дата: 2026-10-18 коммиты: см. git log ветки worktree-stage-09-motivation-profiles (.claude/worktrees/stage-09-motivation-profiles)

## сделано

- миграция `20261018120000_current_motivation_profile`: `students.current_motivation_profile_id` (unique FK, бэкфилл последней записи). указатель = последняя запись профилирования (любой статус).
- shared `packages/shared/src/motivation-profiles.ts`: `proposeMotivationLevel(items, minScales)` (большинство шкал; 0 шкал / < minScales / ничья → level null + reason), `defaultStudentSummary`, `DEFAULT_MOTIVATION_STRATEGIES` (дословно п. 4.5 ТЗ), `motivationStrategiesSchema`, `profileDecisionSchema(proposedLevel)`, DTO. spec 7 тестов.
- shared: `PROFILE_FILTER_VALUES` + `PROPOSED`; `StudentSummaryDto.motivationProfile.proposedLevel`; `OwnProfileDto.motivationProfile` {studentSummary, decidedAt}; STUDENT_HISTORY_LABELS + motivation_profile.*; настройка `profiles.minScales` (default 1) + поле `group` у SYSTEM_SETTINGS.
- api `apps/api/src/profiles/*`: GET `students/:id/motivation-profile` (students.read, scope), POST `students/:id/motivation-profiles` (Idempotency-Key; те же источники и результат → возвращает текущую запись), POST `motivation-profiles/:id/decision` (только PROPOSED и текущая; другой уровень → CORRECTED, причина обязательна; NEEDS → 409), GET `motivation-profiles/distribution`, GET/PUT `motivation-strategies` (PUT — settings.manage; key `profiles.strategies` в system_settings). история в motivation_profile_history + аудит `motivation_profile.proposed|needs_more_diagnostics|confirmed|corrected`.
- students.service: `contextWhere`, `currentProfileWhere` (экспорт), фильтр по текущему профилю. profile.service: история с профилями, «Мой профиль» — только studentSummary утверждённого.
- web: `views/profiles/` StudentMotivationTab (вкладка профиля), ProfileDecisionDialog, StrategyCard, MotivationProfilesView (раздел), StrategiesSettings (в «Настройках»); StudentProfileView `?tab=`; StudentsView `?profile=`; labels `profileBadge` (PROPOSED → «Ждёт решения: …»), `PROFILE_FILTER_LABELS`; MyProfileView блок «Рекомендации по учёбе»; SettingsView группы по `group`.
- api e2e `test/motivation-profiles.e2e-spec.ts` 8/8 ✅. web vitest `views/profiles/profiles.spec.ts` 5/5 ✅. lint + typecheck ✅.

## требования

- FR-027 ✅ FR-028 ✅ FR-029 ✅ FR-030 ✅ FR-032 ✅ FR-033 ✅ (ограничений нет, пояснение в UI)
- FR-031 ⚠️ кнопка есть, ведёт в /trajectories?studentId= (конструктор — этап 11)
- UC-02 ✅ AT-03 ✅ AT-04 ✅
- FR-008 ⚠️ + фильтр по текущему профилю, значение PROPOSED
- FR-016 ⚠️ + студенту только пояснение утверждённого профиля
- NFR-006 ⚠️ + формирование профиля (Idempotency-Key, без новых данных — без записи)
- AT-12 ⚠️ + профиль по scope, студент/исследователь/админ — 403, чужой преподаватель — 404

## решения (почему)

- профиль формирует преподаватель кнопкой (UC-02), не авто при завершении диагностики. повтор без новых данных — без новой записи.
- ничья шкал → нет уровня: п. 4.5 «произвольно не присваивается». правило и minScales — до ответа на open-questions 3.
- решение только по PROPOSED; по NEEDS уровень не ставится. новое предложение при утверждённом — карточка показывает «ждёт решения», утверждённый уровень в `lastDecided` (для ИОТ этапа 11).
- студенту — только studentSummary (без уровня, оснований, причины), FR-016.
- FR-031: кнопка «Сформировать ИОТ» → `/trajectories?studentId=` (заглушка до этапа 11), видна при утверждённом профиле.
- FR-033: ограничений нет, пояснение в UI.

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- в worktree .env/.env.test скопированы из корня.

## файлы ключевые

- packages/shared/src/motivation-profiles.ts — правило, DTO, стратегии по умолч.
- apps/api/src/profiles/motivation-profiles.{service,controller,dto}.ts, profiles.module.ts
- apps/api/prisma/migrations/20261018120000_current_motivation_profile
- apps/web/src/views/profiles/*.vue

## тесты

- shared 38 (+7), api unit 44, api e2e 89 (+8 motivation-profiles), web vitest 72 (+5 profiles.spec), playwright 93 passed / 1 skipped (by design; +4: motivation-profiles 2 × 2 вьюпорта).
- правлены старые: моки OwnProfileDto + motivationProfile, StudentSummaryDto + proposedLevel; navigation.spec IMPLEMENTED + motivation-profiles; mockSession мокает motivation-strategies и distribution.
- грабли: Playwright reuseExistingServer подхватил чужой vite (осиротевший dev-сервер worktree этапа 08 на :5173) — тесты шли по старому коду. процесс остановлен. перед test:e2e проверять `ss -ltnp | grep 5173`.

## долги / TODO(этап NN)

- TODO(этап 11): FR-031 — ссылка на конструктор ИОТ; паспорт ИОТ брать из `lastDecided` (последний утверждённый профиль).
- TODO(этап 16): распределение профилей — диаграмма на главной (API `GET /motivation-profiles/distribution` готов).
- TODO(решение заказчика): open-questions 3 (правило/минимум), 11 (тексты стратегий).

## для след. этапа

- этап 10 (библиотека): профиль сложность заданий не ограничивает — не связывать уровни заданий с профилем (FR-033).
