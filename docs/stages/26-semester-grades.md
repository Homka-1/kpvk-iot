# Этап 26 — Академическая успешность по семестрам

статус: done дата: 2026-10-25 коммиты: см. STATUS

## сделано

- ветка `worktree-stage-26-grades`. EnterWorktree дал ветку от 235cb39 (старый worktree-admin-students) → `git reset --hard fda4179` (main, этап 25 уже слит).
- решения заказчика 2026-10-25 (спросил): по дисциплине за семестр — несколько текущих оценок; общий балл = среднее средних дисциплин; в профиле — блок во вкладке «Диагностика» (7 вкладок п. 4.3 не трогаем).
- БД: миграция `apps/api/prisma/migrations/20261025120000_semester_grades` (аддитивная): enum `AcademicResultSource` + `SEMESTER_IMPORT`; `academic_results` + `period_id`, `group_id`, `import_id` (NULL); таблицы `academic_periods` (academic_year «гггг/гггг» CHECK, semester 1|2 CHECK, unique пара), `grade_imports` (file_name, content_hash, row_count, created_by, cancelled_at/by). CHECK `academic_results_semester_grade_check`: для SEMESTER_IMPORT обязательны period/group/import, score 0–100, max_score = 100 (сравнение `source::text` — новое значение enum нельзя юзать в той же транзакции).
- право `grades.manage` (`packages/shared/src/auth.ts`): admin + teacher. каталог синхронизируется при старте.
- shared `packages/shared/src/grades.ts`: `GRADE_IMPORT_COLUMNS` (ФИО | Группа | Учебный год | Семестр | Дисциплина | Оценка + алиасы), `parseAcademicYear` (2025/2026, 2025-2026, 2025–2026, 2025/26, «уч. г.»), `parseSemester` (1, 2, I, II, «1 семестр»), `parseGradeScore` (0–100, запятая/точка, до 2 знаков), `formatAcademicPeriod`, `compareAcademicPeriods`, `gradeMean` (0,1; пусто → null), `gradeDelta`, `summarizeSemester` (общий — по НЕокруглённым средним дисциплин), DTO.
- api `apps/api/src/grades/*`: `GET /grades/options` (STUDENTS_READ: семестры сначала последние, группы scope), `GET /grades/group?groupId&periodId&compareWith` (STUDENTS_READ; чужая группа → 404; одинаковые семестры → 400), `POST /grades/import/preview` + `POST /grades/import` (GRADES_MANAGE, Idempotency-Key, всё-или-ничего, 409 при том же отпечатке), `GET /grades/imports` (admin — все, teacher — свои, ≤100), `DELETE /grades/imports/:id` (автор или admin; 204; повтор → 409; чужая → 404), `GET /students/:id/grades` (STUDENTS_READ + scope студентов). аудит `grades.imported`, `grades.import_cancelled`.
- web `apps/web/src/views/grades/*`: `GradesPanel.vue` (вкладка «Успеваемость» в `DisciplinesView.vue`, видна при STUDENTS_READ; группа по умолчанию из шапки), `ImportGradesDialog.vue`, `GradeImportsDialog.vue` (отмена через ActionDialog), `StudentGrades.vue` (в `StudentProfileView.vue` вкладка «Диагностика» под `StudentDiagnosticsTab`, обёртка `profile__stack`), `format.ts` (`gradeText`, `deltaView`). ссылка студента → `student-details` с `?tab=diagnostics`.
- доки: ADR-032, `docs/architecture/data-model.md`, `er-diagram.md` (`pnpm db:erd`), `docs/design/wireframes.md` экран 23 + правка экрана 11, `docs/guides/admin.md` (вкладка + «Оценки за семестр»), `docs/guides/teacher.md` («Академическая успешность по семестрам» в п. 4), traceability FR-006, FR-074, NFR-006 (+26), `docs/api/openapi.json` (`pnpm docs:openapi`).

## требования

