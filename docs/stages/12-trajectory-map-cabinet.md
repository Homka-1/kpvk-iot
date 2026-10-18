# Этап 12 — Карта ИОТ и кабинет студента: траектория и задания

статус: done дата: 2026-10-18 коммиты: a6f6a97 (api+shared), 437aa11 (web), docs-коммит; ветка worktree-stage-12-trajectory-map

## сделано

- миграции нет: trajectory_assignments, assignment_choice_groups, feedback — с этапа 01.
- shared `packages/shared/src/student-assignments.ts`: `STUDENT_VISIBLE_TRAJECTORY_STATUSES` (ACTIVE, NEEDS_CORRECTION, COMPLETED), `ROUTE_PROPOSAL_STATUSES`, `ASSIGNMENT_INACTIVE_STATUSES` (DECLINED, CANCELLED), `ASSIGNMENT_CANCELLABLE_STATUSES` (OFFERED, ASSIGNED), `studentAssignmentSection`, лимиты, DTO: StudentAssignmentDto, CabinetAssignmentDetailDto, AssignmentChoiceDto, CabinetAssignmentsDto, AssignTasksResultDto, RouteProposalDto, CabinetStageDto/CabinetStageMaterialDto, CabinetTrajectoryDto. trajectories.ts: TrajectoryDto.proposals, снимок без proposals. profile.ts: метка истории `trajectory.change_proposed`.
- api:
  - `apps/api/src/assignments/*` (StudentAssignmentsModule): `POST /student-assignments` (FR-048: studentIds | groupId, одна дисциплина, пары группа×дисциплина из scope, advisory lock на студента, дубль → skipped «Задание уже назначено», Idempotency-Key, choice → AssignmentChoiceGroup + OFFERED, уведомление, аудит `assignment.assigned`), `GET /student-assignments?studentId=` (вкладка профиля), `POST /student-assignments/:id/cancel` (только вне ИОТ и OFFERED/ASSIGNED, невыбранный набор — целиком, 204). кабинет: `GET /cabinet/assignments`, `GET /cabinet/assignments/:id`, `POST /cabinet/assignment-choices/:id/choose` (ровно requiredCount, один раз — updateMany chosenAt null, остальные DECLINED, уведомление преподавателю).
  - trajectories: `GET /cabinet/trajectories` (CabinetTrajectoryDto, материалы с содержимым, свои proposals), `POST /cabinet/trajectories/:id/proposals` (feedback ROUTE_CHANGE_PROPOSAL, уведомление teacherId, аудит, Idempotency-Key; COMPLETED → 409). маппинг этапа вынесен в `toStageBase`/`toStageMaterial`/`toCabinetMaterial`/`toProposals`.
  - library: `publishedAssignmentWhere`/`cabinetAssignmentWhere` в library-scope.ts; `FilesService.readForStudent` + `GET /cabinet/files/:id` (CabinetFilesController), общий `attachment()` для ответа файлом.
  - `AccessScopeService.ownStudent(user)` — общий; удалены копии из sessions.service и новых сервисов.
- web:
  - `views/student/MyTrajectoryView.vue` («Моя траектория»: переключатель дисциплины, «Моя цель», StageMap со слотами, «Мои предложения» + RouteProposalDialog, подсказка про интересы → «Мой профиль»), `StageMaterialLink.vue` (ссылка/файл через кабинет/текст в окне), `MyAssignmentsView.vue` (наборы на выбор с чекбоксами, текущие, выполненные), `MyAssignmentView.vue` (`/student/assignments/:id`, имя `student-assignment-details`: сведения, цель, инструкция, критерии, ресурсы; сдача — сообщение «появится в следующем обновлении»).
  - `views/assignments/AssignTasksDialog.vue` (кнопка «Назначить» на карточке библиотеки), `StudentAssignmentsTab.vue` (вкладка «Задания» профиля, отмена с причиной), `status.ts` (бейдж статуса задания, срок, мета).
  - `StageMap.vue` — generic `S extends TrajectoryStageDto`, слоты `material`, `assignment`. `StudentTrajectoriesTab.vue` — «Карта действующей ИОТ» + «Все маршруты студента». `TrajectoryView.vue` — блок «Предложения студента».
  - router: SECTION_VIEWS student-trajectory, student-assignments; вложенный `student/assignments/:id`. меню не менялось.
- docs: ADR-018, access-model (этап 12), data-model 3.6 (реализация), wireframes (экран 3 — реализация 12, новый экран 16), traceability.

## требования

