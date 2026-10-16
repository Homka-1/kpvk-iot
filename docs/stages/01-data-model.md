# Этап 01 — Модель данных и ER-диаграмма

статус: done дата: 2026-10-16 коммиты: (см. STATUS)

## сделано

- apps/api/prisma/schema.prisma: 60 таблиц, 25 enum. все 28 таблиц п. 7 ТЗ под своими именами (@@map), snake_case колонки, uuid v7.
- вспомогательные: permissions, role_permissions, user_roles, user_permissions (доп. права с причиной — п. 2.1/2.4), auth_sessions (хеш refresh), teacher_assignments (scope FR-002), diagnostic_directions, questionnaire_scales, scoring_keys, interpretation_rules, questionnaire_version_comparabilities (UC-06), diagnostic_assignments, diagnostic_revisions, motivation_profile_sources, motivation_profile_history, files, materials, trajectory_template_stages, trajectory_checkpoints, stage_materials, assignment_types, assessment_criteria, assignment_attachments, assignment_choice_groups (FR-054), submission_files, assessment_criterion_scores, consultations, pedagogical_observations, research_measurements, notifications, idempotency_keys, system_settings.
- миграции: `20261016171227_init` (вся схема), `20261016171337_immutable_records` (FK audit_logs.actor и motivation_profile_history.profile → RESTRICT + триггер forbid_modification на 6 таблиц).
- PrismaService (src/prisma, @Global PrismaModule) через @prisma/adapter-pg; ленивое подключение. src/config/load-env.ts грузит корневой .env (ENV_FILE) — main.ts.
- packages/shared/src/enums.ts: все enum как `as const` + RU-подписи (*_LABELS).
- docs/architecture/er-diagram.md — генерится `pnpm db:erd` (apps/api/prisma/erd.ts парсит schema.prisma). руками не править.
- docs/architecture/data-model.md — соглашения, группы таблиц, жизненные циклы (mermaid stateDiagram), неизменяемость, ПДн.
- ADR-007 в docs/spec/decisions.md. README: .env.test, db:migrate, db:generate, db:erd.

## требования

- NFR-009 ✅ схема под весь MVP, доп. таблицы.
- NFR-007 ⚠️ миграции к пустой БД — тест есть; прод-обновление — этап 21.
- FR-013/FR-026/FR-043/п.8.3 — только фундамент (ревизии, снимки, триггеры). логика — этапы 07/06/14/03. в traceability статус не менял (⏳).

## решения (почему)

- диагностика по ревизиям: diagnostic_revisions (INITIAL/CORRECTION/RECALCULATION) + revision в answers/scores, unique(session,question,revision) / (session,scale,revision). current = diagnostic_sessions.current_revision. так исправление и пересчёт не трогают старые строки и нет partial index.
- черновик ответов — diagnostic_sessions.draft_answers (Json); в diagnostic_answers пишем только при завершении.
- ИОТ: живое состояние в trajectories/trajectory_stages (стабильные id для заданий/комментов), версия = неизменяемый JSON-снимок в trajectory_versions. diff — по снимкам (этап 14).
- просрочка задания НЕ статус, считается по due_at (статус не протухает).
- students.current_group_id — денормализация; история в enrollments. перевод = одна транзакция (этап 04).
- teacher = user с ролью, отдельной таблицы нет. дисциплины студента = дисциплины его группы через teacher_assignments.
- триггер кидает ERRCODE restrict_violation (23001). prisma ORM мапит это в P2003 «Foreign key constraint violated» — текст теряется. в сервисах ловить и давать понятную ошибку (NFR-005). в тесте проверяем через $executeRaw (там текст есть).
- prisma.config.ts: datasource.url = process.env.DATABASE_URL (не env()) — чтобы `prisma generate` работал без БД. миграции без URL падают с понятной ошибкой.
- generated client в .gitignore; `prisma generate` встроен в api build/typecheck/test.
- prisma `migrate reset` заблокирован для агента (Prisma детектит Claude Code, нужен consent пользователя). не обходил. init-миграцию восстановил байт-в-байт через `migrate diff --from-empty` (минус строка CREATE SCHEMA), чек-сумма совпала.

## файлы ключевые

- apps/api/prisma/schema.prisma — схема (разделы «// ── Название ──» = разделы ERD)
- apps/api/prisma/migrations/* — НЕ редактировать применённые
- apps/api/prisma/erd.ts — генератор ERD
- apps/api/src/prisma/prisma.service.ts, prisma.module.ts
- apps/api/src/prisma/enums.spec.ts — enum shared == prisma
- apps/api/test/database.e2e-spec.ts — подключение, миграции к чистой временной БД, триггеры
- apps/api/test/setup-env.ts — грузит .env.test, падает если БД не *_test
- packages/shared/src/enums.ts

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm db:up` (docker теперь доступен агенту), .env и .env.test из .env.example (в .env.test база iot_test)
- `pnpm db:migrate`; `pnpm lint && pnpm typecheck && pnpm test`

## тесты

- shared 1/1, web 1/1, api unit 26/26 (25 enum + health), api e2e 6/6 (health 2, БД 4). все зелёные.

## долги / TODO(этап NN)

- TODO(этап 03): сид ролей/permissions/учёток; маппинг ошибки триггера (P2003 от forbid_modification) в понятный ответ.
- TODO(этап 06): запрет правки опубликованной версии методики — в сервисе (триггера нет: правка затрагивает дочерние таблицы). демо-методика, diagnostic_directions сид (5 направлений).
- TODO(этап 10): сид assignment_types (8 стандартных из п. 4.7).
- TODO(этап 11): сид стандартного 5-этапного шаблона; state machine ИОТ в shared (draft в data-model.md п. 3.4).
- TODO(этап 17): огр. 4 — проверка по research_participants.group при создании ИОТ.
- дата рождения студента не хранится (ТЗ не требует, ПДн-минимум) → age_restrictions методики — только текст. если нужна проверка возраста — вопрос заказчику.
- Node 26 тут, prisma ругается в preinstall — работает.

## для след. этапа

- этап 02 (дизайн/каркас UI) БД почти не трогает. подписи статусов для StatusBadge — *_LABELS из @iot/shared.
- e2e API тесты требуют поднятый postgres + .env.test; перед ними `prisma migrate deploy` на iot_test автоматически.
