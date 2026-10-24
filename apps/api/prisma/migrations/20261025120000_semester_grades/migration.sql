-- Этап 26: академическая успешность по семестрам.
-- Миграция только добавляет значение перечисления, столбцы (NULL) и таблицы: существующие данные не меняются.
-- AlterEnum
ALTER TYPE "AcademicResultSource" ADD VALUE 'SEMESTER_IMPORT';

-- AlterTable
ALTER TABLE "academic_results" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "import_id" UUID,
ADD COLUMN     "period_id" UUID;

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_imports" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,

    CONSTRAINT "grade_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_academic_year_semester_key" ON "academic_periods"("academic_year", "semester");

-- CreateIndex
CREATE INDEX "grade_imports_content_hash_idx" ON "grade_imports"("content_hash");

-- CreateIndex
CREATE INDEX "grade_imports_created_at_idx" ON "grade_imports"("created_at");

-- CreateIndex
CREATE INDEX "academic_results_period_id_group_id_idx" ON "academic_results"("period_id", "group_id");

-- CreateIndex
CREATE INDEX "academic_results_import_id_idx" ON "academic_results"("import_id");

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "grade_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_imports" ADD CONSTRAINT "grade_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Семестр учебного года — 1 или 2; учебный год — «гггг/гггг».
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_semester_check" CHECK ("semester" IN (1, 2));
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_academic_year_check" CHECK ("academic_year" ~ '^[0-9]{4}/[0-9]{4}$');

-- Оценка за семестр всегда привязана к периоду, группе и загрузке; шкала 0–100.
-- Сравнение через ::text: новое значение перечисления нельзя использовать в той же транзакции.
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_semester_grade_check" CHECK (
  "source"::text <> 'SEMESTER_IMPORT'
  OR ("period_id" IS NOT NULL AND "group_id" IS NOT NULL AND "import_id" IS NOT NULL
      AND "score" >= 0 AND "score" <= 100 AND "max_score" = 100)
);
