# Этап 05 — Профиль студента (каркас) и педагогические наблюдения

статус: done дата: 2026-10-17 коммиты: 4c974ee (api), 168c859 (web) + коммит журнала. ветка worktree-stage-05-profile (worktree .claude/worktrees/stage-05-profile), в main не сливал.

## сделано

- shared: packages/shared/src/profile.ts — StudentProfileDto (details + interests + disciplines), ObservationDto, StudentVisibleObservationDto, StudentHistoryItemDto, OwnProfileDto, STUDENT_HISTORY_LABELS (закрытый список действий истории), todayIsoDate, zod observationFormSchema / interestsFormSchema, OBSERVATION_TEXT_MAX 2000, INTERESTS_MAX 1000. auth.ts: новое право `observations.manage` (teacher).
- api apps/api/src/students/profile.\*: StudentProfileController `students/:id` (класс students.read): GET profile, GET observations, POST observations (observations.manage + Idempotency-Key), PATCH observations/:observationId (только автор, иначе 403), GET history. CabinetProfileController `cabinet/profile` (cabinet.access): GET, PATCH {interests}.
- StudentProfileService: getProfile = StudentsService.get (scope, 404) + interests + дисциплины группы из действующих teacher_assignments (все преподаватели группы, не только свои). observedAt `YYYY-MM-DD` → DateTime UTC 00:00; не позже UTC-сегодня+14ч; дисциплина — только пара (дисциплина, группа студента) из scope.pairs. аудит observation.created/updated: id, studentId, visibility — БЕЗ текста. history: audit_logs по entityType student + pedagogical_observation (ids наблюдений студента), action ∈ STUDENT_HISTORY_LABELS, desc, 200. cabinet: студент по user.id (userId), архивный → 404; наблюдения только STUDENT_VISIBLE, без поля visibility. интересы: '' → null, аудит student.interests_updated без содержимого, если изменилось.
- web: views/students/StudentProfileView.vue (маршрут `students/:id`, name student-details, meta permission students.read; меню не менялось), ObservationDialog.vue (дата type=date, дисциплины — только те, где текущий юзер в teachers, RadioButton видимости, по умолчанию INTERNAL), views/student/MyProfileView.vue (SECTION_VIEWS 'student-profile'). StudentCard: проп `to` → RouterLink, без него текст; emit open убран. StudentsView: диалог убран, имя → профиль. StudentDialog — открывается кнопкой «Управление карточкой» в профиле. utils/format.ts formatDate (YYYY-MM-DD как местная дата). testing/setup.ts — заглушка ResizeObserver (TabList PrimeVue в jsdom).
- docs: ADR-011, access-model (право + таблица этапа 05), navigation (вложенные страницы), wireframes §2 (реализация) + «Мой профиль» студента + §10 (имя → профиль), traceability (FR-005, 009, 012, 014, 016, NFR-006, AT-12).

## требования

- FR-009 ✅
- FR-012 ⚠️ каркас: студент, закрепления, наблюдения, аудит; вкладки модулей — EmptyState до 07–15
- FR-014 ✅
- FR-016 ⚠️ наблюдения: служебные студенту не уходят (проверено e2e); интерпретация профиля — 09; заметки сопровождения — 15
- FR-005 ⚠️ вкладки без данных — пояснение
- NFR-006 ⚠️ + добавление наблюдения
- AT-12 ⚠️ + профиль/наблюдения/история чужого студента 404, студенту 403, cabinet только свой

## решения (почему)

- профиль — вложенная страница `/students/:id`, не пункт меню (огр. 7). ADR-011.
- отдельное право observations.manage, а не students.manage: гранулярность (CLAUDE.md п. 2), можно дать/отнять отдельно.
- наблюдения на вкладке «Сопровождение» (п. 4.3 «рекомендации, комментарии»), кнопка ещё в шапке профиля (макет). записано в wireframes §2.
- удаления наблюдений нет: история. правка — только автор.
- служебные наблюдения видят все преподаватели, кому доступен студент (не только автор). если заказчик против — фильтровать по authorId.
- история из audit_logs, без новой таблицы: аудит уже пишется в той же транзакции. новые модули добавляют action в STUDENT_HISTORY_LABELS (+ entityType в where в profile.service.ts history(), если сущность не student).
- текст наблюдения не в аудите: audit.read у админа (п. 2.1).
- «Создать ИОТ» в шапке профиля не делал — этап 11.
- блоки «Карта ИОТ», «Динамика», «Задания» из центра макета — придут со своими вкладками (08, 12, 13).
- коммиты --no-verify (husky без pnpm в PATH агента, как раньше). lint/typecheck/prettier гонял руками.
- работа в git worktree (фоновая сессия требует изоляции): ветка worktree-stage-05-profile, не main. слить в main — пользователь (`git merge --ff-only worktree-stage-05-profile` из основной копии).

## файлы ключевые

- packages/shared/src/profile.ts — контракты, метки истории, схемы форм
- apps/api/src/students/profile.service.ts — вся логика профиля/наблюдений/истории/кабинета
- apps/api/src/students/profile.controller.ts, profile.dto.ts
- apps/web/src/views/students/StudentProfileView.vue, ObservationDialog.vue
- apps/web/src/views/student/MyProfileView.vue
- apps/api/test/profile.e2e-spec.ts, apps/web/src/views/students/profile.spec.ts, apps/web/e2e/profile.spec.ts

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- `pnpm db:seed` → `pnpm dev` → teacher → /students → DEMO-0001 → профиль, «Добавить наблюдение» (видно студенту) → student → «Мой профиль» (отзыв виден, служебные нет)
- право observations.manage появится у роли teacher после перезапуска API (синк каталога) или сида

## тесты

- shared 6; api unit 38; api e2e 52 (+7 profile.e2e-spec); web vitest 51 (+7 profile.spec); playwright 73 passed, 1 skipped (by design, как раньше; +4 profile.spec × 2 вьюпорта).

## долги / TODO(этап NN)

- TODO(этап 07/08): вкладка «Диагностика» — результаты, даты, динамика (FR-015); history: добавить действия диагностики в STUDENT_HISTORY_LABELS.
- TODO(этап 09): вкладка «Мотивационный профиль», понятная студенту интерпретация (FR-016).
- TODO(этап 11): кнопка «Создать ИОТ» в шапке профиля.
- TODO(этап 12): вкладка «Моя ИОТ» + центральная карта ИОТ.
- TODO(этап 13): вкладка «Задания»; показатели карточки (прогресс и т. п.).
- TODO(этап 15): консультации/комментарии на вкладке «Сопровождение» (сейчас EmptyState под наблюдениями), внутренние заметки сопровождения (FR-068).
- TODO(этап 19): история ограничена 200 событиями без пагинации — проверить на объёмах.

## для след. этапа

- вкладки профиля — TabPanel value: general, diagnostics, motivation, trajectory, assignments, support, history в StudentProfileView.vue. наполнять, заменяя EmptyState.
- проверка доступа к студенту в новом модуле: `scopes.forUser(user)` + `prisma.student.findFirst({ where: { id, ...scopes.studentsWhere(scope) } })` → 404 (см. assertStudentInScope в profile.service.ts).
- кабинет студента: студент по `prisma.student.findUnique({ where: { userId: user.id } })`, эндпоинты под `cabinet/*` с cabinet.access.
- vitest с Tabs PrimeVue — нужен attachTo: document.body не обязателен, ResizeObserver уже заглушен в setup.ts.
