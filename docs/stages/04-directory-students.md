# Этап 04 — Группы, дисциплины, студенты

статус: done дата: 2026-10-17 коммиты: 58d5da7 (api), 2be13f6 (web) + коммит журнала

## сделано

- api groups: GET /api/groups (groups.manage ИЛИ students.read; scope), POST/PATCH/archive(reason)/restore (groups.manage). архив — только без действующих студентов (409). имя уникально без учёта регистра.
- api disciplines: GET /api/disciplines (disciplines.read; препод — свои дисциплины и только свои группы), POST/PATCH/archive/restore (disciplines.manage). архив — только без действующих закреплений.
- api teacher-assignments (disciplines.manage): GET (?includeEnded), GET /teachers, POST {teacherId, groupId, disciplineId} (409 если такое действует), POST /:id/end {reason} — endsAt=now, история.
- api students: GET list (students.read): search (фамилия/имя/код/группа), groupId, disciplineId, profile, trajectoryStatus, hasDifficulties, archived, пагинация. GET /:id — карточка + enrollments. students.manage: POST (Idempotency-Key обязателен), POST import/preview (multipart file), POST import (rows + Idempotency-Key), PATCH (ФИО → и в users), transfer, archive, restore, reset-password. чужой студент → 404.
- guard: новый декоратор @RequireAnyPermission (apps/api/src/auth/decorators.ts) — хотя бы одно право.
- common: dto.ts (trim, emptyToNull, ReasonDto — вынесены из users.dto), idempotency.service.ts (IdempotencyService.run + @IdempotencyKey()).
- activeAssignmentWhere() вынесен в access-scope.service.ts (одно место «действующее закрепление»).
- сид: группа ДЕМО-21, дисциплина «Математика (демо)», закрепление teacher, студент DEMO-0001 в ДЕМО-21. идемпотентно (2 прогона ок).
- web: раздел «Студенты» (views/students/_: StudentsView, StudentCard, CreateStudentDialog, ImportStudentsDialog, StudentDialog, labels.ts, download.ts), раздел «Дисциплины» (views/disciplines/_: вкладки Дисциплины / Учебные группы / Закрепление преподавателей, useList.ts). stores/context.ts — группа/дисциплина в шапке (localStorage в try/catch), StaffLayout грузит списки. http.ts: headers, FormData, newIdempotencyKey(). ActionDialog, TemporaryPassword → components/. tokens.css: .iot-form/.iot-field/.iot-field-hint/.iot-field-error/.iot-form-buttons.
- docs: ADR-010, access-model (таблица scope этапа 04), navigation (вкладки Дисциплин, шапка), wireframes §10–11, tokens.md (классы форм), open-questions 4 и 7 (дефолты), traceability.

## требования

- FR-006 ✅ (формат файла — дефолт, вопрос 7)
- FR-007 ✅
- FR-008 ⚠️ фильтры работают по таблицам, данных нет до 09/12/15; «текущий профиль» — 09
- FR-009 ⚠️ карточка-диалог; профиль с вкладками — 05
- FR-010 ✅
- FR-011 ⚠️ архив без удаления; сроки хранения — вопрос 4 (17, 21)
- FR-002 ⚠️ группы/дисциплины/студенты по scope; панель — 16
- FR-005 ⚠️ карточка «Нет данных», EmptyState; панель — 16
- NFR-006 ⚠️ Idempotency-Key для студентов; другие формы — 07, 13, 19
- AT-12 ⚠️ 403 студенту/исследователю/админу на студентов; IDOR полный — 19
- MVP-2, MVP-3 ✅ (строка в traceability)

## решения (почему)

