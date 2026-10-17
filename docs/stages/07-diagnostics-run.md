# Этап 07 — Проведение диагностики

статус: in_progress дата: 2026-10-17 коммиты: см. git log ветки worktree-stage-07-diagnostics-run (worktree .claude/worktrees/stage-07-diagnostics-run), в main не сливал.

## сделано (сессия 1 — shared + api, остановился по лимиту)

- shared packages/shared/src/diagnostic-sessions.ts: `FormQuestion` (в diagnostics.ts — вопрос без значений/ключей; answerError/isAnswered теперь принимают FormQuestion), `DiagnosticForm`, `toFormQuestion`/`toDiagnosticForm`, `answersIssues(questions, answers, complete)` → `{ 'answers.<id>': текст }`, `answeredOnly`, `AssignmentState` + `assignmentState(period)` (PLANNED/ACTIVE/FINISHED/CANCELLED, не в БД), DTO: DiagnosticAssignmentDto(+Detail, counts по статусам), DiagnosticSessionRowDto, StudentDiagnosticDto, ScaleResultDto, DiagnosticAnswersDto/RevisionDto, CabinetDiagnosticDto(+SessionDto с form, draft). zod `assignmentFormSchema` (questionnaireId, targetKind group|student, groupId, studentId, startsOn, endsOn YYYY-MM-DD), `localDayStart(date)`, `correctionReasonSchema`. ASSIGNMENT_MAX_DAYS 366. spec diagnostic-sessions.spec.ts (+6).
- profile.ts STUDENT_HISTORY_LABELS: diagnostic_session.completed / paper_entered / corrected. profile.service history() берёт ещё entityType diagnostic_session по id сессий студента.
- миграция 20261017200000_diagnostic_session_guard: триггер на diagnostic_sessions — у COMPLETED меняется только current_revision (только вверх), удалить нельзя. ответы/баллы/ревизии уже защищены миграцией 20261016171337.
- api apps/api/src/diagnostics/sessions.service.ts (DiagnosticSessionsService), sessions.controller.ts, sessions.dto.ts; модуль обновлён.
- эндпоинты:
  - `diagnostic-assignments` (diagnostics.manage): GET список (scope), POST (Idempotency-Key; questionnaireId → действующая PUBLISHED версия ACTIVE-методики; groupId XOR studentId; startsAt/endsAt ISO, endsAt не включительно, >now, ≤366 дн), GET :id (+ sessions), POST :id/cancel {reason} (открытые → CANCELLED, завершённые остаются).
  - `diagnostic-sessions/:id`: GET form (diagnostics.manage), POST paper {answers, completedAt} (diagnostics.manage, Idempotency-Key; статусы ASSIGNED/IN_PROGRESS/EXPIRED), GET answers (diagnostics.answers.read — у admin нет), POST corrections {answers, reason ≥5} (manage + answers.read, Idempotency-Key; новая ревизия CORRECTION, расчёт той же версией, одинаковые ответы → 400).
  - `students/:id/diagnostics` (students.read): прохождения + баллы действующей ревизии.
  - `cabinet/diagnostics` (cabinet.access): GET список (без CANCELLED), GET :id (form без значений вариантов, draft если allowDraft и открыт), POST :id/start (ASSIGNED→IN_PROGRESS, startedAt), PUT :id/draft {answers} (только IN_PROGRESS и allowDraft), POST :id/complete {answers} (Idempotency-Key; полнота → 400 fields; расчёт scoreQuestionnaire; durationSeconds). студенту — только studentText правил, без баллов.
- при назначении: diagnostic_sessions для всех неархивных студентов группы; notifications type `diagnostic.assigned`, link /student/diagnostics (бейдж — этап 15).
- expireOverdue(): при чтении списков/кабинета открытые сессии с прошедшим endsAt → EXPIRED (без фоновой задачи).
- e2e apps/api/test/diagnostic-sessions.e2e-spec.ts — 10 тестов (AT-02 по контрольным примерам 01-high/02-low, UC-01, FR-013 триггеры+ревизия, FR-022, AT-12, NFR-006, отмена/истечение, история).

## требования (пока)

- FR-018, FR-019, FR-020, FR-022, FR-023, FR-013 ✅ на API; UI — нет
- UC-01 ⚠️ API готов; Playwright UC-01 — нет
- AT-02 ⚠️ e2e API зелёный; UI — нет

## решения (почему)

- версия при назначении — действующая на момент назначения; сохраняется в сессии (FR-023). новая публикация не трогает уже назначенные.
- черновик — draft_answers JSON в сессии; при завершении очищается. ответы черновика проверяются answersIssues(complete=false).
- ответы хранятся без пропусков (answeredOnly), пустой текст = пропуск. расчёт пропуск → null (ADR-012).
- исправление — полный набор ответов новой ревизии, а не правка отдельных: проще аудит и расчёт.
- текст ответов в аудит не пишется (admin читает журнал, п. 2.1).
- бумажный бланк можно ввести и после истечения срока (EXPIRED) — бланки собирают позже.
- статус EXPIRED выставляется лениво при чтении: в MVP нет планировщика; фоновая задача — этап 14 (FR-058).

## осталось (следующая сессия продолжает ЭТОТ этап)

- web:
  - DiagnosticsView: вкладка «Назначения» (value assignments): список + диалог «Назначить» (методика с published, группа/студент из scope, период датами → startsAt=localDayStart(startsOn), endsAt=localDayStart(endsOn)+1 день), карточка назначения со списком прохождений, кнопки «Ввести бланк» (форма как PreviewDialog), «Отменить назначение».
  - StudentProfileView вкладка diagnostics: таблица прохождений (методика, версия, тип, статус StatusBadge, даты, время, баллы, «Нет данных» при null), «Ответы и исправление» (если право diagnostics.answers.read) → диалог с ревизиями + форма исправления с причиной.
  - кабинет: SECTION_VIEWS 'student-diagnostics' → views/student/MyDiagnosticsView.vue (список) + вложенный маршрут /student/diagnostics/:id (инструкция → «Начать» → вопросы, автосохранение черновика debounce, «Завершить» с подтверждением, ошибки полей). рендер вопросов вынести из PreviewDialog в общий компонент QuestionField. мобильная вёрстка 360.
  - vitest + Playwright e2e/diagnostics-run.spec.ts (UC-01, 2 вьюпорта).
- docs: ADR-013 (проведение диагностики, решения выше), access-model (таблица этапа 07), data-model (триггер сессии), wireframes (кабинет «Диагностика», вкладка профиля), navigation (вложенная страница кабинета), traceability (FR-013, 018–020, 022, 023, UC-01, AT-02, NFR-006, AT-12), STATUS → done.
- сид: назначить демо-методику демо-группе (по желанию, для ручной проверки).

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- worktree: `pnpm install` уже сделан; .env и .env.test скопированы из основной копии (не в git).
- `pnpm lint && pnpm typecheck && pnpm --filter @iot/api test` — зелёные (api unit 44, e2e 74; shared 24).
- миграция 20261017200000 применена к test-БД (test:api-e2e делает migrate deploy). к dev — нет: `pnpm db:deploy`.

## тесты

- shared 24 (+6); api unit 44; api e2e 74 (+10 diagnostic-sessions). web/playwright в этой сессии не гонял (web не менялся, кроме нет).
