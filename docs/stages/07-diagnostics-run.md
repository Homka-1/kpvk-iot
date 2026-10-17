# Этап 07 — Проведение диагностики

статус: done дата: 2026-10-18 коммиты: 09df6fa (shared+api), 1dab1ea (web) + коммит docs. ветка worktree-stage-07-diagnostics-run (worktree .claude/worktrees/stage-07-diagnostics-run), в main не сливал.

## сделано

- shared packages/shared/src/diagnostic-sessions.ts: `FormQuestion` (в diagnostics.ts — вопрос без значений/ключей; answerError/isAnswered принимают FormQuestion), `DiagnosticForm`, `toFormQuestion`/`toDiagnosticForm`, `answersIssues(questions, answers, complete)` → `{ 'answers.<id>': текст }`, `answeredOnly`, `AssignmentState` + `assignmentState(period)` (PLANNED/ACTIVE/FINISHED/CANCELLED, не в БД), DTO: DiagnosticAssignmentDto(+Detail, counts), DiagnosticSessionRowDto, StudentDiagnosticDto, ScaleResultDto, DiagnosticAnswersDto/RevisionDto, CabinetDiagnosticDto(+SessionDto с form, draft). zod `assignmentFormSchema`, `localDayStart`, `correctionReasonSchema`. ASSIGNMENT_MAX_DAYS 366.
- profile.ts STUDENT_HISTORY_LABELS: diagnostic_session.completed / paper_entered / corrected. profile.service history() берёт entityType diagnostic_session по id сессий студента.
- миграция 20261017200000_diagnostic_session_guard: триггер на diagnostic_sessions — у COMPLETED меняется только current_revision (вверх), удалить нельзя.
- api apps/api/src/diagnostics/sessions.{service,controller,dto}.ts:
  - `diagnostic-assignments` (diagnostics.manage): GET, POST (Idempotency-Key; действующая PUBLISHED версия ACTIVE-методики; groupId XOR studentId; endsAt не включительно, >now, ≤366 дн), GET :id (+sessions), POST :id/cancel {reason}.
  - `diagnostic-sessions/:id`: GET form, POST paper {answers, completedAt} (manage), GET answers (diagnostics.answers.read), POST corrections {answers, reason} (manage + answers.read).
  - `students/:id/diagnostics` (students.read).
  - `cabinet/diagnostics` (cabinet.access): GET, GET :id, POST :id/start, PUT :id/draft, POST :id/complete.
  - назначение → diagnostic_sessions всем неархивным студентам группы + notifications `diagnostic.assigned`. expireOverdue() лениво → EXPIRED.
- web:
  - components/QuestionField.vue — общий вопрос (5 типов); PreviewDialog переведён на него.
  - views/diagnostics: AssignmentsPanel (вкладка «Назначения» в DiagnosticsView), AssignDialog, AssignmentDetailDialog (прохождения, «Ввести бланк», отмена), AnswersFormDialog (mode paper|correction), AnswersHistoryDialog (ревизии, ответы, «Исправить ошибочный ввод»), ScoresTable, sessions.ts (бейджи, periodText, formatDuration, formatAnswer).
  - views/students/StudentDiagnosticsTab.vue — вкладка «Диагностика» профиля вместо EmptyState.
  - views/student/MyDiagnosticsView.vue (SECTION_VIEWS student-diagnostics), DiagnosticRunView.vue (маршрут `/student/diagnostics/:id`, name student-diagnostic-run): инструкция → «Начать» → вопросы, автосохранение черновика 1,5 с, «Отвечено N из M», проверка полноты, подтверждение, результат.
  - testing/setup.ts: заглушка scrollIntoView. e2e/support/session.ts: mockSession отдаёт [] для cabinet/diagnostics и diagnostic-assignments.
- docs: ADR-013, access-model (таблица этапа 07 + коды аудита), data-model (триггер сессии), navigation (вложенная страница кабинета, вкладка «Назначения»), wireframes §2 (реализация вкладки) + §12 (назначения, кабинет), traceability.

## требования

