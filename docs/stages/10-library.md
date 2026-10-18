# Этап 10 — Библиотека материалов и заданий

статус: done дата: 2026-10-18 коммиты: 7c2f25b (api), 1fed427 (web), docs-коммит; ветка worktree-stage-10-library

## сделано

- миграции нет: таблицы files, materials, assignments, assignment_types, assessment_criteria, assignment_attachments — с этапа 01.
- shared `packages/shared/src/library.ts`: `FILE_UPLOAD_MAX_BYTES` (20 МБ), `FILE_UPLOAD_EXTENSIONS` (14 шт.), `SAFE_URL_PATTERN` (только http/https), `SYSTEM_ASSIGNMENT_TYPES` (8 типов п. 4.7), DTO (FileDto, MaterialDto, LibraryAssignmentDto, AssignmentTypeDto), zod-схемы форм (materialFormSchema, libraryAssignmentFormSchema, assignmentTypeFormSchema), `formatFileSize`.
- api `apps/api/src/library/*` (LibraryModule):
  - `file-signature.ts` — белый список + сигнатуры (PDF, PNG, JPEG, OLE doc/xls/ppt, OOXML по `[Content_Types].xml` + `word/`|`xl/`|`ppt/`, ODF по mimetype, TXT = UTF-8 без NUL). MIME из таблицы, не от клиента.
  - `files.service.ts` — `POST /files` (multer в память, `defParamCharset: utf8`, 413 с русским текстом), хранение `FILE_STORAGE_DIR` или `storage/<NODE_ENV>`, имя = UUID без расширения, sha256; `GET /files/:id` — вложение, `filename*` UTF-8; доступ: загрузивший или видна запись библиотеки с файлом, иначе 404; `scan()` — пустая точка под антивирус; `assertOwnUpload` — новый файл только свой.
  - `library-scope.ts` — область: материалы своих дисциплин + общие (discipline null); задания — своих дисциплин; `assertLibraryDiscipline`.
  - `materials.service.ts` — CRUD, поиск q/disciplineId/topic/kind/includeArchived, поля по виду (лишние чистятся), архив с причиной/возврат, архивный не правится (409), аудит `material.*`.
  - `assignments.service.ts` — типы (список: системные по порядку п. 4.7, потом свои; создание, дубль без регистра → 409), задания: CRUD, поиск q/disciplineId/topic/difficulty/typeId, maxScore = сумма критериев, PUT заменяет критерии и вложения, запрет менять критерии с баллами (409), аудит `assignment.*`, `assignment_type.created`.
  - `assignment-types-catalog.ts` — синхронизация системных типов при старте (OnApplicationBootstrap) и в сиде.
  - `library.controller.ts` — FilesController, MaterialsController, AssignmentTypesController, LibraryAssignmentsController; всё под `library.manage`; POST создания — `Idempotency-Key`.
- common: `ApiIdempotencyHeader()` в `idempotency.service.ts`; config: `findWorkspaceRoot` экспортирован.
- сид: системные типы + демо-материал (текст) и демо-задание (практическая, 2 критерия) по «Математика (демо)».
- web: `views/assignments/AssignmentsView.vue` (раздел «Задания» = библиотека заданий, инфоблок про назначение из ИОТ), `views/library/LibraryView.vue` (раздел «Библиотека материалов»), `AssignmentDialog.vue`, `MaterialDialog.vue`, `FileUploadButton.vue`, `files.ts` (precheck, upload, download), `form.ts` (issuesToErrors). router SECTION_VIEWS + assignments, library. `apiDownload` читает `filename*`. tokens.css: `.iot-field__label`.
- docs: ADR-016, access-model (этап 10), data-model (реализация 2.5, 2.7), wireframes §15, traceability, `.env.example` FILE_STORAGE_DIR.

## требования

