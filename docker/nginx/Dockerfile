# Внутренний nginx для развёртывания через Coolify: конфигурация входит в образ, потому что
# Coolify не гарантирует монтирование файлов репозитория в контейнеры.
#   docker build -f docker/nginx/Dockerfile .
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY docker/nginx/coolify.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/healthz || exit 1
