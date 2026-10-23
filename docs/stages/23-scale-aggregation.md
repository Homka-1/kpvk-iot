# Этап 23 — Способ расчёта шкалы: сумма или среднее

статус: done дата: 2026-10-23 коммиты: 93a7273, (docs — этот коммит)

## сделано

- контекст: отзыв научрука ВКР → этапы 23–27 добавлены в CLAUDE.md п. 4 и STATUS. решения заказчика 2026-10-23: Реан — Якунин (Бадмаева) = среднее по шкале, округл. 0,1 (методичка `~/Downloads/20170830_izuch_urov_motiv.pdf`: 7 шкал, 34 пункта, ответ 1–5, норм нет); Ильина = сумма (источник bstudy.net/710499, там «Т.Н. Ильина», веса 3,6/2,4/1,2…, норм нет). в проде: обе методики заведены, Ильина — 1 прохождение, Реан — 0; 40 студентов.
- enum `ScaleAggregation { SUM, MEAN }` (`packages/shared/src/enums.ts` + `schema.prisma`), подписи `SCALE_AGGREGATION_LABELS`.
- `questionnaire_scales.aggregation` NOT NULL DEFAULT 'SUM'; миграция `apps/api/prisma/migrations/20261023120000_scale_aggregation` (аддитивная, старые шкалы = SUM → баллы не меняются).
- движок `packages/shared/src/diagnostics.ts`: `ScaleContent.aggregation`, `scaleTotal()`, `SCALE_MEAN_DECIMALS = 1`. MEAN = сумма вкладов / число РАЗНЫХ вопросов шкалы (ключи на варианты одного вопроса = 1 пункт), `roundScore` перед округлением до 0,1 (убрать 3.4999…). `scaleScoreRange` тоже делит.
- API: `ScaleContentDto.aggregation` optional, `@IsIn`, по умолчанию SUM (`questionnaires.service.ts` toContent); чтение/запись в `questionnaire-content.ts`; `loadDefinitions` подставляет SUM, если в json поля нет.
- запрет сопоставимости (`results.service.ts` `approveComparability`): одна шкала (по code) в версиях A/B с разным aggregation → 400 «…баллы несопоставимы: <шкалы>».
- web: `ScalesEditor.vue` — Select «Способ расчёта» + подсказка; `newScale` → SUM.
- доки: `docs/guides/methodologies.md` (п. 2 способ расчёта, конструктор, поле `aggregation` в json, чек-лист), `docs/architecture/data-model.md`, ADR-029, traceability FR-021/FR-026 (+этап 23), `docs/api/openapi.json` (`pnpm docs:openapi`).
- отдельно до этапа: ветка `fix/student-card-badge` (4ee9863) — бейдж профиля в карточке студента переносится, не наезжает. не слита.

## требования

- FR-021 ✅ (+ среднее по пунктам)
- FR-026 ✅ (способ расчёта = правило обработки, только новой версией; триггер `questionnaire_content_guard` покрывает новое поле автоматом — построчный на всю строку)
- FR-020 ✅ без изменений для SUM

## решения (почему)

- делитель = число вопросов, не ключей: у Ильиной/выбора несколько ключей на один вопрос.
- округление 0,1 зашито константой (указание заказчика, конфиг не нужен). сумма — по-прежнему 3 знака (веса Ильиной дробные).
- DTO-поле optional: старая вкладка браузера после деплоя не ломается.
- пересчёта старых прохождений нет (FR-026, вопрос 14 открыт). Реану пересчитывать нечего.

## файлы ключевые

- `packages/shared/src/diagnostics.ts` — движок
- `apps/api/prisma/migrations/20261023120000_scale_aggregation/migration.sql`
- `apps/api/src/diagnostics/results.service.ts` — запрет сопоставимости
- `apps/web/src/views/diagnostics/ScalesEditor.vue`

## проверить

- `pnpm --filter @iot/shared test` — «FR-021: среднее по пунктам…», «FR-074: пропуск ответа при среднем…»
- `pnpm --filter @iot/api test` — `questionnaires.e2e-spec.ts` «FR-021, FR-026: способ расчёта шкалы…»
- в проде после деплоя: Реан → «Создать новую версию» → у 7 шкал «Среднее по пунктам» → пороги уровней в единицах 1–5 (этап 24) → опубликовать.

## тесты

- shared 79 passed; api unit 56 passed, api e2e 176 passed (после обновления openapi.json); web diagnostics 14 passed; lint, typecheck чисто.

## долги / TODO(этап 24)

- пороги уровней и роль шкалы (внутр./внешн./справ.) для Реана и Ильиной — этап 24.
- инициалы Ильиной: в репо «Т. А.» (из ТЗ), источник заказчика «Т. Н.», в литературе «Т. И.» — ждём выбора заказчика; ТЗ не править.
- Playwright конструктора не прогонялся (поле добавлено в форму, сценарий e2e не менялся).

## для след. этапа

- этап 24: `proposeMotivationLevel` (`packages/shared/src/motivation-profiles.ts`) — сейчас голосование шкал + `profiles.minScales` (умолч. 1). заменить правилом из CLAUDE.md этап 24. роль шкалы — новое поле `questionnaire_scales` (аддитивно, умолч. «справочная»? продумать: старые версии в проде с motivationLevel в правилах).
- в проде у Ильиной 1 прохождение по текущей версии — его профиль не пересчитывать.
