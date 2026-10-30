-- Рекомендуемая сложность заданий этапа (подсказка в конструкторе ИОТ, FR-033: не ограничение).
-- Аддитивно: существующие этапы маршрутов остаются без рекомендации.
ALTER TABLE "trajectory_template_stages" ADD COLUMN "recommended_difficulty" "DifficultyLevel";
ALTER TABLE "trajectory_stages" ADD COLUMN "recommended_difficulty" "DifficultyLevel";

-- Системные шаблоны уровней профиля: значения PROFILE_STAGE_DIFFICULTY (packages/shared).
UPDATE "trajectory_template_stages" AS s
SET "recommended_difficulty" = v."difficulty"::"DifficultyLevel"
FROM "trajectory_templates" AS t,
  (VALUES
    ('LOW', 0, 'BASIC'), ('LOW', 1, 'BASIC'), ('LOW', 2, 'BASIC'),
    ('LOW', 3, 'INTERMEDIATE'), ('LOW', 4, 'INTERMEDIATE'),
    ('MEDIUM', 0, 'BASIC'), ('MEDIUM', 1, 'INTERMEDIATE'), ('MEDIUM', 2, 'INTERMEDIATE'),
    ('MEDIUM', 3, 'INTERMEDIATE'), ('MEDIUM', 4, 'ADVANCED'),
    ('HIGH', 0, 'INTERMEDIATE'), ('HIGH', 1, 'ADVANCED'), ('HIGH', 2, 'ADVANCED'),
    ('HIGH', 3, 'ADVANCED'), ('HIGH', 4, 'ADVANCED')
  ) AS v("level", "sort_order", "difficulty")
WHERE s."template_id" = t."id"
  AND t."created_by" IS NULL
  AND t."motivation_level"::text = v."level"
  AND s."sort_order" = v."sort_order";
