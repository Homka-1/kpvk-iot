#!/bin/sh
# Планировщик резервного копирования: crond запускает backup.sh по расписанию BACKUP_SCHEDULE
# (формат cron, время по TZ). Задачи cron не наследуют окружение контейнера, поэтому
# параметры подключения сохраняются в файл, доступный только root.
set -eu
: "${BACKUP_SCHEDULE:=30 2 * * *}"

umask 077
{
  for var in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE BACKUP_DIR FILES_DIR BACKUP_KEEP TZ; do
    eval "value=\${$var-}"
    [ -n "$value" ] || continue
    # Значение в одинарных кавычках; сами кавычки внутри экранируются.
    printf "export %s='%s'\n" "$var" "$(printf %s "$value" | sed "s/'/'\\\\''/g")"
  done
} >/etc/iot-backup.env

echo "$BACKUP_SCHEDULE /usr/local/bin/backup.sh >>/proc/1/fd/1 2>>/proc/1/fd/2" >/etc/crontabs/root
echo "[backup] расписание: $BACKUP_SCHEDULE (TZ=${TZ:-UTC}), хранить копий: ${BACKUP_KEEP:-14}"
exec crond -f -l 8
