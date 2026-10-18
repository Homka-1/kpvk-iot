# Этап 13 — Сдача и проверка заданий

статус: done дата: 2026-10-18 коммиты: 04f347f (fix ИОТ scope), 4252c4b (api+shared), 370bd23 (web), 51b8111 (таймаут e2e), docs-коммит; ветка worktree-stage-13-submissions

## сделано

- миграции нет: submissions, submission_files, assessments, assessment_criterion_scores, academic_results — с этапа 01.
- shared `packages/shared/src/submissions.ts`: `ASSIGNMENT_SUBMITTABLE_STATUSES` (ASSIGNED, IN_PROGRESS, RETURNED), `isAssignmentOverdue`, `submissionIssues` (форматы задания, непустой ответ), `checkAssessment` (баллы по каждому критерию 0…max, итог — сумма; без критериев — без балла; RETURNED — комментарий обязателен, баллов нет), `assignmentProgress` (total/completed/submitted/returned/inProgress/notStarted/overdue/percent; без заданий percent null), `nextStageStatus`; DTO SubmissionDto, AssessmentDto, AssignmentResultDto, AssignmentWorkDto, AssignmentReviewDto, ReviewQueueItemDto. `StudentAssignmentDto.result` — итог последней проверки. profile.ts: метки истории `assignment.submitted|accepted|returned`.
- api:
  - `apps/api/src/assignments/submissions.service.ts` (SubmissionsService): `start` (ASSIGNED→IN_PROGRESS), `submit` (Idempotency-Key, условный переход в SUBMITTED, попытка attemptNumber=count+1, файлы — только свои загрузки `assertOwnUpload`, уведомление преподавателю ИОТ или назначившему, аудит без содержимого), `reviewQueue`, `reviewGet`, `assess` (только последняя непроверенная попытка, 409 повтор; COMPLETED+completedAt или RETURNED; academic_results при балле; уведомление студенту; аудит). `syncStageProgress` — статус этапа и переход currentStageId.
  - `submissions.controller.ts`: `AssignmentReviewController` (`GET /student-assignments/review`, `GET /student-assignments/files/:fileId`, `GET /student-assignments/:id`, `POST /student-assignments/:id/assessments`) — объявлен первым в модуле, чтобы `review` не попал в `:id`; `CabinetSubmissionsController` (`POST /cabinet/assignments/:id/start`, `POST /cabinet/assignments/:id/submissions`).
  - `StudentAssignmentsService.work(where)` — карточка с попытками; `cabinetGet` отдаёт AssignmentWorkDto; `toDtos` — public, считает `result`.
  - library: `teacherAssignmentWhere(scope)` (пары группа×дисциплина), `FilesService.readSubmissionFile`, `readForStudent` + файлы своих ответов; `POST /cabinet/files` (загрузка студентом); `attachment()` экспортирован.
  - profile.service history: + entityType trajectory_assignment.
- fix 04f347f: `trajectoryScopeWhere` — пустой `OR: []` в Prisma = без ограничения → преподаватель без закреплений видел все ИОТ (77 в тестовой БД). теперь `{ id: { in: [] } }`. регрессионный e2e в trajectories.e2e-spec.
- 51b8111: jest-e2e `testTimeout: 30000` — при корневом `pnpm test` web и api параллельно, beforeAll падал по 5 с.
- web:
  - `views/student/SubmissionForm.vue` (поля по форматам, до 5 файлов через `/cabinet/files`, Idempotency-Key, ошибки полей), `MyAssignmentView.vue` (блок «Выполнение»: «Приступить к выполнению», форма, сообщения по статусу, комментарий возврата; «Мои попытки»; бейдж «Просрочено»), `MyAssignmentsView.vue` (просрочка, балл).
  - `views/assignments/SubmissionHistory.vue` (общая история попыток), `AssignmentReviewView.vue` (`/assignments/review/:id`, имя `assignment-review`: сведения, критерии, ответы, форма проверки — решение, баллы, пояснения, итог, комментарий), `ReviewQueue.vue` (очередь, фильтры группы/дисциплины из шапки), `AssignmentsView.vue` — вкладки «Библиотека заданий» | «На проверке» (`?tab=review`), `StudentAssignmentsTab.vue` (просрочка, итог, «Проверить ответ» / «Ответы и проверка»), `status.ts` (`overdueBadge`, `decisionBadge`, `scoreText`).
  - `StageMap.vue`: «Выполнение маршрута» сверху, % на карточке этапа, статистика этапа (FR-055), бейджи статуса заданий; проп `progress` (false в предпросмотре конструктора). `FileUploadButton` — проп `endpoint`, `disabled`.
  - router: вложенный `assignments/review/:id`. меню не менялось.
- docs: ADR-019, access-model (этап 13), data-model 3.5/3.6 (реализация), wireframes (экраны 3, 16, новый 17), traceability.

## требования

