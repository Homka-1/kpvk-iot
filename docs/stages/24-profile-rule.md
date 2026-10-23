# Этап 24 — Правило мотивационного профиля

статус: done дата: 2026-10-23 коммиты: d828527

## сделано

- ветка `worktree-stage-24-profile-rule` от main 59adeac (main ушёл на fix карточки после 23).
- enum `ScaleMotivationRole { INTRINSIC, EXTRINSIC, REFERENCE }` (`packages/shared/src/enums.ts` + `schema.prisma`), подписи `SCALE_MOTIVATION_ROLE_LABELS`.
- `questionnaire_scales.motivation_role` NOT NULL DEFAULT 'REFERENCE'; миграция `apps/api/prisma/migrations/20261023140000_scale_motivation_role` (аддитивная). триггер `questionnaire_content_guard` покрывает поле (e2e проверяет прямой update в БД → ошибка).
- API: `ScaleContentDto.motivationRole` optional `@IsIn`, умолч. REFERENCE (`questionnaires.service.ts` normalize, `questionnaire-definitions.ts` loadDefinitions, `questionnaire-content.ts` read/write).
- shared `motivation-profiles.ts`: `methodologyLevel()` (уровень методики), `combineMethodologyLevels()` (сведение), `usesIntrinsicRule()`, `METHODOLOGY_LEVEL_THRESHOLDS`, `MethodologyLevelMethod`, `ProfileRuleOutcome`, `MethodologyLevelDto`. `ProfileBasisDto` + optional `rule`, `methodologies`, `outcome`, `explanation`; `ProfileBasisItemDto.motivationRole?`. `defaultStudentSummary` берёт и внутренние шкалы.
- shared `diagnostics.ts` `scaleScoreRange` переписан по вопросам: SINGLE_CHOICE — мин/макс по вариантам (ключи «да» 3,6 + «не знаю» 1,2 одного вопроса больше не складываются → максимум Ильиной верный), MULTIPLE_CHOICE — сумма отриц./полож. вкладов вариантов, LIKERT/NUMBER — по краям.
- сервис `motivation-profiles.service.ts` `collectBasis`: если у последнего прохождения хоть одной методики есть INTRINSIC → `intrinsicBasis()` (новое правило, версии без ролей игнор); иначе прежнее голосование + `profiles.minScales` (`rule: 'SCALE_VOTES'`). максимум шкал — `readContent` + `scaleScoreRange` по версиям.
- OpenAPI: `MethodologyLevelResponseDto`, поля basis, описание `POST /students/:id/motivation-profiles`; `docs/api/openapi.json` перегенерирован.
- web: `ScalesEditor.vue` — Select «Роль в мотивационном профиле» + подсказка; `RulesEditor.vue` — подсказка «поле не используется», если в версии есть внутренние шкалы; `StudentMotivationTab.vue` — итог (`data-testid="rule-outcome"`), предупреждение «Преобладает внешняя мотивация» (Message warn + иконка, `extrinsic-warning`), таблица «Уровни методик», колонка «Роль шкалы». старые профили (без `rule`) — прежний вид.
- доки: ADR-030, `docs/guides/methodologies.md` (роль шкалы, таблица порогов, json `motivationRole`, чек-лист), `docs/guides/teacher.md` п. 6, `docs/architecture/data-model.md`, open-questions вопрос 3 закрыт, traceability FR-027–029 (+24), `docs/architecture/er-diagram.md` (`pnpm db:erd`, +поле).

## требования

- FR-027 ✅ (новое правило по внутренним шкалам + сведение методик)
- FR-028 ✅ (уровни методик, показатели, роль шкал, итог, предупреждение)
- FR-029 ✅ без изменений (решение за преподавателем; при «доп. диагностике» решение 409)
- п. 4.5 ✅ «Требуется дополнительная диагностика» / «Недостаточно данных»

## решения (почему)

- способ уровня методики выводится из aggregation шкал: все внутр.+внешн. MEAN → среднее (Реан), иначе процент от максимума (Ильина). отдельное поле версии не вводил — лишний UI, у методик это уже задано этапом 23.
- пороги — константы, не настройка: утверждённые нормы исследования.
- округление: среднее до 0,1, процент до целого (иначе 66,67 % «провалилось» бы между 66 и 67).
- extrinsicPrevails = внешн. строго > внутр., тем же способом.
- «одна методика» и «высокий/низкий» → статус NEEDS_MORE_DIAGNOSTICS (существующий), различие — `basis.outcome` + текст reason «Недостаточно данных: …» / «Требуется дополнительная диагностика: …». новый статус не вводил: фильтры, отчёты, аналитика, дашборд не трогаем.
- методики без ролей при наличии хоть одной с ролями — не участвуют (смешение правил даст мусор). без ролей у всех → прежнее правило (демо, старые версии в проде, приёмочные тесты AT-03/AT-04 не меняются).
- сохранённые профили не пересчитываются; при повторном «Сформировать» после новых версий с ролями — новая запись.

## файлы ключевые

- `packages/shared/src/motivation-profiles.ts` — правило
- `packages/shared/src/diagnostics.ts` — `scaleScoreRange`
- `apps/api/src/profiles/motivation-profiles.service.ts` — `collectBasis`, `intrinsicBasis`
- `apps/api/prisma/migrations/20261023140000_scale_motivation_role/migration.sql`
- `apps/web/src/views/profiles/StudentMotivationTab.vue`, `apps/web/src/views/diagnostics/ScalesEditor.vue`
- `apps/api/test/motivation-rule.e2e-spec.ts` — e2e «как Реан» + «как Ильина»

## проверить

- `pnpm --filter @iot/shared test` — «FR-027: уровень методики…», «FR-027: сведение уровней…», «диапазон шкалы: ключи на разные варианты…»
- `pnpm --filter @iot/api test` — `motivation-rule.e2e-spec.ts` (5 тестов)
- в проде после деплоя: Реан и Ильина → «Создать новую версию» → роли шкал (какие внутр./внешн. — решает заказчик) → опубликовать → назначить → «Сформировать предварительный профиль».

## тесты

- полный `pnpm typecheck && pnpm test`: shared 92 passed; api unit 57 passed; api e2e 182 passed (в т. ч. motivation-rule 5); web 121 passed. `pnpm lint` чисто. (раньше 1 таймаут web diagnostics.spec под нагрузкой — в полном прогоне зелёный.)

## долги / TODO(этап 25)

- какие шкалы Реана (7) и Ильиной внутренние/внешние — не в репо, вводит заказчик в конструкторе. свои догадки не вносил.
- инициалы Ильиной — всё ещё ждём (см. этап 23).
- Playwright конструктора/профиля не прогонялся (моки в `apps/web/e2e/motivation-profiles.spec.ts` — старый формат basis, ветка прежнего правила).

## для след. этапа

- этап 25: занятия + журнал наблюдений. настройки критериев — через `packages/shared/src/settings.ts` (как `profiles.minScales`). навигацию не менять.
