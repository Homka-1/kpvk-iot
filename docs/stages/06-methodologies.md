# Этап 06 — Конструктор диагностических методик

статус: done дата: 2026-10-17 коммиты: e2464cd (api+shared), 272b254 (web) + коммит журнала. ветка worktree-stage-06-methodologies (worktree .claude/worktrees/stage-06-methodologies), в main не сливал.

## сделано

- shared packages/shared/src/diagnostics.ts: документ версии `QuestionnaireContent` (паспорт п. 4.4 + questions/options/scales/keys/rules, `key` = id БД или временный `new-…`), DTO-контракты (DiagnosticDirectionDto, QuestionnaireSummaryDto, QuestionnaireDetailDto, QuestionnaireVersionDto), DEMO_MARK, QUESTIONNAIRE_LIMITS, движок `scoreQuestionnaire`, `answerError`, `isAnswered`, `matchRule`, `roundScore`, `scaleScoreRange`, проверки `structuralIssues` (при каждом сохранении) и `publishIssues` (перед публикацией), zod `questionnaireCreateFormSchema`, `directionFormSchema`.
- миграция 20261017120000_questionnaire_versions: `scoring_keys.sort_order`; 5 направлений п. 4.4 (фикс. UUIDv7, ON CONFLICT DO NOTHING); триггеры `questionnaire_version_guard` (у не-DRAFT версии меняется только status, удалить нельзя) и `questionnaire_content_guard` на questions, answer_options, questionnaire_scales, scoring_keys, interpretation_rules (только у DRAFT; родитель удалён каскадом → можно).
- api apps/api/src/diagnostics/: QuestionnairesService/Controller, DiagnosticDirectionsController, DTO (class-validator вложенный, числа ≤3 знаков, коды шкал `^[A-Z0-9_]{0,30}$`), questionnaire-content.ts (readContent / replaceContent / passportData — общий с сидом), questionnaire-definitions.ts (загрузка `prisma/questionnaires/<slug>/v<N>.json`).
- эндпоинты (все `diagnostics.manage`): `GET/POST /diagnostic-directions`, `PATCH /diagnostic-directions/:id`; `GET /questionnaires?includeArchived`, `POST /questionnaires` (Idempotency-Key), `GET/PATCH /questionnaires/:id` (PATCH = направление), `POST :id/copy` (Idempotency-Key), `POST :id/archive {reason}`, `POST :id/restore`, `POST :id/versions` (новый черновик-копия действующей), `GET/PUT/DELETE :id/versions/:versionId`, `POST :id/versions/:versionId/publish`.
- публикация: publishIssues → 400 `{message, fields: {путь: текст}}`; PUBLISHED → RETIRED у прежней в той же транзакции.
- сид: `seedQuestionnaires` публикует все определения из prisma/questionnaires (сейчас demo-motivation v1, is_demo). ищет по title версии 1, повтор пропускает.
- контрольные примеры п. 11.3: apps/api/test/fixtures/diagnostics/demo-motivation/1/01..04.json + src/diagnostics/control-examples.spec.ts (unit, без БД).
- web: views/diagnostics/ — DiagnosticsView (вкладки «Методики», «Направления»), QuestionnairesPanel, CreateQuestionnaireDialog, DirectionsPanel, QuestionnaireEditorView (маршрут `diagnostics/questionnaires/:id`, name questionnaire-editor, ?version=id), QuestionsEditor, ScalesEditor, RulesEditor, PreviewDialog, content.ts (правка документа + pruneKeys, versionBadge, formatScore). меню не менялось.
- docs: ADR-012, access-model (таблица этапа 06), data-model (триггеры, sort_order), navigation (вложенная страница), wireframes §5 (реализация + отступление), traceability.

## требования

- FR-017 ✅
- FR-020 ⚠️ движок готов и проверен; расчёт при прохождении — 07
- FR-021 ✅
- FR-026 ✅ версия неизменяема, новая версия, прежние результаты не трогаются. процедура явного пересчёта (RECALCULATION) — НЕ сделана, см. долги
- FR-074 ⚠️ пропуск → null на уровне движка
- п. 11.3 ⚠️ формат + тест; примеры реальных методик — от заказчика
- огр. 1 ⚠️ демо-методика с пометкой; реальные — после передачи
- NFR-006 ⚠️ + создание/копирование методики
- AT-12 ⚠️ + методики: admin/researcher/student 403

## решения (почему)