- FR-042 ✅ FR-050 ✅ FR-051 ✅ FR-052 ✅ FR-053 ✅ FR-055 ✅ UC-04 ✅ AT-07 ✅
- FR-002 ⚠️ + проверка по парам группа×дисциплина; fix ИОТ без закреплений
- AT-12 ⚠️ + свои задания/файлы ответов; чужие — 404, студенту проверка — 403
- NFR-006 ⚠️ + сдача и проверка — Idempotency-Key, проверка один раз
- FR-056 (прогресс %) частично готов для этапа 14: `assignmentProgress`; раздел «Мониторинг» — этап 14

## решения (почему)

- правила — чистые функции в shared: сервер и форма проверяют одинаково, ошибки у полей до отправки.
- баллы только по критериям (maxScore задания = сумма критериев с этапа 10). без критериев — принять без балла, academic_results не пишется (нет фиктивных оценок, FR-005).
- проверяется только последняя попытка; старую — 409. попытка проверяется один раз (unique submission_id + условный переход).
- статус этапа считается автоматически: это ход выполнения, не решение о маршруте; версия ИОТ не меняется. завершение ИОТ — преподаватель (этап 14).
- % не хранится: считается по статусам заданий, отменённые/невыбранные не учитываются.
- «Приступить» необязательно: форма видна сразу в ASSIGNED/IN_PROGRESS/RETURNED, чтобы не добавлять лишний шаг.
- файлы ответа преподаватель качает через `/student-assignments/files/:id` (право на задания), а не `/files/:id` (право библиотеки).
- вкладка «На проверке» в «Задания» — изменение состава экрана 15 (причина: AT-07 нужна точка входа для проверки без обхода профилей; меню не тронуто). записано в wireframes, экран 17.
- комментарий проверки виден студенту (обратная связь по заданию). внутренние заметки — этап 15.

## файлы ключевые

- packages/shared/src/submissions.ts — правила и DTO
- apps/api/src/assignments/submissions.service.ts, submissions.controller.ts, submissions.dto.ts
- apps/api/src/assignments/student-assignments.service.ts — `work`, `result`
- apps/api/src/library/library-scope.ts (`teacherAssignmentWhere`), files.service.ts
- apps/api/test/submissions.e2e-spec.ts — e2e (5)
- apps/web/src/views/assignments/AssignmentReviewView.vue, ReviewQueue.vue, SubmissionHistory.vue
- apps/web/src/views/student/SubmissionForm.vue, MyAssignmentView.vue
- apps/web/src/views/trajectories/StageMap.vue — прогресс
- apps/web/e2e/submissions.spec.ts — Playwright UC-04 и AT-07

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- руками: `pnpm db:seed && pnpm dev` → преподаватель назначает задание с критериями; студент: «Мои задания» → задание → ответ + файл → «Отправить на проверку»; преподаватель: «Задания» → «На проверке» → вернуть с комментарием; студент сдаёт снова; преподаватель принимает с баллами → карта ИОТ показывает %.

## тесты

- shared 55 (+6 submissions.spec), api unit 50, api e2e 122 (+5 submissions, +1 trajectories регрессия), web vitest 100 (+2 cabinet.spec, +2 assignments.spec, +1 trajectories.spec), playwright 107 passed / 1 skipped (by design; +4: UC-04 и AT-07 × 2 вьюпорта).
- правлены старые: моки `result: null` (cabinet.spec, assignments.spec, e2e/cabinet.spec), карточка — AssignmentWorkDto (completedAt, submissions).
- грабли: worktree-сессия блокирует команды с `\"` в heredoc и git в цепочках — правки делать python-скриптом из $CLAUDE_JOB_DIR/tmp. порт 5432 занят postgres главного репо — `pnpm db:up` в worktree падает, используем общий (контейнер worktree удалить). Prisma `OR: []` не ограничивает выборку!

## долги / TODO(этап NN)

- TODO(этап 14): раздел «Мониторинг» (FR-056–FR-062) — брать `assignmentProgress`, `isAssignmentOverdue`; предупреждения о просрочке и пропущенных КТ; этап без заданий не завершается автоматически — решить через КТ/корректировку; завершение ИОТ с итоговой оценкой (FR-044).
- TODO(этап 15): бейдж уведомлений в шапке (пишутся `assignment.submitted|accepted|returned`); внутренние заметки к заданию (FR-068).
- TODO(этап 16): карточка «Заданий на проверке» на главной → `/assignments?tab=review`; «Мои достижения» — из academic_results.
- антивирус файлов ответа — хук `FilesService.scan` (вне MVP, ADR-016).

## для след. этапа

- этап 14: прогресс и просрочка — функции shared; `teacherAssignmentWhere`/`trajectoryScopeWhere` — scope (пустые пары уже обработаны). статус этапа пересчитывает `syncStageProgress` (submissions.service.ts) — при корректировке заданий этапа вызывать его же. academic_results — оценки за задания для «динамики академической успешности».