- FR-006 ✅ по аналогии: импорт оценок CSV/XLSX, предпросмотр, ошибки по строкам
- FR-074 ✅ нет оценок → null/«Нет данных»; разность при пропуске не считается
- FR-002 ✅ импорт — только свои пары группа — дисциплина; просмотр — scope студентов/групп
- NFR-006 ✅ Idempotency-Key + отпечаток содержания (409)
- п. 4.10 ⚠️ частично: динамика академической успешности — сравнение семестров в профиле и по группе; в «Аналитику»/«Отчёты» не встраивал (ЭГ/КГ — этап 27)

## решения (почему)

- хранение в `academic_results` (таблица п. 7 ТЗ «учебные достижения»), а не новая таблица: мониторинг (`trajectoryAssignment` фильтр) и аналитика (через assignment relation) эти строки не берут — проверил grep `academicResult` в `apps/api/src`: только analytics, monitoring, submissions.
- дубли строк не ищем: одинаковые текущие оценки законны. повтор файла ловит sha256 по (studentId|год|семестр|disciplineId|score), сортировка → порядок строк и CSV/XLSX не важны. гонка двух одновременных одинаковых импортов не закрыта уникальным индексом (Prisma не моделирует partial unique) — риск мал.
- отмена загрузки = удаление её оценок + `cancelled_at`; запись загрузки и аудит остаются. иначе ошибочный файл не исправить.
- студент ищется внутри группы из файла: текущий состав ∪ `enrollments` этой группы (переведённые, архивные). ключи `personNameKeys` без голой фамилии (однофамильцы).
- архивные группы/дисциплины сопоставляются — оценки прошлых семестров.
- групповой вид: студенты = действующие группы ∪ с оценками по этой группе за выбранные семестры; оценки студента в семестре — по всем группам. средний группы по дисциплине = среднее средних студентов; общий группы = среднее общих (уже округлённых до 0,1) студентов с оценками — ошибка ≤ 0,05, записано.
- студенту и исследователю оценки не отдаются (у ролей нет STUDENTS_READ). обезличенная выгрузка — этап 27.
- место UI: «Дисциплины» → «Успеваемость» (как «Занятия» этапа 25: доступно admin и teacher), меню не трогали; структура экрана «Дисциплины» дополнена вкладкой — причина здесь и в ADR-032.

## файлы ключевые

- `apps/api/src/grades/grades.service.ts` — вся логика (scope, импорт, отпечаток, средние, отмена)
- `packages/shared/src/grades.ts` — разбор и расчёт средних (этап 27 — брать `summarizeSemester` отсюда)
- `apps/web/src/views/grades/GradesPanel.vue`, `StudentGrades.vue`
- `apps/api/test/grades.e2e-spec.ts` — e2e этапа

## проверить

- `pnpm build:shared && pnpm --filter @iot/shared test` — `grades.spec.ts`
- `pnpm --filter @iot/api test` — `grades.e2e-spec.ts` (10), `idor.e2e-spec.ts` (+ `/api/grades/imports/`)
- `pnpm --filter @iot/web exec vitest run src/views/grades`
- в проде после деплоя: миграция только добавляет; admin → «Дисциплины» → «Успеваемость» → «Импорт оценок».

## тесты

- полный `pnpm lint && pnpm typecheck && pnpm test` зелёный: shared 122 passed; api unit 57 passed; api e2e 205 passed (grades 10, idor с `/api/grades/imports/`); web 134 passed.

## долги / TODO(этап 27)

- Playwright-сценарий «Успеваемость» (360 px) не писал — покрыто vitest + e2e api; таблицы в `overflow-x: auto` контейнерах.
- этап 27: средний балл за семестры 1 и 2 в широкой выгрузке — из `academic_results` source `SEMESTER_IMPORT` + `summarizeSemester`; какие учебные годы брать для «семестр 1/2» — уточнить у заказчика при этапе 27.
- отчёты (этап 18) оценки за семестр не включают.
- инициалы Ильиной — всё ещё ждём (этап 23).

## для след. этапа

- этап 27: данные ЭГ/КГ — `research_participants` → студенты; оценки — `academic_results` (`source = SEMESTER_IMPORT`, `period_id`); наблюдения — `lesson_ratings` (этап 25).