- FR-040 ✅ FR-041 ✅ FR-048 ✅ FR-054 ✅ AT-06 ✅
- п. 2.3 ✅ интересы (этап 05, ссылка из траектории), предложение изменения маршрута; обязательные этапы студент не меняет
- FR-002 ⚠️ + назначение и вкладка «Задания» по парам группа×дисциплина
- AT-12 ⚠️ + кабинет: свои ИОТ/задания/наборы/файлы, чужое — 404; роли — 403
- NFR-006 ⚠️ + назначение, предложение (Idempotency-Key), выбор — один раз (409)

## решения (почему)

- видимость задания = статус ИОТ: на этапе 11 задания черновика уже ASSIGNED. фильтр в одном месте (`publishedAssignmentWhere`), им же пользуется файлы студента.
- назначение вне маршрута не трогает утверждённую ИОТ: добавить задание в этап = корректировка с новой версией (этап 14). поэтому наборы на выбор только в «Назначить», не в конструкторе (иначе меняется снимок версии).
- дубль по студенту — пропуск с причиной, не 409 на весь запрос: группе назначают, когда часть уже имеет задание.
- отдельный CabinetTrajectoryDto: без versions/reason/updatedAt/кода участника; материалы с содержимым, чтобы не открывать библиотеку студенту.
- предложение = feedback ROUTE_CHANGE_PROPOSAL: таблица уже есть, этап 15 добавит ответы. маршрут, версия, updatedAt не меняются (проверено тестом).
- PrimeVue Select: подпись только через `aria-labelledby` (label for не работает) — сделал как в AssignDialog диагностики.

## файлы ключевые

- packages/shared/src/student-assignments.ts — статусы видимости, DTO
- apps/api/src/assignments/* — назначение, выбор, отмена, «Мои задания»
- apps/api/src/trajectories/trajectories.service.ts — cabinetList, propose
- apps/api/src/library/library-scope.ts, files.service.ts — видимость заданий и файлов студента
- apps/api/test/student-assignments.e2e-spec.ts — e2e (8)
- apps/web/src/views/student/* — кабинет; apps/web/src/views/assignments/* — назначение, вкладка
- apps/web/e2e/cabinet.spec.ts — Playwright AT-06 + назначение

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- руками: `pnpm db:seed && pnpm dev` → преподаватель: «Студенты» → студент → «Создать ИОТ» → утвердить; «Задания» → «Назначить» (группа, срок, выбор). студент: «Моя траектория», «Мои задания», выбрать из набора, открыть карточку.

## тесты

- shared 49 (+3 student-assignments.spec), api unit 50, api e2e 116 (+8 student-assignments), web vitest 95 (+4 cabinet.spec, +3 assignments.spec), playwright 103 passed / 1 skipped (by design; +4: AT-06 и назначение × 2 вьюпорта).
- правлены старые: profile.spec (мок /student-assignments), trajectories.spec и e2e trajectories (proposals: []), e2e support/session (дефолтные моки кабинета).
- грабли: vue-tsc падает на `.map((format) => …)` в шаблоне (TS2339 'value' на Record) — вынес в computed. heredoc/`sed -i 'Nr file'` в worktree-сессии блокируются — вставки делать python-скриптом из $CLAUDE_JOB_DIR/tmp.

## долги / TODO(этап NN)

- TODO(этап 13): сдача из карточки `/student/assignments/:id` (сейчас информационное сообщение), статусы IN_PROGRESS/SUBMITTED/RETURNED/COMPLETED, % этапов и ИОТ (StageMap «Нет данных»), просрочка во вкладке «Задания» и у студента.
- TODO(этап 14): задания этапа ИОТ меняются корректировкой (cancel → 409 сейчас); разбор предложений студента при корректировке; наборы на выбор внутри этапа ИОТ — если нужно, через корректировку.
- TODO(этап 15): ответы на предложения (feedback.parentId), бейдж уведомлений в шапке (уведомления уже пишутся: assignment.assigned, assignment.choice_offered, assignment.cancelled, assignment.chosen, trajectory.change_proposed).
- TODO(этап 16): главная студента (п. 6.5) — брать /cabinet/trajectories и /cabinet/assignments.
- история профиля: события заданий (entityType assignment) в «Историю» не попадают — результаты заданий добавит этап 13.

## для след. этапа

- этап 13: брать `StudentAssignmentDto`/`CabinetAssignmentDetailDto`, `cabinetAssignmentWhere` (видимость), `assignmentBadge`. submissions/assessments — таблицы есть. переход ASSIGNED → IN_PROGRESS/SUBMITTED; RETURNED → SUBMITTED; идемпотентная сдача (Idempotency-Key).
