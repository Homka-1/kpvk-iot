# Этап 15 — Обратная связь и уведомления

статус: done дата: 2026-10-19 коммиты: ee230fc (api+shared), fbdb4f8 (web), 2a7ed91 (docs); ветка worktree-stage-15-feedback от ветки 14 с fix f3325fb

## сделано

- миграции нет: feedback, consultations, reflections, notifications — с этапа 01.
- shared `packages/shared/src/feedback.ts` (новый): виды сообщений `TEACHER_FEEDBACK_KINDS`, `STUDENT_FEEDBACK_KINDS`, `RESOLVABLE_FEEDBACK_KINDS`, `DATED_FEEDBACK_KINDS`; `CONSULTATION_OPEN_STATUSES`; `isCheckpointReflectable` (PASSED|MISSED); лимиты текстов; самооценка 1–5; DTO `FeedbackDto` (ветка + ответы + привязка), `ConsultationDto`/`CabinetConsultationDto` (без internalNote), `ReflectionDto`, `PendingReflectionDto`, `StudentSupportDto` (+ trajectories для привязки), `CabinetFeedbackDto`, `NotificationDto/NotificationsDto`; `interactionTimeline` (лента FR-063). `profile.ts` — метки истории `feedback.resolved`, `consultation.*`, `reflection.created`.
- api:
  - `apps/api/src/notifications/*` (новый модуль): `GET /notifications` (30 последних + unread), `POST /notifications/:id/read`, `POST /notifications/read-all`; `NotificationsService.notify(tx, userIds, …)` и `teachersFor(tx, studentId, trajectoryId)` (преподаватель ИОТ, иначе преподаватели действующих закреплений группы).
  - `apps/api/src/feedback/*` (новый модуль): `FeedbackService` (list, support, create, reply, resolve, cabinet, ask, studentReply, reflect), `ConsultationsService` (list, forStudent, create, schedule, hold, cancel, request; `withoutInternalNote`), `feedback-refs.ts` (`resolveBinding`, `findStudentInScope`, select'ы), контроллеры `FeedbackController` (`/feedback`), `StudentSupportController` (`/students/:id/support`), `ConsultationsController` (`/consultations`), `CabinetFeedbackController` (`/cabinet/feedback`, `/replies`, `/consultations`, `/reflections`), DTO со swagger.
  - `trajectories.service.ts`: markCheckpoint PASSED/MISSED → уведомление студенту `reflection.requested` (если рефлексии ещё нет); `assertReflectionsKept` в correct → 400, если удаляется точка с рефлексией (долг этапа 14 закрыт).
  - `profile.service.ts` history: + entityType feedback/consultation/reflection.
- web:
  - `stores/notifications.ts` (опрос 60 с), `HeaderActions.vue` — колокольчик с бейджем, Popover со списком, «Прочитать все», переход по ссылке.
  - `views/feedback/`: `FeedbackView.vue` (раздел: вкладки Обращения/Консультации/Сообщения, `?tab=`), `FeedbackThread.vue`, `ConsultationCard.vue`, `ConsultationActions.vue` (диалоги назначить/провести/отменить, defineExpose), `ConsultationDialog.vue`, `ConsultationHeldDialog.vue`, `FeedbackComposeDialog.vue`, `ReflectionCard.vue`, `InteractionTimeline.vue`, `StudentSupportTab.vue` (вкладка «Сопровождение» профиля), `AssignmentComments.vue`, `content.ts` (бейджи, `bindingText`, `toIsoDateTime`, `splitDateTime`, `StudentOption`).
  - `views/student/`: `MyFeedbackView.vue`, `StudentRequestDialog.vue` (вопрос/затруднение/консультация), `ReflectionDialog.vue`.
  - встроено: профиль (вместо EmptyState консультаций), `MyAssignmentView` и `AssignmentReviewView` (комментарии к заданию), `MonitoringDetailView` («Назначить консультацию», UC-05). router: `feedback`, `student-feedback` в SECTION_VIEWS. меню не менялось.
- docs: ADR-021, access-model (этап 15), data-model 3.7/3.8, wireframes экран 19 + пометки 2, 18, traceability.

## требования

- FR-063 ✅ FR-064 ✅ FR-065 ✅ FR-066 ✅ FR-067 ✅ FR-068 ✅
- FR-016 ⚠️→✅, FR-008 ⚠️→✅ (затруднения из кабинета включают фильтр до «рассмотрено»)
- UC-05: шаг «консультация» закрыт (кнопка в мониторинге)
- NFR-006 + Idempotency-Key у всех форм этапа, одна рефлексия на точку

## решения (почему)

- внутренними бывают только рекомендация и комментарий: цель и запрос самооценки адресованы студенту (иначе 400).
- ответ во внутренней ветке всегда внутренний; в открытой — можно внутренний (заметка коллегам прямо в ветке).
- доступ к веткам — область студента по группам (как наблюдения этапа 05), не пары группа×дисциплина: сообщение может быть без ИОТ.
- привязка только к утверждённой ИОТ (ACTIVE/NEEDS_CORRECTION/COMPLETED): черновик удаляет этапы/задания → FK feedback.
- рефлексия — только после отметки точки преподавателем (PASSED|MISSED), не по дате: явное событие, есть уведомление.
- ответ на запрос самооценки = рефлексия с requestId, запрос закрывается resolvedAt. отдельной колонки связи нет — без миграции; связь в аудите (`reflection.created` after.requestId).
- уведомления — опрос раз в минуту, без SSE: проще, достаточно для MVP (CLAUDE.md п. 2 допускает опрос).
- аудит: только рассмотрение обращения, консультации, рефлексия. сообщения — не «значимые изменения» п. 8.3 и видны в ленте; тексты в журнал не пишутся (журнал читает админ).
- время консультации — поле «чч:мм» рядом с DateInput (память: только DateInput, без input type=date/time).
- `StudentSupportDto.trajectories` — варианты привязки для окна сообщения; тот же тип, что в кабинете.

## файлы ключевые

- packages/shared/src/feedback.ts — типы, лента
- apps/api/src/feedback/* — сообщения, консультации, рефлексия
- apps/api/src/notifications/* — уведомления
- apps/api/test/feedback.e2e-spec.ts — e2e (6)
- apps/web/src/views/feedback/* ; apps/web/src/views/student/MyFeedbackView.vue, ReflectionDialog.vue, StudentRequestDialog.vue
- apps/web/src/components/layout/HeaderActions.vue, apps/web/src/stores/notifications.ts
- apps/web/e2e/feedback.spec.ts — Playwright (2 × 2 вьюпорта)

## проверить

- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- руками: `pnpm db:seed && pnpm dev` → студент: «Обратная связь» → «Задать вопрос» → преподаватель: колокольчик (бейдж) → «Обратная связь» → ответ / внутренняя заметка / «Отметить рассмотренным»; «Консультации» → назначить время → «Отметить проведённой»; мониторинг ИОТ → отметить КТ «Пройдена» → студент: «Заполнить рефлексию».

## тесты

- shared 64 (+3 feedback.spec), api unit 50, api e2e 135 (+6 feedback), web vitest 109 (+7 feedback.spec), playwright 115 passed / 1 skipped (by design; +4: 2 сценария × 2 вьюпорта).
- правлены: assignments.spec (мок отвечал одним телом на все пути → для /api/feedback пустой список), e2e/support/session.ts (моки уведомлений и обратной связи), e2e/navigation.spec (feedback больше не заглушка).
- при общем `pnpm test` (api e2e и web vitest параллельно) один раз упал по таймауту 5 с старый тест monitoring.spec «UC-05, FR-043…» (TrajectoryEditor); отдельный прогон web — 109/109. нестабильность от нагрузки, не от этапа; при повторе — поднять testTimeout этого теста.

## долги / TODO(этап NN)

- TODO(этап 16): главная — нерассмотренные обращения (`GET /feedback?source=student&open=true`) и ближайшие консультации (`GET /consultations?status=SCHEDULED`); бейдж уже есть.
- TODO(этап 18): индивидуальный отчёт студента — консультации и рефлексия из `GET /students/:id/support`.
- список ветки/консультаций — до 200 последних (FEEDBACK_LIST_LIMIT), без пагинации; лента профиля — без лимита.
- студент не может отменить свой запрос консультации (не требуется ТЗ).

## для след. этапа

- уведомления писать через `NotificationsService.notify(tx, …)` (модуль NotificationsModule экспортирует сервис); старые модули пишут `tx.notification.create` напрямую — работает, переписывать не нужно.
- worktree-грабли те же: heredoc с python и цепочки команд могут блокироваться — скрипты класть в `$CLAUDE_JOB_DIR/tmp` через Write и запускать отдельной командой.
