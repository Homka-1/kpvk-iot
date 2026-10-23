-- Этап 25: занятия по расписанию и журнал педагогических наблюдений на занятии.
-- Миграция только добавляет таблицы: существующие данные не меняются.
-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation_criteria" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "observation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_journal_entries" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_ratings" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "score" INTEGER,

    CONSTRAINT "lesson_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_date_idx" ON "lessons"("date");

-- CreateIndex
CREATE INDEX "lessons_teacher_id_idx" ON "lessons"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_group_id_discipline_id_date_start_time_key" ON "lessons"("group_id", "discipline_id", "date", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "observation_criteria_name_key" ON "observation_criteria"("name");

-- CreateIndex
CREATE INDEX "lesson_journal_entries_student_id_idx" ON "lesson_journal_entries"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_journal_entries_lesson_id_student_id_key" ON "lesson_journal_entries"("lesson_id", "student_id");

-- CreateIndex
CREATE INDEX "lesson_ratings_criterion_id_idx" ON "lesson_ratings"("criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_ratings_entry_id_criterion_id_key" ON "lesson_ratings"("entry_id", "criterion_id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_journal_entries" ADD CONSTRAINT "lesson_journal_entries_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_journal_entries" ADD CONSTRAINT "lesson_journal_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "lesson_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "observation_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Время начала — «ЧЧ:ММ»; оценка — 1–5 или NULL («Не наблюдалось»).
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_start_time_check"
  CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "lesson_ratings" ADD CONSTRAINT "lesson_ratings_score_check"
  CHECK ("score" IS NULL OR "score" BETWEEN 1 AND 5);

-- Критерии наблюдения по умолчанию (список редактируется в разделе «Настройки»).
INSERT INTO "observation_criteria" ("id", "name", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'Активность на занятии', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Включённость в работу', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Самостоятельность', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Инициативность', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Доведение задания до конца', 5, CURRENT_TIMESTAMP);