- FR-046 ✅ FR-047 ✅
- FR-049 ⚠️ библиотека готова (файлы, ссылки, инструкция); у назначенных заданий — этап 12
- п. 8.3 ⚠️ + контроль загрузки файлов (антивирус вне MVP, хук есть)
- FR-002 ⚠️ + библиотека по дисциплинам закреплений
- AT-12 ⚠️ + библиотека: студент/исследователь 403, чужая дисциплина 404, чужой файл не прикрепить
- NFR-006 ⚠️ + создание материала, задания, типа
- NFR-010 ⚠️ + каталог файлов по окружению
- FR-033 ✅ сложность с профилем не связана, подсказка в карточке

## решения (почему)

- файл грузится отдельно (`POST /files`), потом id в материале/вложении — проще форма, одна точка проверок, переиспользуется на этапе 13.
- своя проверка сигнатур, без `file-type`: белый список фиксирован, зависимость не нужна.
- выдача всегда `attachment` — html/svg не в списке, но и pdf не открывается inline: нет XSS через загруженный файл.
- библиотека общая для преподавателей одной дисциплины, правит любой из них (переиспользование), всё в аудите. общий материал (без дисциплины) видят все с `library.manage`.
- системные типы — синк каталога при старте, не SQL-миграция: SQL дал бы UUID v4, а API (ParseUUIDPipe/IsUUID '7') принимает только v7.
- `library.manage` = материалы + задания библиотеки (так в описании разрешения); `assignments.manage` — назначение/проверка (12, 13).
- поля конкретного назначения (этап ИОТ, срок, статус, результат, комментарий) в библиотеке не показаны — инфоблок в разделе «Задания».
- эндпоинт `/library-assignments`, не `/assignments` — `/assignments` оставлен под назначенные задания (этап 12).

## файлы ключевые

- packages/shared/src/library.ts — константы, DTO, схемы
- apps/api/src/library/* — модуль библиотеки и файлов
- apps/api/test/library.e2e-spec.ts — e2e
- apps/web/src/views/assignments/AssignmentsView.vue, apps/web/src/views/library/*

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm db:up && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- в worktree .env/.env.test скопированы из корня. файлы тестов пишутся в `storage/test` (gitignored).
- сид: `pnpm db:seed` → демо-задание «Практическая работа: линейные уравнения (демо)», материал «Памятка: …».

## тесты

- shared 38, api unit 50 (+6 file-signature), api e2e 99 (+10 library), web vitest 80 (+8 library.spec), playwright 97 passed / 1 skipped (by design; +4: library 2 × 2 вьюпорта).
- правлены старые: e2e/navigation IMPLEMENTED + assignments, library; mockSession мокает materials, library-assignments, assignment-types.
- грабли: vue-tsc (шаблон) теряет область v-for после статического атрибута с `//` (`placeholder="https://"`) → «Cannot find name». плейсхолдер без `//`. также стрелка `(format) =>` в шаблоне → ошибка `.value` — вынесено в функцию.
- pg DeprecationWarning «client.query() when the client is already executing» — было и до этапа (1 на прогон), не моё.

## долги / TODO(этап NN)

- TODO(этап 11): привязка материалов (stage_materials) и заданий из библиотеки к этапам ИОТ (FR-037); выбор — через `GET /materials`, `GET /library-assignments` (только неархивные).
- TODO(этап 12): назначение заданий (FR-048) — `trajectory_assignments`; вложения показывать студенту → расширить доступ `FilesService.read` (студент — файлы своих назначенных заданий и материалов своих ИОТ).
- TODO(этап 13): сдача файлом — `FilesService.upload` + submission_files; доступ к файлам попыток.
- TODO(этап 19): ревизия загрузки файлов, CSP; антивирус — по решению заказчика (`scan()`).
- TODO(этап 21): очистка неиспользуемых файлов, бэкап каталога `FILE_STORAGE_DIR`, лимит nginx `client_max_body_size` ≥ 20 МБ.

## для след. этапа

- этап 11 (конструктор ИОТ): материалы и задания брать из библиотеки по дисциплине ИОТ; архивные не предлагать. `LibraryAssignmentDto`/`MaterialDto` в shared.
