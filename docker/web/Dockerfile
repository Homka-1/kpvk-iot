# Образ веб-интерфейса: production-сборка Vue и nginx без прав root, раздающий статику.
# Сборка из корня репозитория:
#   docker build -f docker/web/Dockerfile .

# Корневой package.json без полей version и scripts.prepare — для установки зависимостей,
# чтобы подъём версии не сбрасывал кэш этого слоя (см. docker/api/Dockerfile). Полный файл
# копируется перед сборкой: vite.config.ts берёт из него версию для демо-панели.
FROM node:24-alpine AS manifest
WORKDIR /app
COPY package.json ./
RUN npm pkg delete version scripts.prepare

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
ENV npm_config_store_dir=/pnpm/store
COPY --from=manifest /app/package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=iot-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @iot/web... --filter iot-college
COPY tsconfig.base.json package.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @iot/shared build && pnpm --filter @iot/web build

FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/web/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/healthz || exit 1
