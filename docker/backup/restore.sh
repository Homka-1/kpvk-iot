#!/bin/sh
# Восстановление из резервной копии: restore.sh <имя копии | latest>.
# Перед запуском остановите API (docker compose ... stop api): восстановление полностью
# заменяет данные базы и загруженные файлы. Скрипт откажется работать, пока к базе подключены
# другие клиенты. Контрольные суммы копии проверяются до любых изменений.
set -eu
[ -f /etc/iot-backup.env ] && . /etc/iot-backup.env

BACKUP_DIR="${BACKUP_DIR:-/backups}"
FILES_DIR="${FILES_DIR:-/data/files}"

name="${1:-}"
if [ -z "$name" ]; then
  echo "Укажите имя копии или latest. Доступные копии:" >&2
  ls -1 "$BACKUP_DIR" | grep -v '\.partial$' >&2 || true
  exit 2
fi
if [ "$name" = latest ]; then
  name="$(ls -1 "$BACKUP_DIR" | grep -E '^[0-9]{8}-[0-9]{6}$' | sort | tail -n 1)"
  [ -n "$name" ] || { echo "Резервных копий нет в $BACKUP_DIR" >&2; exit 1; }
fi
source_dir="$BACKUP_DIR/$name"
[ -d "$source_dir" ] || { echo "Копия не найдена: $source_dir" >&2; exit 1; }

echo "[restore] проверка контрольных сумм копии $name"
(cd "$source_dir" && sha256sum -c SHA256SUMS)

others="$(psql -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")"
if [ "$others" != 0 ]; then
  echo "К базе подключены другие клиенты ($others). Остановите API и повторите." >&2
  exit 1
fi

echo "[restore] база $PGDATABASE: очистка схемы и загрузка дампа"
psql -v ON_ERROR_STOP=1 -qc 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$PGDATABASE" "$source_dir/db.dump"

echo "[restore] файлы: замена содержимого $FILES_DIR"
find "$FILES_DIR" -mindepth 1 -delete
tar -xzpf "$source_dir/files.tar.gz" -C "$FILES_DIR"

echo "[restore] готово: восстановлена копия $name ($(grep created_at "$source_dir/info.txt" | cut -d= -f2))"
