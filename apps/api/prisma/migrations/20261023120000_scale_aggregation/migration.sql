-- Этап 23: способ расчёта балла шкалы (сумма или среднее по пунктам).
-- Существующие шкалы получают SUM: их баллы и сохранённые результаты не меняются (FR-026).
-- ALTER TABLE не запускает построчные триггеры неизменяемости опубликованных версий; дальнейшие
-- изменения поля у опубликованных версий запрещает questionnaire_content_guard().
CREATE TYPE "ScaleAggregation" AS ENUM ('SUM', 'MEAN');

ALTER TABLE "questionnaire_scales"
  ADD COLUMN "aggregation" "ScaleAggregation" NOT NULL DEFAULT 'SUM';
