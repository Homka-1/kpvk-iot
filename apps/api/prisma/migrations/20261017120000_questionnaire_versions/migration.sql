-- Этап 06. Конструктор методик (ТЗ, п. 4.4; FR-026; CLAUDE.md п. 1.7).

-- AlterTable
ALTER TABLE "scoring_keys" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Диагностические направления из п. 4.4 ТЗ. Справочник нужен в любом окружении, поэтому
-- заполняется миграцией, а не демо-сидом. Список можно дополнять и переименовывать в интерфейсе.
INSERT INTO "diagnostic_directions" ("id", "code", "name", "sort_order") VALUES
  ('01a14728-8400-7baa-b971-8b0d53d86de7', 'LEARNING_MOTIVATION', 'Учебная мотивация', 10),
  ('01a14728-8401-7982-85fb-7860927bb5e0', 'SELF_REGULATION', 'Саморегуляция', 20),
  ('01a14728-8402-7285-a6a1-a5ab2a5eed22', 'ACADEMIC_SUCCESS', 'Академическая успешность', 30),
  ('01a14728-8403-71a6-ae1f-614770059252', 'PEDAGOGICAL_OBSERVATION', 'Педагогическое наблюдение', 40),
  ('01a14728-8404-74a1-bd2f-689804420037', 'FINAL_CONCLUSION', 'Итоговое аналитическое заключение', 50)
ON CONFLICT ("code") DO NOTHING;

-- Опубликованная версия методики неизменяема (FR-026). Разрешена только смена статуса
-- (публикация черновика, вывод из использования). Удалить можно только черновик.
CREATE FUNCTION questionnaire_version_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'DRAFT' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Опубликованная версия методики не удаляется'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at')
     OR NEW."status" = 'DRAFT' THEN
    RAISE EXCEPTION 'Опубликованная версия методики неизменяема: создайте новую версию'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questionnaire_versions_immutable
  BEFORE UPDATE OR DELETE ON "questionnaire_versions"
  FOR EACH ROW EXECUTE FUNCTION questionnaire_version_guard();

-- Вопросы, варианты, шкалы, ключи и правила интерпретации меняются только у черновика.
-- Если родительская запись уже удалена (каскад при удалении черновика), изменение разрешено:
-- удалить опубликованную версию запрещает триггер выше.
CREATE FUNCTION questionnaire_content_guard() RETURNS trigger AS $$
DECLARE
  row_data jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  version_status text;
BEGIN
  IF TG_TABLE_NAME IN ('questions', 'questionnaire_scales') THEN
    SELECT v."status" INTO version_status FROM "questionnaire_versions" v
      WHERE v."id" = (row_data ->> 'version_id')::uuid;
  ELSIF TG_TABLE_NAME = 'answer_options' THEN
    SELECT v."status" INTO version_status FROM "questions" q
      JOIN "questionnaire_versions" v ON v."id" = q."version_id"
      WHERE q."id" = (row_data ->> 'question_id')::uuid;
  ELSE
    SELECT v."status" INTO version_status FROM "questionnaire_scales" s
      JOIN "questionnaire_versions" v ON v."id" = s."version_id"
      WHERE s."id" = (row_data ->> 'scale_id')::uuid;
  END IF;
  IF version_status IS NOT NULL AND version_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Содержимое опубликованной версии методики неизменяемо (таблица %)', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "questions"
  FOR EACH ROW EXECUTE FUNCTION questionnaire_content_guard();

CREATE TRIGGER answer_options_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "answer_options"
  FOR EACH ROW EXECUTE FUNCTION questionnaire_content_guard();

CREATE TRIGGER questionnaire_scales_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "questionnaire_scales"
  FOR EACH ROW EXECUTE FUNCTION questionnaire_content_guard();

CREATE TRIGGER scoring_keys_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "scoring_keys"
  FOR EACH ROW EXECUTE FUNCTION questionnaire_content_guard();

CREATE TRIGGER interpretation_rules_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "interpretation_rules"
  FOR EACH ROW EXECUTE FUNCTION questionnaire_content_guard();
