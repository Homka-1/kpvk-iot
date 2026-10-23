-- Этап 24: роль шкалы в мотивационном профиле (внутренняя, внешняя мотивация, справочная).
-- Существующие шкалы получают REFERENCE: их версии предлагают профиль по прежнему правилу
-- (уровни профиля в правилах интерпретации), сохранённые профили не меняются.
-- ALTER TABLE не запускает построчные триггеры неизменяемости опубликованных версий; дальнейшие
-- изменения поля у опубликованных версий запрещает questionnaire_content_guard().
CREATE TYPE "ScaleMotivationRole" AS ENUM ('INTRINSIC', 'EXTRINSIC', 'REFERENCE');

ALTER TABLE "questionnaire_scales"
  ADD COLUMN "motivation_role" "ScaleMotivationRole" NOT NULL DEFAULT 'REFERENCE';
