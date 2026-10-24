# Этап 27 — Исследовательская аналитика ЭГ и КГ, широкий экспорт

статус: done дата: 2026-10-25 коммиты: 75d6bb6

## сделано

- ветка `worktree-stage-27-research-export`. EnterWorktree опять дал ветку от 235cb39 (worktree-admin-students) → `git reset --hard main` (ed3bc51, этап 26 уже в main).
- решения заказчика 2026-10-25 (спросил): семестры «до/после» выбирает исследователь, по умолчанию 2 последних с оценками участников; наблюдения — два периода дат, по умолчанию граница = дата начала исследования; наблюдения — средняя по всем критериям + по каждому критерию.
- миграций нет. данные: `research_participants` → `academic_results` (`source = SEMESTER_IMPORT`) + `lesson_ratings`/`lesson_journal_entries`/`lessons`.
- shared `packages/shared/src/research.ts`:
  - `ResearchDiagnosticDataDto` (старый состав) + `ResearchDataDto extends … { outcomes }`; `buildResearchData` возвращает diagnostic-часть.
  - `buildResearchOutcomes` — показатели `grades` (общий балл семестра `summarizeSemester`), `observations` (среднее неокруглённых средних по критериям), `observations:<criterionId>` (только критерии с оценками); по ЭГ/КГ stats до/после/изменение (парные, после − до, округл. 0,1); `values[code][key] = {before, after}`.
  - `ResearchDateRange`, `dateRangeSet`, `inDateRange` (включительно), `dateRangesOverlap`, `formatDateRange`, `RESEARCH_GRADES_KEY`, `RESEARCH_OBSERVATIONS_KEY`, `researchCriterionKey`.
  - `ResearchDataset.WIDE = 'wide'` + `buildResearchWideTable`: код, ЭГ/КГ, шкалы × замеры («— до» PRIMARY, «— после» REPEATED, «— промежуточный»; при 2+ замерах одного типа одной методики — `фаза: название`), средний балл до/после, наблюдения до/после. в заголовке — методика+версия, семестр или период.
  - `buildResearchAggregateTable` принимает `outcomes?` → доп. строки «<показатель> — до/после/изменение (после − до)».
- shared `grades.ts`: `academicPeriodDto(row)` (вынес `toPeriod` из `grades.service.ts`, там теперь он).
- api `apps/api/src/analytics/research.service.ts`: `data()` → `outcomes()` (периоды с оценками участников, дефолты, валидация), `observationPeriods()`, `academicPeriod()`; `EXPORT_DATASETS` (raw/aggregate/wide → build, имя файла, лист «До и после»); аудит `research_data.exported` + `gradesBefore/After`, `observationsBefore/After` (`[from, to]`) для aggregate/wide.
- api dto `research.dto.ts`: query `gradesBeforePeriodId`, `gradesAfterPeriodId` (uuid v7), `observationsBeforeFrom|To`, `observationsAfterFrom|To`; ответ `outcomes` (`ResearchOutcomesResponseDto`).
- правило дефолтов: любой семестр указан → берутся только указанные (второй null); любая граница периодов указана → только указанные. 400: одинаковые семестры, неизвестный семестр, from > to, пересечение периодов.
- web: `ResearchOutcomesBlock.vue` (таблицы StatsTable: группа × до/после/изменение); `ResearchDataPanel.vue` — fieldset «Успеваемость и наблюдения…» (2 Select + 4 DateInput), клиентская проверка (`outcomeError` → не грузим), дефолты сервера подставляются в поля без повторной загрузки (`applyingDefaults` + `nextTick`), поля видны и без замеров (EmptyState только про замеры), третий набор экспорта.
- доки: ADR-033, wireframes §20 (схема + причина), `docs/guides/researcher.md` (п. 5, 6), traceability FR-069, 070, 071, 074, 075 (+27), `docs/api/openapi.json`.

## требования

- FR-069 ✅ FR-070 ✅ ЭГ/КГ по среднему баллу и наблюдениям до/после/изменение
- FR-071 ✅ широкая таблица CSV/XLSX
- FR-074 ✅ нет оценок/наблюдений → null/«Нет данных»/пустая ячейка; «Не наблюдалось» и «Отсутствовал» не оценки
- FR-075 ✅ без ФИО, логинов, учебной группы; аудит
- FR-072/073 без изменений (версии в заголовках широкой таблицы)

## решения (почему)

- outcomes внутри `/data`, не отдельный эндпоинт: экспорт и UI берут одни данные, одни фильтры.
- отдельная функция `buildResearchOutcomes`, а не расширение `buildResearchData`: разные источники, тесты проще.
- изменение (после − до) считаем от округлённых значений участника — то же, что в выгрузке, внешний Вилкоксон совпадёт.
- наблюдения «общая» = среднее средних по критериям (как общий балл за семестр, ADR-032). критерии без оценок у участников в периодах — не колонки.
- архивные критерии с оценками остаются в показателях (история).
- фильтры outcomes вне `ErrorState`-зоны: при ошибке загрузки поля не пропадают.

## файлы ключевые

- `packages/shared/src/research.ts` — `buildResearchOutcomes`, `buildResearchWideTable`
- `apps/api/src/analytics/research.service.ts` — `outcomes()`, `observationPeriods()`, `EXPORT_DATASETS`
- `apps/web/src/views/analytics/ResearchDataPanel.vue`, `ResearchOutcomesBlock.vue`
- `apps/api/test/research-outcomes.e2e-spec.ts` — e2e этапа (данные оценок и журналов — через prisma)

## проверить

- `pnpm build:shared && pnpm --filter @iot/shared test` — `statistics.spec.ts` (блок «этап 27»)
- `pnpm --filter @iot/api test` — `research-outcomes.e2e-spec.ts` (4), `health.e2e-spec.ts` (openapi)
- `pnpm --filter @iot/web exec vitest run src/views/analytics`; `pnpm --filter @iot/web exec playwright test e2e/research.spec.ts --project=desktop --project=mobile-360`
- в проде: миграций нет; исследователь → «Аналитика» → «Исследования» → исследование → «Данные исследования» → семестры/периоды → «Широкая таблица» → «Экспортировать».

## тесты

- shared 126 passed; api e2e этапа 4 passed; web analytics 6 passed; Playwright research desktop + mobile-360 4 passed.
- полный `pnpm lint && pnpm typecheck && pnpm test` зелёный: shared 126; api unit 57; api e2e 209 (research-outcomes 4, health/openapi); web 135.

## долги / TODO

- инициалы Ильиной — всё ещё ждём (этап 23).
- отчёты (этап 18) оценки за семестр и наблюдения не включают — по запросу.
- Playwright-моки исследования без показателей outcomes (пустой список) — таблицы показателей проверены vitest.

## для след. этапа

- план CLAUDE.md закончен (27/27). дальше — только по запросу: пилот (ТЗ-9), AT-14, п. 10.2.
