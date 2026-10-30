# Образ API (NestJS). Сборка из корня репозитория:
#   docker build -f docker/api/Dockerfile .
# Стадия build собирает shared и api, стадия runtime содержит только production-зависимости.

# Корневой package.json без полей version и scripts.prepare: версия меняется почти в каждом
# коммите, и без этого каждый пуш сбрасывал бы кэш слоёв установки зависимостей. Слой ниже
# сравнивается по содержимому файла, поэтому установка пересобирается только при изменении
# зависимостей. Хук husky нужен только разработчикам; в образе его нет.
FROM node:24-alpine AS manifest
WORKDIR /app
COPY package.json ./
RUN npm pkg delete version scripts.prepare

FROM node:24-alpine AS base
# openssl нужен Prisma для определения платформы движка миграций.
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
# Хранилище пакетов pnpm — в кэше сборки, общем для стадий и сборок: пакеты не скачиваются
# заново при каждом изменении зависимостей.
ENV npm_config_store_dir=/pnpm/store
COPY --from=manifest /app/package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN --mount=type=cache,id=iot-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @iot/api... --filter iot-college
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @iot/shared build && pnpm --filter @iot/api build

FROM base AS runtime
ENV NODE_ENV=production
RUN --mount=type=cache,id=iot-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @iot/api... \
  && rm -rf /root/.cache
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma/schema.prisma apps/api/prisma/
COPY apps/api/prisma/migrations apps/api/prisma/migrations
COPY apps/api/prisma.config.ts apps/api/
COPY docker/api/entrypoint.sh /usr/local/bin/iot-api-entrypoint
# Каталог загруженных файлов: том монтируется сюда и наследует владельца node.
RUN mkdir -p /var/lib/iot/files && chown node:node /var/lib/iot/files
USER node
WORKDIR /app/apps/api
ENV FILE_STORAGE_DIR=/var/lib/iot/files API_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["iot-api-entrypoint"]
