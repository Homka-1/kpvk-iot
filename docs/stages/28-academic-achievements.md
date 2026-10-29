# Этап 28 — Академические достижения: контрольные работы ЭГ и КГ

статус: done дата: 2026-10-29 коммиты: d2f7962 20d65a1 03666c6 (+ docs)

## сделано

- запрос заказчика 2026-10-29 (агент заказчика: гипотеза ВКР — рост и мотивации, и успеваемости; обе группы ПО-9 — программа ДО «Веб-дизайнер»). этап сверх плана 00–27, ветка `feat/academic-achievements` (слить в main).
- решения заказчика (спросил): 1а новый пункт меню «Академические достижения» после «Мониторинга», оценки за семестр туда же; 2 одна работа для обеих групп; 3б критерии текстом + один итоговый балл; 4 отметки ABSENT/NOT_SUBMITTED/EXEMPT (в демо — реже); 5а текущий контроль = те же работы вида CURRENT, оценки ИОТ не сравниваются; 6 профиль, конструктор ИОТ, аналитика ЭГ/КГ, широкая выгрузка, кабинет студента (без отчётов PDF); 7а ручной ввод + файл; 8 доступ как у оценок; 9 ИОТ ЭГ в демо: веб-дизайн вместо математики.
- схема: `control_works`, `control_work_groups`, `control_results` + enum `ControlKind`, `ControlMark`. миграция `20261029165420_control_works` только добавляет; CHECK `control_results_score_or_mark_check` (ровно одно: score 0–100 или mark).
- shared `packages/shared/src/control-works.ts`: подписи видов/отметок, `isControlScore` (0–100, шаг 0,1), `parseControlResult` (балл | отметка | пусто | invalid; «н», «нб», «осв» и т. п.), `CONTROL_IMPORT_COLUMNS` (`ФИО | Результат`), `summarizeControlResults` (stats только по баллам + marks + noData), `controlMean`, `controlProgress` (entry/final/delta по дисциплине; CURRENT не входит), DTO.
- shared `research.ts`: показатель `controls:<disciplineId>` («Контрольные работы: <дисциплина>»): до = средний ENTRY, после = средний FINAL; `researchControlsKey`, `isResearchControlsKey`; подписи фаз «входной контроль/итоговый контроль» (сводная, широкая, web). вход `controls?` в `ResearchOutcomesInput`.
- api `apps/api/src/control-works/*`: `GET /control-works/options|`, `POST /control-works` (Idempotency-Key), `GET|PUT|DELETE /control-works/:id`, `GET|PUT /control-works/:id/groups/:groupId/results`, `POST /control-works/:id/groups/:groupId/import` (только разбор, без сохранения), `GET /students/:id/control-results`, `GET /cabinet/control-results`. право: просмотр `students.read` (видна, если доступна хоть одна группа работы), запись `grades.manage` + пара группа—дисциплина. 409: убрать группу с результатами, сменить дисциплину при результатах, ввод до даты проведения (now+14h). аудит `control_work.created|updated|deleted`, `control_results.saved`.
- api `research.service.ts` `outcomes()`: тянет баллы ENTRY/FINAL участников.
- web: пункт меню `achievements` (`/achievements`, `pi-graduation-cap`, `students.read`) в `navigation.ts` + тест; `views/achievements/`: `AchievementsView` (вкладки «Контрольные работы», «Оценки за семестр» — `GradesPanel` перенесён из «Дисциплин»), `ControlWorksPanel`, `ControlWorkDialog` (группы с DateInput, дата первой подставляется в следующие), `ControlWorkView` (`/achievements/works/:id`: карточка, `StatsTable` сравнения групп, ведомость), `ControlSheet` (Select «Балл»/отметка + InputNumber), `ControlImportDialog` (файл → «Заполнить ведомость»), `StudentControlResults` (вход→итог, график Chart.js, таблица) — в профиле (вкладка «Диагностика») и в `MyAchievementsView` (вне `isEmpty`, видно КГ). конструктор ИОТ шаг 1: строка «Входной контроль» по дисциплине (справочно, FR-033). `ResearchOutcomesBlock` — фазы для controls.
- демо: `TRAJECTORY_DISCIPLINES = ['ДО Веб-дизайн', 'Информатика']`, у веб-дизайна 15 заданий (5 этапов × 3), математика — только библиотека. `DEMO_CONTROL_WORKS` (ENTRY 21.10.2025, CURRENT 09.12, 17.02, 17.03) в prepare, `DEMO_FINAL_CONTROL_WORK` (28.04.2026, та же тема и рубрика, что ENTRY) в repeat. балл = 42 + 34·уровень + рост (ЭГ: прогресс·(8 + 45·growth), КГ: прогресс·U(−1;5)) + шум; отметки ~1–3 %.
- доки: ADR-035 (+ правка ADR-034 про ИОТ и закрепления), navigation.md, wireframes §24 (+ §23/§19 ссылки), guides teacher (§11 новый, перенумерация 12–15), admin, researcher, student; data-model, er-diagram (`pnpm db:erd`), traceability FR-002, 015, 069–071, 074, 075 (+28); openapi.json.

