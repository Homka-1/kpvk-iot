-- Этап 07. Проведение диагностики (ТЗ, п. 4.4; FR-013, FR-023; CLAUDE.md п. 1.6).

-- Завершённое прохождение неизменяемо: дата, источник, версия методики, студент и время
-- прохождения фиксируются при завершении. Разрешён только переход на новую ревизию
-- результатов: процедура исправления ошибочного ввода добавляет ревизию с причиной (FR-013).
-- Исходные ответы, баллы и ревизии защищены триггерами миграции 20261016171337.
CREATE FUNCTION diagnostic_session_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'COMPLETED' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Завершённое прохождение диагностики не удаляется'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'current_revision' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'current_revision' - 'updated_at')
     OR NEW."current_revision" <= OLD."current_revision" THEN
    RAISE EXCEPTION 'Завершённое прохождение диагностики неизменяемо: используйте процедуру исправления'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diagnostic_sessions_completed_immutable
  BEFORE UPDATE OR DELETE ON "diagnostic_sessions"
  FOR EACH ROW EXECUTE FUNCTION diagnostic_session_guard();
