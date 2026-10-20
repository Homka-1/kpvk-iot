# Резервное копирование и восстановление: утилиты PostgreSQL 16 той же версии, что у базы,
# и crond из busybox. Работает от root: читает и восстанавливает файлы тома API с их владельцем.
FROM postgres:16-alpine
COPY docker/backup/backup.sh /usr/local/bin/backup.sh
COPY docker/backup/restore.sh /usr/local/bin/restore.sh
COPY docker/backup/entrypoint.sh /usr/local/bin/backup-entrypoint
RUN chmod 755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/backup-entrypoint
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD pg_isready -q || exit 1
ENTRYPOINT ["backup-entrypoint"]
