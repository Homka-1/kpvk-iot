# Этап 21 — Развёртывание

статус: done дата: 2026-10-20 коммиты: 1467203, b0751eb, b926c91, 1baa7ed

## сделано

- `docker-compose.prod.yml`: postgres (16-alpine, том `pgdata`), api, web, nginx, backup. сеть `backend` internal (база и API без выхода наружу), `frontend` — nginx + web. порты наружу только nginx: `HTTP_PORT`/`HTTPS_PORT` → 8080/8443. логи json-file 5×10 МБ. api/web/nginx: `cap_drop: ALL`, `no-new-privileges`. обязательные `POSTGRES_PASSWORD`, `JWT_SECRET` (`:?` с русским сообщением).
- `docker/api/Dockerfile`: node:24-alpine, стадии base → build (shared + api) → runtime (`pnpm install --prod --filter @iot/api...`, копия dist, schema, migrations, prisma.config.ts). `npm pkg delete scripts.prepare` — husky в образе нет. USER node. `FILE_STORAGE_DIR=/var/lib/iot/files` (том `files`, владелец node). HEALTHCHECK wget `/api/health`. entrypoint `docker/api/entrypoint.sh`: `prisma migrate deploy` → `exec node dist/main.js`.
- `docker/web/Dockerfile`: сборка vue → `nginxinc/nginx-unprivileged:1.30-alpine` :8080. `docker/web/nginx.conf` (SPA fallback, `/assets/` immutable, `/healthz`), `docker/web/security-headers.conf` (CSP с `style-src 'unsafe-inline'` для PrimeVue, nosniff, DENY, no-referrer) — include в каждом location (add_header в location глушит server-уровень).
- `docker/nginx/default.conf` (монтируется в стоковый unprivileged): 8080 → 301 https, 8443 ssl http2, TLS 1.2/1.3, HSTS (у API скрыт `proxy_hide_header`, чтобы не дублировать), gzip, `client_max_body_size 25m`, `X-Forwarded-For $remote_addr` (перезапись), `proxy_read_timeout 120s` для /api, `resolver 127.0.0.11 valid=10s` + `set $api_upstream` — пересоздание контейнера не ломает прокси. `docker/nginx/self-signed-cert.sh [каталог] [имя]` — тестовый сертификат (chmod 644, nginx UID 101).
- `docker/backup/`: образ на postgres:16-alpine, root, crond. `entrypoint.sh` пишет env в `/etc/iot-backup.env` (600, экранирование кавычек) + crontab из `BACKUP_SCHEDULE` (деф. `30 2 * * *`, TZ деф. Asia/Almaty). `backup.sh`: umask 077, `<ГГГГММДД-ЧЧММСС>.partial` → pg_dump -Fc + tar файлов + info.txt (последняя миграция) + SHA256SUMS → mv; ротация `BACKUP_KEEP` (деф. 14), старые .partial удаляются; последняя строка вывода = имя копии. `restore.sh <имя|latest>`: sha256sum -c → отказ, если к базе подключены другие → DROP/CREATE SCHEMA public → pg_restore --exit-on-error → замена файлов тома.
- API: `TRUST_PROXY` (число прокси, деф. 0) → `app.set('trust proxy', n)` в `configureApp`. без этого за nginx `req.ip` = адрес nginx → лимит входа общий на всех, аудит без адресов. в compose prod = 1.
- API: `apps/api/src/cli/create-admin.ts` → `node dist/cli/create-admin.js [логин]`: админ с временным паролем (mustChangePassword), `syncRbacCatalog`, запись `user.created` в audit_logs (source create-admin), повтор с тем же логином → ошибка, код 1. скрипт `pnpm --filter @iot/api create-admin`.
- `prisma` перенесён из devDependencies в dependencies API (CLI нужен в рабочем образе для migrate deploy). lockfile обновлён.
- `.dockerignore`, `.env.prod.example`, `.gitignore` (+ `!.env.prod.example`, `deploy/certs/`).
- AT-13 автотест `docker/test/restore.test.mts`, `pnpm test:restore` (node --test, ~4 мин со сборкой из кэша): проект compose `iot-at13`, порты 18080/18443, временный каталог в os.tmpdir → create-admin → смена пароля → группа, преподаватель (`/admin/users`), загрузка .txt преподавателем → backup.sh → `down --volumes` → `up` (чистый, вход 401) → stop api → restore.sh → up → вход админа и преподавателя, группа, файл побайтно, аудит `user.created`. after: удаляет копии внутри контейнера (root-файлы), `down --volumes`, tmp.
- e2e `apps/api/test/proxy.e2e-spec.ts`: без TRUST_PROXY XFF игнорируется; с TRUST_PROXY=1 берётся крайний правый адрес.
- docs (обычный язык): `docs/deploy/README.md` (состав, схема, окружения NFR-010), `server-requirements.md` (п. 8.2 + чек-лист сисадмина), `install.md`, `environment.md`, `update.md` (порядок, откат, обслуживание), `backup-restore.md`; `docs/acceptance/at-14-server.md`; checklist AT-13/AT-14; README (раздел «Рабочий сервер», `pnpm test:restore`); traceability; ADR-026.

## требования