## требования

- FR-015 ✅ график динамики контрольных работ (профиль, кабинет)
- FR-069 ✅ FR-070 ✅ статистики и сравнение групп по одной работе
- FR-071 ✅ FR-075 ✅ входной/итоговый в сводной и широкой выгрузке, по коду
- FR-074 ✅ отметки и пустой балл не ноль, не в средних
- FR-002 ✅ запись только в своих парах; IDOR-тест покрывает новые маршруты
- FR-033 ✅ входной контроль в конструкторе только справочно

## решения (почему)

- одна работа → много групп (`control_work_groups` с датой) — гарантирует одинаковое задание/рубрику у ЭГ и КГ.
- результат = score XOR mark (CHECK) — отметка не может «съесть» ноль; нет строки = нет данных.
- импорт файла без отдельной «загрузки» и отмены: файл только заполняет ведомость, сохраняет человек (проще, чем у оценок за семестр; ведомость всё равно перезаписывается целиком).
- контрольные работы отдельно от `academic_results`: другой жизненный цикл (ведомость целиком, отметки), не смешиваются с оценками ИОТ и семестра.
- текущий контроль в показатель исследования не идёт: «до/после» = входной/итоговый.

## файлы ключевые

- `apps/api/prisma/schema.prisma` (ControlWork*), миграция `20261029165420_control_works`
- `packages/shared/src/control-works.ts`, `packages/shared/src/research.ts`
- `apps/api/src/control-works/` (controller, service, dto, module)
- `apps/web/src/views/achievements/`
- `apps/api/src/demo/demo-catalog.ts` (`DEMO_CONTROL_WORKS`), `demo-activity.ts` (`controlWork`)

## проверить

- `pnpm build:shared && pnpm --filter @iot/api exec prisma migrate deploy`
- `pnpm lint && pnpm typecheck && pnpm test`
- UI: учётка преподавателя → «Академические достижения» → «Новая работа» → страница работы → ведомость. демо: «Подготовить заново» (тройной клик по заголовку «Администрирование»).

## тесты

- shared: `control-works.spec.ts` 5, `statistics.spec.ts` +1 (controls в outcomes и wide).
- api e2e: `control-works.e2e-spec.ts` 6 passed; `idor` (+маршруты control-works), `route-guards`, `research-outcomes` — 14 passed; `demo.e2e-spec.ts` 6 passed (+ проверки работ и роста ЭГ > КГ).
- web: `achievements.spec.ts` 5, `navigation.spec.ts` обновлён — vitest 43 passed по затронутым папкам.
- полный прогон: shared 132 passed; api unit 66 + e2e 221 passed (30 suites); web 142 passed (25 files). `layouts.spec.ts`: админ теперь видит «Академические достижения» (оценки за семестр переехали) — ожидание обновлено.
- `pnpm lint` в корне падает только на неотслеживаемом `apps/web/.probe/render.mjs` (не наш код); `eslint apps packages` по отслеживаемым файлам чистый. typecheck чистый.

## долги / TODO

- отчёты PDF/XLSX (FR-076–079) контрольные работы не включают — заказчик пункт «е» не выбрал.
- критерии рубрики не оцениваются по отдельности (решение 3б); если понадобится — новая таблица баллов по критериям.
- Playwright-сценарий раздела не написан (обход меню покрывает открытие).

## для след. этапа

- план 00–28 закрыт. прод: миграция аддитивная, `pnpm install` не нужен (зависимости не менялись). после деплоя демо пересоздать: «Подготовить заново» → «Провести повторный замер».
