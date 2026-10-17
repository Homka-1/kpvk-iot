# Этап 09 — Мотивационные профили

статус: in_progress дата: 2026-10-18 коммиты: см. git log ветки worktree-stage-09-motivation-profiles (.claude/worktrees/stage-09-motivation-profiles)

## сделано

- миграция `20261018120000_current_motivation_profile`: `students.current_motivation_profile_id` (unique FK, бэкфилл последней записи). указатель = последняя запись профилирования (любой статус).
- shared `packages/shared/src/motivation-profiles.ts`: `proposeMotivationLevel(items, minScales)` (большинство шкал; 0 шкал / < minScales / ничья → level null + reason), `defaultStudentSummary`, `DEFAULT_MOTIVATION_STRATEGIES` (дословно п. 4.5 ТЗ), `motivationStrategiesSchema`, `profileDecisionSchema(proposedLevel)`, DTO. spec 7 тестов.
- shared: `PROFILE_FILTER_VALUES` + `PROPOSED`; `StudentSummaryDto.motivationProfile.proposedLevel`; `OwnProfileDto.motivationProfile` {studentSummary, decidedAt}; STUDENT_HISTORY_LABELS + motivation_profile.*; настройка `profiles.minScales` (default 1) + поле `group` у SYSTEM_SETTINGS.
- api `apps/api/src/profiles/*`: GET `students/:id/motivation-profile` (students.read, scope), POST `students/:id/motivation-profiles` (Idempotency-Key; те же источники и результат → возвращает текущую запись), POST `motivation-profiles/:id/decision` (только PROPOSED и текущая; другой уровень → CORRECTED, причина обязательна; NEEDS → 409), GET `motivation-profiles/distribution`, GET/PUT `motivation-strategies` (PUT — settings.manage; key `profiles.strategies` в system_settings). история в motivation_profile_history + аудит `motivation_profile.proposed|needs_more_diagnostics|confirmed|corrected`.
- students.service: `contextWhere`, `currentProfileWhere` (экспорт), фильтр по текущему профилю. profile.service: история с профилями, «Мой профиль» — только studentSummary утверждённого.
- web: `views/profiles/` StudentMotivationTab (вкладка профиля), ProfileDecisionDialog, StrategyCard, MotivationProfilesView (раздел), StrategiesSettings (в «Настройках»); StudentProfileView `?tab=`; StudentsView `?profile=`; labels `profileBadge` (PROPOSED → «Ждёт решения: …»), `PROFILE_FILTER_LABELS`; MyProfileView блок «Рекомендации по учёбе»; SettingsView группы по `group`.
- api e2e `test/motivation-profiles.e2e-spec.ts` 8/8 ✅. web vitest `views/profiles/profiles.spec.ts` 5/5 ✅. lint + typecheck ✅.

## осталось (следующая сессия, этот же этап)

- ❌ Playwright `apps/web/e2e/motivation-profiles.spec.ts` падает (оба теста × 2 вьюпорта): вкладка не показывает «Система предлагает» / раздел без заголовков карточек. гипотеза: не замокан `GET /api/motivation-strategies` до загрузки? (мок есть в mockSession) или пользователь без прав/ErrorState — смотреть `test-results/*/error-context.md`. navigation.spec прошёл (motivation-profiles добавлен в IMPLEMENTED; mockSession мокает strategies + distribution).
- прогнать полный `pnpm test` (api e2e все, web) и `pnpm test:e2e`.
- docs: ADR-015 (правило большинства, minScales, указатель текущего профиля, стратегии в system_settings, студенту только пояснение), data-model §2.4/3.3 (указатель, лишний переход нет), access-model (эндпоинты этапа 09), wireframes §2 вкладка + раздел, navigation (раздел 09), open-questions 3 и 11 «до ответа: …», traceability FR-027–033, UC-02, AT-03, AT-04.
- финальный коммит + STATUS done.

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