- AT-13 ✅ (автотест на рабочей сборке)
- п. 8.3 резервное копирование и проверка восстановления ✅
- NFR-007 ✅ (migrate deploy при старте, тома, update.md)
- NFR-010 ✅ (prod: свой compose + .env.prod + тома; тестовый экземпляр — другой проект compose)
- NFR-008 ⚠️ — установка/эксплуатация есть, руководства пользователей — этап 22
- MVP-15 ⚠️, AT-14 ⚠️ — подготовлено, выполняет колледж на своём сервере (`docs/acceptance/at-14-server.md`)
- п. 8.1 ✅ (nginx, контейнеры, Linux), п. 8.2 — чек-лист сисадмина

## решения (почему)

- два nginx (web со статикой + внешний прокси) — так в таблице CLAUDE.md п. 2; web-образ самодостаточен, прокси — стоковый образ + конфиг.
- `prisma` в dependencies, а не `pnpm deploy`: deploy использует pack → `.gitignore` выкидывает dist shared. проще ставить prod-зависимости в runtime-стадии и копировать dist.
- миграции в entrypoint API, не отдельный сервис: один шаг, API не стартует со старой схемой. `migrate reset` нигде нет.
- backup — свой контейнер с crond, не cron хоста: ставится вместе с compose, сисадмину ничего настраивать. root — чтобы tar сохранял владельца node (UID 1000) файлов тома.
- копия = каталог с суммами, запись через .partial: битую/недописанную копию видно, restore проверяет до изменений.
- restore.sh через `docker compose exec backup` (не run): entrypoint контейнера — crond.
- fetch в тесте: после пересоздания nginx пул держит мёртвое HTTP/2-соединение (GOAWAY) → один повтор на TypeError. NODE_TLS_REJECT_UNAUTHORIZED=0 только в процессе теста (самоподписанный сертификат).
- тест `.mts`: корневой package.json без `"type"` → `.ts` давал предупреждение MODULE_TYPELESS. parameter properties type stripping не умеет.
- create-admin, а не сид: сид создаёт демо-учётки и демо-группы, на рабочем сервере их быть не должно. каталоги ролей/типов заданий/шаблонов ИОТ API синхронизирует сам при старте (`onApplicationBootstrap`).
- демо-методика на рабочий сервер не ставится; реальные — через конструктор (install.md п. 6).

## проверено вручную (смоук, стенд `iot-smoke`, 18080/18443)

- все 5 контейнеров healthy с первого `up --wait`.
- https `/api/health` 200, заголовки helmet + HSTS один раз; страница `/students/123` → index.html с CSP; http → 301; gzip.
- Playwright по https 360 px: вход админом с временным паролем → `/account/password` → смена → главная; reload — сессия жива; cookie `iot_refresh` Secure HttpOnly Strict, `iot_csrf` Secure; ошибок консоли (в т. ч. CSP) нет.
- `auth_sessions.ip_address` = 172.20.0.1 (шлюз docker = клиент), не IP nginx (172.19.0.5/172.20.0.3).
- backup.sh вручную: копия 180 КБ на пустой базе; create-admin повтор → «уже существует», exit 1.

## файлы ключевые

- docker-compose.prod.yml, .env.prod.example, .dockerignore
- docker/api/{Dockerfile,entrypoint.sh}, docker/web/{Dockerfile,nginx.conf,security-headers.conf}, docker/nginx/{default.conf,self-signed-cert.sh}, docker/backup/{Dockerfile,entrypoint.sh,backup.sh,restore.sh}
- docker/test/restore.test.mts — AT-13
- apps/api/src/cli/create-admin.ts, apps/api/src/app.setup.ts (TRUST_PROXY), apps/api/test/proxy.e2e-spec.ts
- docs/deploy/\*, docs/acceptance/at-14-server.md

## проверить

- `export PATH=$HOME/.npm-global/bin:$PATH; pnpm install && pnpm db:up && pnpm lint && pnpm typecheck && pnpm test`
- `pnpm test:restore` (Docker; первая сборка образов несколько минут)
- ручной прод-стенд: `docker/nginx/self-signed-cert.sh deploy/certs`, `cp .env.prod.example .env.prod` + секреты, `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --wait`, `... exec api node dist/cli/create-admin.js`, https://localhost/

## тесты

- итог: lint/typecheck/format ок; shared 77, api unit 55, api e2e 174 (+2 proxy), web vitest 120 — все passed; `pnpm test:restore` 1 passed (AT-13, 75 с сам тест, ~4 мин с подъёмом стендов).
- `pnpm test:e2e`, `pnpm test:acceptance` не перезапускал: UI и логика API не менялись (только trust proxy под переменной, деф. выкл.).

## долги / TODO(этап NN)

- TODO(этап 22): руководства admin/teacher/student/researcher (NFR-008 полностью), `docs/architecture/` — добавить схему развёртывания (есть в `docs/deploy/README.md`), сверка traceability.
- AT-14, MVP-15 — выполняет колледж на своём сервере по `docs/acceptance/at-14-server.md`.
- перенос копий на внешний носитель — средствами сисадмина (описано в backup-restore.md), не автоматизирован.
- health-запросы docker (каждые 10 с) пишутся в журнал API уровнем info — шум, но ротация логов ограничивает объём.
- из прошлых этапов: pg@9 + adapter-pg; лимиты 200 в списках; выгрузка без стрима; FR-033 без автотеста.

## для след. этапа

- этап 22 — итоговая документация, без caveman. деплой-доки уже в `docs/deploy/` — ссылаться, не дублировать.
- имя проекта compose зашито `name: iot` (тома `iot_pgdata`, `iot_files` не зависят от каталога); тест — `-p iot-at13`, тестовый экземпляр — `-p iot-test`.
- после слияния нужен `pnpm install` (prisma перенесён в dependencies, lockfile изменён).
