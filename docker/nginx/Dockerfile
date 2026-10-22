# nginx для развёртывания через Coolify: конфигурация входит в образ, потому что Coolify не
# монтирует файлы репозитория в контейнеры. Принимает HTTP на порту HTTP_PORT от прокси с HTTPS;
# порт подставляется в шаблон при старте контейнера.
#   docker build -f docker/nginx/Dockerfile .
FROM nginxinc/nginx-unprivileged:1.30-alpine
ENV HTTP_PORT=8080
COPY docker/nginx/coolify.conf.template /etc/nginx/templates/default.conf.template
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO /dev/null "http://127.0.0.1:${HTTP_PORT}/healthz" || exit 1