- FR-013 ✅ триггеры + ревизия CORRECTION с причиной и аудитом, UI исправления
- FR-018 ✅
- FR-019 ✅
- FR-020 ✅ расчёт при завершении/бланке/исправлении
- FR-022 ✅
- FR-023 ✅
- UC-01 ✅ Playwright e2e/diagnostics-run.spec.ts (2 вьюпорта)
- AT-02 ✅ API e2e по контрольным примерам + Playwright
- FR-016 ⚠️ + студент видит только studentText, без баллов
- FR-074 ⚠️ + «Нет данных (без ответа: N)» в профиле
- NFR-006 ⚠️ + назначение, завершение, бланк, исправление
- AT-12 ⚠️ + назначения/прохождения по scope, ответы только с answers.read, кабинет только свои
- FR-012 ⚠️ + вкладка «Диагностика», события в «Истории»

## решения (почему)

- версия фиксируется при назначении; новая публикация не трогает назначенные (FR-026).
- черновик — draft_answers JSON в сессии; при завершении очищается; без allowDraft → 409.
- ответы хранятся без пропусков (answeredOnly), пустой текст = пропуск; пропуск → балл null (ADR-012).
- исправление — полный набор ответов новой ревизии; одинаковые ответы → 400.
- текст ответов в аудит не пишется (п. 2.1).
- бланк можно ввести и после истечения срока.
- EXPIRED лениво при чтении: планировщика нет; фоновая задача — этап 14.
- период в UI — даты; endsAt = начало дня после даты окончания (не включительно); бланк — полдень выбранного дня, не позже now.
- студент результат — только studentText правил; если текста нет → «Результаты обсудит с вами преподаватель».
- Select PrimeVue не берёт имя из `<label for>` → `aria-labelledby` на label id (нужно для доступности и Playwright).
- Playwright проверка горизонтальной прокрутки — после закрытия listbox (иначе флак на 360 px из-за анимации оверлея).
- живой прогон с реальным API вручную не делал: контракт общий (`@iot/shared`), API покрыт e2e, UI — Playwright с моками.

## файлы ключевые

- packages/shared/src/diagnostic-sessions.ts — контракты, проверка ответов
- apps/api/src/diagnostics/sessions.service.ts — вся логика назначений/прохождений/ревизий
- apps/api/prisma/migrations/20261017200000_diagnostic_session_guard/migration.sql
- apps/web/src/components/QuestionField.vue
- apps/web/src/views/diagnostics/{AssignmentsPanel,AssignDialog,AssignmentDetailDialog,AnswersFormDialog,AnswersHistoryDialog}.vue
- apps/web/src/views/students/StudentDiagnosticsTab.vue
- apps/web/src/views/student/{MyDiagnosticsView,DiagnosticRunView}.vue

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- `pnpm db:deploy && pnpm db:seed && pnpm dev` → teacher → «Диагностика» → «Назначения» → «Назначить диагностику» (демо-методика, группа) → student → «Диагностика» → пройти → teacher → профиль студента → «Диагностика» → баллы, «Ответы и ревизии» → «Исправить ошибочный ввод».

## тесты

- shared 24 (+6); api unit 44; api e2e 74 (+10 diagnostic-sessions); web vitest 62 (+7 sessions.spec); playwright 83 passed, 1 skipped (by design, как раньше; +2 diagnostics-run × 2 вьюпорта).
- один полный прогон `pnpm test` дал 10 failed «Connection terminated» в diagnostic-sessions (обрыв соединения с общей test-БД, другой процесс); повтор — 74/74, ещё один полный прогон — зелёный. логику не трогал.

## долги / TODO(этап NN)

- TODO(этап 08): тип замера REPEATED/INTERMEDIATE при назначении, сравнение замеров и динамика во вкладке «Диагностика».
- TODO(этап 14): фоновая задача истечения сроков вместо ленивого expireOverdue().
- TODO(этап 15): бейдж уведомлений в шапке (уведомления `diagnostic.assigned` уже пишутся).
- TODO(решение заказчика): процедура RECALCULATION (open-questions, вопрос 14) — по-прежнему нет.
- TODO(этап 19): список назначений ограничен 200 без пагинации.

## для след. этапа

- прохождение: `diagnostic_sessions` (versionId, currentRevision), баллы — `diagnostic_scores` с revision = currentRevision. `StudentDiagnosticDto` — готовый формат для динамики.
- `measurementType` в назначении и сессии сейчас всегда PRIMARY (default БД); поле уже в DTO.
- общий компонент вопроса — `@/components/QuestionField.vue`; бейджи статусов — `@/views/diagnostics/sessions.ts`.
- dev-БД: миграцию 20261017200000 применить `pnpm db:deploy` (test-БД уже применена).