- черновик сохраняется целиком (PUT), дети пересоздаются → id вопросов черновика меняются при каждом сохранении. безопасно: на черновик никто не ссылается (сессии/назначения только на опубликованные). UI после сохранения берёт документ из ответа.
- пропуск хотя бы одного вопроса шкалы → rawScore null + missingAnswers. частичная сумма занижает уровень. если реальной методике нужно иначе (среднее, допуск N пропусков) — добавить свойство шкалы после передачи. ADR-012.
- обратный ключ: min+max−значение. для SINGLE_CHOICE min/max по значениям вариантов; LIKERT/NUMBER — границы вопроса; MULTIPLE_CHOICE нельзя.
- ключ по варианту: points ?? value варианта, если вариант выбран; reverse запрещён.
- диапазоны правил с включёнными границами, пересечение запрещено при публикации; балл вне диапазонов → уровень не определён.
- ключи в отдельной вкладке «Шкалы и ключи», не в карточке вопроса (вопрос в нескольких шкалах + ключи по вариантам). записано в wireframes §5.
- направление — свойство методики (не версии): меняется сразу PATCH, даже у опубликованной.
- направления в миграции (не в сиде): нужны в проде. фиксированные UUIDv7, т.к. ParseUUIDPipe version 7.
- методики — общий справочник для всех с diagnostics.manage, без scope по группам.
- копия демо-методики остаётся демо (isDemo наследуется, к названию добавляется DEMO_MARK при отсутствии).
- первая версия не удаляется (только архив методики), черновики v2+ — можно.
- body limit express 100kb не трогал: реальные методики (десятки вопросов) влезают. если нет — поднять лимит json в app.setup.ts.
- коммиты с хуком husky (PATH с ~/.npm-global/bin в env команды) — lint-staged отработал.
- dev-БД и test-БД общие с основной копией: миграция 20261017120000 уже применена к ним и демо-методика засеяна в dev. основной checkout без этой миграции увидит «миграция в БД, нет локально» до слияния ветки.

## файлы ключевые

- packages/shared/src/diagnostics.ts — контракты, движок, проверки
- apps/api/src/diagnostics/questionnaires.service.ts — вся логика методик/версий
- apps/api/src/diagnostics/questionnaire-content.ts — документ ↔ таблицы
- apps/api/prisma/migrations/20261017120000_questionnaire_versions/migration.sql — направления, триггеры
- apps/api/prisma/questionnaires/demo-motivation/v1.json — демо-методика
- apps/api/test/fixtures/diagnostics/ + apps/api/src/diagnostics/control-examples.spec.ts
- apps/web/src/views/diagnostics/QuestionnaireEditorView.vue (+ *Editor.vue, PreviewDialog.vue)

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- `pnpm db:migrate` (или deploy) → `pnpm db:seed` → `pnpm dev` → teacher → «Диагностика» → демо-методика (опубликована v1, только чтение) → «Создать новую версию» → поменять ключ → «Опубликовать версию» → вкладка «Версии»: v1 выведена из использования. «Предпросмотр» — расчёт баллов.

## тесты

- shared 18 (+12 diagnostics.spec); api unit 44 (+6 control-examples); api e2e 64 (+11 questionnaires, +1 database); web vitest 55 (+4 diagnostics.spec); playwright 79 passed, 1 skipped (как раньше; +3 diagnostics × 2 вьюпорта).

## долги / TODO(этап NN)

- TODO(этап 07): назначать только PUBLISHED версию неархивной методики; расчёт при завершении через scoreQuestionnaire + answerError; DiagnosticScore.interpretationRuleId = rule.key; ревизия INITIAL со scoringVersionId; вкладка «Назначения» в DiagnosticsView; allowDraft версии управляет черновиком студента.
- TODO(этап 07/08): действия диагностики в STUDENT_HISTORY_LABELS.
- TODO(решение заказчика/исследователя): процедура явного пересчёта старых прохождений по новой версии ключей (ревизия RECALCULATION, FR-026) — не делал, в ТЗ нет сценария; нужен ли в MVP — спросить. вопрос 14 в open-questions; обработка пропусков — вопрос 15.
- TODO(после передачи методик): определения Ильиной/Реана/Моросановой в prisma/questionnaires + примеры в test/fixtures; при иной обработке пропусков — свойство шкалы.
- TODO(этап 19): лимит размера JSON-тела для очень больших методик.

## для след. этапа

- версия для назначения: `questionnaireVersion` со status PUBLISHED и questionnaire.status ACTIVE. содержимое для расчёта: `readContent(version)` с include `versionContentInclude`; ключи документа = id вопросов/вариантов/правил в БД, ответы студента хранить по id вопроса, выбор — по id варианта (тип AnswerValue).
- опубликованную версию менять нельзя ни в коде, ни в БД (триггер бросит restrict_violation → Prisma ошибка → 409/500). DiagnosticSession/Score ссылаются на версию — это ок, триггеры на них не влияют.
- вкладки DiagnosticsView: value questionnaires, directions — добавить assignments.
