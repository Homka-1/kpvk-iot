#!/bin/sh
# Резервная копия: дамп базы (pg_dump, формат custom) и архив загруженных файлов.
# Каталог копии: $BACKUP_DIR/<ГГГГММДД-ЧЧММСС>/ — db.dump, files.tar.gz, SHA256SUMS, info.txt.
# Копия сначала пишется в каталог *.partial и переименовывается только после успешного
# завершения: недописанная копия не выглядит готовой. После копии старые удаляются (ротация).
# Печатает имя созданной копии последней строкой.
set -eu
umask 077
[ -f /etc/iot-backup.env ] && . /etc/iot-backup.env

BACKUP_DIR="${BACKUP_DIR:-/backups}"
FILES_DIR="${FILES_DIR:-/data/files}"
KEEP="${BACKUP_KEEP:-14}"

name="$(date +%Y%m%d-%H%M%S)"
work="$BACKUP_DIR/$name.partial"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT

echo "[backup] $(date -Iseconds) начало: $name"
pg_dump --format=custom --no-owner --file="$work/db.dump"
tar -czf "$work/files.tar.gz" -C "$FILES_DIR" .
{
  echo "created_at=$(date -Iseconds)"
  echo "database=$PGDATABASE"
  echo "last_migration=$(psql -tAc 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1')"
} >"$work/info.txt"
(cd "$work" && sha256sum db.dump files.tar.gz info.txt >SHA256SUMS)
mv "$work" "$BACKUP_DIR/$name"
trap - EXIT

# Ротация: остаются KEEP последних готовых копий, старые недописанные — удаляются.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '*.partial' -mmin +60 -exec rm -rf {} +
ls -1d "$BACKUP_DIR"/[0-9]*-[0-9]* 2>/dev/null | grep -v '\.partial$' | sort -r | tail -n +"$((KEEP + 1))" |
  while read -r old; do
    echo "[backup] удалена старая копия: $(basename "$old")"
    rm -rf "$old"
  done

echo "[backup] $(date -Iseconds) готово: $(du -sh "$BACKUP_DIR/$name" | cut -f1)"
echo "$name"
