# Этап 11 — Конструктор ИОТ и утверждение

статус: done дата: 2026-10-18 коммиты: 87ac9ff (api+shared), 182b1c5 (web), docs-коммит; ветка worktree-stage-11-trajectories

## сделано

- миграции нет: trajectory_templates, trajectory_template_stages, trajectories, trajectory_stages, trajectory_checkpoints, stage_materials, trajectory_assignments, trajectory_versions (+ триггер неизменяемости) — с этапа 01.
- shared `packages/shared/src/trajectories.ts`: `TRAJECTORY_TRANSITIONS` + `canTransition` (автомат п. 4.6), `TRAJECTORY_EDITABLE_STATUSES` (только DRAFT), `TRAJECTORY_CURRENT_STATUSES`, `STANDARD_TRAJECTORY_STAGES` (5 этапов дословно п. 4.6), `suggestTemplate`, `trajectoryIssues(content, 'draft'|'approve')`, `stageDurationDays`, DTO (TrajectoryDto, TrajectorySnapshot, TrajectorySummaryDto, TrajectoryPageDto, TrajectoryOptionsDto, TrajectoryTemplateDto), лимиты. profile.ts: STUDENT_HISTORY_LABELS + trajectory.\*.
- api `apps/api/src/trajectories/*` (TrajectoriesModule, импорт ProfilesModule):
  - `trajectory-templates-catalog.ts` — `syncTrajectoryTemplates` при старте и в сиде: стандартный + 3 варианта по уровням (createdById null; ключ = isStandard+motivationLevel; только создаёт недостающие).
  - `trajectories.service.ts` — options, list (page, фильтры studentId/groupId/disciplineId/status/q; без status — без ARCHIVED), get, create (Idempotency-Key, pg_advisory_xact_lock по студент+дисциплина, 1 действующая на дисциплину → 409, этапы из шаблона, supportMethods = стратегия утверждённого профиля), update (только DRAFT, ранняя проверка updatedAt → 409, trajectoryIssues draft → 400 fields, ссылки: этапы/точки/назначения свои, материалы/задания из библиотеки дисциплины, архивные — только уже привязанные; upsert по id, удаление отсутствующих), submit, returnToDraft (причина), approve (ACTIVE, version+1, профиль на момент назначения, currentStage = 1-й этап IN_PROGRESS, assignedAt задач, снимок в trajectory_versions, уведомление студенту, аудит), archive (причина, задания CANCELLED). `touch()` = updateMany по id+updatedAt+status — оптимистическая блокировка. огр. 4: контрольная группа действующего исследования → 403 (create/approve), options.blockedReason.
  - `trajectoryScopeWhere(scope)` — пары группа студента × дисциплина из закреплений.
  - контроллеры: `GET students/:id/trajectory-options`; `/trajectories` GET, POST, GET :id, PUT :id, POST :id/submit|return|approve|archive. approve/return — `trajectories.approve`.
- profiles: `MotivationProfilesService.lastDecided(studentId, db?)` + export сервиса из ProfilesModule.
- common/dto.ts: `RequiredTitle`, `OptionalText`, `OptionalUrl`, `OptionalUuid` перенесены из library.dto (переиспользуются).
- students/profile.service: вкладка «История» включает события trajectory.\*.
- сид: `syncTrajectoryTemplates`.
- web `apps/web/src/views/trajectories/`: TrajectoriesView (раздел, фильтры статус+поиск, контекст шапки, пагинация, старый `?studentId=` → редирект в конструктор), TrajectoryNewView (шаг 1), TrajectoryView (`/trajectories/:id`: DRAFT → TrajectoryEditor, иначе паспорт + карта + согласование + версии), TrajectoryEditor (шаги 2–7, автосохранение на переходах, предпросмотр, утвердить/согласование/архив), StageMap (карта п. 6.4, мобильная — вертикальная), TrajectoryPassport, LibraryPickerDialog, StepsHeader, TrajectoryCards, StudentTrajectoriesTab, content.ts (форма ↔ контент, dueAt = конец дня местного времени, бейджи этапа/КТ, STEPS).
- router: trajectories в SECTION_VIEWS; `trajectories/new` (trajectory-new), `trajectories/:id` (trajectory-details), право trajectories.manage. меню не менялось.
- профиль студента: кнопка «Создать ИОТ» в шапке, вкладка «Моя ИОТ» = StudentTrajectoriesTab. FR-031 ссылка → `/trajectories/new?studentId=`.
- docs: ADR-017, access-model (этап 11), data-model (реализация 2.6, автомат 3.4), wireframes (экраны 2, 3, 6), open-questions (10 — статус, 16 — новый: содержание шаблонов под профили), traceability.

## требования

- FR-034 ✅ FR-035 ✅ FR-036 ✅ FR-037 ✅ FR-038 ✅ FR-039 ✅ FR-045 ✅
- FR-031 ✅ (ссылка ведёт в конструктор)
- UC-03 ✅ AT-05 ✅
- огр. 4 ⚠️ серверный запрет есть; ведение ЭГ/КГ — этап 17
- FR-002 ⚠️ + ИОТ по парам группа×дисциплина
- AT-12 ⚠️ + ИОТ: студент/исследователь/админ 403, чужая область 404
- NFR-006 ⚠️ + создание ИОТ (Idempotency-Key), сохранение/утверждение по метке updatedAt
- FR-043 ⚠️ основа: снимок версии при утверждении; корректировка — этап 14