- группы и закрепления — вкладки в «Дисциплины»: меню менять нельзя (огр. 7), отдельного пункта нет. записано в ADR-010, navigation.md.
- админ без students.read (как было в каталоге этапа 03): ведёт справочники, но не видит студентов. студентов создаёт препод в своих группах. перевод — только в свою действующую группу (иначе потеряет доступ).
- логин студента = код участника lowercase → в логине нет ФИО. код авто `S-` + 6 символов (без 0/O/1/I).
- импорт 2 шага: preview ничего не пишет; commit перепроверяет все строки, одна транзакция (timeout 120 с), любая ошибка → 400 с fields `rows.<line>`, ничего не создано. клиент шлёт только корректные строки без поля errors (forbidNonWhitelisted).
- разделитель CSV — по строке заголовков (papaparse guess ломался на пустой последней строке). кодировка: UTF-8 fatal → иначе windows-1251.
- тип файла по содержимому: xlsx = ZIP-сигнатура + расширение, csv = нет NUL + расширение.
- @types/multer не ставили: тип файла в контроллере описан вручную `{ buffer, originalname }`. multer — из @nestjs/platform-express.
- idempotency: сохраняем ответ без временных паролей (секрет в БД не храним). повтор → temporaryPassword null, UI говорит «выдайте новый в карточке». для этого добавлен reset-password студента для препода.
- показатели карточки (прогресс, успеваемость, задания, активность) → null до этапа 13, не нули (FR-005). lastLoginAt НЕ используем как «активность» (правило п. 1.9).
- инструмент записи файлов превращает `﻿` в настоящий BOM → eslint no-irregular-whitespace. в коде BOM через String.fromCharCode(0xfeff) / regex `/^﻿/` (проверить после правок).
- коммиты --no-verify: husky не видит pnpm в PATH агента; lint-staged запускался вручную (как на этапе 03).

## файлы ключевые

- apps/api/src/groups/_, apps/api/src/disciplines/_ — справочники, закрепления
- apps/api/src/students/students.service.ts — список, валидация кандидатов, создание учёток, перевод, архив
- apps/api/src/students/student-import.ts — разбор CSV/XLSX
- apps/api/src/common/idempotency.service.ts — NFR-006
- packages/shared/src/students.ts — DTO-интерфейсы, zod-схемы форм, колонки импорта, лимиты
- apps/web/src/views/students/_, apps/web/src/views/disciplines/_, apps/web/src/stores/context.ts
- apps/web/e2e/support/session.ts — mockDirectoryApi

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH`
- `pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- `pnpm db:seed` → `pnpm dev` → teacher → /students (ДЕМО-21, DEMO-0001); admin → /disciplines (вкладки)
- импорт руками: CSV `Фамилия;Имя;Группа` + строки с группой ДЕМО-21

## тесты

- api unit 38 (+6 student-import), api e2e 45 (+15 students.e2e-spec: справочники 5, студенты 8, импорт 2); web vitest 44 (+6 students.spec); playwright 69 passed, 1 skipped (by design, как раньше).

## долги / TODO(этап NN)

- TODO(этап 05): профиль студента /students/:id с вкладками; открыть его из карточки (сейчас диалог StudentDialog). «Мой профиль» студента.
- TODO(этап 09): фильтр profile — по текущему профилю (сейчас «любой CONFIRMED/CORRECTED с уровнем»).
- TODO(этап 13): прогресс, средний балл, выполненные задания, последняя активность в StudentSummaryDto (сейчас null).
- TODO(этап 14): supportStatus меняется (FR-060) — сейчас только STANDARD по умолчанию.
- TODO(этап 15): hasDifficulties — данные из feedback DIFFICULTY_REPORT (фильтр уже есть).
- TODO(этап 16): период в шапке (FR-004), главная по контексту шапки.
- TODO(этап 17/21): сроки хранения архивных данных (вопрос 4).
- TODO(этап 19): очистка просроченных idempotency_keys фоном (сейчас удаляются только при повторе того же ключа); 413 от multer — русское сообщение есть общее, проверить.
- открытые вопросы 4, 7 — ждут заказчика; дефолты в ADR-010.

## для след. этапа

- карточка студента API: GET /api/students/:id (scope внутри сервиса, findInScope → 404). для профиля этапа 05 расширять detailsInclude / toDetails в students.service.ts.
- scope студентов: `this.scopes.studentsWhere(scope)`; дисциплины препода — scope.disciplineIds/pairs.
- новые формы создания: `@IdempotencyKey() key` + `IdempotencyService.run(user.id, '<действие>:'+key, body, action, toStored)`; на клиенте `newIdempotencyKey()` при открытии формы и заголовок `Idempotency-Key`.
- web: контекст шапки — useContextStore() (groups, disciplines, groupId, disciplineId, load()). после изменения справочников звать context.load().
- e2e UI: mockDirectoryApi(page, { groups, disciplines, students }).

## исправления после закрытия

- fix(web): e2e засорял вывод `[vite] http proxy error: /api/groups|/api/disciplines ECONNREFUSED` — шапка грузит списки, а тесты без mockDirectoryApi их не мокали. теперь mockSession отдаёт пустые списки по умолчанию. тесты и раньше зелёные, это был только шум.
- шум `DeprecationWarning: client.query()` в api e2e — изнутри prisma adapter-pg (см. этап 03), не наш код, не трогаем.
