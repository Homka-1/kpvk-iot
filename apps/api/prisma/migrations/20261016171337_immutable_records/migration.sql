-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "motivation_profile_history" DROP CONSTRAINT "motivation_profile_history_profile_id_fkey";

-- AddForeignKey
ALTER TABLE "motivation_profile_history" ADD CONSTRAINT "motivation_profile_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "motivation_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Неизменяемые записи (CLAUDE.md п. 1.6, 1.11, 1.13; FR-013, FR-043; ТЗ п. 8.3).
-- Исходные ответы, рассчитанные показатели, ревизии диагностики, версии ИОТ и журнал аудита
-- только добавляются. Исправление — новой записью с новой ревизией/версией и причиной.
-- TRUNCATE (очистка тестовой БД) триггеры не затрагивает.

CREATE FUNCTION forbid_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Запись в таблице % неизменяема: % запрещён', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diagnostic_answers_immutable
  BEFORE UPDATE OR DELETE ON "diagnostic_answers"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER diagnostic_scores_immutable
  BEFORE UPDATE OR DELETE ON "diagnostic_scores"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER diagnostic_revisions_immutable
  BEFORE UPDATE OR DELETE ON "diagnostic_revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER trajectory_versions_immutable
  BEFORE UPDATE OR DELETE ON "trajectory_versions"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER motivation_profile_history_immutable
  BEFORE UPDATE OR DELETE ON "motivation_profile_history"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