## решения (почему)

- одна действующая ИОТ на дисциплину: FR-045 «по разным дисциплинам»; без правила дубли черновиков. частичный уникальный индекс не делал — prisma его не описывает, будет дрейф; вместо — advisory lock в транзакции.
- задания этапа сразу в trajectory_assignments (статус ASSIGNED): одна модель для плана и назначения, снимок версии их содержит. студенту — только у опубликованной ИОТ (этап 12 фильтрует по статусу ИОТ!).
- PUT целиком, upsert по id: id этапов стабильны (нужно на 14 — ссылки заданий/рефлексий). в DRAFT удаление физическое, на 14 — archived_at.
- метка updatedAt вместо версии-счётчика: поле уже есть, `@updatedAt` двигается при каждом изменении паспорта; PUT всегда пишет паспорт.
- варианты шаблонов = те же 5 этапов + акцент стратегии: не выдумываю методическое содержание (open-questions 16).
- «На утверждении» необязателен: утвердить можно из черновика (п. 4.6 «только при необходимости»).
- dueAt задания = конец дня по местному времени браузера (браузер знает пояс пользователя, сервер — нет).
- шаги ②–⑦ на странице ИОТ, ① — отдельная страница: черновик создаётся сразу, дальше всё сохраняется на сервере.

## файлы ключевые

- packages/shared/src/trajectories.ts — автомат, шаблон, проверки, DTO
- apps/api/src/trajectories/\* — модуль ИОТ
- apps/api/test/trajectories.e2e-spec.ts — e2e (9)
- apps/web/src/views/trajectories/\* — конструктор, карта, раздел
- apps/web/e2e/trajectories.spec.ts — Playwright UC-03

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- в worktree .env/.env.test скопированы из корня.
- руками: `pnpm db:seed && pnpm dev` → преподаватель → «Студенты» → студент → «Создать ИОТ» (сид: шаблоны ИОТ, демо-задание и материал «Математика (демо)»).

## тесты

- shared 46 (+8 trajectories.spec), api unit 50, api e2e 108 (+9 trajectories), web vitest 86 (+6 trajectories.spec), playwright 99 passed / 1 skipped (by design; +2: UC-03 × 2 вьюпорта).
- правлены старые: profiles.spec (href FR-031), e2e navigation IMPLEMENTED + trajectories, mockSession мокает /api/trajectories.
- грабли: диалог, смонтированный сразу открытым (`v-if` + visible=true), не ловит `watch(visible)` — нужен `immediate: true`. bash с python heredoc/сложными конструкциями в worktree-сессии блокируется — скрипты писать файлом в $CLAUDE_JOB_DIR/tmp, запускать отдельной командой.

## исправление после закрытия (по просьбе пользователя)

- ввод дат был `<input type="date">` → формат по языку браузера (en-US = мм/дд/гггг). теперь общий `apps/web/src/components/DateInput.vue` (PrimeVue DatePicker, `dd/mm/yy`, плейсхолдер «дд/мм/гггг», календарь по кнопке, `showOnFocus=false`); значение — строка `YYYY-MM-DD`, формы и API не менялись. заменены все 10 полей: AssignDialog (2), AnswersFormDialog, ObservationDialog, TrajectoryEditor (6). локаль PrimeVue `dateFormat` → `dd/mm/yy` (поле срока разрешения в админке). показ дат (`formatDate`) остался «дд.мм.гггг».
- тесты: `src/components/DateInput.spec.ts` (+2), Playwright UC-03 вводит «дд/мм/гггг» и проверяет ISO в запросе. web vitest 88, playwright 99 passed / 1 skipped.
- новые поля дат — только через `DateInput`.

## долги / TODO(этап NN)

- TODO(этап 12): кабинет студента — активная ИОТ (FR-040), карта `StageMap` для студента; задания студенту показывать только у ИОТ в статусах ACTIVE/NEEDS_CORRECTION/COMPLETED (черновые trajectory_assignments тоже ASSIGNED!). центральная карта во вкладке профиля. уведомление `trajectory.approved` ссылается на `/student/trajectory`.
- TODO(этап 13): % выполнения этапа/ИОТ (сейчас «Нет данных»), StudentSummaryDto.currentTrajectory.progress.
- TODO(этап 14): корректировка ACTIVE (новая версия + причина, этапы архивировать), просмотр снимков версий и diff, NEEDS_CORRECTION → ACTIVE, завершение.
- TODO(этап 17): ведение участников ЭГ/КГ, research_project_id у ИОТ.
- TODO(решение заказчика): open-questions 10 (согласующий), 16 (содержание шаблонов под профили).

## для след. этапа

- этап 12: брать `TrajectoryDto`/`StageMap.vue`/`TrajectoryPassport.vue`; нужен студенческий эндпоинт (cabinet) с фильтром статуса ИОТ и без внутренних полей. выбор из равнозначных заданий (FR-054) — `assignment_choice_groups`, статус OFFERED.
