-- Этап 09: текущий мотивационный профиль студента — последняя запись профилирования.
-- AlterTable
ALTER TABLE "students" ADD COLUMN     "current_motivation_profile_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "students_current_motivation_profile_id_key" ON "students"("current_motivation_profile_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_current_motivation_profile_id_fkey" FOREIGN KEY ("current_motivation_profile_id") REFERENCES "motivation_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Заполнение для профилей, созданных до миграции: последняя запись каждого студента.
UPDATE "students" s
SET "current_motivation_profile_id" = p."id"
FROM (
  SELECT DISTINCT ON ("student_id") "id", "student_id"
  FROM "motivation_profiles"
  ORDER BY "student_id", "created_at" DESC, "id" DESC
) p
WHERE p."student_id" = s."id";
