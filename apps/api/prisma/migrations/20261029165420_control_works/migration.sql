-- Этап 28: академические достижения — контрольные работы.
-- Миграция только добавляет перечисления и таблицы: существующие данные не меняются.
-- CreateEnum
CREATE TYPE "ControlKind" AS ENUM ('ENTRY', 'CURRENT', 'FINAL');

-- CreateEnum
CREATE TYPE "ControlMark" AS ENUM ('ABSENT', 'NOT_SUBMITTED', 'EXEMPT');

-- CreateTable
CREATE TABLE "control_works" (
    "id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "kind" "ControlKind" NOT NULL,
    "criteria" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_work_groups" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "control_work_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_results" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "score" DECIMAL(4,1),
    "mark" "ControlMark",
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_works_discipline_id_idx" ON "control_works"("discipline_id");

-- CreateIndex
CREATE INDEX "control_work_groups_group_id_idx" ON "control_work_groups"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "control_work_groups_work_id_group_id_key" ON "control_work_groups"("work_id", "group_id");

-- CreateIndex
CREATE INDEX "control_results_student_id_idx" ON "control_results"("student_id");

-- CreateIndex
CREATE INDEX "control_results_work_id_group_id_idx" ON "control_results"("work_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "control_results_work_id_student_id_key" ON "control_results"("work_id", "student_id");

-- AddForeignKey
ALTER TABLE "control_works" ADD CONSTRAINT "control_works_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_works" ADD CONSTRAINT "control_works_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_work_groups" ADD CONSTRAINT "control_work_groups_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "control_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_work_groups" ADD CONSTRAINT "control_work_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_results" ADD CONSTRAINT "control_results_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "control_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_results" ADD CONSTRAINT "control_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_results" ADD CONSTRAINT "control_results_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Результат — ровно одно из двух: балл 0–100 или отметка.
ALTER TABLE "control_results" ADD CONSTRAINT "control_results_score_or_mark_check"
  CHECK ((("score" IS NULL) <> ("mark" IS NULL)) AND ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)));
